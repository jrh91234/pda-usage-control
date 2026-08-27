'use client';

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';

type DeviceStatus = 'available' | 'in-use';
type Device = { id: string; name: string; serial: string; status: DeviceStatus; holder?: string; since?: string };
type UsageEvent = { id: string; deviceId: string; type: 'checkout' | 'return'; user: string; at: string; photo?: string; note?: string };
type RegisteredUser = { username: string; fullName: string; role: 'admin' | 'operator'; status: 'active' | 'inactive'; password?: string };

const initialDevices: Device[] = Array.from({ length: 11 }, (_, index) => {
  const number = String(index + 1).padStart(2, '0');
  return { id: `PDA-${number}`, name: `PDA Scanner ${number}`, serial: `ZB-${202600 + index + 1}`, status: index === 1 || index === 4 || index === 7 ? 'in-use' : 'available', holder: index === 1 ? 'somchai.p' : index === 4 ? 'nicha.k' : index === 7 ? 'ananda.s' : undefined, since: index === 1 ? '08:14' : index === 4 ? '09:02' : index === 7 ? '10:36' : undefined };
});

const initialEvents: UsageEvent[] = [
  { id: 'e1', deviceId: 'PDA-02', type: 'checkout', user: 'somchai.p', at: '2026-08-27T08:14:00', note: 'Line A' },
  { id: 'e2', deviceId: 'PDA-05', type: 'checkout', user: 'nicha.k', at: '2026-08-27T09:02:00', note: 'Packing' },
  { id: 'e3', deviceId: 'PDA-08', type: 'checkout', user: 'ananda.s', at: '2026-08-27T10:36:00', note: 'Warehouse' },
  { id: 'e4', deviceId: 'PDA-01', type: 'return', user: 'pimchanok.r', at: '2026-08-27T11:20:00' },
];
const users = ['somchai.p', 'nicha.k', 'ananda.s', 'pimchanok.r', 'thanawat.m'];
const initialUsers: RegisteredUser[] = users.map((username, index) => ({ username, fullName: username.split('.')[0], role: index === 0 ? 'admin' : 'operator', status: 'active' }));
const appScriptUrl = process.env.NEXT_PUBLIC_APPS_SCRIPT_URL;
function formatTime(value: string) { return new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit' }).format(new Date(value)); }
function formatDate(value: string) { return new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value)); }

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
  const [message, setMessage] = useState('');
  const [signedInUser, setSignedInUser] = useState('กำลังตรวจสอบบัญชี…');
  const videoRef = useRef<HTMLVideoElement>(null);
  const scanTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  useEffect(() => {
    fetch('/api/auth/session').then((response) => response.json()).then((data) => {
      if (data.authenticated && data.user) { setAuthUser(data.user); setSignedInUser(data.user.fullName || data.user.username); setUsername(data.user.username); setAuthStatus('signed-in'); }
      else setAuthStatus('signed-out');
    }).catch(() => setAuthStatus('signed-out'));
  }, []);
  useEffect(() => {
    if (!appScriptUrl) return;
    fetch(appScriptUrl).then((response) => response.json()).then((data) => {
      if (Array.isArray(data.devices)) setDevices(data.devices);
      if (Array.isArray(data.events)) setEvents(data.events);
      if (Array.isArray(data.users) && data.users.length) setRegisteredUsers(data.users);
    }).catch(() => setMessage('ยังโหลดข้อมูล Google ไม่ได้ — กำลังแสดงข้อมูลตัวอย่าง'));
  }, []);
  const summary = useMemo(() => ({ available: devices.filter((item) => item.status === 'available').length, inUse: devices.filter((item) => item.status === 'in-use').length }), [devices]);
  const sortedEvents = useMemo(() => [...events].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()), [events]);
  function openFlow(device: Device, requestedMode?: 'checkout' | 'return') { setActiveDevice(device); setMode(requestedMode ?? (device.status === 'available' ? 'checkout' : 'return')); setPhoto(undefined); setNote(''); setMessage(''); }
  function closeFlow() { stopScanner(); setActiveDevice(null); }
  function attachPhoto(event: ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => setPhoto(String(reader.result)); reader.readAsDataURL(file); }
  function startScanner() {
    if (!('BarcodeDetector' in window) || !navigator.mediaDevices?.getUserMedia) { setMessage('กรุณาเปิดเว็บด้วย Chrome บนมือถือที่รองรับการสแกน QR'); return; }
    setIsScanning(true);
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } }).then((stream) => {
      if (!videoRef.current) return;
      videoRef.current.srcObject = stream; videoRef.current.play();
      const Detector = (window as unknown as { BarcodeDetector: new (options: { formats: string[] }) => { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
      const detector = new Detector({ formats: ['qr_code'] });
      scanTimer.current = setInterval(async () => { if (!videoRef.current) return; const codes = await detector.detect(videoRef.current).catch(() => []); const matched = devices.find((device) => device.id === codes[0]?.rawValue.trim().toUpperCase()); if (matched) { stopScanner(); openFlow(matched); } }, 450);
    }).catch(() => { setIsScanning(false); setMessage('ไม่สามารถเปิดกล้องได้ โปรดอนุญาตการใช้กล้อง หรือเลือกอุปกรณ์จากรายการ'); });
  }
  function stopScanner() { if (scanTimer.current) clearInterval(scanTimer.current); const stream = videoRef.current?.srcObject as MediaStream | null; stream?.getTracks().forEach((track) => track.stop()); if (videoRef.current) videoRef.current.srcObject = null; setIsScanning(false); }
  async function submitFlow() {
    if (!activeDevice || !photo) { setMessage('กรุณาถ่ายหรือแนบรูปยืนยันก่อนบันทึก'); return; }
    const now = new Date().toISOString(); const event: UsageEvent = { id: crypto.randomUUID(), deviceId: activeDevice.id, type: mode, user: mode === 'return' ? activeDevice.holder || username : username, at: now, photo, note };
    const nextDevice: Device = mode === 'checkout' ? { ...activeDevice, status: 'in-use', holder: username, since: formatTime(now) } : { ...activeDevice, status: 'available', holder: undefined, since: undefined };
    setDevices((items) => items.map((item) => item.id === nextDevice.id ? nextDevice : item)); setEvents((items) => [event, ...items]); setMessage('บันทึกเรียบร้อยแล้ว');
    if (appScriptUrl) { try { await fetch(appScriptUrl, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: mode, device: nextDevice, event }) }); } catch { setMessage('บันทึกในเครื่องแล้ว แต่ส่งข้อมูลไป Google ไม่สำเร็จ'); } }
    window.setTimeout(closeFlow, 700);
  }
  async function registerUser(user: RegisteredUser) {
    const savedUser = { ...user, password: undefined };
    setRegisteredUsers((items) => [savedUser, ...items.filter((item) => item.username !== user.username)]);
    if (appScriptUrl) { try { await fetch(appScriptUrl, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'registerUser', user }) }); } catch { setMessage('เพิ่มผู้ใช้ในหน้านี้แล้ว แต่ส่งไป Google ไม่สำเร็จ'); } }
  }
  async function registerDevice(device: Device) {
    setDevices((items) => [device, ...items.filter((item) => item.id !== device.id)]);
    if (appScriptUrl) { try { await fetch(appScriptUrl, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'registerDevice', device }) }); } catch { setMessage('เพิ่มอุปกรณ์ในหน้านี้แล้ว แต่ส่งไป Google ไม่สำเร็จ'); } }
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
    <section className="topbar"><div className="brand"><span className="brand-mark">P</span><span><strong>PDA CONTROL</strong><small>Factory device custody</small></span></div><div className="today">{formatDate('2026-08-27T12:00:00')}</div><div className="profile"><span className="avatar">{signedInUser.slice(0, 2).toUpperCase()}</span><span>{signedInUser}</span><button onClick={logout} title="ออกจากระบบ">ออกจากระบบ</button></div></section>
    <section className="hero"><div><p className="eyebrow">DEVICE OPERATIONS</p><h1>ควบคุมการใช้งาน PDA<br /><em>ให้ตรวจสอบได้ทุกครั้ง</em></h1><p className="hero-copy">สแกน QR เพื่อเบิกหรือคืนเครื่อง พร้อมภาพยืนยันและประวัติที่ค้นหาได้</p></div><button className="scan-button" onClick={startScanner}><span>⌁</span> สแกน QR เครื่อง</button></section>
    <nav className="tabs" aria-label="การนำทางหลัก"><button className={screen === 'devices' ? 'active' : ''} onClick={() => setScreen('devices')}>อุปกรณ์ <b>{devices.length}</b></button><button className={screen === 'timeline' ? 'active' : ''} onClick={() => setScreen('timeline')}>ประวัติการใช้งาน</button><button className={screen === 'admin' ? 'active' : ''} onClick={() => setScreen('admin')}>ตั้งค่าระบบ <b className="admin-badge">ADMIN</b></button></nav>
    {screen === 'devices' ? <><section className="stats"><article><span className="stat-icon green">✓</span><div><small>พร้อมใช้งาน</small><strong>{summary.available} <i>เครื่อง</i></strong></div></article><article><span className="stat-icon amber">↗</span><div><small>กำลังถูกใช้งาน</small><strong>{summary.inUse} <i>เครื่อง</i></strong></div></article><article><span className="stat-icon blue">◷</span><div><small>รายการวันนี้</small><strong>{events.length} <i>ครั้ง</i></strong></div></article></section><section className="content-head"><div><h2>รายการอุปกรณ์</h2><p>ตารางแสดงสถานะ · การเบิกและคืนต้องเริ่มจากการสแกน QR เท่านั้น</p></div><div className="legend"><span className="dot available" /> พร้อมใช้ <span className="dot used" /> กำลังใช้งาน</div></section><section className="device-table-wrap"><table className="device-table"><thead><tr><th>อุปกรณ์</th><th>หมายเลขเครื่อง</th><th>สถานะ</th><th>ผู้ใช้งานปัจจุบัน</th><th>เวลาเบิก</th><th>การทำงาน</th></tr></thead><tbody>{devices.map((device) => <tr key={device.id}><td><span className="table-device"><span className="device-icon">▣</span><span><strong>{device.name}</strong><small>{device.id}</small></span></span></td><td>{device.serial}</td><td><span className={`pill ${device.status}`}>{device.status === 'available' ? 'พร้อมใช้' : 'กำลังใช้'}</span></td><td>{device.holder || <span className="muted">—</span>}</td><td>{device.since ? `${device.since} น.` : <span className="muted">—</span>}</td><td><span className="scan-required">⌁ สแกน QR เพื่อทำรายการ</span></td></tr>)}</tbody></table></section></> : screen === 'timeline' ? <Timeline events={sortedEvents} /> : authUser?.role === 'admin' ? <AdminPage users={registeredUsers} devices={devices} onRegister={registerUser} onRegisterDevice={registerDevice} /> : <AccessDenied />}
    {isScanning && <div className="scanner-overlay"><div className="scanner"><button className="close" onClick={stopScanner}>×</button><p className="eyebrow">QR SCANNER</p><h2>เล็งกล้องไปที่ QR ของเครื่อง</h2><div className="video-wrap"><video ref={videoRef} muted playsInline /><span className="scan-frame" /></div><p>รองรับรหัส เช่น PDA-01</p></div></div>}
    {activeDevice && <div className="modal-overlay"><section className="flow-modal"><button className="close" onClick={closeFlow}>×</button><p className="eyebrow">{mode === 'checkout' ? 'CHECK OUT DEVICE' : 'RETURN DEVICE'}</p><h2>{mode === 'checkout' ? 'ยืนยันการเบิกเครื่อง' : 'ยืนยันการคืนเครื่อง'}</h2><div className="selected-device"><span>▣</span><div><strong>{activeDevice.name}</strong><small>{activeDevice.id} · {activeDevice.serial}</small></div></div>{mode === 'checkout' ? <p className="signed-user">ผู้ใช้งานที่ล็อกอิน: <b>{signedInUser}</b></p> : <p className="returning">ผู้เบิก: <b>{activeDevice.holder}</b></p>}<label>พื้นที่/หมายเหตุ <input value={note} placeholder="เช่น Line A, Packing" onChange={(event) => setNote(event.target.value)} /></label><div className={`photo-box ${photo ? 'has-photo' : ''}`}>{photo ? <img src={photo} alt="ภาพยืนยัน" /> : <><span>◉</span><strong>ถ่ายรูปยืนยัน</strong><small>กรุณาถ่ายภาพเครื่องก่อนบันทึก</small></>}<input type="file" accept="image/*" capture="environment" onChange={attachPhoto} /></div>{message && <p className="form-message">{message}</p>}<button className="primary-action" onClick={submitFlow}>{mode === 'checkout' ? 'ยืนยันการเบิก' : 'ยืนยันการคืน'} <span>→</span></button></section></div>}
  </main>;
}

function Timeline({ events }: { events: UsageEvent[] }) {
  const [query, setQuery] = useState(''); const filtered = events.filter((item) => `${item.deviceId} ${item.user}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="timeline-page"><section className="history-filter"><div><p className="eyebrow">USAGE HISTORY</p><h2>ประวัติการเบิก–คืน</h2></div><input aria-label="ค้นหาประวัติ" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหา PDA หรือชื่อผู้ใช้" /></section><div className="date-bar"><strong>27 สิงหาคม 2569</strong><span>เลือกช่วงเวลา: วันนี้ ▾</span></div><div className="timeline">{filtered.map((event) => <article className="event" key={event.id}><time>{formatTime(event.at)}<small>{formatDate(event.at)}</small></time><span className={`event-dot ${event.type}`}>{event.type === 'checkout' ? '↗' : '↙'}</span><div><span className={`type-tag ${event.type}`}>{event.type === 'checkout' ? 'เบิกเครื่อง' : 'คืนเครื่อง'}</span><h3>{event.deviceId} <em>{event.type === 'checkout' ? 'ถูกเบิกโดย' : 'ถูกคืนโดย'} {event.user}</em></h3><p>{event.note || 'ไม่มีหมายเหตุ'} · มีรูปยืนยัน</p></div>{event.photo && <img src={event.photo} alt="ภาพยืนยัน" />}</article>)}</div></section>;
}

function AdminPage({ users, devices, onRegister, onRegisterDevice }: { users: RegisteredUser[]; devices: Device[]; onRegister: (user: RegisteredUser) => Promise<void>; onRegisterDevice: (device: Device) => Promise<void> }) {
  const [username, setUsername] = useState(''); const [fullName, setFullName] = useState(''); const [password, setPassword] = useState(''); const [confirmPassword, setConfirmPassword] = useState(''); const [role, setRole] = useState<RegisteredUser['role']>('operator'); const [saved, setSaved] = useState(false); const [error, setError] = useState('');
  const [deviceId, setDeviceId] = useState(''); const [deviceName, setDeviceName] = useState(''); const [serial, setSerial] = useState(''); const [deviceSaved, setDeviceSaved] = useState(false); const [deviceError, setDeviceError] = useState('');
  async function submit(event: React.FormEvent) { event.preventDefault(); setError(''); if (!username.trim() || !fullName.trim() || password.length < 8) { setError('กรุณากรอกข้อมูลให้ครบ และตั้งรหัสผ่านอย่างน้อย 8 ตัวอักษร'); return; } if (password !== confirmPassword) { setError('รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน'); return; } await onRegister({ username: username.trim(), fullName: fullName.trim(), role, status: 'active', password }); setUsername(''); setFullName(''); setPassword(''); setConfirmPassword(''); setRole('operator'); setSaved(true); window.setTimeout(() => setSaved(false), 2200); }
  async function submitDevice(event: React.FormEvent) { event.preventDefault(); setDeviceError(''); const normalizedId = deviceId.trim().toUpperCase(); if (!normalizedId || !deviceName.trim() || !serial.trim()) { setDeviceError('กรุณากรอก Device ID, ชื่ออุปกรณ์ และ Serial Number'); return; } if (devices.some((device) => device.id.toLowerCase() === normalizedId.toLowerCase())) { setDeviceError('Device ID นี้มีอยู่ในระบบแล้ว'); return; } await onRegisterDevice({ id: normalizedId, name: deviceName.trim(), serial: serial.trim(), status: 'available' }); setDeviceId(''); setDeviceName(''); setSerial(''); setDeviceSaved(true); window.setTimeout(() => setDeviceSaved(false), 2200); }
  return <section className="admin-page"><div className="admin-heading"><div><p className="eyebrow">ADMINISTRATION</p><h2>ตั้งค่าระบบ</h2><p>จัดการผู้ใช้งานและอุปกรณ์ที่อยู่ในระบบ</p></div><span className="admin-lock">▣ เฉพาะผู้ดูแลระบบ</span></div><div className="admin-layout"><form className="admin-form" onSubmit={submit}><div className="form-title"><span className="stat-icon blue">+</span><div><h3>ลงทะเบียนผู้ใช้งาน</h3><p>เพิ่มบัญชี พร้อมกำหนดรหัสผ่านสำหรับเข้าใช้งาน</p></div></div><label>Username<input required value={username} onChange={(event) => setUsername(event.target.value)} placeholder="เช่น somchai.p" /></label><label>ชื่อ–นามสกุล<input required value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="เช่น สมชาย ใจดี" /></label><label>รหัสผ่าน<input required type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="อย่างน้อย 8 ตัวอักษร" /></label><label>ยืนยันรหัสผ่าน<input required type="password" minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="กรอกรหัสผ่านอีกครั้ง" /></label><label>สิทธิ์การใช้งาน<select value={role} onChange={(event) => setRole(event.target.value as RegisteredUser['role'])}><option value="operator">ผู้ใช้งาน — เบิก/คืนเครื่อง</option><option value="admin">ผู้ดูแลระบบ — ตั้งค่าและลงทะเบียน</option></select></label><button className="primary-action" type="submit">บันทึกผู้ใช้งาน <span>→</span></button>{error && <p className="form-message">{error}</p>}{saved && <p className="saved-message">✓ ลงทะเบียนผู้ใช้งานแล้ว</p>}</form><section className="user-list"><div className="list-title"><div><h3>ผู้ใช้งานในระบบ</h3><p>{users.filter((user) => user.status === 'active').length} บัญชีที่ใช้งานอยู่</p></div><span className="user-count">{users.length}</span></div><div className="user-rows">{users.map((user) => <div className="user-row" key={user.username}><span className="user-avatar">{user.fullName.slice(0, 2)}</span><div><strong>{user.fullName}</strong><small>{user.username}</small></div><span className={`role-pill ${user.role}`}>{user.role === 'admin' ? 'ADMIN' : 'OPERATOR'}</span></div>)}</div></section></div><section className="device-admin"><div className="form-title"><span className="stat-icon green">▣</span><div><h3>ลงทะเบียนอุปกรณ์</h3><p>กำหนดรหัสที่ต้องนำไปสร้างเป็น QR และติดที่ตัวเครื่อง</p></div></div><form className="device-form" onSubmit={submitDevice}><label>Device ID / QR ID<input required value={deviceId} onChange={(event) => setDeviceId(event.target.value)} placeholder="เช่น PDA-12" /></label><label>ชื่ออุปกรณ์<input required value={deviceName} onChange={(event) => setDeviceName(event.target.value)} placeholder="เช่น PDA Scanner 12" /></label><label>Serial Number<input required value={serial} onChange={(event) => setSerial(event.target.value)} placeholder="เช่น ZB-202612" /></label><button className="primary-action" type="submit">บันทึกอุปกรณ์ <span>→</span></button></form>{deviceError && <p className="form-message">{deviceError}</p>}{deviceSaved && <p className="saved-message">✓ ลงทะเบียนอุปกรณ์แล้ว</p>}<div className="device-registry"><div className="list-title"><div><h3>อุปกรณ์ในระบบ</h3><p>{devices.length} เครื่อง · ใช้ Device ID เป็นค่าที่บันทึกใน QR</p></div></div><div className="registry-table-wrap"><table className="device-table registry-table"><thead><tr><th>Device ID / QR ID</th><th>ชื่ออุปกรณ์</th><th>Serial Number</th><th>สถานะ</th></tr></thead><tbody>{devices.map((device) => <tr key={device.id}><td><code>{device.id}</code></td><td>{device.name}</td><td>{device.serial}</td><td><span className={`pill ${device.status}`}>{device.status === 'available' ? 'พร้อมใช้' : 'กำลังใช้'}</span></td></tr>)}</tbody></table></div></div></section><div className="admin-note"><span>i</span><p>รหัสผ่านจะถูกแฮชก่อนจัดเก็บ ไม่เก็บเป็นข้อความปกติ และ Device ID ที่ลงทะเบียนควรตรงกับข้อความใน QR ของเครื่อง</p></div></section>;
}

function LoadingScreen() { return <main className="auth-shell"><section className="auth-card loading-card"><span className="brand-mark">P</span><h1>กำลังตรวจสอบบัญชี</h1><p>โปรดรอสักครู่…</p></section></main>; }

function LoginPage({ onLogin }: { onLogin: (username: string, password: string) => Promise<void> }) {
  const [username, setUsername] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) { event.preventDefault(); setError(''); setBusy(true); try { await onLogin(username, password); } catch (loginError) { setError(loginError instanceof Error ? loginError.message : 'เข้าสู่ระบบไม่สำเร็จ'); } finally { setBusy(false); } }
  return <main className="auth-shell"><section className="auth-card"><div className="auth-brand"><span className="brand-mark">P</span><p className="eyebrow">PDA CONTROL</p></div><h1>เข้าสู่ระบบ</h1><p className="auth-copy">ลงชื่อเข้าใช้เพื่อเบิกหรือคืนอุปกรณ์</p><form onSubmit={submit}><label>Username<input required autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="กรอก Username" /></label><label>รหัสผ่าน<input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="กรอกรหัสผ่าน" /></label>{error && <p className="form-message">{error}</p>}<button className="primary-action" disabled={busy}>{busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'} <span>→</span></button></form><p className="auth-footnote">บัญชีเริ่มต้นสำหรับทดสอบ: <b>admin</b> / <b>PDAadmin2026!</b></p></section></main>; }

function AccessDenied() { return <section className="access-denied"><span className="stat-icon amber">!</span><h2>ไม่มีสิทธิ์เข้าหน้านี้</h2><p>หน้านี้สำหรับผู้ดูแลระบบเท่านั้น กรุณาให้ Admin ลงทะเบียนสิทธิ์ของคุณ</p></section>; }
