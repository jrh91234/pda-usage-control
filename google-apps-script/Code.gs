/** PDA CONTROL — Google Apps Script backend */
const SPREADSHEET_ID = '1u2Ywi5fqT1ApY9CMCCSiAYNkSCTBFs-QnEeXOKfp2LA';
const DRIVE_FOLDER_ID = '10x4TZ1tOBsp0w5jHK1NW967EejoGy7Yi';

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
  let payload;
  try { payload = JSON.parse(e.postData.contents); } catch (error) { return jsonResponse_({ ok: false, message: 'รูปแบบข้อมูลไม่ถูกต้อง' }); }
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  if (payload.action === 'registerUser') return registerUser_(ss, payload.user);
  if (payload.action === 'updateUser') return updateUser_(ss, payload.originalUsername, payload.user);
  if (payload.action === 'deleteUser') return deleteUser_(ss, payload.username);
  if (payload.action === 'registerDevice') return registerDevice_(ss, payload.device);
  if (payload.action === 'updateDevice') return updateDevice_(ss, payload.originalId, payload.device);
  if (payload.action === 'deleteDevice') return deleteDevice_(ss, payload.deviceId);
  if (payload.action === 'login') return loginUser_(ss, payload.username, payload.password);
  const event = payload.event;
  if (!event || !payload.device || !event.deviceId) return jsonResponse_({ ok: false, message: 'ข้อมูลรายการไม่ครบถ้วน' });
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const devices = ss.getSheetByName('Devices'); const rows = devices.getDataRange().getValues(); const row = rows.findIndex((item, index) => index > 0 && String(item[0]).toUpperCase() === String(event.deviceId).toUpperCase()) + 1;
    if (row <= 1) return jsonResponse_({ ok: false, message: `ไม่พบอุปกรณ์ ${event.deviceId}` });
    const currentStatus = String(rows[row - 1][3]).toLowerCase();
    const expectedStatus = event.type === 'checkout' ? 'in-use' : event.type === 'return' ? 'available' : '';
    if (!expectedStatus || String(payload.device.status).toLowerCase() !== expectedStatus) return jsonResponse_({ ok: false, message: 'สถานะรายการไม่ถูกต้อง' });
    if (event.type === 'checkout' && currentStatus !== 'available') return jsonResponse_({ ok: false, message: 'เครื่องนี้ถูกเบิกไปแล้ว กรุณาโหลดข้อมูลล่าสุด' });
    if (event.type === 'return' && currentStatus !== 'in-use') return jsonResponse_({ ok: false, message: 'เครื่องนี้ไม่ได้อยู่ในสถานะกำลังใช้งาน' });
    let photoUrl = '';
    try { photoUrl = savePhoto_(event.photo, `${event.deviceId}_${event.type}_${event.at}`); } catch (photoError) { console.log(`บันทึกรูปไม่สำเร็จ: ${photoError}`); }
    ss.getSheetByName('Transactions').appendRow([event.id, new Date(event.at), event.type, event.deviceId, event.user, event.note || '', photoUrl]);
    devices.getRange(row, 4, 1, 3).setValues([[payload.device.status, payload.device.holder || '', new Date()]]);
    const savedEvent = { id: event.id, deviceId: event.deviceId, type: event.type, user: event.user, at: new Date(event.at).toISOString(), photo: photoUrl || undefined, note: event.note || '' };
    const savedDevice = { id: rows[row - 1][0], name: rows[row - 1][1], serial: rows[row - 1][2], status: payload.device.status, holder: payload.device.holder || undefined, since: payload.device.status === 'in-use' ? Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'HH:mm') : undefined };
    return jsonResponse_({ ok: true, device: savedDevice, event: savedEvent });
  } catch (error) {
    return jsonResponse_({ ok: false, message: 'บันทึกข้อมูลไม่สำเร็จ' });
  } finally {
    try { lock.releaseLock(); } catch (error) { /* no-op */ }
  }
}
function doGet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const devices = ss.getSheetByName('Devices').getDataRange().getValues().slice(1).map(row => ({ id: row[0], name: row[1], serial: row[2], status: row[3], holder: row[4] || undefined, since: row[3] === 'in-use' && row[5] ? Utilities.formatDate(new Date(row[5]), Session.getScriptTimeZone(), 'HH:mm') : undefined }));
  const events = ss.getSheetByName('Transactions').getDataRange().getValues().slice(1).map(row => ({ id: row[0], at: new Date(row[1]).toISOString(), type: row[2], deviceId: row[3], user: row[4], note: row[5], photo: row[6] || undefined }));
  const users = ss.getSheetByName('Users').getDataRange().getValues().slice(1).filter(row => row[0]).map(row => ({ username: row[0], fullName: row[1], role: row[2] || 'operator', status: row[3] || 'active' }));
  return ContentService.createTextOutput(JSON.stringify({ ok: true, devices, events, users })).setMimeType(ContentService.MimeType.JSON);
}
function registerUser_(ss, user) { const sheet = ss.getSheetByName('Users'); const values = sheet.getDataRange().getValues(); const existing = values.findIndex((row, index) => index > 0 && String(row[0]).toLowerCase() === String(user.username).toLowerCase()) + 1; const row = [user.username, user.fullName, user.role || 'operator', user.status || 'active', hashPassword_(user.password || ''), new Date()]; if (existing > 1) sheet.getRange(existing, 1, 1, row.length).setValues([row]); else sheet.appendRow(row); return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON); }
function updateUser_(ss, originalUsername, user) { const sheet = ss.getSheetByName('Users'); const values = sheet.getDataRange().getValues(); const rowNumber = values.findIndex((row, index) => index > 0 && String(row[0]).toLowerCase() === String(originalUsername || '').toLowerCase()) + 1; if (rowNumber <= 1) return jsonResponse_({ ok: false, message: 'ไม่พบผู้ใช้งานที่ต้องการแก้ไข' }); const duplicate = values.some((row, index) => index > 0 && index + 1 !== rowNumber && String(row[0]).toLowerCase() === String(user.username).toLowerCase()); if (duplicate) return jsonResponse_({ ok: false, message: 'Username นี้มีอยู่ในระบบแล้ว' }); const oldRow = values[rowNumber - 1]; const passwordHash = user.password ? hashPassword_(user.password) : oldRow[4]; sheet.getRange(rowNumber, 1, 1, 6).setValues([[user.username, user.fullName, user.role || 'operator', user.status || 'active', passwordHash, oldRow[5] || new Date()]]); return jsonResponse_({ ok: true }); }
function deleteUser_(ss, username) { const sheet = ss.getSheetByName('Users'); const values = sheet.getDataRange().getValues(); const rowNumber = values.findIndex((row, index) => index > 0 && String(row[0]).toLowerCase() === String(username || '').toLowerCase()) + 1; if (rowNumber <= 1) return jsonResponse_({ ok: false, message: 'ไม่พบผู้ใช้งานที่ต้องการลบ' }); const target = values[rowNumber - 1]; const activeAdmins = values.filter((row, index) => index > 0 && String(row[2]).toLowerCase() === 'admin' && String(row[3]).toLowerCase() === 'active'); if (String(target[2]).toLowerCase() === 'admin' && activeAdmins.length <= 1) return jsonResponse_({ ok: false, message: 'ต้องเหลือผู้ดูแลระบบที่ใช้งานได้อย่างน้อย 1 บัญชี' }); sheet.deleteRow(rowNumber); return jsonResponse_({ ok: true }); }
function loginUser_(ss, username, password) { const rows = ss.getSheetByName('Users').getDataRange().getValues(); const row = rows.find((item, index) => index > 0 && String(item[0]).toLowerCase() === String(username).toLowerCase()); if (!row || row[3] !== 'active' || row[4] !== hashPassword_(password || '')) return ContentService.createTextOutput(JSON.stringify({ ok: false })).setMimeType(ContentService.MimeType.JSON); return ContentService.createTextOutput(JSON.stringify({ ok: true, user: { username: row[0], fullName: row[1], role: row[2] || 'operator', status: row[3] } })).setMimeType(ContentService.MimeType.JSON); }
function registerDevice_(ss, device) { const sheet = ss.getSheetByName('Devices'); const values = sheet.getDataRange().getValues(); const existing = values.findIndex((row, index) => index > 0 && String(row[0]).toLowerCase() === String(device.id).toLowerCase()) + 1; const row = [device.id, device.name, device.serial, 'available', '', new Date()]; if (existing > 1) sheet.getRange(existing, 1, 1, row.length).setValues([row]); else sheet.appendRow(row); return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON); }
function updateDevice_(ss, originalId, device) { const sheet = ss.getSheetByName('Devices'); const values = sheet.getDataRange().getValues(); const rowNumber = values.findIndex((row, index) => index > 0 && String(row[0]).toLowerCase() === String(originalId || '').toLowerCase()) + 1; if (rowNumber <= 1) return jsonResponse_({ ok: false, message: 'ไม่พบอุปกรณ์ที่ต้องการแก้ไข' }); const duplicate = values.some((row, index) => index > 0 && index + 1 !== rowNumber && String(row[0]).toLowerCase() === String(device.id).toLowerCase()); if (duplicate) return jsonResponse_({ ok: false, message: 'Device ID นี้มีอยู่ในระบบแล้ว' }); const oldRow = values[rowNumber - 1]; sheet.getRange(rowNumber, 1, 1, 6).setValues([[device.id, device.name, device.serial, oldRow[3] || 'available', oldRow[4] || '', new Date()]]); return jsonResponse_({ ok: true }); }
function deleteDevice_(ss, deviceId) { const sheet = ss.getSheetByName('Devices'); const values = sheet.getDataRange().getValues(); const rowNumber = values.findIndex((row, index) => index > 0 && String(row[0]).toLowerCase() === String(deviceId || '').toLowerCase()) + 1; if (rowNumber <= 1) return jsonResponse_({ ok: false, message: 'ไม่พบอุปกรณ์ที่ต้องการลบ' }); if (String(values[rowNumber - 1][3]).toLowerCase() === 'in-use') return jsonResponse_({ ok: false, message: 'กรุณาคืนเครื่องก่อนลบอุปกรณ์นี้' }); sheet.deleteRow(rowNumber); return jsonResponse_({ ok: true }); }
function jsonResponse_(payload) { return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON); }
function hashPassword_(password) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password, Utilities.Charset.UTF_8).map(byte => (byte < 0 ? byte + 256 : byte).toString(16).padStart(2, '0')).join(''); }
function getPhotoFolder_() { return DriveApp.getFolderById(DRIVE_FOLDER_ID); }
function savePhoto_(dataUrl, name) {
  if (!dataUrl) return '';
  const matches = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!matches) return '';
  const contentType = matches[1].split(';')[0] || 'image/jpeg';
  const extension = contentType.split('/')[1] || 'jpg';
  const safeName = String(name).replace(/[^a-zA-Z0-9._-]+/g, '_');
  const blob = Utilities.newBlob(Utilities.base64Decode(matches[2]), contentType, `${safeName}.${extension}`);
  return getPhotoFolder_().createFile(blob).getUrl();
}
