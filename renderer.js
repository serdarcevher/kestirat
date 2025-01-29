const { ipcRenderer } = require('electron');

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function updateFileInfo(file) {
  const container = document.querySelector('.file-input-container');
  const fileInput = document.getElementById('mediaFile');
  const infoDiv = container.querySelector('.file-info') || document.createElement('div');
  infoDiv.className = 'file-info';
  
  if (file) {
    infoDiv.innerHTML = `
      <p class="file-name">${file.name}</p>
      <p class="file-size">${formatFileSize(file.size)}</p>
    `;
    container.classList.add('has-file');
  } else {
    infoDiv.innerHTML = `<p>Dosya seçmek için tıklayın</p>`;
    container.classList.remove('has-file');
  }

  if (!container.contains(infoDiv)) {
    container.insertBefore(infoDiv, fileInput);
  }
}

function handleFileSelect(e) {
  if (this.files.length > 0) {
    updateFileInfo(this.files[0]);
  } else {
    updateFileInfo(null);
  }
}

async function processMedia() {
  const fileInput = document.getElementById('mediaFile');
  const promptInput = document.getElementById('prompt');
  const maxSizeSelect = document.getElementById('maxSize');
  const convertButton = document.querySelector('#convertButton');
  
  if (!fileInput.files.length) {
    alert('Lütfen bir dosya seçin');
    return;
  }

  const filePath = fileInput.files[0].path;
  let prompt = promptInput.value;
  const maxSize = parseInt(maxSizeSelect.value);

  if (!prompt && maxSize > 0) {
    prompt = 'Shrink video';
  } else if (!prompt) {
    alert('Lütfen bir işlem açıklaması girin');
    return;
  }

  try {
    convertButton.disabled = true;
    convertButton.textContent = 'Dönüştürülüyor...';
    document.getElementById('progress').style.width = '0%';
    
    await ipcRenderer.invoke('processMedia', { filePath, prompt, maxSize });
  } catch (error) {
    alert('Hata: ' + error);
  } finally {
    convertButton.disabled = false;
    convertButton.textContent = 'Dönüştür';
  }
}

document.getElementById('mediaFile').addEventListener('change', handleFileSelect);

ipcRenderer.on('progress', (event, data) => {
  document.getElementById('progress').style.width = '50%';
});

ipcRenderer.on('complete', (event, outputPath) => {
  document.getElementById('progress').style.width = '100%';
  document.querySelector('#convertButton').disabled = false;
  document.querySelector('#convertButton').textContent = 'Dönüştür';
  alert('İşlem tamamlandı!');
});

ipcRenderer.on('error', (event, message) => {
  document.querySelector('#convertButton').disabled = false;
  document.querySelector('#convertButton').textContent = 'Dönüştür';
  
  if (message.includes('API key')) {
    alert('API anahtarı geçerli değil. Lütfen geçerli anahtar girin');
  } else {
    const errorDialog = document.createElement('dialog');
    errorDialog.innerHTML = `
      <div style="padding: 20px;">
        <h3>Hata Detayı</h3>
        <pre style="white-space: pre-wrap; max-height: 400px; overflow-y: auto;">${message}</pre>
        <button onclick="this.parentElement.parentElement.close()">Kapat</button>
      </div>
    `;
    document.body.appendChild(errorDialog);
    errorDialog.showModal();
  }
}); 