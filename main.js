const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const ffmpeg = require('ffmpeg-static');
const { spawn } = require('child_process');

const store = new Store();

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('saveApiKey', async (event, apiKey) => {
  store.set('geminiApiKey', apiKey);
  return true;
});

ipcMain.handle('getApiKey', async () => {
  return store.get('geminiApiKey');
});

// Benzersiz dosya adı oluşturan fonksiyon
function getUniqueOutputPath(originalPath) {
  let counter = 1;
  let outputPath = originalPath.replace(/\.[^/.]+$/, "") + "-converted" + path.extname(originalPath);
  
  while (fs.existsSync(outputPath)) {
    outputPath = originalPath.replace(/\.[^/.]+$/, "") + `-converted-${counter}` + path.extname(originalPath);
    counter++;
  }
  
  return outputPath;
}

// FFmpeg komutunu çalıştıran fonksiyon
async function runFFmpegCommand(command, inputPath, outputPath, event) {
  return new Promise((resolve, reject) => {
    const commandParts = command
      .trim()
      .split(' ')
      .slice(1)
      .map(part => {
        if (part === inputPath || part === outputPath) {
          return part;
        }
        return part.replace(/^["']|["']$/g, '');
      })
      .filter(part => part); // Boş parçaları filtrele

    // Komut parçaları boşsa veya geçersizse atla
    if (!commandParts.length) {
      console.log('Boş veya geçersiz komut, atlıyorum:', command);
      resolve();
      return;
    }

    console.log('FFmpeg komut parçaları:', commandParts);

    const ffmpegProcess = spawn(ffmpeg, commandParts, {
      shell: false
    });
    
    let errorOutput = '';
    
    ffmpegProcess.stdout.on('data', (data) => {
      console.log('FFmpeg stdout:', data.toString());
      event.sender.send('progress', data.toString());
    });

    ffmpegProcess.stderr.on('data', (data) => {
      console.log('FFmpeg stderr:', data.toString());
      errorOutput += data.toString();
    });

    ffmpegProcess.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg işlemi başarısız oldu (Kod: ${code})\nHata detayı:\n${errorOutput}`));
      }
    });
  });
}

ipcMain.handle('processMedia', async (event, { filePath, prompt, maxSize }) => {
  const apiKey = store.get('geminiApiKey');
  
  if (!apiKey) {
    event.sender.send('error', 'API anahtarı bulunamadı');
    return false;
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-pro" });

  try {
    const stats = fs.statSync(filePath);
    const fileSizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
    
    const outputPath = getUniqueOutputPath(filePath);
    
    // Maksimum boyut sınırlaması varsa prompt'a ekle
    let sizeLimit = '';
    if (maxSize > 0) {
      sizeLimit = `Media quality should be adjusted to the maximum quality limited by a maximum file size of ${maxSize}MB. `;
    }
    
    const aiPrompt = `
      Input file: "${filePath}"
      Input file size: ${fileSizeInMB} MB
      Output file: "${outputPath}"
      ${sizeLimit}Operation: ${prompt}
      
      Give me the ffmpeg command(s) for this operation. Requirements:
      1. Use the exact input and output paths provided above
      2. If the operation requires multiple steps, return multiple commands, one per line
      3. Each command should start with 'ffmpeg'
      4. Do not include quotes around file paths
      5. If multiple commands are needed, use temporary files with "-temp" suffix for intermediate steps
      6. Include only the commands, no explanations
    `;

    const result = await model.generateContent(aiPrompt);
    const ffmpegCommands = result.response.text()
      .trim()
      .split('\n')
      .map(cmd => cmd.trim())
      .filter(cmd => cmd && cmd.startsWith('ffmpeg')); // Boş satırları ve ffmpeg ile başlamayan komutları filtrele
    
    console.log('AI tarafından önerilen FFmpeg komutları:', ffmpegCommands);

    if (!ffmpegCommands.length) {
      event.sender.send('error', 'AI geçerli bir FFmpeg komutu üretemedi');
      return false;
    }

    let currentInputPath = filePath;
    let currentOutputPath = outputPath;

    // Birden fazla komut varsa, ara dosyalar için temp path'ler oluştur
    for (let i = 0; i < ffmpegCommands.length; i++) {
      const isLastCommand = i === ffmpegCommands.length - 1;
      
      if (!isLastCommand) {
        // Ara dosya için temp path oluştur
        currentOutputPath = filePath.replace(/\.[^/.]+$/, "") + `-temp-${i}` + path.extname(filePath);
      } else {
        // Son komut için final output path'i kullan
        currentOutputPath = outputPath;
      }

      try {
        await runFFmpegCommand(ffmpegCommands[i], currentInputPath, currentOutputPath, event);
        
        // Bir sonraki komut için input path'i güncelle
        if (!isLastCommand) {
          currentInputPath = currentOutputPath;
        }
      } catch (error) {
        // Hata durumunda temp dosyaları temizle
        ffmpegCommands.forEach((_, index) => {
          const tempPath = filePath.replace(/\.[^/.]+$/, "") + `-temp-${index}` + path.extname(filePath);
          if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
          }
        });
        throw error;
      }
    }

    // Temp dosyaları temizle
    ffmpegCommands.forEach((_, index) => {
      const tempPath = filePath.replace(/\.[^/.]+$/, "") + `-temp-${index}` + path.extname(filePath);
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    });

    event.sender.send('complete', outputPath);
    return true;

  } catch (error) {
    if (error.message.includes('API key not valid')) {
      event.sender.send('error', 'API key not valid');
    } else {
      event.sender.send('error', error.message);
    }
    return false;
  }
}); 