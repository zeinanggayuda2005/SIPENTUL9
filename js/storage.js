(function () {
  'use strict';

  const config = window.LABORA_CONFIG || (window.LABORA_CONFIG = {
    apiUrl: 'https://script.google.com/macros/s/AKfycbxkjWORUoyICeu6sRECsgbhel_y3DbRr2sQq2TktxqEDHMW6Vw-3sIgXbhY2iSqHqllhw/exec',
    syncIntervalMs: 5000,
    sessionStorageKey: 'labora.session',
    demoStoragePrefix: 'labora.demo.v1.',
    demoUsers: [
      { username: 'admin', password: 'fisika2026', role: 'laboran', name: 'Admin Laboratorium', className: '' },
      { username: '2026001', password: 'siswa2026', role: 'siswa', name: 'Siswa Demo', className: 'XII IPA 1' }
    ],
    demoTools: []
  });
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const key = (name) => config.demoStoragePrefix + name;

  function getSession() {
    try {
      const value = localStorage.getItem(config.sessionStorageKey);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      return null;
    }
  }

  function setSession(session) {
    try {
      if (session) localStorage.setItem(config.sessionStorageKey, JSON.stringify(session));
      else localStorage.removeItem(config.sessionStorageKey);
      return true;
    } catch (error) {
      return false;
    }
  }

  function readDemo(name, fallback) {
    try {
      const value = localStorage.getItem(key(name));
      return value === null ? clone(fallback) : JSON.parse(value);
    } catch (error) {
      return clone(fallback);
    }
  }

  function writeDemo(name, value) {
    try {
      localStorage.setItem(key(name), JSON.stringify(value));
    } catch (error) {
      throw new Error('Penyimpanan browser penuh. Hapus foto demo atau sambungkan Google Sheets.');
    }
  }

  function ensureDemo() {
    if (localStorage.getItem(key('users')) === null) writeDemo('users', config.demoUsers);
    if (localStorage.getItem(key('tools')) === null) writeDemo('tools', config.demoTools);
    if (localStorage.getItem(key('loans')) === null) writeDemo('loans', []);
  }

  function demoSession(payload, role) {
    const session = getSession();
    if (!session || session.mode !== 'demo' || session.token !== payload.token) {
      throw new Error('Sesi demo berakhir. Silakan masuk kembali.');
    }
    if (role && session.role !== role) throw new Error('Akun ini tidak memiliki akses.');
    return session;
  }

  function publicAccount(account) {
    return {
      username: account.username,
      name: account.name,
      className: account.className || '',
      role: account.role
    };
  }

  function demoRequest(action, payload) {
    ensureDemo();
    let users = readDemo('users', config.demoUsers);
    let tools = readDemo('tools', config.demoTools);
    let loans = readDemo('loans', []);
    const findUser = (username) => users.find((account) => String(account.username).toLowerCase() === String(username || '').trim().toLowerCase());
    const findTool = (id) => tools.find((tool) => tool.id === id);

    if (action === 'login') {
      const account = findUser(payload.username);
      if (!account || account.password !== String(payload.password || '')) {
        throw new Error('ID pengguna atau password tidak cocok.');
      }
      const session = {
        ...publicAccount(account),
        token: 'demo-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2),
        mode: 'demo'
      };
      return { ok: true, session };
    }

    if (action === 'registerStudent') {
      const username = String(payload.username || '').trim();
      const name = String(payload.name || '').trim();
      const className = String(payload.className || '').trim();
      const password = String(payload.password || '');
      if (username.length < 3 || name.length < 2 || password.length < 6) {
        throw new Error('Periksa nama, ID, dan password. Password minimal 6 karakter.');
      }
      if (findUser(username)) throw new Error('ID tersebut sudah terdaftar.');
      const account = { username, name, className, password, role: 'siswa' };
      users.push(account);
      writeDemo('users', users);
      return {
        ok: true,
        session: {
          ...publicAccount(account),
          token: 'demo-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2),
          mode: 'demo'
        }
      };
    }

    if (action === 'getState') {
      const session = demoSession(payload);
      const visibleLoans = session.role === 'laboran' ? loans : loans.filter((loan) => loan.userId === session.username);
      const state = {
        ok: true,
        user: publicAccount(session),
        tools: tools.map((tool) => ({ ...tool, availableStock: Number(tool.stock || 0) })),
        loans: visibleLoans
      };
      if (session.role === 'laboran') {
        state.accounts = {
          laboran: users.filter((item) => item.role === 'laboran').map(publicAccount),
          siswa: users.filter((item) => item.role === 'siswa').map(publicAccount)
        };
      }
      return state;
    }

    if (action === 'updateProfile') {
      const session = demoSession(payload);
      if (!['laboran', 'siswa'].includes(session.role)) throw new Error('Peran akun tidak dikenali.');
      const account = findUser(session.username);
      const name = String(payload.name || '').trim();
      const className = String(payload.className || '').trim();
      if (!account || name.length < 2) throw new Error('Nama profil tidak valid.');
      account.name = name;
      account.className = className;
      writeDemo('users', users);
      const updated = { ...session, name, className };
      setSession(updated);
      return { ok: true, user: publicAccount(updated) };
    }

    if (action === 'createAccount') {
      demoSession(payload, 'laboran');
      const account = payload.account || {};
      const username = String(account.username || '').trim();
      if (username.length < 3 || String(account.name || '').trim().length < 2 || String(account.password || '').length < 6) {
        throw new Error('Periksa nama, ID, dan password akun laboran.');
      }
      if (findUser(username)) throw new Error('ID tersebut sudah terdaftar.');
      users.push({
        username,
        name: String(account.name).trim(),
        className: String(account.className || '').trim(),
        password: String(account.password),
        role: 'laboran'
      });
      writeDemo('users', users);
      return { ok: true, message: 'Akun guru/laboran berhasil dibuat.' };
    }

    if (action === 'saveTool') {
      demoSession(payload, 'laboran');
      const incoming = payload.tool || {};
      const name = String(incoming.name || '').trim();
      const stock = Number(incoming.stock);
      if (!name || !Number.isInteger(stock) || stock < 0) throw new Error('Periksa nama dan jumlah stok alat.');
      const id = incoming.id || 'alat-' + Date.now().toString(36);
      const old = findTool(id);
      const photoUrl = payload.photoDataUrl || incoming.photoUrl || (old && old.photoUrl) || '';
      const saved = {
        id,
        name,
        category: String(incoming.category || '').trim() || 'Umum',
        stock,
        condition: String(incoming.condition || 'Baik'),
        note: String(incoming.note || '').trim(),
        photoUrl
      };
      if (old) Object.assign(old, saved);
      else tools.push(saved);
      writeDemo('tools', tools);
      return { ok: true, message: 'Alat tersimpan pada demo browser.' };
    }

    if (action === 'deleteTool') {
      demoSession(payload, 'laboran');
      const active = loans.some((loan) => ['Menunggu persetujuan', 'Dipinjam', 'Menunggu pengembalian'].includes(loan.status) &&
        loan.items.some((item) => item.toolId === payload.id));
      if (active) throw new Error('Alat masih terkait peminjaman yang belum selesai.');
      const before = tools.length;
      tools = tools.filter((tool) => tool.id !== payload.id);
      if (tools.length === before) throw new Error('Alat tidak ditemukan.');
      writeDemo('tools', tools);
      return { ok: true, message: 'Alat dihapus dari demo browser.' };
    }

    if (action === 'createLoan') {
      const session = demoSession(payload, 'siswa');
      const startDate = String(payload.startDate || '');
      const endDate = String(payload.endDate || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < startDate) {
        throw new Error('Tanggal peminjaman tidak valid.');
      }
      if (!Array.isArray(payload.items) || !payload.items.length) throw new Error('Pilih minimal satu alat.');
      const items = payload.items.map((request) => {
        const tool = findTool(request.toolId);
        const quantity = Number(request.quantity);
        if (!tool || tool.condition !== 'Baik' || !Number.isInteger(quantity) || quantity < 1 || tool.stock < quantity) {
          throw new Error('Stok atau kondisi alat tidak mencukupi.');
        }
        return { toolId: tool.id, name: tool.name, quantity };
      });
      items.forEach((item) => { findTool(item.toolId).stock -= item.quantity; });
      const loan = {
        id: 'TRX-' + Date.now().toString(36).toUpperCase(),
        userId: session.username,
        username: session.username,
        userName: session.name,
        className: session.className || '',
        startDate,
        endDate,
        items,
        status: 'Menunggu persetujuan',
        createdAt: new Date().toISOString()
      };
      loans.push(loan);
      writeDemo('tools', tools);
      writeDemo('loans', loans);
      return { ok: true, message: 'Pengajuan tersimpan dan menunggu persetujuan.' };
    }

    if (action === 'processLoan') {
      demoSession(payload, 'laboran');
      const loan = loans.find((item) => item.id === payload.id && item.status === 'Menunggu persetujuan');
      if (!loan) throw new Error('Pengajuan tidak ditemukan atau sudah diproses.');
      if (payload.decision === 'approve') {
        if (loan.items.some((item) => !findTool(item.toolId) || findTool(item.toolId).condition !== 'Baik')) {
          throw new Error('Kondisi alat berubah. Tolak pengajuan ini untuk mengembalikan stok.');
        }
        loan.status = 'Dipinjam';
        loan.approvedAt = new Date().toISOString();
        writeDemo('loans', loans);
        return { ok: true, message: 'Peminjaman disetujui.' };
      }
      if (payload.decision !== 'reject') throw new Error('Keputusan tidak valid.');
      loan.items.forEach((item) => { const tool = findTool(item.toolId); if (tool) tool.stock += item.quantity; });
      loan.status = 'Ditolak';
      writeDemo('tools', tools);
      writeDemo('loans', loans);
      return { ok: true, message: 'Pengajuan ditolak dan stok dikembalikan.' };
    }

    if (action === 'requestReturn') {
      const session = demoSession(payload, 'siswa');
      const loan = loans.find((item) => item.id === payload.id && item.userId === session.username && item.status === 'Dipinjam');
      if (!loan) throw new Error('Peminjaman aktif tidak ditemukan.');
      loan.status = 'Menunggu pengembalian';
      loan.returnRequestedAt = new Date().toISOString();
      writeDemo('loans', loans);
      return { ok: true, message: 'Permintaan pengembalian dikirim.' };
    }

    if (action === 'confirmReturn') {
      demoSession(payload, 'laboran');
      const loan = loans.find((item) => item.id === payload.id && item.status === 'Menunggu pengembalian');
      if (!loan) throw new Error('Permintaan pengembalian tidak ditemukan.');
      loan.items.forEach((item) => { const tool = findTool(item.toolId); if (tool) tool.stock += item.quantity; });
      loan.status = 'Dikembalikan';
      loan.returnedAt = new Date().toISOString();
      writeDemo('tools', tools);
      writeDemo('loans', loans);
      return { ok: true, message: 'Pengembalian dikonfirmasi dan stok diperbarui.' };
    }

    throw new Error('Perintah demo tidak dikenal.');
  }

  async function request(action, data) {
    const url = String(config.apiUrl || '').trim();
    if (!url) return demoRequest(action, data || {});
    if (!/^https:\/\/script\.google\.com\/(?:a\/macros\/[^/]+\/)?macros\/s\/[^/]+\/exec\/?$/.test(url)) {
      throw new Error('URL Web App harus berakhiran /exec. Periksa js/config.js.');
    }

    let response;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 12000);
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, ...(data || {}) }),
        cache: 'no-store',
        signal: controller.signal
      });
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Google Sheets tidak merespons dalam 12 detik. Periksa deployment Web App dan koneksi internet.');
      }
      throw new Error('Browser tidak dapat membaca balasan Apps Script. Jalankan melalui Live Server, lalu periksa URL /exec dan akses deployment Web App.');
    } finally {
      window.clearTimeout(timeoutId);
    }

    let result;
    try {
      result = await response.json();
    } catch (error) {
      throw new Error('Apps Script tidak mengirim JSON. Pastikan URL /exec mengarah ke deployment Web App terbaru dan aksesnya diizinkan.');
    }

    if (!response.ok || !result.ok) throw new Error(result.error || 'Permintaan ke spreadsheet gagal.');
    return result;
  }

  window.LaboraStore = { getSession, setSession, request };
})();