const { ipcRenderer } = require('electron');

async function processMedia() {
  const fileInput = document.getElementById('mediaFile');
  const promptInput = document.getElementById('prompt');
  const convertButton = document.querySelector('button[onclick="processMedia()"]');
  
  if (!fileInput.files.length) {
    alert('Lütfen bir dosya seçin');
    return;
  }

  const filePath = fileInput.files[0].path;
  const prompt = promptInput.value;

  if (!prompt) {
    alert('Lütfen bir işlem açıklaması girin');
    return;
  }

  try {
    // Butonu devre dışı bırak
    convertButton.disabled = true;
    
    await ipcRenderer.invoke('processMedia', { filePath, prompt });
  } catch (error) {
    alert('Hata: ' + error);
  } finally {
    // İşlem bittiğinde butonu tekrar aktif et
    convertButton.disabled = false;
  }
}

ipcRenderer.on('progress', (event, data) => {
  const progressBar = document.getElementById('progress');
  progressBar.style.width = '50%';
});

ipcRenderer.on('complete', (event, outputPath) => {
  document.getElementById('progress').style.width = '100%';
  // Butonu tekrar aktif et
  document.querySelector('button[onclick="processMedia()"]').disabled = false;
  alert('İşlem tamamlandı!');
});

ipcRenderer.on('error', (event, message) => {
  // Butonu tekrar aktif et
  document.querySelector('button[onclick="processMedia()"]').disabled = false;
  
  if (message.includes('API key')) {
    alert('API anahtarı geçerli değil. Lütfen geçerli anahtar girin');
  } else {
    // Hata detayları için özel dialog oluştur
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