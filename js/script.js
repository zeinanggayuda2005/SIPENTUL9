(function () {
  'use strict';

  const store = window.LaboraStore;
  const config = window.LABORA_CONFIG;
  const expectedRole = document.body.dataset.role;
  const $ = (selector, root = document) => root.querySelector(selector);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
  const norm = (value) => String(value || '').trim().toLocaleLowerCase('id');
  const today = () => {
    const d = new Date();
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
  };
  const dateText = (value) => {
    const p = String(value || '').slice(0, 10).split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : '—';
  };
  const initials = (name) => String(name || 'L').trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();

  if (!store || !config) {
    const status = $('#sync-indicator');
    const content = $('#page-content');
    if (status) {
      status.textContent = 'File JavaScript belum siap';
      status.dataset.state = 'offline';
    }
    if (content) {
      content.innerHTML = '<section class="panel"><div class="panel-body"><strong>Dashboard belum dapat dijalankan.</strong><p>Pastikan file js/config.js, js/storage.js, dan js/script.js ada di folder js, lalu muat ulang halaman.</p></div></section>';
    }
    window.LaboraAppReady = true;
    return;
  }

  let user = store.getSession();
  let tools = [];
  let loans = [];
  let accounts = { laboran: [], siswa: [] };
  let page = 'dashboard';
  let cart = {};
  let editId = '';
  let startDate = today();
  let endDate = today();
  let toastTimer;
  let busySync = false;
  let offlineNoticeShown = false;

  function toast(message) {
    const node = $('#toast');
    node.textContent = message;
    node.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('visible'), 3200);
  }

  function syncLabel(text, state) {
    const el = $('#sync-indicator');
    el.textContent = text;
    el.dataset.state = state || 'idle';
  }

  function api(action, data) {
    return store.request(action, { ...(data || {}), token: user && user.token });
  }

  async function refresh(render) {
    if (!user || !user.token) return;
    const result = await api('getState');
    const previous = JSON.stringify([tools, loans, accounts, user.name, user.className]);
    tools = result.tools || [];
    loans = result.loans || [];
    accounts = result.accounts || { laboran: [], siswa: [] };
    Object.keys(cart).forEach((id) => {
      const tool = tools.find((item) => item.id === id);
      const available = tool ? stateOf(tool).count : 0;
      if (available <= 0) delete cart[id];
      else cart[id] = Math.min(Number(cart[id]) || 0, available);
    });
    if (result.user) user = { ...user, ...result.user };
    store.setSession(user);
    const demoMode = !String(config.apiUrl || '').trim();
    syncLabel(demoMode ? 'Demo lokal' : 'Tersinkron', demoMode ? 'demo' : 'online');
    offlineNoticeShown = false;
    const changed = previous !== JSON.stringify([tools, loans, accounts, user.name, user.className]);
    if (render && changed && !isTyping()) renderPage();
  }

  function isTyping() {
    const active = document.activeElement;
    return Boolean(active && $('#page-content').contains(active) &&
      (active.matches('input, select, textarea') || active.closest('form')));
  }

  function navigation() {
    return user.role === 'laboran'
      ? [
          ['dashboard', '⌂', 'Dashboard'],
          ['approvals', '✓', 'Persetujuan', loans.filter((loan) => ['Menunggu persetujuan', 'Menunggu pengembalian'].includes(loan.status)).length],
          ['inventory', '▦', 'Inventaris'],
          ['accounts', '♙', 'Akun'],
          ['history', '▤', 'Riwayat']
        ]
      : [['dashboard', '⌂', 'Dashboard'], ['borrow', '+', 'Pinjam alat'], ['my-loans', '▤', 'Peminjaman saya'], ['profile', '♙', 'Profil']];
  }

  function showApp() {
    if (!user || !user.token) {
      window.location.replace('index.html');
      return;
    }
    if (user.role !== expectedRole) {
      window.location.replace(user.role === 'laboran' ? 'laboran.html' : 'siswa.html');
      return;
    }
    $('#app-view').hidden = false;
    const items = navigation();
    const activePage = page === 'tool-form' ? 'inventory' : page;
    if (!items.some((item) => item[0] === activePage)) page = 'dashboard';
    const navPage = page === 'tool-form' ? 'inventory' : page;
    $('#sidebar-nav').innerHTML = items.map(([id, icon, label, count]) =>
      '<a class="nav-link ' + (navPage === id ? 'active' : '') + '" href="#' + id + '" data-page="' + id + '" ' +
      (navPage === id ? 'aria-current="page"' : '') + '><span class="nav-icon" aria-hidden="true">' + icon + '</span><span>' + label + '</span>' +
      (count ? '<span class="nav-count">' + count + '</span>' : '') + '</a>'
    ).join('');
    $('#sidebar-name').textContent = user.name;
    $('#sidebar-role').textContent = user.role === 'laboran' ? 'Guru / Laboran' : 'Siswa';
    $('#sidebar-avatar').textContent = initials(user.name);
    $('#topbar-role').textContent = user.role === 'laboran' ? 'Guru / Laboran' : 'Siswa';
    renderPage();
    window.LaboraAppReady = true;
  }

  function heading(kicker, title, description, extra) {
    return '<div class="page-heading"><div><span class="eyebrow">' + kicker + '</span><h1>' + title +
      '</h1><p>' + description + '</p></div>' + (extra || '<span class="date-label">' +
      new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()) + '</span>') + '</div>';
  }

  function stat(label, value, note, icon, tone) {
    return '<article class="stat-card"><div class="stat-card-top"><span>' + label + '</span><span class="stat-icon ' +
      (tone || '') + '" aria-hidden="true">' + icon + '</span></div><strong class="stat-value">' + value +
      '</strong><span class="stat-note">' + note + '</span></article>';
  }

  function badge(label, kind) {
    return '<span class="badge badge-' + kind + '">' + label + '</span>';
  }

  function loanBadge(status) {
    const map = {
      'Menunggu persetujuan': ['Menunggu persetujuan', 'pending'],
      'Dipinjam': ['Sedang dipinjam', 'active'],
      'Ditolak': ['Ditolak', 'rejected'],
      'Menunggu pengembalian': ['Menunggu pengembalian', 'pending'],
      'Dikembalikan': ['Dikembalikan', 'returned']
    };
    const value = map[status] || [status || '—', 'neutral'];
    return badge(esc(value[0]), value[1]);
  }

  function emptyRow(cols, title, detail) {
    return '<tr><td colspan="' + cols + '" class="table-empty"><strong>' + title + '</strong><span>' + (detail || '') + '</span></td></tr>';
  }

  function renderPage() {
    const names = { dashboard: 'Dashboard', approvals: 'Persetujuan', inventory: 'Inventaris', 'tool-form': editId ? 'Edit alat' : 'Tambah alat', accounts: 'Akun', history: 'Riwayat', borrow: 'Pinjam alat', 'my-loans': 'Peminjaman saya', profile: 'Profil' };
    $('#breadcrumb-current').textContent = names[page] || 'Dashboard';
    const laboran = user.role === 'laboran';
    const pages = laboran
      ? { dashboard: renderLaboranDashboard, approvals: renderApprovals, inventory: renderInventory, 'tool-form': renderToolForm, accounts: renderAccounts, history: renderHistory }
      : { dashboard: renderStudentDashboard, borrow: renderBorrow, 'my-loans': renderMyLoans, profile: renderProfile };
    $('#page-content').innerHTML = (pages[page] || pages.dashboard)();
  }

  function loanRows(rows, laboran) {
    if (!rows.length) return emptyRow(laboran ? 6 : 5, 'Belum ada peminjaman', 'Transaksi akan tampil di sini.');
    return rows.map((loan) => {
      const items = (loan.items || []).map((item) => esc(item.name) + ' × ' + Number(item.quantity)).join('<br>');
      let action = '<span class="muted">—</span>';
      if (laboran && loan.status === 'Menunggu persetujuan') {
        action = '<div class="action-group"><button class="button button-sm button-success" data-action="approve" data-id="' + esc(loan.id) + '">Setujui</button><button class="button button-sm button-danger" data-action="reject" data-id="' + esc(loan.id) + '">Tolak</button></div>';
      } else if (!laboran && loan.status === 'Dipinjam') {
        action = '<button class="button button-sm button-ghost" data-action="request-return" data-id="' + esc(loan.id) + '">Ajukan pengembalian</button>';
      } else if (laboran && loan.status === 'Menunggu pengembalian') {
        action = '<button class="button button-sm button-success" data-action="confirm-return" data-id="' + esc(loan.id) + '">Konfirmasi kembali</button>';
      }
      const student = laboran ? '<td><span class="item-name">' + esc(loan.userName) + '</span><span class="item-sub">ID ' + esc(loan.username) + ' · ' + esc(loan.className || '—') + '</span></td>' : '';
      return '<tr><td class="item-name">' + esc(loan.id) + '</td>' + student + '<td>' + items + '</td><td>' + dateText(loan.startDate) +
        '<span class="item-sub">s.d. ' + dateText(loan.endDate) + '</span></td><td>' + loanBadge(loan.status) + '</td><td>' + action + '</td></tr>';
    }).join('');
  }

  function renderLaboranDashboard() {
    const pending = loans.filter((loan) => loan.status === 'Menunggu persetujuan').slice().reverse().slice(0, 5);
    const latest = loans.slice().reverse().slice(0, 5);
    const stock = tools.reduce((sum, tool) => sum + Number(tool.stock || 0), 0);
    const active = loans.filter((loan) => ['Dipinjam', 'Menunggu pengembalian'].includes(loan.status)).length;
    return heading('RINGKASAN LABORATORIUM', 'Dashboard laboran', 'Ringkasan inventaris dan aktivitas peminjaman.') +
      '<section class="stats-grid">' + stat('Jenis alat', tools.length, 'Tercatat di inventaris', '▦', 'green') +
      stat('Jumlah stok', stock, 'Unit di laboratorium', '⌘', 'blue') +
      stat('Menunggu persetujuan', loans.filter((l) => l.status === 'Menunggu persetujuan').length, 'Pengajuan siswa', '◷', 'amber') +
      stat('Sedang dipinjam', active, 'Belum dikonfirmasi kembali', '↗', 'violet') + '</section>' +
      '<section class="panel"><div class="panel-heading"><div><h2>Pengajuan terbaru</h2><p>Setujui atau tolak permintaan siswa</p></div><button class="button button-sm button-ghost" data-page="approvals">Buka persetujuan →</button></div>' +
      '<div class="table-wrap"><table><thead><tr><th>ID TRANSAKSI</th><th>SISWA</th><th>ALAT</th><th>PERIODE</th><th>STATUS</th><th>AKSI</th></tr></thead><tbody>' +
      (pending.length ? pending.map((loan) => '<tr><td class="item-name">' + esc(loan.id) + '</td><td>' + esc(loan.userName) + '<span class="item-sub">ID ' + esc(loan.username) + '</span></td><td>' + loan.items.map((it) => esc(it.name) + ' × ' + it.quantity).join('<br>') + '</td><td>' + dateText(loan.startDate) + ' – ' + dateText(loan.endDate) + '</td><td>' + loanBadge(loan.status) + '</td><td><div class="action-group"><button class="button button-sm button-success" data-action="approve" data-id="' + esc(loan.id) + '">Setujui</button><button class="button button-sm button-danger" data-action="reject" data-id="' + esc(loan.id) + '">Tolak</button></div></td></tr>').join('') : emptyRow(6, 'Tidak ada pengajuan baru', 'Pengajuan siswa akan muncul di sini.')) +
      '</tbody></table></div></section><section class="panel"><div class="panel-heading"><div><h2>Aktivitas terbaru</h2><p>Riwayat pinjam dan pengembalian</p></div><button class="button button-sm button-ghost" data-page="history">Riwayat lengkap →</button></div>' +
      '<div class="table-wrap"><table><thead><tr><th>ID TRANSAKSI</th><th>SISWA</th><th>TANGGAL PINJAM</th><th>STATUS</th></tr></thead><tbody>' +
      (latest.length ? latest.map((l) => '<tr><td class="item-name">' + esc(l.id) + '</td><td>' + esc(l.userName) + '</td><td>' + dateText(l.startDate) + '</td><td>' + loanBadge(l.status) + '</td></tr>').join('') : emptyRow(4, 'Belum ada aktivitas', 'Transaksi akan muncul setelah ada pengajuan.')) +
      '</tbody></table></div></section>';
  }

  function renderStudentDashboard() {
    const mine = loans.filter((loan) => loan.userId === user.username).slice().reverse();
    return heading('AKUN SISWA', 'Halo, ' + esc(user.name), 'Ringkasan peminjaman alat laboratorium.') +
      '<section class="stats-grid student-stats">' +
      stat('Peminjaman aktif', mine.filter((l) => ['Dipinjam', 'Menunggu pengembalian'].includes(l.status)).length, 'Belum selesai dikembalikan', '↗', 'green') +
      stat('Menunggu persetujuan', mine.filter((l) => l.status === 'Menunggu persetujuan').length, 'Sedang ditinjau laboran', '◷', 'amber') +
      stat('Selesai', mine.filter((l) => l.status === 'Dikembalikan').length, 'Sudah dikembalikan', '✓', 'blue') +
      '<button class="stat-card stat-card-action" data-page="borrow"><div class="stat-card-top"><span>Butuh alat?</span><span class="stat-icon green">+</span></div><strong class="stat-action-text">Ajukan peminjaman</strong><span class="stat-note">Pilih alat yang tersedia</span></button></section>' +
      '<section class="panel"><div class="panel-heading"><div><h2>Peminjaman terbaru</h2><p>Status dan jadwal pengembalian</p></div><button class="button button-sm button-ghost" data-page="my-loans">Lihat semua →</button></div>' +
      '<div class="table-wrap"><table><thead><tr><th>ID TRANSAKSI</th><th>ALAT</th><th>PERIODE</th><th>STATUS</th><th>AKSI</th></tr></thead><tbody>' + loanRows(mine.slice(0, 5), false) + '</tbody></table></div></section>';
  }

  function renderApprovals() {
    const pending = loans.filter((l) => l.status === 'Menunggu persetujuan').slice().reverse();
    const returns = loans.filter((l) => l.status === 'Menunggu pengembalian').slice().reverse();
    const body = (rows) => rows.length ? rows.map((l) => loanRows([l], true)).join('') : emptyRow(6, 'Tidak ada transaksi', 'Permintaan akan muncul di sini.');
    const table = (rows) => '<div class="table-wrap"><table><thead><tr><th>ID TRANSAKSI</th><th>SISWA</th><th>ALAT</th><th>PERIODE</th><th>STATUS</th><th>AKSI</th></tr></thead><tbody>' + body(rows) + '</tbody></table></div>';
    return heading('TINJAU PERMINTAAN', 'Persetujuan', 'Setujui atau tolak pinjaman, lalu konfirmasi pengembalian.') +
      '<section class="panel"><div class="panel-heading"><div><h2>Menunggu persetujuan</h2><p>' + pending.length + ' pengajuan pinjam</p></div></div>' + table(pending) + '</section>' +
      '<section class="panel"><div class="panel-heading"><div><h2>Menunggu konfirmasi pengembalian</h2><p>' + returns.length + ' pengembalian diajukan</p></div></div>' + table(returns) + '</section>';
  }

  function stateOf(tool) {
    const available = Number(tool.availableStock ?? tool.stock);
    if (tool.condition !== 'Baik') return { label: tool.condition, kind: tool.condition === 'Rusak' ? 'rejected' : 'pending', count: 0, ok: false };
    if (available <= 0) return { label: Number(tool.stock) > 0 ? 'Sedang dipesan' : 'Stok habis', kind: 'neutral', count: 0, ok: false };
    return { label: 'Tersedia', kind: 'returned', count: available, ok: true };
  }

  function photo(tool, className) {
    return tool.photoUrl
      ? '<img class="' + className + '" src="' + esc(tool.photoUrl) + '" alt="Foto ' + esc(tool.name) + '" loading="lazy">'
      : '<span class="' + className + ' photo-placeholder" aria-hidden="true">⌘</span>';
  }

  function inventoryRows(rows) {
    if (!rows.length) return emptyRow(6, 'Alat tidak ditemukan', 'Coba kata pencarian lain.');
    return rows.map((tool) => {
      const status = stateOf(tool);
      return '<tr><td>' + photo(tool, 'inventory-thumb') + '</td><td><span class="item-name">' + esc(tool.name) + '</span><span class="item-sub">' + esc(tool.category || 'Umum') + (tool.note ? ' · ' + esc(tool.note) : '') + '</span></td>' +
        '<td>' + Number(tool.stock) + ' unit<span class="item-sub">' + Number(tool.availableStock ?? tool.stock) + ' tersedia untuk diajukan</span></td><td>' + badge(status.label, status.kind) + '</td>' +
        '<td>' + badge(esc(tool.condition), tool.condition === 'Baik' ? 'returned' : 'pending') + '</td><td><div class="action-group"><button class="button button-sm button-ghost" data-action="edit-tool" data-id="' + esc(tool.id) + '">Edit</button><button class="button button-sm button-danger" data-action="delete-tool" data-id="' + esc(tool.id) + '">Hapus</button></div></td></tr>';
    }).join('');
  }

  function renderInventory() {
    return heading('DATA PERLENGKAPAN', 'Katalog alat', 'Kelola stok, ketersediaan, dan kondisi alat laboratorium.',
      '<button class="button button-primary" type="button" data-page="tool-form">+ Tambah alat</button>') +
      '<section class="panel"><div class="panel-heading"><div><h2>Daftar inventaris</h2><p>' + tools.length + ' jenis alat · perubahan tersimpan di spreadsheet</p></div><label class="search-box"><span>⌕</span><input id="inventory-search" type="search" placeholder="Cari alat" aria-label="Cari inventaris"></label></div>' +
      '<div class="table-wrap"><table><thead><tr><th>FOTO</th><th>NAMA ALAT</th><th>STOK</th><th>KETERSEDIAAN</th><th>KONDISI</th><th>AKSI</th></tr></thead><tbody id="inventory-rows">' + inventoryRows(tools) + '</tbody></table></div></section>';
  }

  function renderToolForm() {
    const tool = tools.find((item) => item.id === editId);
    const preview = tool && tool.photoUrl
      ? '<img id="photo-preview" class="photo-preview" src="' + esc(tool.photoUrl) + '" alt="Pratinjau foto alat">'
      : '<img id="photo-preview" class="photo-preview" alt="Pratinjau foto alat" hidden>';

    return heading('DATA PERLENGKAPAN', tool ? 'Edit alat' : 'Tambah alat baru', tool ? 'Perbarui informasi, stok, atau kondisi alat.' : 'Lengkapi data alat agar langsung tampil di katalog siswa.',
      '<button class="button button-ghost" type="button" data-page="inventory">← Kembali ke katalog</button>') +
      '<section class="panel"><div class="panel-heading"><div><h2>' + (tool ? 'Perbarui alat' : 'Informasi alat baru') + '</h2><p>Data inventaris tersimpan di spreadsheet, foto di Google Drive.</p></div></div><div class="panel-body">' +
      '<form id="inventory-form" class="inventory-form">' +
      '<div class="field"><label for="tool-name">Nama alat</label><input id="tool-name" name="name" value="' + (tool ? esc(tool.name) : '') + '" maxlength="80" required></div>' +
      '<div class="field"><label for="tool-category">Kategori</label><input id="tool-category" name="category" value="' + (tool ? esc(tool.category) : '') + '" maxlength="40" placeholder="Pengukuran"></div>' +
      '<div class="field"><label for="tool-stock">Jumlah stok</label><input id="tool-stock" name="stock" type="number" min="0" max="99999" value="' + (tool ? Number(tool.stock) : '') + '" required></div>' +
      '<div class="field"><label for="tool-condition">Kondisi</label><select id="tool-condition" name="condition"><option ' + (!tool || tool.condition === 'Baik' ? 'selected' : '') + '>Baik</option><option ' + (tool && tool.condition === 'Perlu servis' ? 'selected' : '') + '>Perlu servis</option><option ' + (tool && tool.condition === 'Rusak' ? 'selected' : '') + '>Rusak</option></select></div>' +
      '<div class="field inventory-note"><label for="tool-note">Catatan <span class="optional">opsional</span></label><input id="tool-note" name="note" value="' + (tool ? esc(tool.note) : '') + '" maxlength="120"></div>' +
      '<div class="field photo-field"><label for="tool-photo">Foto alat <span class="optional">opsional</span></label><input id="tool-photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp"><span class="field-help">Foto akan dikompres sebelum diunggah.</span>' + preview + '</div>' +
      '<div class="form-actions"><button class="button button-primary" type="submit">' + (tool ? 'Simpan perubahan' : 'Simpan alat') + '</button>' +
      '<button class="button button-ghost" type="button" data-page="inventory">Batal</button></div></form></div></section>';
  }

  function renderAccounts() {
    const rows = (items) => items.length
      ? items.map((account) => '<tr><td class="item-name">' + esc(account.username) + '</td><td>' + esc(account.name) + '</td><td>' + esc(account.className || '—') + '</td></tr>').join('')
      : emptyRow(3, 'Belum ada akun', 'Akun yang dibuat tercatat di sini.');

    return heading('MANAJEMEN PENGGUNA', 'Akun', 'Akun siswa dan guru/laboran disimpan pada tab terpisah.') +
      '<section class="panel"><div class="panel-heading"><div><h2>Buat akun guru/laboran</h2><p>Pendaftaran umum hanya membuat akun siswa.</p></div></div><div class="panel-body">' +
      '<form id="account-form" class="account-form">' +
      '<div class="field"><label for="account-name">Nama lengkap</label><input id="account-name" name="name" maxlength="80" required></div>' +
      '<div class="field"><label for="account-class">Kelas / unit</label><input id="account-class" name="className" maxlength="40"></div>' +
      '<div class="field"><label for="account-id">ID login</label><input id="account-id" name="username" minlength="3" maxlength="32" required></div>' +
      '<div class="field"><label for="account-password">Password</label><input id="account-password" name="password" type="password" minlength="6" autocomplete="new-password" required></div>' +
      '<div class="form-actions"><button class="button button-primary" type="submit">Buat akun laboran</button></div></form></div></section>' +
      '<div class="account-grid"><section class="panel"><div class="panel-heading"><div><h2>Guru / Laboran</h2><p>Tab: Akun Guru-Laboran</p></div></div><div class="table-wrap"><table><thead><tr><th>ID LOGIN</th><th>NAMA</th><th>KELAS / UNIT</th></tr></thead><tbody>' + rows(accounts.laboran || []) + '</tbody></table></div></section>' +
      '<section class="panel"><div class="panel-heading"><div><h2>Siswa</h2><p>Tab: Akun Siswa</p></div></div><div class="table-wrap"><table><thead><tr><th>ID LOGIN</th><th>NAMA</th><th>KELAS</th></tr></thead><tbody>' + rows(accounts.siswa || []) + '</tbody></table></div></section></div>';
  }

  function historyRows(rows) {
    if (!rows.length) return emptyRow(6, 'Belum ada transaksi', 'Riwayat akan muncul setelah ada pengajuan.');
    return rows.map((loan) => {
      let action = '<span class="muted">—</span>';
      if (loan.status === 'Menunggu persetujuan') {
        action = '<div class="action-group"><button class="button button-sm button-success" data-action="approve" data-id="' + esc(loan.id) + '">Setujui</button><button class="button button-sm button-danger" data-action="reject" data-id="' + esc(loan.id) + '">Tolak</button></div>';
      } else if (loan.status === 'Menunggu pengembalian') {
        action = '<button class="button button-sm button-success" data-action="confirm-return" data-id="' + esc(loan.id) + '">Konfirmasi kembali</button>';
      }
      return '<tr><td class="item-name">' + esc(loan.id) + '</td><td>' + esc(loan.userName) + '<span class="item-sub">ID ' + esc(loan.username) + ' · ' + esc(loan.className || '—') + '</span></td>' +
        '<td>' + loan.items.map((item) => esc(item.name) + ' × ' + item.quantity).join('<br>') + '</td><td>' + dateText(loan.startDate) + '<span class="item-sub">s.d. ' + dateText(loan.endDate) + '</span></td><td>' + loanBadge(loan.status) + '</td><td>' + action + '</td></tr>';
    }).join('');
  }

  function renderHistory() {
    const statuses = ['Semua status', 'Menunggu persetujuan', 'Dipinjam', 'Menunggu pengembalian', 'Ditolak', 'Dikembalikan'];
    const rows = loans.slice().reverse();
    return heading('ARSIP PEMINJAMAN', 'Riwayat peminjaman', 'Riwayat transaksi tersimpan pada tab Riwayat Peminjaman.') +
      '<section class="panel"><div class="panel-heading"><div><h2>Semua transaksi</h2><p>' + rows.length + ' transaksi</p></div><select id="history-filter" class="filter-select" aria-label="Filter status">' +
      statuses.map((status, index) => '<option value="' + (index ? esc(status) : 'all') + '">' + esc(status) + '</option>').join('') +
      '</select></div><div class="table-wrap"><table><thead><tr><th>ID TRANSAKSI</th><th>SISWA</th><th>ALAT</th><th>PERIODE</th><th>STATUS</th><th>AKSI</th></tr></thead><tbody id="history-rows">' + historyRows(rows) + '</tbody></table></div></section>';
  }

  function renderBorrowCards(rows) {
    if (!rows.length) return '<p class="empty-state">Belum ada alat di inventaris laboratorium.</p>';
    return rows.map((tool) => {
      const state = stateOf(tool);
      const count = Number(cart[tool.id] || 0);
      return '<article class="equipment-card' + (state.ok ? '' : ' unavailable') + '"><div class="equipment-top">' + photo(tool, 'equipment-photo') + badge(state.label, state.kind) + '</div>' +
        '<span class="equipment-category">' + esc(tool.category || 'Umum') + '</span><h3>' + esc(tool.name) + '</h3><p>' + esc(tool.note || 'Alat laboratorium fisika') + '</p>' +
        '<div class="equipment-bottom"><span class="stock-copy">Stok: ' + Number(tool.stock) + ' · Tersedia: ' + state.count + '</span>' +
        (state.ok ? '<div class="quantity-control"><button type="button" data-action="quantity" data-id="' + esc(tool.id) + '" data-delta="-1" aria-label="Kurangi ' + esc(tool.name) + '" ' + (count <= 0 ? 'disabled' : '') + '>−</button><span>' + count + '</span>' +
        '<button type="button" data-action="quantity" data-id="' + esc(tool.id) + '" data-delta="1" aria-label="Tambah ' + esc(tool.name) + '" ' + (count >= state.count ? 'disabled' : '') + '>+</button></div>' : '<span class="unavailable-copy">Tidak dapat dipinjam</span>') + '</div></article>';
    }).join('');
  }

  function renderBorrow() {
    const available = tools.filter((tool) => stateOf(tool).ok);
    const picked = Object.values(cart).reduce((sum, qty) => sum + Number(qty), 0);
    const selected = Object.entries(cart).filter(([, qty]) => qty > 0);
    const summary = selected.length
      ? selected.map(([id, qty]) => {
          const tool = tools.find((entry) => entry.id === id);
          return tool ? '<div class="summary-row"><span>' + esc(tool.name) + '</span><strong>' + qty + ' unit</strong></div>' : '';
        }).join('') + '<div class="summary-row summary-total"><span>Total unit</span><strong>' + picked + '</strong></div>'
      : '<div class="empty-cart"><span>＋</span><p>Pilih alat untuk memulai.</p></div>';

    return heading('PEMINJAMAN SISWA', 'Pinjam alat', 'Pilih alat dan tentukan tanggal peminjaman.') +
      '<section class="stats-grid compact-stats">' + stat('Jenis alat tersedia', available.length, 'Disinkronkan dengan Sheets', '⌘', 'green') +
      stat('Unit dipilih', picked, 'Pada pengajuan ini', '+', 'blue') + '</section><div class="borrow-layout"><div class="borrow-main">' +
      '<section class="panel"><div class="panel-heading"><div><h2>Katalog alat</h2><p>Semua alat inventaris ditampilkan, termasuk yang rusak atau stoknya habis.</p></div><label class="search-box"><span>⌕</span><input id="catalog-search" type="search" placeholder="Cari alat" aria-label="Cari alat"></label></div>' +
      '<div id="catalog-grid" class="catalog-grid">' + renderBorrowCards(tools) + '</div></section>' +
      '<section class="panel"><div class="panel-heading"><div><h2>Periode peminjaman</h2><p>Tanggal kembali tidak boleh sebelum tanggal pinjam.</p></div></div><div class="panel-body">' +
      '<form id="loan-form" class="date-form"><div class="field"><label for="loan-start">Tanggal pinjam</label><input id="loan-start" name="startDate" type="date" min="' + today() + '" value="' + startDate + '" required></div>' +
      '<div class="field"><label for="loan-end">Tanggal kembali</label><input id="loan-end" name="endDate" type="date" min="' + (startDate || today()) + '" value="' + endDate + '" required></div>' +
      '<button class="button button-primary" type="submit" ' + (picked ? '' : 'disabled') + '>Kirim pengajuan →</button></form></div></section></div>' +
      '<aside class="panel cart-panel"><div class="panel-heading"><div><h2>Ringkasan</h2><p>Alat pilihan</p></div></div><div class="panel-body"><div id="cart-summary">' + summary + '</div>' +
      '<div class="summary-row summary-date"><span>Tanggal pinjam</span><strong id="summary-start">' + dateText(startDate) + '</strong></div><div class="summary-row summary-date"><span>Tanggal kembali</span><strong id="summary-end">' + dateText(endDate) + '</strong></div>' +
      '<p class="helper-copy">Stok berubah pada sistem saat permintaan tersimpan. Penolakan atau pengembalian akan memperbarui stok lagi.</p></div></aside></div>';
  }

  function renderMyLoans() {
    const mine = loans.filter((loan) => loan.userId === user.username).slice().reverse();
    return heading('AKTIVITAS SAYA', 'Peminjaman saya', 'Pantau status dan ajukan pengembalian alat.') +
      '<section class="panel"><div class="panel-heading"><div><h2>Riwayat saya</h2><p>' + mine.length + ' transaksi tersimpan di spreadsheet</p></div></div>' +
      '<div class="table-wrap"><table><thead><tr><th>ID TRANSAKSI</th><th>ALAT</th><th>PERIODE</th><th>STATUS</th><th>AKSI</th></tr></thead><tbody>' + loanRows(mine, false) + '</tbody></table></div></section>';
  }

  function renderProfile() {
    return heading('AKUN SAYA', 'Profil', 'Data profil tersimpan pada tab Akun Siswa.') +
      '<section class="profile-layout"><div class="profile-card"><div class="profile-avatar">' + esc(initials(user.name)) + '</div><span class="eyebrow">SISWA</span><h2>' + esc(user.name) + '</h2><p>ID ' + esc(user.username) + '</p></div>' +
      '<section class="panel"><div class="panel-heading"><div><h2>Informasi profil</h2><p>Perbarui nama atau kelas.</p></div></div><div class="panel-body">' +
      '<form id="profile-form" class="profile-form"><div class="field"><label for="profile-id">ID siswa</label><input id="profile-id" value="' + esc(user.username) + '" disabled></div>' +
      '<div class="field"><label for="profile-name">Nama lengkap</label><input id="profile-name" name="name" value="' + esc(user.name) + '" maxlength="80" required></div>' +
      '<div class="field"><label for="profile-class">Kelas</label><input id="profile-class" name="className" value="' + esc(user.className || '') + '" maxlength="40"></div>' +
      '<button class="button button-primary" type="submit">Simpan profil</button></form></div></section></section>';
  }

  async function compressImage(file) {
    if (!file) return '';
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Pilih foto JPG, PNG, atau WebP.');
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    try {
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error('Foto tidak dapat dibaca.'));
        image.src = objectUrl;
      });
      const scale = Math.min(1, 1000 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      return await new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (!blob) return reject(new Error('Foto gagal dikompres.'));
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error('Foto gagal dibaca.'));
          reader.readAsDataURL(blob);
        }, 'image/jpeg', 0.78);
      });
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  async function mutate(action, data, success) {
    try {
      const result = await api(action, data);
      await refresh(false);
      showApp();
      if (success) toast(result.message || success);
    } catch (error) {
      toast(error.message);
      await refresh(true).catch(() => {});
    }
  }

  async function submitLoan(form) {
    const data = new FormData(form);
    const dateFrom = String(data.get('startDate') || '');
    const dateTo = String(data.get('endDate') || '');
    const items = Object.entries(cart).filter(([, qty]) => qty > 0).map(([toolId, quantity]) => ({ toolId, quantity: Number(quantity) }));
    if (!items.length) return toast('Pilih minimal satu alat.');
    if (!dateFrom || !dateTo || dateFrom < today() || dateTo < dateFrom) return toast('Periksa kembali tanggal peminjaman.');
    try {
      const result = await api('createLoan', { startDate: dateFrom, endDate: dateTo, items });
      cart = {};
      startDate = today();
      endDate = today();
      await refresh(false);
      page = 'my-loans';
      showApp();
      toast(result.message);
    } catch (error) {
      toast(error.message);
      await refresh(true).catch(() => {});
    }
  }

  async function saveTool(form) {
    const data = new FormData(form);
    const existing = tools.find((item) => item.id === editId);
    const tool = {
      id: editId,
      name: String(data.get('name') || '').trim(),
      category: String(data.get('category') || '').trim(),
      stock: Number(data.get('stock')),
      condition: String(data.get('condition') || 'Baik'),
      note: String(data.get('note') || '').trim(),
      photoUrl: existing ? existing.photoUrl || '' : ''
    };
    try {
      const file = data.get('photo');
      const photoDataUrl = file && file.size ? await compressImage(file) : '';
      const result = await api('saveTool', { tool, photoDataUrl });
      editId = '';
      page = 'inventory';
      await refresh(false);
      showApp();
      toast(result.message);
    } catch (error) {
      toast(error.message);
    }
  }

  async function createLaboran(form) {
    const data = new FormData(form);
    const account = {
      name: String(data.get('name') || '').trim(),
      className: String(data.get('className') || '').trim(),
      username: String(data.get('username') || '').trim(),
      password: String(data.get('password') || '')
    };
    try {
      const result = await api('createAccount', { account });
      form.reset();
      await refresh(false);
      showApp();
      toast(result.message);
    } catch (error) {
      toast(error.message);
    }
  }

  document.addEventListener('click', async (event) => {
    if (event.target.closest('#logout-button')) {
      event.preventDefault();
      store.setSession(null);
      window.location.replace('index.html');
      return;
    }

    const pageLink = event.target.closest('[data-page]');
    if (pageLink && $('#app-view').contains(pageLink)) {
      event.preventDefault();
      page = pageLink.dataset.page;
      editId = '';
      showApp();
      return;
    }

    const button = event.target.closest('[data-action]');
    if (!button || button.disabled) return;
    const id = button.dataset.id;
    const action = button.dataset.action;

    if (action === 'quantity') {
      const tool = tools.find((item) => item.id === id);
      const available = tool ? stateOf(tool).count : 0;
      const next = Number(cart[id] || 0) + Number(button.dataset.delta);
      if (next <= 0) delete cart[id];
      else if (next <= available) cart[id] = next;
      renderPage();
    }
    if (action === 'approve') await mutate('processLoan', { id, decision: 'approve' }, 'Peminjaman disetujui.');
    if (action === 'reject') await mutate('processLoan', { id, decision: 'reject' }, 'Pengajuan ditolak.');
    if (action === 'request-return') await mutate('requestReturn', { id }, 'Permintaan pengembalian dikirim.');
    if (action === 'confirm-return') await mutate('confirmReturn', { id }, 'Pengembalian dikonfirmasi.');
    if (action === 'edit-tool') {
      editId = id;
      page = 'tool-form';
      showApp();
      $('#tool-name')?.focus();
    }
    if (action === 'cancel-edit') {
      editId = '';
      page = 'inventory';
      showApp();
    }
    if (action === 'delete-tool') {
      const tool = tools.find((item) => item.id === id);
      if (tool && window.confirm('Hapus ' + tool.name + ' dari inventaris?')) {
        await mutate('deleteTool', { id }, 'Alat dihapus dari inventaris.');
      }
    }
  });

  $('#page-content').addEventListener('input', (event) => {
    if (event.target.id === 'catalog-search') {
      const term = norm(event.target.value);
      const rows = tools.filter((tool) => norm(tool.name).includes(term) || norm(tool.category).includes(term));
      $('#catalog-grid').innerHTML = renderBorrowCards(rows);
    }
    if (event.target.id === 'inventory-search') {
      const term = norm(event.target.value);
      const rows = tools.filter((tool) => norm(tool.name).includes(term) || norm(tool.category).includes(term));
      $('#inventory-rows').innerHTML = inventoryRows(rows);
    }
  });

  $('#page-content').addEventListener('change', (event) => {
    if (event.target.id === 'loan-start') {
      startDate = event.target.value;
      const endInput = $('#loan-end');
      endInput.min = startDate || today();
      if (endInput.value < endInput.min) {
        endInput.value = endInput.min;
        endDate = endInput.value;
      }
      $('#summary-start').textContent = dateText(startDate);
      $('#summary-end').textContent = dateText(endDate);
    }
    if (event.target.id === 'loan-end') {
      endDate = event.target.value;
      $('#summary-end').textContent = dateText(endDate);
    }
    if (event.target.id === 'tool-photo') {
      const file = event.target.files && event.target.files[0];
      if (file) {
        const preview = $('#photo-preview');
        preview.src = URL.createObjectURL(file);
        preview.hidden = false;
      }
    }
    if (event.target.id === 'history-filter') {
      const status = event.target.value;
      const rows = loans.slice().reverse().filter((loan) => status === 'all' || loan.status === status);
      $('#history-rows').innerHTML = historyRows(rows);
    }
  });

  $('#page-content').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (event.target.id === 'loan-form') await submitLoan(event.target);
    if (event.target.id === 'inventory-form') await saveTool(event.target);
    if (event.target.id === 'account-form') await createLaboran(event.target);
    if (event.target.id === 'profile-form') {
      const data = new FormData(event.target);
      try {
        await api('updateProfile', {
          name: String(data.get('name') || '').trim(),
          className: String(data.get('className') || '').trim()
        });
        await refresh(false);
        showApp();
        toast('Profil tersimpan pada tab Akun Siswa.');
      } catch (error) {
        toast(error.message);
      }
    }
  });

  window.setInterval(async () => {
    if (!user || busySync) return;
    busySync = true;
    try {
      await refresh(true);
    } catch (error) {
      syncLabel('Koneksi terputus', 'offline');
      if (!offlineNoticeShown) {
        toast('Pembaruan data gagal. Halaman akan mencoba lagi secara otomatis.');
        offlineNoticeShown = true;
      }
    } finally {
      busySync = false;
    }
  }, Number(config.syncIntervalMs || 5000));

  async function boot() {
    if (!user || !user.token) {
      window.location.replace('index.html');
      return;
    }
    if (user.role !== expectedRole) {
      window.location.replace(user.role === 'laboran' ? 'laboran.html' : 'siswa.html');
      return;
    }
    // Render the dashboard from the saved session first. A temporary Sheets/API
    // error must not erase a valid login and send the user back to the login page.
    showApp();
    try {
      await refresh(true);
      showApp();
    } catch (error) {
      syncLabel('Data belum termuat', 'offline');
      toast(error.message || 'Data gagal dimuat. Aplikasi akan mencoba lagi.');
      if (/sesi (tidak ditemukan|berakhir)/i.test(error.message || '')) {
        store.setSession(null);
        window.location.replace('index.html?error=session');
      }
    }
  }

  boot();
})();