const { ipcRenderer } = require('electron');

let terminalContent = '';

async function processMedia() {
  const fileInput = document.getElementById('mediaFile');
  const promptInput = document.getElementById('prompt');
  const convertButton = document.querySelector('#convertButton');
  const terminalDialog = document.getElementById('terminalDialog');
  const terminalContentDiv = document.getElementById('terminalContent');
  
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
    convertButton.disabled = true;
    document.getElementById('progress').style.width = '0%';
    
    // Terminal penceresini aç ve içeriği temizle
    terminalContent = '';
    terminalContentDiv.textContent = '';
    terminalDialog.showModal();
    
    await ipcRenderer.invoke('processMedia', { filePath, prompt });
  } catch (error) {
    alert('Hata: ' + error);
  }
}

// Dosya seçildiğinde dosya adını göster
document.getElementById('mediaFile').addEventListener('change', function(e) {
  const container = document.querySelector('.file-input-container');
  if (this.files.length > 0) {
    container.innerHTML = `<p>Seçilen dosya: ${this.files[0].name}</p>`;
  } else {
    container.innerHTML = '<p>Dosya seçmek için tıklayın veya sürükleyin</p>';
  }
});

ipcRenderer.on('progress', (event, data) => {
  // Terminal içeriğini güncelle
  terminalContent += data + '\n';
  document.getElementById('terminalContent').textContent = terminalContent;
  document.getElementById('terminalContent').scrollTop = document.getElementById('terminalContent').scrollHeight;
  
  // Progress bar'ı güncelle
  document.getElementById('progress').style.width = '50%';
});

ipcRenderer.on('complete', (event, outputPath) => {
  document.getElementById('progress').style.width = '100%';
  document.querySelector('#convertButton').disabled = false;
  alert('İşlem tamamlandı!');
});

ipcRenderer.on('error', (event, message) => {
  document.querySelector('#convertButton').disabled = false;
  
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
}); 