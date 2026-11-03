(function () {
  'use strict';

  const store = window.LaboraStore;
  const $ = (selector, root = document) => root.querySelector(selector);
  const query = new URLSearchParams(window.location.search);

  if (query.get('logout') === '1') {
    if (store) store.setSession(null);
    else localStorage.removeItem('labora.session');
    window.history.replaceState({}, '', 'index.html');
  }

  function goToDashboard(session) {
    if (!session || !['laboran', 'siswa'].includes(session.role)) {
      throw new Error('Peran akun tidak dikenali.');
    }
    if (!store.setSession(session)) {
      throw new Error('Sesi tidak dapat disimpan di browser. Aktifkan penyimpanan situs lalu coba lagi.');
    }
    window.location.assign(session.role === 'laboran' ? 'laboran.html' : 'siswa.html');
  }

  if (query.get('error') === 'session') {
    const error = $('#login-error');
    error.textContent = 'Sesi berakhir. Silakan masuk kembali.';
    error.hidden = false;
  }

  function switchAuthView(view) {
    const register = view === 'register';
    $('#login-panel').hidden = register;
    $('#register-panel').hidden = !register;
    $('#auth-card').setAttribute('aria-labelledby', register ? 'register-title' : 'auth-title');
    (register ? $('#register-title') : $('#auth-title')).focus();
    $('#login-error').hidden = true;
    $('#register-error').hidden = true;
  }

  $('#login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const button = event.currentTarget.querySelector('[type="submit"]');
    const error = $('#login-error');
    const originalLabel = button.innerHTML;
    error.hidden = true;
    button.disabled = true;
    button.textContent = 'Memeriksa…';

    try {
      const result = await store.request('login', {
        username: String(data.get('username') || '').trim(),
        password: String(data.get('password') || '')
      });
      goToDashboard(result.session);
    } catch (exception) {
      error.textContent = exception.message || 'Login gagal. Periksa koneksi dan coba lagi.';
      error.hidden = false;
    } finally {
      button.disabled = false;
      button.innerHTML = originalLabel;
    }
  });

  $('#register-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get('name') || '').trim();
    const username = String(data.get('username') || '').trim();
    const className = String(data.get('className') || '').trim();
    const password = String(data.get('password') || '');
    const confirmation = String(data.get('confirmPassword') || '');
    const error = $('#register-error');

    if (name.length < 2 || username.length < 3) {
      error.textContent = 'Masukkan nama dan ID siswa yang valid.';
      error.hidden = false;
      return;
    }
    if (password.length < 6) {
      error.textContent = 'Password harus memiliki minimal 6 karakter.';
      error.hidden = false;
      return;
    }
    if (password !== confirmation) {
      error.textContent = 'Password dan pengulangannya belum sama.';
      error.hidden = false;
      return;
    }

    const button = event.currentTarget.querySelector('[type="submit"]');
    const originalLabel = button.innerHTML;
    button.disabled = true;
    button.textContent = 'Membuat akun…';
    error.hidden = true;
    try {
      const result = await store.request('registerStudent', { name, username, className, password });
      goToDashboard(result.session);
    } catch (exception) {
      error.textContent = exception.message || 'Akun belum dapat dibuat. Coba lagi.';
      error.hidden = false;
    } finally {
      button.disabled = false;
      button.innerHTML = originalLabel;
    }
  });

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-auth-view]');
    if (button) switchAuthView(button.dataset.authView);
  });
})();