'use client';

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';

type DeviceStatus = 'available' | 'in-use';
type Device = { id: string; name: string; serial: string; status: DeviceStatus; holder?: string; since?: string };
type UsageEvent = { id: string; deviceId: string; type: 'checkout' | 'return'; user: string; at: string; photo?: string; note?: string };

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
const appScriptUrl = process.env.NEXT_PUBLIC_APPS_SCRIPT_URL;
function formatTime(value: string) { return new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit' }).format(new Date(value)); }
function formatDate(value: string) { return new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value)); }

export default function Home() {
  const [devices, setDevices] = useState(initialDevices);
  const [events, setEvents] = useState(initialEvents);
  const [screen, setScreen] = useState<'devices' | 'timeline'>('devices');
  const [activeDevice, setActiveDevice] = useState<Device | null>(null);
  const [mode, setMode] = useState<'checkout' | 'return'>('checkout');
  const [username, setUsername] = useState(users[0]);
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<string | undefined>();
  const [isScanning, setIsScanning] = useState(false);
  const [message, setMessage] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const scanTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  useEffect(() => {
    if (!appScriptUrl) return;
    fetch(appScriptUrl).then((response) => response.json()).then((data) => {
      if (Array.isArray(data.devices)) setDevices(data.devices);
      if (Array.isArray(data.events)) setEvents(data.events);
    }).catch(() => setMessage('ยังโหลดข้อมูล Google ไม่ได้ — กำลังแสดงข้อมูลตัวอย่าง'));
  }, []);
  const summary = useMemo(() => ({ available: devices.filter((item) => item.status === 'available').length, inUse: devices.filter((item) => item.status === 'in-use').length }), [devices]);
  const sortedEvents = useMemo(() => [...events].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()), [events]);
  function openFlow(device: Device, requestedMode?: 'checkout' | 'return') { setActiveDevice(device); setMode(requestedMode ?? (device.status === 'available' ? 'checkout' : 'return')); setPhoto(undefined); setNote(''); setMessage(''); }
  function closeFlow() { stopScanner(); setActiveDevice(null); }
  function attachPhoto(event: ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => setPhoto(String(reader.result)); reader.readAsDataURL(file); }
  function startScanner() {
    if (!('BarcodeDetector' in window) || !navigator.mediaDevices?.getUserMedia) { setMessage('เบราว์เซอร์นี้ยังไม่รองรับการสแกนกล้อง กรุณาเลือกอุปกรณ์จากรายการ'); return; }
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
  return <main>
    <section className="topbar"><div className="brand"><span className="brand-mark">P</span><span><strong>PDA CONTROL</strong><small>Factory device custody</small></span></div><div className="today">{formatDate('2026-08-27T12:00:00')}</div><div className="profile"><span className="avatar">OP</span><span>ผู้ดูแลระบบ</span></div></section>
    <section className="hero"><div><p className="eyebrow">DEVICE OPERATIONS</p><h1>ควบคุมการใช้งาน PDA<br /><em>ให้ตรวจสอบได้ทุกครั้ง</em></h1><p className="hero-copy">สแกน QR เพื่อเบิกหรือคืนเครื่อง พร้อมภาพยืนยันและประวัติที่ค้นหาได้</p></div><button className="scan-button" onClick={startScanner}><span>⌁</span> สแกน QR เครื่อง</button></section>
    <nav className="tabs" aria-label="การนำทางหลัก"><button className={screen === 'devices' ? 'active' : ''} onClick={() => setScreen('devices')}>อุปกรณ์ <b>{devices.length}</b></button><button className={screen === 'timeline' ? 'active' : ''} onClick={() => setScreen('timeline')}>ประวัติการใช้งาน</button></nav>
    {screen === 'devices' ? <><section className="stats"><article><span className="stat-icon green">✓</span><div><small>พร้อมใช้งาน</small><strong>{summary.available} <i>เครื่อง</i></strong></div></article><article><span className="stat-icon amber">↗</span><div><small>กำลังถูกใช้งาน</small><strong>{summary.inUse} <i>เครื่อง</i></strong></div></article><article><span className="stat-icon blue">◷</span><div><small>รายการวันนี้</small><strong>{events.length} <i>ครั้ง</i></strong></div></article></section><section className="content-head"><div><h2>รายการอุปกรณ์</h2><p>เลือกอุปกรณ์ หรือใช้กล้องสแกน QR ที่ตัวเครื่อง</p></div><div className="legend"><span className="dot available" /> พร้อมใช้ <span className="dot used" /> กำลังใช้งาน</div></section><section className="device-grid">{devices.map((device) => <article className={`device-card ${device.status}`} key={device.id}><div className="device-top"><span className="device-icon">▣</span><span className="pill">{device.status === 'available' ? 'พร้อมใช้' : 'กำลังใช้'}</span></div><h3>{device.name}</h3><p className="serial">{device.id} · {device.serial}</p>{device.status === 'in-use' ? <div className="holder"><span>{device.holder?.slice(0, 2).toUpperCase()}</span><p><b>{device.holder}</b><small>เบิกเมื่อ {device.since} น.</small></p></div> : <div className="ready-space">ว่างสำหรับการเบิก</div>}<button onClick={() => openFlow(device)}>{device.status === 'available' ? 'เบิกเครื่อง' : 'คืนเครื่อง'} <span>→</span></button></article>)}</section></> : <Timeline events={sortedEvents} />}
    {isScanning && <div className="scanner-overlay"><div className="scanner"><button className="close" onClick={stopScanner}>×</button><p className="eyebrow">QR SCANNER</p><h2>เล็งกล้องไปที่ QR ของเครื่อง</h2><div className="video-wrap"><video ref={videoRef} muted playsInline /><span className="scan-frame" /></div><p>รองรับรหัส เช่น PDA-01</p></div></div>}
    {activeDevice && <div className="modal-overlay"><section className="flow-modal"><button className="close" onClick={closeFlow}>×</button><p className="eyebrow">{mode === 'checkout' ? 'CHECK OUT DEVICE' : 'RETURN DEVICE'}</p><h2>{mode === 'checkout' ? 'ยืนยันการเบิกเครื่อง' : 'ยืนยันการคืนเครื่อง'}</h2><div className="selected-device"><span>▣</span><div><strong>{activeDevice.name}</strong><small>{activeDevice.id} · {activeDevice.serial}</small></div></div>{mode === 'checkout' ? <label>ชื่อผู้ใช้งาน<input list="usernames" value={username} placeholder="พิมพ์ username" onChange={(event) => setUsername(event.target.value)} /><datalist id="usernames">{users.map((user) => <option key={user} value={user} />)}</datalist></label> : <p className="returning">ผู้เบิก: <b>{activeDevice.holder}</b></p>}<label>พื้นที่/หมายเหตุ <input value={note} placeholder="เช่น Line A, Packing" onChange={(event) => setNote(event.target.value)} /></label><div className={`photo-box ${photo ? 'has-photo' : ''}`}>{photo ? <img src={photo} alt="ภาพยืนยัน" /> : <><span>◉</span><strong>ถ่ายรูปยืนยัน</strong><small>กรุณาถ่ายภาพเครื่องก่อนบันทึก</small></>}<input type="file" accept="image/*" capture="environment" onChange={attachPhoto} /></div>{message && <p className="form-message">{message}</p>}<button className="primary-action" onClick={submitFlow}>{mode === 'checkout' ? 'ยืนยันการเบิก' : 'ยืนยันการคืน'} <span>→</span></button></section></div>}
  </main>;
}

function Timeline({ events }: { events: UsageEvent[] }) {
  const [query, setQuery] = useState(''); const filtered = events.filter((item) => `${item.deviceId} ${item.user}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="timeline-page"><section className="history-filter"><div><p className="eyebrow">USAGE HISTORY</p><h2>ประวัติการเบิก–คืน</h2></div><input aria-label="ค้นหาประวัติ" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหา PDA หรือชื่อผู้ใช้" /></section><div className="date-bar"><strong>27 สิงหาคม 2569</strong><span>เลือกช่วงเวลา: วันนี้ ▾</span></div><div className="timeline">{filtered.map((event) => <article className="event" key={event.id}><time>{formatTime(event.at)}<small>{formatDate(event.at)}</small></time><span className={`event-dot ${event.type}`}>{event.type === 'checkout' ? '↗' : '↙'}</span><div><span className={`type-tag ${event.type}`}>{event.type === 'checkout' ? 'เบิกเครื่อง' : 'คืนเครื่อง'}</span><h3>{event.deviceId} <em>{event.type === 'checkout' ? 'ถูกเบิกโดย' : 'ถูกคืนโดย'} {event.user}</em></h3><p>{event.note || 'ไม่มีหมายเหตุ'} · มีรูปยืนยัน</p></div>{event.photo && <img src={event.photo} alt="ภาพยืนยัน" />}</article>)}</div></section>;
}
