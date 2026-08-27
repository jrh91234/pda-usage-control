/** PDA CONTROL — Google Apps Script backend */
const SPREADSHEET_ID = 'PASTE_YOUR_GOOGLE_SHEET_ID_HERE';
const DRIVE_FOLDER_NAME = 'PDA Control - Verification Photos';

function initialize() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  [['Devices', ['Device ID', 'Name', 'Serial', 'Status', 'Current user', 'Updated at']], ['Transactions', ['Transaction ID', 'Timestamp', 'Action', 'Device ID', 'User', 'Note', 'Photo URL']], ['Users', ['Username', 'Full name', 'Role', 'Status', 'Password hash', 'Created at']]].forEach(([name, headers]) => {
    let sheet = ss.getSheetByName(name); if (!sheet) sheet = ss.insertSheet(name);
    if (sheet.getLastRow() === 0) sheet.appendRow(headers); sheet.setFrozenRows(1);
  });
  const devices = ss.getSheetByName('Devices');
  if (devices.getLastRow() === 1) {
    const rows = Array.from({ length: 11 }, (_, i) => [`PDA-${String(i + 1).padStart(2, '0')}`, `PDA Scanner ${String(i + 1).padStart(2, '0')}`, `ZB-${202601 + i}`, 'available', '', new Date()]);
    devices.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }
  const users = ss.getSheetByName('Users');
  if (users.getLastColumn() === 5) { users.insertColumnBefore(5); users.getRange(1, 5).setValue('Password hash'); }
  if (users.getLastRow() === 1) users.appendRow(['admin', 'System Administrator', 'admin', 'active', hashPassword_('PDAadmin2026!'), new Date()]);
  else if (users.getRange(2, 1).getValue() === 'admin' && !users.getRange(2, 5).getValue()) users.getRange(2, 5).setValue(hashPassword_('PDAadmin2026!'));
  getPhotoFolder_();
}

function doPost(e) {
  const payload = JSON.parse(e.postData.contents); const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  if (payload.action === 'registerUser') return registerUser_(ss, payload.user);
  if (payload.action === 'registerDevice') return registerDevice_(ss, payload.device);
  if (payload.action === 'login') return loginUser_(ss, payload.username, payload.password);
  const event = payload.event;
  const photoUrl = savePhoto_(event.photo, `${event.deviceId}_${event.type}_${event.at}`);
  ss.getSheetByName('Transactions').appendRow([event.id, new Date(event.at), event.type, event.deviceId, event.user, event.note || '', photoUrl]);
  const devices = ss.getSheetByName('Devices'); const rows = devices.getDataRange().getValues(); const row = rows.findIndex((item, index) => index > 0 && item[0] === event.deviceId) + 1;
  if (row > 1) devices.getRange(row, 4, 1, 3).setValues([[payload.device.status, payload.device.holder || '', new Date()]]);
  return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
}
function doGet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const devices = ss.getSheetByName('Devices').getDataRange().getValues().slice(1).map(row => ({ id: row[0], name: row[1], serial: row[2], status: row[3], holder: row[4] || undefined, since: row[5] ? Utilities.formatDate(new Date(row[5]), Session.getScriptTimeZone(), 'HH:mm') : undefined }));
  const events = ss.getSheetByName('Transactions').getDataRange().getValues().slice(1).map(row => ({ id: row[0], at: new Date(row[1]).toISOString(), type: row[2], deviceId: row[3], user: row[4], note: row[5], photo: row[6] || undefined }));
  const users = ss.getSheetByName('Users').getDataRange().getValues().slice(1).filter(row => row[0]).map(row => ({ username: row[0], fullName: row[1], role: row[2] || 'operator', status: row[3] || 'active' }));
  return ContentService.createTextOutput(JSON.stringify({ ok: true, devices, events, users })).setMimeType(ContentService.MimeType.JSON);
}
function registerUser_(ss, user) { const sheet = ss.getSheetByName('Users'); const values = sheet.getDataRange().getValues(); const existing = values.findIndex((row, index) => index > 0 && String(row[0]).toLowerCase() === String(user.username).toLowerCase()) + 1; const row = [user.username, user.fullName, user.role || 'operator', user.status || 'active', hashPassword_(user.password || ''), new Date()]; if (existing > 1) sheet.getRange(existing, 1, 1, row.length).setValues([row]); else sheet.appendRow(row); return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON); }
function loginUser_(ss, username, password) { const rows = ss.getSheetByName('Users').getDataRange().getValues(); const row = rows.find((item, index) => index > 0 && String(item[0]).toLowerCase() === String(username).toLowerCase()); if (!row || row[3] !== 'active' || row[4] !== hashPassword_(password || '')) return ContentService.createTextOutput(JSON.stringify({ ok: false })).setMimeType(ContentService.MimeType.JSON); return ContentService.createTextOutput(JSON.stringify({ ok: true, user: { username: row[0], fullName: row[1], role: row[2] || 'operator', status: row[3] } })).setMimeType(ContentService.MimeType.JSON); }
function registerDevice_(ss, device) { const sheet = ss.getSheetByName('Devices'); const values = sheet.getDataRange().getValues(); const existing = values.findIndex((row, index) => index > 0 && String(row[0]).toLowerCase() === String(device.id).toLowerCase()) + 1; const row = [device.id, device.name, device.serial, 'available', '', new Date()]; if (existing > 1) sheet.getRange(existing, 1, 1, row.length).setValues([row]); else sheet.appendRow(row); return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON); }
function hashPassword_(password) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password, Utilities.Charset.UTF_8).map(byte => (byte < 0 ? byte + 256 : byte).toString(16).padStart(2, '0')).join(''); }
function getPhotoFolder_() { const folders = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME); return folders.hasNext() ? folders.next() : DriveApp.createFolder(DRIVE_FOLDER_NAME); }
function savePhoto_(dataUrl, name) { if (!dataUrl) return ''; const matches = dataUrl.match(/^data:(.+);base64,(.+)$/); if (!matches) return ''; const blob = Utilities.newBlob(Utilities.base64Decode(matches[2]), matches[1], `${name}.jpg`); return getPhotoFolder_().createFile(blob).getUrl(); }
