/**
 * BBC — Buatan Business Cockpit
 * Setup.gs : menu "BBC" di spreadsheet backend, setup awal, dan kelola user.
 */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('BBC')
    .addItem('1. Setup awal (buat sheet)', 'bbcSetupAwal')
    .addItem('2. Tambah / reset user', 'bbcMenuUser')
    .addSeparator()
    .addItem('Sinkron sekarang', 'bbcMenuSync')
    .addItem('Sinkron ulang semua file', 'bbcMenuSyncPaksa')
    .addSeparator()
    .addItem('Nyalakan sinkron otomatis (tiap 15 menit)', 'bbcPasangTrigger')
    .addItem('Matikan sinkron otomatis', 'bbcHapusTrigger')
    .addToUi();
}

function bbcSetupAwal() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone('Asia/Jakarta');

  var set = ss.getSheetByName('Setting') || ss.insertSheet('Setting', 0);
  if (set.getLastRow() < 1) {
    set.getRange(1, 1, 7, 3).setValues([
      ['kunci', 'nilai', 'keterangan'],
      ['FOLDER_ID', '', 'ID folder Google Drive berisi file laporan (bagian URL setelah /folders/)'],
      ['NAMA_PKS', 'PKS Sei Buatan', 'Nama yang tampil di website'],
      ['KAPASITAS_TERPASANG_TON_JAM', '', 'Kapasitas terpasang pabrik (ton TBS/jam) untuk menghitung utilitas'],
      ['TARGET_REND_CPO', '', 'Target rendemen CPO (%), mis. 21.5 — kosongkan jika tidak ada'],
      ['TARGET_REND_PK', '', 'Target rendemen PK (%), mis. 4.3 — kosongkan jika tidak ada'],
      ['CATATAN', '', 'Baris di bawah ini bebas']
    ]);
    set.getRange('A1:C1').setFontWeight('bold');
    set.setColumnWidth(1, 260); set.setColumnWidth(2, 260); set.setColumnWidth(3, 520);
  }
  var users = ss.getSheetByName('Users') || ss.insertSheet('Users');
  if (users.getLastRow() < 1) {
    users.getRange(1, 1, 1, 7).setValues([['username', 'nama', 'role', 'aktif', 'salt', 'hash', 'login_terakhir']]).setFontWeight('bold');
    users.setFrozenRows(1);
  }
  var log = ss.getSheetByName('Log') || ss.insertSheet('Log');
  if (log.getLastRow() < 1) {
    log.getRange(1, 1, 1, 4).setValues([['waktu', 'user', 'aksi', 'detail']]).setFontWeight('bold');
    log.setFrozenRows(1);
  }
  Object.keys(TABEL).forEach(function (t) {
    if (!ss.getSheetByName('db_' + t)) bbcWriteTable_(t, []);
  });
  SpreadsheetApp.getUi().alert('Setup selesai.\n\nLangkah berikutnya:\n1. Isi FOLDER_ID di sheet Setting.\n2. Menu BBC > Tambah / reset user.\n3. Menu BBC > Sinkron sekarang.');
}

function bbcMenuUser() {
  var ui = SpreadsheetApp.getUi();
  var u = ui.prompt('Tambah / reset user', 'Username (huruf kecil, tanpa spasi):', ui.ButtonSet.OK_CANCEL);
  if (u.getSelectedButton() !== ui.Button.OK) return;
  var username = u.getResponseText().trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) { ui.alert('Username tidak valid (3–30 karakter: huruf, angka, titik, strip).'); return; }
  var n = ui.prompt('Nama lengkap', 'Nama yang tampil di website:', ui.ButtonSet.OK_CANCEL);
  if (n.getSelectedButton() !== ui.Button.OK) return;
  var r = ui.prompt('Role', 'Ketik "admin" atau "viewer":', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var role = r.getResponseText().trim().toLowerCase();
  if (role !== 'admin' && role !== 'viewer') { ui.alert('Role harus admin atau viewer.'); return; }
  var p = ui.prompt('Password', 'Minimal 8 karakter. Sampaikan ke pemilik akun secara langsung.', ui.ButtonSet.OK_CANCEL);
  if (p.getSelectedButton() !== ui.Button.OK) return;
  var pass = p.getResponseText();
  if (pass.length < 8) { ui.alert('Password minimal 8 karakter.'); return; }
  bbcSimpanUser(username, n.getResponseText().trim(), role, pass);
  ui.alert('User "' + username + '" disimpan (' + role + ').');
}

/** Bisa juga dipanggil dari editor: bbcSimpanUser('admin', 'Admin', 'admin', 'passwordkuat') */
function bbcSimpanUser(username, nama, role, password) {
  var sh = bbcSheet_('Users');
  var data = sh.getDataRange().getValues();
  var salt = Utilities.getUuid();
  var baris = [username, nama || username, role, true, salt, bbcHash_(salt, password), ''];
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][0]).toLowerCase() === username) {
      baris[6] = data[r][6];
      sh.getRange(r + 1, 1, 1, 7).setValues([baris]);
      return;
    }
  }
  sh.appendRow(baris);
}

function bbcMenuSync() { bbcMenuSyncJalan_(false); }
function bbcMenuSyncPaksa() { bbcMenuSyncJalan_(true); }
function bbcMenuSyncJalan_(paksa) {
  var h = bbcSync(paksa).ringkas;
  var v = bbcValidasi_().peringatan;
  var err = v.filter(function (x) { return x.level === 'error'; }).length;
  SpreadsheetApp.getUi().alert('Sinkron selesai.\n\nFile dibaca: ' + h.file_dibaca + '\nFile tidak berubah: ' + h.file_tidak_berubah +
    '\nPeringatan: ' + v.length + ' (error: ' + err + ')\n\nDetail peringatan bisa dilihat di halaman Validasi pada website.');
}

function bbcPasangTrigger() {
  bbcHapusTrigger(true);
  ScriptApp.newTrigger('bbcSyncOtomatis').timeBased().everyMinutes(15).create();
  SpreadsheetApp.getUi().alert('Sinkron otomatis aktif: setiap 15 menit.');
}

function bbcHapusTrigger(diam) {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'bbcSyncOtomatis') ScriptApp.deleteTrigger(t);
  });
  if (diam !== true) SpreadsheetApp.getUi().alert('Sinkron otomatis dimatikan.');
}
