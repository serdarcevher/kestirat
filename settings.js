const { ipcRenderer } = require('electron');

window.onload = async () => {
  const apiKey = await ipcRenderer.invoke('getApiKey');
  if (apiKey) {
    document.getElementById('apiKey').value = apiKey;
  }
};

async function saveSettings() {
  const apiKey = document.getElementById('apiKey').value;
  
  if (!apiKey) {
    alert('Lütfen API anahtarını girin');
    return;
  }

  try {
    await ipcRenderer.invoke('saveApiKey', apiKey);
    alert('Ayarlar kaydedildi!');
  } catch (error) {
    alert('Hata: ' + error);
  }
} 