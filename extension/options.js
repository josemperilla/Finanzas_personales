const DEFAULT_BACKEND = 'https://finanzas-abiertas.pages.dev';
const $ = (id) => document.getElementById(id);

chrome.storage.local.get(['extToken', 'backendUrl']).then((cfg) => {
  $('token').value = cfg.extToken || '';
  $('backend').value = cfg.backendUrl || DEFAULT_BACKEND;
});

$('save').onclick = async () => {
  const extToken = $('token').value.trim();
  const backendUrl = ($('backend').value.trim() || DEFAULT_BACKEND).replace(/\/$/, '');
  await chrome.storage.local.set({ extToken, backendUrl });
  $('ok').textContent = '✓ Guardado';
};
