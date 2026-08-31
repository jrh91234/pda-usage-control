'use client';

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';

type DeviceStatus = 'available' | 'in-use';
type Device = { id: string; name: string; serial: string; status: DeviceStatus; holder?: string; since?: string };
type UsageEvent = { id: string; deviceId: string; type: 'checkout' | 'return'; user: string; at: string; photo?: string; note?: string };
type RegisteredUser = { username: string; fullName: string; role: 'admin' | 'operator'; status: 'active' | 'inactive'; password?: string };
type Notification = { tone: 'success' | 'error'; text: string };

const initialDevices: Device[] = Array.from({ length: 11 }, (_, index) => {
  const number = String(index + 1).padStart(2, '0');
  return { id: `PDA-${number}`, name: `PDA Scanner ${number}`, serial: `ZB-${202600 + index + 1}`, status: index === 1 || index === 4 || index === 7 ? 'in-use' : 'available', holder: index === 1 ? 'somchai.p' : index === 4 ? 'nicha.k' : index === 7 ? 'ananda.s' : undefined, since: index === 1 ? '08:14' : index === 4 ? '09:02' : index === 7 ? '10:36' : undefined };
});

const initialEvents: UsageEvent[] = [
  { id: 'e1', deviceId: 'PDA-02', type: 'checkout', user: 'somchai.p', at: '2026-08-27T08:14:00+07:00', note: 'Line A' },
  { id: 'e2', deviceId: 'PDA-05', type: 'checkout', user: 'nicha.k', at: '2026-08-27T09:02:00+07:00', note: 'Packing' },
  { id: 'e3', deviceId: 'PDA-08', type: 'checkout', user: 'ananda.s', at: '2026-08-27T10:36:00+07:00', note: 'Warehouse' },
  { id: 'e4', deviceId: 'PDA-01', type: 'return', user: 'pimchanok.r', at: '2026-08-27T11:20:00+07:00' },
];
const users = ['somchai.p', 'nicha.k', 'ananda.s', 'pimchanok.r', 'thanawat.m'];
const initialUsers: RegisteredUser[] = users.map((username, index) => ({ username, fullName: username.split('.')[0], role: index === 0 ? 'admin' : 'operator', status: 'active' }));
const dataApiUrl = '/api/device-events';
const THAILAND_TIME_ZONE = 'Asia/Bangkok';
function formatTime(value: string) { return new Intl.DateTimeFormat('th-TH', { timeZone: THAILAND_TIME_ZONE, hour: '2-digit', minute: '2-digit' }).format(new Date(value)); }
function formatDate(value: string) { return new Intl.DateTimeFormat('th-TH', { timeZone: THAILAND_TIME_ZONE, day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value)); }
function photoSource(value?: string) { if (!value) return undefined; const match = value.match(/\/d\/([^/]+)/) || value.match(/[?&]id=([^&]+)/); return match ? `/api/device-photo?id=${encodeURIComponent(match[1])}` : value; }
function normalizeQrValue(value: string) { return value.normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function qrTextVariants(raw: string) {
  const variants = new Set<string>();
  const add = (value: unknown) => { if (typeof value === 'string' && value.trim()) variants.add(value.trim()); };
  add(raw);
  try { add(decodeURIComponent(raw)); } catch { /* QR text may not be URL encoded. */ }
  try {
    const url = new URL(raw);
    add(url.pathname);
    url.searchParams.forEach((value) => add(value));
  } catch { /* Most device QR codes are plain text rather than URLs. */ }
  try {
    const parsed: unknown = JSON.parse(raw);
    const addJson = (value: unknown, depth: number) => {
      if (depth > 2) return;
      if (typeof value === 'string') add(value);
      else if (Array.isArray(value)) value.forEach((item) => addJson(item, depth + 1));
      else if (value && typeof value === 'object') Object.values(value).forEach((item) => addJson(item, depth + 1));
    };
    addJson(parsed, 0);
  } catch { /* QR text may not be JSON. */ }
  return [...variants].map(normalizeQrValue).filter(Boolean);
}
function editDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) {
      current[column] = Math.min(current[column - 1] + 1, previous[column] + 1, previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1));
    }
    for (let column = 0; column <= right.length; column += 1) previous[column] = current[column];
  }
  return previous[right.length];
}
function matchDeviceFromQr(raw: string, devices: Device[]) {
  const variants = qrTextVariants(raw);
  const matches = devices.map((device) => {
    const id = normalizeQrValue(device.id);
    let best = { score: 0, exact: false };
    variants.forEach((value) => {
      if (value === id) best = best.score >= 1000 ? best : { score: 1000, exact: true };
      else if (value.includes(id)) best = best.score >= 900 ? best : { score: 900, exact: false };
      else if (value.length >= 3 && id.includes(value)) best = best.score >= 300 + value.length ? best : { score: 300 + value.length, exact: false };
      else {
        const rawDigits = value.match(/\d+/g)?.join('');
        const idDigits = id.match(/\d+/g)?.join('');
        if (rawDigits && rawDigits.length >= 2 && rawDigits === idDigits) best = best.score >= 500 + rawDigits.length ? best : { score: 500 + rawDigits.length, exact: false };
        else if (value.length >= 3 && Math.min(value.length, id.length) >= 3 && editDistance(value, id) <= 1) best = best.score >= 200 ? best : { score: 200, exact: false };
      }
    });
    return { device, ...best };
  }).filter((match) => match.score > 0).sort((left, right) => right.score - left.score);
  const winner = matches[0];
  if (!winner || (matches[1] && matches[1].score === winner.score)) return null;
  return { device: winner.device, guessed: !winner.exact };
}
function bangkokDateInputValue(value: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: THAILAND_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export default function Home() {
  const [devices, setDevices] = useState(initialDevices);
  const [events, setEvents] = useState(initialEvents);
  const [screen, setScreen] = useState<'devices' | 'timeline' | 'admin'>('devices');
  const [registeredUsers, setRegisteredUsers] = useState<RegisteredUser[]>(initialUsers);
  const [authStatus, setAuthStatus] = useState<'loading' | 'signed-out' | 'signed-in'>('loading');
  const [authUser, setAuthUser] = useState<RegisteredUser | null>(null);
  const [activeDevice, setActiveDevice] = useState<Device | null>(null);
  const [mode, setMode] = useState<'checkout' | 'return'>('checkout');
  const [username, setUsername] = useState(users[0]);
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<string | undefined>();
  const [isScanning, setIsScanning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [notification, setNotification] = useState<Notification | null>(null);
  const [signedInUser, setSignedInUser] = useState('กำลังตรวจสอบบัญชี…');
  const videoRef = useRef<HTMLVideoElement>(null);
  const scanTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const scannerControls = useRef<{ stop: () => void } | undefined>(undefined);
  const notificationTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  function showNotification(text: string, tone: Notification['tone'] = 'success') {
    setNotification({ text, tone });
    if (notificationTimer.current) window.clearTimeout(notificationTimer.current);
    notificationTimer.current = window.setTimeout(() => setNotification(null), 3800);
  }
  useEffect(() => () => { if (notificationTimer.current) window.clearTimeout(notificationTimer.current); }, []);
  useEffect(() => {
    fetch('/api/auth/session').then((response) => response.json()).then((data) => {
      if (data.authenticated && data.user) { setAuthUser(data.user); setSignedInUser(data.user.fullName || data.user.username); setUsername(data.user.username); setAuthStatus('signed-in'); }
      else setAuthStatus('signed-out');
    }).catch(() => setAuthStatus('signed-out'));
  }, []);
  useEffect(() => {
    fetch(dataApiUrl, { cache: 'no-store' }).then(async (response) => {
      if (!response.ok) throw new Error('load-failed');
      return response.json();
    }).then((data) => {
      if (Array.isArray(data.devices)) setDevices(data.devices);
      if (Array.isArray(data.events)) setEvents(data.events);
      if (Array.isArray(data.users) && data.users.length) setRegisteredUsers(data.users);
    }).catch(() => setMessage('ยังโหลดข้อมูล Google ไม่ได้ — กำลังแสดงข้อมูลตัวอย่าง'));
  }, []);
  const summary = useMemo(() => ({ available: devices.filter((item) => item.status === 'available').length, inUse: devices.filter((item) => item.status === 'in-use').length }), [devices]);
  const sortedEvents = useMemo(() => [...events].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()), [events]);
  function openFlow(device: Device) {
    setActiveDevice(device); setMode(device.status === 'available' ? 'checkout' : 'return'); setPhoto(undefined); setNote(''); setMessage('');
  }
  function closeFlow() { stopScanner(); setActiveDevice(null); setIsSubmitting(false); }
  function attachPhoto(event: ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => setPhoto(String(reader.result)); reader.readAsDataURL(file); }
  async function startScanner() {
    setMessage('');
    if (!navigator.mediaDevices?.getUserMedia) { setMessage('เบราว์เซอร์นี้ไม่รองรับกล้อง — กรุณาเปิดเว็บด้วยอุปกรณ์ที่ใช้กล้องได้'); return; }
    setIsScanning(true);
    try {
      const { BrowserQRCodeReader } = await import('@zxing/browser');
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      if (!videoRef.current) throw new Error('scanner-preview-not-ready');
      const reader = new BrowserQRCodeReader();
      scannerControls.current = await reader.decodeFromConstraints({ video: { facingMode: { ideal: 'environment' } } }, videoRef.current, (result) => {
        if (!result) return;
        const scannedText = result.getText().trim();
        const matched = matchDeviceFromQr(scannedText, devices);
        if (!matched) { setMessage(`อ่าน QR ได้เป็น “${scannedText}” แต่ยังจับคู่เครื่องไม่ได้ — ตรวจสอบ QR แล้วลองสแกนใหม่`); return; }
        stopScanner();
        openFlow(matched.device);
        if (matched.guessed) setMessage(`อ่าน QR ได้ไม่ครบ ระบบจับคู่เป็น ${matched.device.id} ให้แล้ว`);
      });
    } catch {
      stopScanner();
      setMessage('ไม่สามารถเปิดกล้องได้ โปรดอนุญาตการใช้กล้อง แล้วลองสแกน QR อีกครั้ง');
    }
  }
  function stopScanner() { scannerControls.current?.stop(); scannerControls.current = undefined; if (scanTimer.current) clearInterval(scanTimer.current); const stream = videoRef.current?.srcObject as MediaStream | null; stream?.getTracks().forEach((track) => track.stop()); if (videoRef.current) videoRef.current.srcObject = null; setIsScanning(false); }
  async function submitFlow() {
    if (!activeDevice || !photo) { setMessage('กรุณาถ่ายหรือแนบรูปยืนยันก่อนบันทึก'); return; }
    const now = new Date().toISOString(); const event: UsageEvent = { id: crypto.randomUUID(), deviceId: activeDevice.id, type: mode, user: mode === 'return' ? activeDevice.holder || username : username, at: now, photo, note };
    const nextDevice: Device = mode === 'checkout' ? { ...activeDevice, status: 'in-use', holder: username, since: formatTime(now) } : { ...activeDevice, status: 'available', holder: undefined, since: undefined };
    setIsSubmitting(true); setMessage('กำลังบันทึกข้อมูล…');
    try {
      const response = await fetch(dataApiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: mode, device: nextDevice, event }) });
      const data = await response.json().catch(() => ({})) as { ok?: boolean; message?: string; device?: Device; event?: UsageEvent };
      if (!response.ok || !data.ok) throw new Error(data.message || 'save-failed');
      let savedDevice = data.device;
      let savedEvent = data.event;
      if (!savedDevice || !savedEvent) {
        const verifyResponse = await fetch(dataApiUrl, { cache: 'no-store' });
        if (!verifyResponse.ok) throw new Error('verify-failed');
        const verifyData = await verifyResponse.json() as { devices?: Device[]; events?: UsageEvent[] };
        savedDevice = verifyData.devices?.find((item) => item.id.toUpperCase() === nextDevice.id.toUpperCase() && item.status === nextDevice.status && (mode !== 'checkout' || item.holder === username));
        savedEvent = verifyData.events?.find((item) => item.id === event.id);
        if (!savedDevice || !savedEvent) throw new Error('verify-failed');
      }
      setDevices((items) => items.map((item) => item.id === nextDevice.id ? savedDevice as Device : item));
      setEvents((items) => [savedEvent as UsageEvent, ...items]);
      showNotification(mode === 'checkout' ? 'บันทึกการเบิกสำเร็จแล้ว' : 'บันทึกการคืนสำเร็จแล้ว');
      window.setTimeout(closeFlow, 700);
    } catch {
      const failureMessage = 'บันทึกไม่สำเร็จ ข้อมูลยังไม่ถูกเปลี่ยน กรุณาลองใหม่อีกครั้ง';
      setMessage(failureMessage); showNotification(failureMessage, 'error');
    } finally { setIsSubmitting(false); }
  }
  async function sendAdminAction(payload: Record<string, unknown>, successMessage: string, failureMessage: string) {
    try {
      const response = await fetch(dataApiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await response.json().catch(() => ({})) as { ok?: boolean; message?: string };
      if (!response.ok || data.ok !== true) throw new Error(data.message || 'save-failed');
      showNotification(successMessage);
    } catch { setMessage(failureMessage); showNotification(failureMessage, 'error'); }
  }
  async function registerUser(user: RegisteredUser) {
    const savedUser = { ...user, password: undefined };
    setRegisteredUsers((items) => [savedUser, ...items.filter((item) => item.username.toLowerCase() !== user.username.toLowerCase())]);
    await sendAdminAction({ action: 'registerUser', user }, 'บันทึกผู้ใช้งานสำเร็จแล้ว', 'เพิ่มผู้ใช้ในหน้านี้แล้ว แต่ส่งไป Google ไม่สำเร็จ');
  }
  async function updateUser(user: RegisteredUser, originalUsername: string) {
    const savedUser = { ...user, password: undefined };
    setRegisteredUsers((items) => items.map((item) => item.username.toLowerCase() === originalUsername.toLowerCase() ? savedUser : item));
    await sendAdminAction({ action: 'updateUser', originalUsername, user }, 'บันทึกการแก้ไขผู้ใช้งานสำเร็จแล้ว', 'แก้ไขผู้ใช้ในหน้านี้แล้ว แต่ส่งไป Google ไม่สำเร็จ');
  }
  async function deleteUser(usernameToDelete: string) {
    setRegisteredUsers((items) => items.filter((item) => item.username.toLowerCase() !== usernameToDelete.toLowerCase()));
    await sendAdminAction({ action: 'deleteUser', username: usernameToDelete }, 'ลบผู้ใช้งานสำเร็จแล้ว', 'ลบผู้ใช้ในหน้านี้แล้ว แต่ส่งไป Google ไม่สำเร็จ');
  }
  async function registerDevice(device: Device) {
    setDevices((items) => [device, ...items.filter((item) => item.id.toLowerCase() !== device.id.toLowerCase())]);
    await sendAdminAction({ action: 'registerDevice', device }, 'บันทึกอุปกรณ์สำเร็จแล้ว', 'เพิ่มอุปกรณ์ในหน้านี้แล้ว แต่ส่งไป Google ไม่สำเร็จ');
  }
  async function updateDevice(device: Device, originalId: string) {
    setDevices((items) => items.map((item) => item.id.toLowerCase() === originalId.toLowerCase() ? device : item));
    await sendAdminAction({ action: 'updateDevice', originalId, device }, 'บันทึกการแก้ไขอุปกรณ์สำเร็จแล้ว', 'แก้ไขอุปกรณ์ในหน้านี้แล้ว แต่ส่งไป Google ไม่สำเร็จ');
  }
  async function deleteDevice(deviceId: string) {
    setDevices((items) => items.filter((item) => item.id.toLowerCase() !== deviceId.toLowerCase()));
    await sendAdminAction({ action: 'deleteDevice', deviceId }, 'ลบอุปกรณ์สำเร็จแล้ว', 'ลบอุปกรณ์ในหน้านี้แล้ว แต่ส่งไป Google ไม่สำเร็จ');
  }
  async function login(usernameValue: string, password: string) {
    const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: usernameValue, password }) });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.message || 'เข้าสู่ระบบไม่สำเร็จ');
    setAuthUser(data.user); setSignedInUser(data.user.fullName || data.user.username); setUsername(data.user.username); setAuthStatus('signed-in');
  }
  async function logout() { await fetch('/api/auth/logout', { method: 'POST' }); setAuthUser(null); setAuthStatus('signed-out'); }
  if (authStatus === 'loading') return <LoadingScreen />;
  if (authStatus === 'signed-out') return <LoginPage onLogin={login} />;
  return <main>
    <section className="topbar"><div className="brand"><span className="brand-mark">P</span><span><strong>PDA CONTROL</strong><small>Factory device custody</small></span></div><div className="today">{formatDate(new Date().toISOString())}</div><div className="profile"><span className="avatar">{signedInUser.slice(0, 2).toUpperCase()}</span><span>{signedInUser}</span><button onClick={logout} title="ออกจากระบบ">ออกจากระบบ</button></div></section>
    <section className="hero"><div><p className="eyebrow">DEVICE OPERATIONS</p><h1>ควบคุมการใช้งาน PDA<br /><em>ให้ตรวจสอบได้ทุกครั้ง</em></h1><p className="hero-copy">ต้องสแกน QR ก่อนเริ่มเบิกหรือคืนเครื่อง พร้อมภาพยืนยันและประวัติที่ค้นหาได้</p></div><button className="scan-button" onClick={() => startScanner()}><span>⌁</span> สแกน QR เครื่อง</button></section>
    <nav className="tabs" aria-label="การนำทางหลัก"><button className={screen === 'devices' ? 'active' : ''} onClick={() => setScreen('devices')}>อุปกรณ์ <b>{devices.length}</b></button><button className={screen === 'timeline' ? 'active' : ''} onClick={() => setScreen('timeline')}>ประวัติการใช้งาน</button><button className={screen === 'admin' ? 'active' : ''} onClick={() => setScreen('admin')}>ตั้งค่าระบบ <b className="admin-badge">ADMIN</b></button></nav>
    {notification && <div className={`toast-notification ${notification.tone}`} role="status" aria-live="polite"><span>{notification.tone === 'success' ? '✓' : '!'}</span><p>{notification.text}</p><button type="button" aria-label="ปิดการแจ้งเตือน" onClick={() => setNotification(null)}>×</button></div>}
    {message && !activeDevice && !isScanning && <div className="global-message" role="status"><span>i</span><p>{message}</p></div>}
    {screen === 'devices' ? <><section className="stats"><article><span className="stat-icon green">✓</span><div><small>พร้อมใช้งาน</small><strong>{summary.available} <i>เครื่อง</i></strong></div></article><article><span className="stat-icon amber">↗</span><div><small>กำลังถูกใช้งาน</small><strong>{summary.inUse} <i>เครื่อง</i></strong></div></article><article><span className="stat-icon blue">◷</span><div><small>รายการวันนี้</small><strong>{events.length} <i>ครั้ง</i></strong></div></article></section><section className="content-head"><div><h2>รายการอุปกรณ์</h2><p>ต้องสแกน QR เท่านั้นจึงจะเปิดหน้าเบิกหรือคืนเครื่องได้</p></div><div className="legend"><span className="dot available" /> พร้อมใช้ <span className="dot used" /> กำลังใช้งาน</div></section><section className="device-table-wrap"><table className="device-table"><thead><tr><th>อุปกรณ์</th><th>หมายเลขเครื่อง</th><th>สถานะ</th><th>ผู้ใช้งานปัจจุบัน</th><th>เวลาเบิก</th><th>การทำงาน</th></tr></thead><tbody>{devices.map((device) => <tr key={device.id}><td><span className="table-device"><span className="device-icon">▣</span><span><strong>{device.name}</strong><small>{device.id}</small></span></span></td><td>{device.serial}</td><td><span className={`pill ${device.status}`}>{device.status === 'available' ? 'พร้อมใช้' : 'กำลังใช้'}</span></td><td>{device.holder || <span className="muted">—</span>}</td><td>{device.since ? `${device.since} น.` : <span className="muted">—</span>}</td><td><span className="table-action-group"><button className="table-action scan-only-action" type="button" onClick={() => startScanner()} aria-label={`สแกน QR เพื่อ${device.status === 'available' ? 'เบิก' : 'คืน'} ${device.id}`}>⌁ สแกน QR</button><small>ต้องสแกนก่อนดำเนินการ</small></span></td></tr>)}</tbody></table></section></> : screen === 'timeline' ? <Timeline events={sortedEvents} devices={devices} /> : authUser?.role === 'admin' ? <AdminPage users={registeredUsers} devices={devices} currentUsername={authUser.username} onRegister={registerUser} onUpdateUser={updateUser} onDeleteUser={deleteUser} onRegisterDevice={registerDevice} onUpdateDevice={updateDevice} onDeleteDevice={deleteDevice} /> : <AccessDenied />}
    {isScanning && <div className="scanner-overlay"><div className="scanner"><button className="close" onClick={stopScanner}>×</button><p className="eyebrow">QR SCANNER</p><h2>เล็งกล้องไปที่ QR ของเครื่อง</h2><div className="video-wrap"><video ref={videoRef} muted playsInline /><span className="scan-frame" /></div><p>รองรับรหัส เช่น PDA-01</p></div></div>}
    {activeDevice && <div className="modal-overlay"><section className="flow-modal"><button className="close" onClick={closeFlow}>×</button><p className="eyebrow">{mode === 'checkout' ? 'CHECK OUT DEVICE' : 'RETURN DEVICE'}</p><h2>{mode === 'checkout' ? 'ยืนยันการเบิกเครื่อง' : 'ยืนยันการคืนเครื่อง'}</h2><div className="selected-device"><span>▣</span><div><strong>{activeDevice.name}</strong><small>{activeDevice.id} · {activeDevice.serial}</small></div></div>{mode === 'checkout' ? <p className="signed-user">ผู้ใช้งานที่ล็อกอิน: <b>{signedInUser}</b></p> : <p className="returning">ผู้เบิก: <b>{activeDevice.holder}</b></p>}<label>พื้นที่/หมายเหตุ <input value={note} placeholder="เช่น Line A, Packing" onChange={(event) => setNote(event.target.value)} /></label><div className={`photo-box ${photo ? 'has-photo' : ''}`}>{photo ? <img src={photo} alt="ภาพยืนยัน" /> : <><span>◉</span><strong>ถ่ายรูปยืนยัน</strong><small>กรุณาถ่ายภาพเครื่องก่อนบันทึก</small></>}<input type="file" accept="image/*" capture="environment" onChange={attachPhoto} /></div>{message && <p className="form-message">{message}</p>}<button className="primary-action" disabled={isSubmitting} aria-busy={isSubmitting} onClick={submitFlow}>{isSubmitting && <span className="submit-spinner" aria-hidden="true" />}{isSubmitting ? 'กำลังบันทึก…' : mode === 'checkout' ? 'ยืนยันการเบิก' : 'ยืนยันการคืน'} {!isSubmitting && <span>→</span>}</button></section></div>}
  </main>;
}

function toDateInputValue(value: string) { return bangkokDateInputValue(value); }
function formatDateInput(value: string) { if (!value) return ''; return new Intl.DateTimeFormat('th-TH', { timeZone: THAILAND_TIME_ZONE, day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T00:00:00+07:00`)); }

function Timeline({ events, devices }: { events: UsageEvent[]; devices: Device[] }) {
  const [query, setQuery] = useState(''); const [fromDate, setFromDate] = useState(''); const [toDate, setToDate] = useState(''); const [deviceFilter, setDeviceFilter] = useState('all'); const [previewPhoto, setPreviewPhoto] = useState<{ src: string; alt: string } | null>(null);
  useEffect(() => {
    if (!previewPhoto) return;
    function closeWithEscape(event: KeyboardEvent) { if (event.key === 'Escape') setPreviewPhoto(null); }
    window.addEventListener('keydown', closeWithEscape);
    return () => window.removeEventListener('keydown', closeWithEscape);
  }, [previewPhoto]);
  const invalidRange = Boolean(fromDate && toDate && fromDate > toDate);
  const filtered = invalidRange ? [] : events.filter((item) => { const eventDate = toDateInputValue(item.at); return (deviceFilter === 'all' || item.deviceId === deviceFilter) && (!fromDate || eventDate >= fromDate) && (!toDate || eventDate <= toDate) && `${item.deviceId} ${item.user}`.toLowerCase().includes(query.toLowerCase()); });
  const rangeLabel = fromDate && toDate && fromDate === toDate ? formatDateInput(fromDate) : fromDate || toDate ? `${fromDate ? formatDateInput(fromDate) : 'เริ่มต้น'} – ${toDate ? formatDateInput(toDate) : 'ปัจจุบัน'}` : 'ทุกช่วงเวลา';
  function clearFilters() { setQuery(''); setFromDate(''); setToDate(''); setDeviceFilter('all'); }
  return <section className="timeline-page"><section className="history-filter"><div><p className="eyebrow">USAGE HISTORY</p><h2>ประวัติการเบิก–คืน</h2></div><input aria-label="ค้นหาประวัติ" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหา PDA หรือชื่อผู้ใช้" /></section><div className="history-controls"><label>ตั้งแต่<input aria-label="วันที่เริ่มต้น" type="date" value={fromDate} max={toDate || undefined} onChange={(event) => setFromDate(event.target.value)} /></label><label>ถึง<input aria-label="วันที่สิ้นสุด" type="date" min={fromDate || undefined} value={toDate} onChange={(event) => setToDate(event.target.value)} /></label><label>อุปกรณ์<select aria-label="เลือกอุปกรณ์" value={deviceFilter} onChange={(event) => setDeviceFilter(event.target.value)}><option value="all">ทุกเครื่อง</option>{devices.map((device) => <option key={device.id} value={device.id}>{device.id} · {device.name}</option>)}</select></label><button className="clear-filters" type="button" onClick={clearFilters}>ล้างตัวกรอง</button></div>{invalidRange && <p className="filter-message">วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด</p>}<div className="date-bar"><strong>{rangeLabel}</strong><span>{filtered.length} รายการ</span></div><div className="timeline">{filtered.map((event) => <article className="event" key={event.id}><time>{formatTime(event.at)}<small>{formatDate(event.at)}</small></time><span className={`event-dot ${event.type}`}>{event.type === 'checkout' ? '↗' : '↙'}</span><div><span className={`type-tag ${event.type}`}>{event.type === 'checkout' ? 'เบิกเครื่อง' : 'คืนเครื่อง'}</span><h3>{event.deviceId} <em>{event.type === 'checkout' ? 'ถูกเบิกโดย' : 'ถูกคืนโดย'} {event.user}</em></h3><p>{event.note || 'ไม่มีหมายเหตุ'} · มีรูปยืนยัน</p></div>{event.photo && <PhotoThumbnail src={photoSource(event.photo) || event.photo} alt={`ภาพยืนยัน ${event.deviceId}`} onOpen={() => setPreviewPhoto({ src: photoSource(event.photo) || event.photo!, alt: `ภาพยืนยัน ${event.deviceId}` })} />}</article>)}</div>{previewPhoto && <PhotoLightbox photo={previewPhoto} onClose={() => setPreviewPhoto(null)} />}{!filtered.length && !invalidRange && <div className="empty-state">ไม่พบประวัติตามตัวกรองที่เลือก</div>}</section>;
}

function PhotoThumbnail({ src, alt, onOpen }: { src: string; alt: string; onOpen: () => void }) {
  return <button className="photo-thumb" type="button" onClick={onOpen} aria-label={`${alt} — กดเพื่อขยาย`}><img src={src} alt={alt} /><span>ขยาย</span></button>;
}

function PhotoLightbox({ photo, onClose }: { photo: { src: string; alt: string }; onClose: () => void }) {
  return <div className="photo-lightbox" role="dialog" aria-modal="true" aria-label="ดูภาพยืนยันขนาดใหญ่" onClick={onClose}><div className="photo-lightbox-card"><button className="photo-lightbox-close" type="button" onClick={onClose} aria-label="ปิดภาพขนาดใหญ่">×</button><img src={photo.src} alt={photo.alt} onClick={(event) => event.stopPropagation()} /></div></div>;
}

type AdminPageProps = { users: RegisteredUser[]; devices: Device[]; currentUsername: string; onRegister: (user: RegisteredUser) => Promise<void>; onUpdateUser: (user: RegisteredUser, originalUsername: string) => Promise<void>; onDeleteUser: (username: string) => Promise<void>; onRegisterDevice: (device: Device) => Promise<void>; onUpdateDevice: (device: Device, originalId: string) => Promise<void>; onDeleteDevice: (deviceId: string) => Promise<void> };

const MIN_QR_SIZE = 64;
const MAX_QR_SIZE = 1024;

function QRCodeGenerator({ devices }: { devices: Device[] }) {
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>(devices[0]?.id ? [devices[0].id] : []);
  const [previewDeviceId, setPreviewDeviceId] = useState(devices[0]?.id || '');
  const [qrSize, setQrSize] = useState(256);
  const [qrResult, setQrResult] = useState<{ key: string; codes: Record<string, string> } | null>(null);
  const [qrError, setQrError] = useState('');
  const [isPrintPreview, setIsPrintPreview] = useState(false);
  const selectedDeviceIdsKey = selectedDeviceIds.join('|');
  const selectedDevices = devices.filter((device) => selectedDeviceIds.includes(device.id));
  const previewDevice = selectedDevices.find((device) => device.id === previewDeviceId) || selectedDevices[0];
  const previewDeviceKey = previewDevice?.id || '';
  const qrResultKey = selectedDeviceIdsKey + ':' + qrSize;
  const qrCodes = qrResult?.key === qrResultKey ? qrResult.codes : {};
  const qrDataUrl = qrCodes[previewDeviceKey] || '';
  const qrReady = selectedDevices.length > 0 && selectedDevices.every((device) => Boolean(qrCodes[device.id]));

  useEffect(() => {
    let cancelled = false;
    const selectedIds = selectedDeviceIdsKey ? selectedDeviceIdsKey.split('|') : [];
    const selectedForQr = devices.filter((device) => selectedIds.includes(device.id));
    if (!selectedForQr.length) return () => { cancelled = true; };
    Promise.all(selectedForQr.map(async (device) => [device.id, await QRCode.toDataURL(device.id, { width: qrSize, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#0b1934', light: '#ffffff' } })] as const))
      .then((entries) => { if (!cancelled) { setQrResult({ key: selectedDeviceIdsKey + ':' + qrSize, codes: Object.fromEntries(entries) }); setQrError(''); } })
      .catch(() => { if (!cancelled) { setQrResult(null); setQrError('สร้าง QR ไม่สำเร็จ กรุณาลองใหม่'); } });
    return () => { cancelled = true; };
  }, [devices, selectedDeviceIdsKey, qrSize]);

  function updateSize(value: string) {
    const nextSize = Number(value);
    if (!Number.isFinite(nextSize)) return;
    setQrSize(Math.min(MAX_QR_SIZE, Math.max(MIN_QR_SIZE, Math.round(nextSize))));
  }

  function toggleDevice(deviceId: string) {
    setSelectedDeviceIds((current) => current.includes(deviceId) ? current.filter((id) => id !== deviceId) : [...current, deviceId]);
    setPreviewDeviceId(deviceId);
  }

  function selectAllDevices() {
    setSelectedDeviceIds(devices.map((device) => device.id));
    setPreviewDeviceId(devices[0]?.id || '');
  }

  function clearDeviceSelection() {
    setSelectedDeviceIds([]);
    setPreviewDeviceId('');
  }

  useEffect(() => {
    if (!isPrintPreview) return;
    const timer = window.setTimeout(() => window.print(), 100);
    const handleAfterPrint = () => setIsPrintPreview(false);
    window.addEventListener('afterprint', handleAfterPrint);
    return () => { window.clearTimeout(timer); window.removeEventListener('afterprint', handleAfterPrint); };
  }, [isPrintPreview]);

  function printQRCode() {
    if (qrReady) setIsPrintPreview(true);
  }

  return <section className="qr-generator"><div className="form-title"><span className="stat-icon blue">⌗</span><div><h3>สร้าง QR Code อุปกรณ์</h3><p>เลือกได้หลายเครื่อง กำหนดขนาด แล้วพิมพ์ลงกระดาษเป็นชุดเดียว</p></div></div>{devices.length ? <div className="qr-layout"><div className="qr-controls"><div className="qr-selection"><div className="qr-selection-heading"><div><strong>เลือกเครื่องที่จะพิมพ์</strong><small>เลือกแล้ว {selectedDevices.length} จาก {devices.length} เครื่อง</small></div><div className="qr-selection-actions"><button type="button" onClick={selectAllDevices}>เลือกทั้งหมด</button><button type="button" onClick={clearDeviceSelection}>ล้าง</button></div></div><div className="qr-device-options">{devices.map((device) => <label className={'qr-device-option ' + (selectedDeviceIds.includes(device.id) ? 'selected' : '')} key={device.id}><input type="checkbox" checked={selectedDeviceIds.includes(device.id)} onChange={() => toggleDevice(device.id)} /><span className="qr-device-check">✓</span><span className="qr-device-label"><strong>{device.id}</strong><small>{device.name}</small></span><span className={'pill ' + device.status}>{device.status === 'available' ? 'พร้อมใช้' : 'กำลังใช้'}</span></label>)}</div></div><label>ขนาด QR Code<div className="qr-size-control"><input type="range" min={MIN_QR_SIZE} max={MAX_QR_SIZE} step="16" value={qrSize} onChange={(event) => updateSize(event.target.value)} /><input aria-label="ขนาด QR Code เป็นพิกเซล" type="number" min={MIN_QR_SIZE} max={MAX_QR_SIZE} step="16" value={qrSize} onChange={(event) => updateSize(event.target.value)} /><span>px</span></div></label><p className="qr-hint">ขนาดต้นฉบับ {MIN_QR_SIZE}–{MAX_QR_SIZE} px · พิมพ์หลายเครื่องลงกระดาษ A4 อัตโนมัติ</p><div className="qr-actions"><a className={'qr-download ' + (!qrDataUrl ? 'disabled' : '')} href={qrDataUrl || undefined} download={previewDevice ? 'QR-' + previewDevice.id + '.png' : undefined} onClick={(event) => { if (!qrDataUrl) event.preventDefault(); }}>ดาวน์โหลดตัวอย่าง PNG</a><button className="secondary-action" type="button" onClick={printQRCode} disabled={!qrReady}>พิมพ์ {selectedDevices.length || ''} เครื่อง</button></div>{qrError && <p className="form-message">{qrError}</p>}</div><div className="qr-preview"><div className="qr-paper">{qrDataUrl ? <img src={qrDataUrl} alt={'QR Code ' + (previewDevice?.id || '')} width={qrSize} height={qrSize} /> : <span>{selectedDevices.length ? 'กำลังสร้าง QR…' : 'เลือกอุปกรณ์เพื่อสร้าง QR'}</span>}{previewDevice && <><strong>{previewDevice.id}</strong><small>{previewDevice.name}</small></>}</div></div></div> : <div className="empty-state">ยังไม่มีอุปกรณ์ กรุณาลงทะเบียนอุปกรณ์ก่อนสร้าง QR</div>}{isPrintPreview && <div className="qr-print-view"><h1>PDA CONTROL · DEVICE QR</h1><p>{selectedDevices.length} เครื่อง · ขนาดต้นฉบับ {qrSize} px</p><div className="qr-print-grid">{selectedDevices.map((device) => <article className="qr-print-card" key={device.id}><img src={qrCodes[device.id]} alt={'QR ' + device.id} style={{ width: Math.min(qrSize, 360) }} /><strong>{device.id}</strong><small>{device.name}</small></article>)}</div></div>}</section>;
}

function AdminPage({ users, devices, currentUsername, onRegister, onUpdateUser, onDeleteUser, onRegisterDevice, onUpdateDevice, onDeleteDevice }: AdminPageProps) {
  const [username, setUsername] = useState(''); const [fullName, setFullName] = useState(''); const [password, setPassword] = useState(''); const [confirmPassword, setConfirmPassword] = useState(''); const [role, setRole] = useState<RegisteredUser['role']>('operator'); const [editingUsername, setEditingUsername] = useState<string | null>(null); const [saved, setSaved] = useState(false); const [error, setError] = useState('');
  const [deviceId, setDeviceId] = useState(''); const [deviceName, setDeviceName] = useState(''); const [serial, setSerial] = useState(''); const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null); const [deviceSaved, setDeviceSaved] = useState(false); const [deviceError, setDeviceError] = useState('');
  const [adminView, setAdminView] = useState<'users' | 'devices'>('users');
  const userFormRef = useRef<HTMLFormElement>(null); const deviceAdminRef = useRef<HTMLElement>(null);
  function resetUserForm() { setUsername(''); setFullName(''); setPassword(''); setConfirmPassword(''); setRole('operator'); setEditingUsername(null); }
  function resetDeviceForm() { setDeviceId(''); setDeviceName(''); setSerial(''); setEditingDeviceId(null); }
  async function submit(event: React.FormEvent) { event.preventDefault(); setError(''); const editing = editingUsername !== null; const normalizedUsername = username.trim(); if (!normalizedUsername || !fullName.trim() || (!editing && password.length < 8) || (password.length > 0 && password.length < 8)) { setError(editing ? 'กรุณากรอกชื่อผู้ใช้และชื่อ–นามสกุล หรือใส่รหัสผ่านใหม่อย่างน้อย 8 ตัวอักษร' : 'กรุณากรอกข้อมูลให้ครบ และตั้งรหัสผ่านอย่างน้อย 8 ตัวอักษร'); return; } if (password !== confirmPassword) { setError('รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน'); return; } if (users.some((user) => user.username.toLowerCase() === normalizedUsername.toLowerCase() && user.username.toLowerCase() !== editingUsername?.toLowerCase())) { setError('Username นี้มีอยู่ในระบบแล้ว'); return; } const existing = editingUsername ? users.find((user) => user.username.toLowerCase() === editingUsername.toLowerCase()) : undefined; const nextUser: RegisteredUser = { username: normalizedUsername, fullName: fullName.trim(), role, status: existing?.status || 'active', password: password || undefined }; if (editing) await onUpdateUser(nextUser, editingUsername); else await onRegister(nextUser); resetUserForm(); setSaved(true); window.setTimeout(() => setSaved(false), 2200); }
  function beginEditUser(user: RegisteredUser) { setEditingUsername(user.username); setUsername(user.username); setFullName(user.fullName); setRole(user.role); setPassword(''); setConfirmPassword(''); setError(''); setSaved(false); setAdminView('users'); window.requestAnimationFrame(() => userFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })); }
  function cancelEditUser() { resetUserForm(); setError(''); }
  async function removeUser(user: RegisteredUser) { setError(''); if (user.username.toLowerCase() === currentUsername.toLowerCase()) { setError('ไม่สามารถลบบัญชีที่กำลังเข้าสู่ระบบอยู่ได้'); return; } if (user.role === 'admin' && users.filter((item) => item.role === 'admin' && item.status === 'active').length <= 1) { setError('ต้องเหลือผู้ดูแลระบบที่ใช้งานได้อย่างน้อย 1 บัญชี'); return; } if (!window.confirm(`ต้องการลบผู้ใช้งาน ${user.username} ใช่หรือไม่`)) return; await onDeleteUser(user.username); if (editingUsername?.toLowerCase() === user.username.toLowerCase()) resetUserForm(); setSaved(true); window.setTimeout(() => setSaved(false), 2200); }
  async function submitDevice(event: React.FormEvent) { event.preventDefault(); setDeviceError(''); const editing = editingDeviceId !== null; const normalizedId = deviceId.trim().toUpperCase(); if (!normalizedId || !deviceName.trim() || !serial.trim()) { setDeviceError('กรุณากรอก Device ID, ชื่ออุปกรณ์ และ Serial Number'); return; } if (devices.some((device) => device.id.toLowerCase() === normalizedId.toLowerCase() && device.id.toLowerCase() !== editingDeviceId?.toLowerCase())) { setDeviceError('Device ID นี้มีอยู่ในระบบแล้ว'); return; } const existing = editingDeviceId ? devices.find((device) => device.id.toLowerCase() === editingDeviceId.toLowerCase()) : undefined; const nextDevice: Device = { ...(existing || { status: 'available' }), id: normalizedId, name: deviceName.trim(), serial: serial.trim() }; if (editing) await onUpdateDevice(nextDevice, editingDeviceId); else await onRegisterDevice(nextDevice); resetDeviceForm(); setDeviceSaved(true); window.setTimeout(() => setDeviceSaved(false), 2200); }
  function beginEditDevice(device: Device) { setEditingDeviceId(device.id); setDeviceId(device.id); setDeviceName(device.name); setSerial(device.serial); setDeviceError(''); setDeviceSaved(false); setAdminView('devices'); window.requestAnimationFrame(() => deviceAdminRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })); }
  function cancelEditDevice() { resetDeviceForm(); setDeviceError(''); }
  async function removeDevice(device: Device) { setDeviceError(''); if (device.status === 'in-use') { setDeviceError('กรุณาคืนเครื่องก่อนลบอุปกรณ์นี้'); return; } if (!window.confirm(`ต้องการลบอุปกรณ์ ${device.id} ใช่หรือไม่`)) return; await onDeleteDevice(device.id); if (editingDeviceId?.toLowerCase() === device.id.toLowerCase()) resetDeviceForm(); setDeviceSaved(true); window.setTimeout(() => setDeviceSaved(false), 2200); }
  return <section className="admin-page"><div className="admin-heading"><div><p className="eyebrow">ADMINISTRATION</p><h2>ตั้งค่าระบบ</h2><p>จัดการผู้ใช้งานและอุปกรณ์ที่อยู่ในระบบ</p></div><span className="admin-lock">▣ เฉพาะผู้ดูแลระบบ</span></div><div className="admin-switch" role="tablist" aria-label="เมนูตั้งค่าระบบ"><button className={adminView === 'users' ? 'active' : ''} onClick={() => setAdminView('users')} role="tab" aria-selected={adminView === 'users'}><span>♙</span> ผู้ใช้งาน</button><button className={adminView === 'devices' ? 'active' : ''} onClick={() => setAdminView('devices')} role="tab" aria-selected={adminView === 'devices'}><span>▣</span> อุปกรณ์</button></div>{adminView === 'users' ? <><div className="admin-layout"><form ref={userFormRef} className="admin-form" onSubmit={submit}><div className="form-title"><span className="stat-icon blue">+</span><div><h3>{editingUsername ? 'แก้ไขผู้ใช้งาน' : 'ลงทะเบียนผู้ใช้งาน'}</h3><p>{editingUsername ? 'แก้ไขข้อมูลบัญชีและสิทธิ์การใช้งาน' : 'เพิ่มบัญชี พร้อมกำหนดรหัสผ่านสำหรับเข้าใช้งาน'}</p></div></div><label>Username<input required value={username} onChange={(event) => setUsername(event.target.value)} placeholder="เช่น somchai.p" /></label><label>ชื่อ–นามสกุล<input required value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="เช่น สมชาย ใจดี" /></label><label>รหัสผ่าน<input required={!editingUsername} type="password" minLength={editingUsername && !password ? undefined : 8} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={editingUsername ? 'เว้นว่างเพื่อใช้รหัสผ่านเดิม' : 'อย่างน้อย 8 ตัวอักษร'} /></label><label>ยืนยันรหัสผ่าน<input required={!editingUsername} type="password" minLength={editingUsername && !confirmPassword ? undefined : 8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder={editingUsername ? 'กรอกรหัสผ่านใหม่อีกครั้ง' : 'กรอกรหัสผ่านอีกครั้ง'} /></label><label>สิทธิ์การใช้งาน<select value={role} onChange={(event) => setRole(event.target.value as RegisteredUser['role'])}><option value="operator">ผู้ใช้งาน — เบิก/คืนเครื่อง</option><option value="admin">ผู้ดูแลระบบ — ตั้งค่าและลงทะเบียน</option></select></label><div className="form-actions"><button className="primary-action" type="submit">{editingUsername ? 'บันทึกการแก้ไข' : 'บันทึกผู้ใช้งาน'} <span>→</span></button>{editingUsername && <button className="secondary-action" type="button" onClick={cancelEditUser}>ยกเลิก</button>}</div>{error && <p className="form-message">{error}</p>}{saved && <p className="saved-message">✓ {editingUsername ? 'บันทึกการแก้ไขแล้ว' : 'ดำเนินการผู้ใช้งานแล้ว'}</p>}</form><section className="user-list"><div className="list-title"><div><h3>ผู้ใช้งานในระบบ</h3><p>{users.filter((user) => user.status === 'active').length} บัญชีที่ใช้งานอยู่</p></div><span className="user-count">{users.length}</span></div><div className="user-rows">{users.map((user) => <div className="user-row" key={user.username}><span className="user-avatar">{user.fullName.slice(0, 2)}</span><div><strong>{user.fullName}</strong><small>{user.username}</small></div><span className={`role-pill ${user.role}`}>{user.role === 'admin' ? 'ADMIN' : 'OPERATOR'}</span><span className="admin-row-actions"><button className="row-action" type="button" onClick={() => beginEditUser(user)}>แก้ไข</button><button className="row-action danger" type="button" onClick={() => removeUser(user)} disabled={user.username.toLowerCase() === currentUsername.toLowerCase()} title={user.username.toLowerCase() === currentUsername.toLowerCase() ? 'ไม่สามารถลบบัญชีที่กำลังใช้งานอยู่' : 'ลบผู้ใช้งาน'}>ลบ</button></span></div>)}</div></section></div><div className="admin-note"><span>i</span><p>รหัสผ่านจะถูกแฮชก่อนจัดเก็บ ไม่เก็บเป็นข้อความปกติ และผู้ใช้จะถูกระบุชื่ออัตโนมัติในรายการเบิก–คืน</p></div></> : <section ref={deviceAdminRef} className="device-admin"><div className="form-title"><span className="stat-icon green">▣</span><div><h3>{editingDeviceId ? 'แก้ไขอุปกรณ์' : 'ลงทะเบียนอุปกรณ์'}</h3><p>{editingDeviceId ? 'แก้ไขชื่อ รหัส หรือ Serial Number ของอุปกรณ์' : 'กำหนดรหัสที่ต้องนำไปสร้างเป็น QR และติดที่ตัวเครื่อง'}</p></div></div><form className="device-form" onSubmit={submitDevice}><label>Device ID / QR ID<input required value={deviceId} onChange={(event) => setDeviceId(event.target.value)} placeholder="เช่น PDA-12" /></label><label>ชื่ออุปกรณ์<input required value={deviceName} onChange={(event) => setDeviceName(event.target.value)} placeholder="เช่น PDA Scanner 12" /></label><label>Serial Number<input required value={serial} onChange={(event) => setSerial(event.target.value)} placeholder="เช่น ZB-202612" /></label><div className="device-form-actions"><button className="primary-action" type="submit">{editingDeviceId ? 'บันทึกการแก้ไข' : 'บันทึกอุปกรณ์'} <span>→</span></button>{editingDeviceId && <button className="secondary-action" type="button" onClick={cancelEditDevice}>ยกเลิก</button>}</div></form>{deviceError && <p className="form-message">{deviceError}</p>}{deviceSaved && <p className="saved-message">✓ ดำเนินการอุปกรณ์แล้ว</p>}<QRCodeGenerator devices={devices} /><div className="device-registry"><div className="list-title"><div><h3>อุปกรณ์ในระบบ</h3><p>{devices.length} เครื่อง · ใช้ Device ID เป็นค่าที่บันทึกใน QR</p></div></div><div className="registry-table-wrap"><table className="device-table registry-table"><thead><tr><th>Device ID / QR ID</th><th>ชื่ออุปกรณ์</th><th>Serial Number</th><th>สถานะ</th><th>การจัดการ</th></tr></thead><tbody>{devices.map((device) => <tr key={device.id}><td><code>{device.id}</code></td><td>{device.name}</td><td>{device.serial}</td><td><span className={`pill ${device.status}`}>{device.status === 'available' ? 'พร้อมใช้' : 'กำลังใช้'}</span></td><td><span className="admin-row-actions"><button className="row-action" type="button" aria-label={'แก้ไข ' + device.id} title={'แก้ไขข้อมูล ' + device.id} onClick={() => beginEditDevice(device)}>แก้ไข</button><button className="row-action danger" type="button" onClick={() => removeDevice(device)} disabled={device.status === 'in-use'} title={device.status === 'in-use' ? 'ต้องคืนเครื่องก่อนลบ' : 'ลบอุปกรณ์'}>ลบ</button></span></td></tr>)}</tbody></table></div></div><div className="admin-note"><span>i</span><p>Device ID ที่ลงทะเบียนควรตรงกับข้อความใน QR ของเครื่อง เพื่อป้องกันการเลือกผิดเครื่อง</p></div></section>}</section>;
}

function LoadingScreen() { return <main className="auth-shell"><section className="auth-card loading-card"><span className="brand-mark">P</span><h1>กำลังตรวจสอบบัญชี</h1><p>โปรดรอสักครู่…</p></section></main>; }

function LoginPage({ onLogin }: { onLogin: (username: string, password: string) => Promise<void> }) {
  const [username, setUsername] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) { event.preventDefault(); setError(''); setBusy(true); try { await onLogin(username, password); } catch (loginError) { setError(loginError instanceof Error ? loginError.message : 'เข้าสู่ระบบไม่สำเร็จ'); } finally { setBusy(false); } }
  return <main className="auth-shell"><section className="auth-card"><div className="auth-brand"><span className="brand-mark">P</span><p className="eyebrow">PDA CONTROL</p></div><h1>เข้าสู่ระบบ</h1><p className="auth-copy">ลงชื่อเข้าใช้เพื่อเบิกหรือคืนอุปกรณ์</p><form onSubmit={submit}><label>Username<input required autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="กรอก Username" /></label><label>รหัสผ่าน<input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="กรอกรหัสผ่าน" /></label>{error && <p className="form-message">{error}</p>}<button className="primary-action" disabled={busy}>{busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'} <span>→</span></button></form><p className="auth-footnote">บัญชีเริ่มต้นสำหรับทดสอบ: <b>admin</b> / <b>PDAadmin2026!</b></p></section></main>; }

function AccessDenied() { return <section className="access-denied"><span className="stat-icon amber">!</span><h2>ไม่มีสิทธิ์เข้าหน้านี้</h2><p>หน้านี้สำหรับผู้ดูแลระบบเท่านั้น กรุณาให้ Admin ลงทะเบียนสิทธิ์ของคุณ</p></section>; }
