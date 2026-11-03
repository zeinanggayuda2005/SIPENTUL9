(function () {
  'use strict';

  function showProblem(message) {
    const status = document.querySelector('#sync-indicator');
    const content = document.querySelector('#page-content');
    if (status) {
      status.textContent = 'Dashboard gagal dimuat';
      status.dataset.state = 'offline';
    }
    if (!content) return;

    const panel = document.createElement('section');
    panel.className = 'panel';
    const body = document.createElement('div');
    body.className = 'panel-body';
    const title = document.createElement('strong');
    title.textContent = 'Dashboard belum dapat dijalankan.';
    const detail = document.createElement('p');
    detail.textContent = message;
    body.append(title, detail);
    panel.append(body);
    content.replaceChildren(panel);
  }

  window.addEventListener('error', (event) => {
    if (event.target && event.target.tagName === 'SCRIPT') {
      const src = event.target.getAttribute('src') || 'file JavaScript';
      showProblem('File ' + src + ' gagal dimuat. Periksa nama file dan folder js.');
    } else if (event.message) {
      showProblem('Terjadi error JavaScript: ' + event.message);
    }
  }, true);

  window.setTimeout(() => {
    if (!window.LaboraAppReady) {
      showProblem('js/script.js belum berjalan. Pastikan file bernama script.js ada di folder js yang sejajar dengan laboran.html atau siswa.html.');
    }
  }, 4000);
})();