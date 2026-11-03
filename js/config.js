(function () {
  window.LABORA_CONFIG = {
    // Isi URL /exec Web App untuk mengaktifkan Google Sheets.
    apiUrl: 'https://script.google.com/macros/s/AKfycbxkjWORUoyICeu6sRECsgbhel_y3DbRr2sQq2TktxqEDHMW6Vw-3sIgXbhY2iSqHqllhw/exec',
    syncIntervalMs: 5000,
    sessionStorageKey: 'labora.session',
    demoStoragePrefix: 'labora.demo.v1.',
    demoUsers: [
      { username: 'admin', password: 'fisika2026', role: 'laboran', name: 'Admin Laboratorium', className: '' },
      { username: '2026001', password: 'siswa2026', role: 'siswa', name: 'Siswa Demo', className: 'XII IPA 1' }
    ],
    demoTools: [
      { id: 'alat-1', name: 'Jangka Sorong', category: 'Pengukuran', stock: 8, condition: 'Baik', note: 'Ketelitian 0,05 mm', photoUrl: '' },
      { id: 'alat-2', name: 'Mikrometer Sekrup', category: 'Pengukuran', stock: 6, condition: 'Baik', note: 'Rentang ukur 0–25 mm', photoUrl: '' },
      { id: 'alat-3', name: 'Neraca Ohaus', category: 'Mekanika', stock: 4, condition: 'Baik', note: 'Neraca tiga lengan', photoUrl: '' },
      { id: 'alat-4', name: 'Stopwatch Digital', category: 'Pengukuran', stock: 12, condition: 'Baik', note: '', photoUrl: '' },
      { id: 'alat-5', name: 'Kit Optik', category: 'Optik', stock: 2, condition: 'Baik', note: 'Lensa dan cermin', photoUrl: '' },
      { id: 'alat-6', name: 'Osiloskop', category: 'Elektronika', stock: 0, condition: 'Baik', note: 'Stok habis', photoUrl: '' },
      { id: 'alat-7', name: 'Multimeter Digital', category: 'Elektronika', stock: 5, condition: 'Perlu servis', note: 'Menunggu pengecekan', photoUrl: '' }
    ]
  };
})();