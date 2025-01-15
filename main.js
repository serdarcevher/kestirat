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
    height: 600,
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

ipcMain.handle('processMedia', async (event, { filePath, prompt }) => {
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
    
    const outputPath = filePath.replace(/\.[^/.]+$/, "") + "-converted" + path.extname(filePath);
    
    const aiPrompt = `
      Input file: "${filePath}"
      Input file size: ${fileSizeInMB} MB
      Output file: "${outputPath}"
      Operation: ${prompt}
      
      Give me the exact ffmpeg command for this operation. The command should:
      1. Use the exact input and output paths provided above
      2. Include only the command, no explanations
      3. Start with 'ffmpeg'
      4. Do not include quotes around file paths
    `;

    const result = await model.generateContent(aiPrompt);
    const ffmpegCommand = result.response.text();
    
    console.log('AI tarafından önerilen FFmpeg komutu:', ffmpegCommand);
    
    const commandParts = ffmpegCommand
      .trim()
      .split(' ')
      .slice(1)
      .map(part => {
        if (part === filePath || part === outputPath) {
          return part;
        }
        return part.replace(/^["']|["']$/g, '');
      });

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
        event.sender.send('complete', outputPath);
      } else {
        event.sender.send('error', `FFmpeg işlemi başarısız oldu (Kod: ${code})\nHata detayı:\n${errorOutput}`);
      }
    });

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