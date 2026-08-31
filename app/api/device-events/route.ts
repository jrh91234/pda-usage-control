const DEFAULT_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwGAfrkDX5mfwiFpp-j_vngJLeKRf2YCHSN3R07qu2tRju4Q5-0K2drZdWGhY9IV2x-/exec';
const appScriptUrl = process.env.GOOGLE_APPS_SCRIPT_URL || process.env.NEXT_PUBLIC_APPS_SCRIPT_URL || DEFAULT_APPS_SCRIPT_URL;
const APPS_SCRIPT_TIMEOUT_MS = 30000;

async function relay(init?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), APPS_SCRIPT_TIMEOUT_MS);
  try {
    const response = await fetch(appScriptUrl, { ...init, signal: controller.signal, redirect: 'follow', cache: 'no-store' });
    const body = await response.text();
    return new Response(body, { status: response.ok ? 200 : 502, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') return Response.json({ ok: false, message: 'Google Apps Script ตอบกลับช้าเกินกำหนด กรุณาตรวจสอบประวัติก่อนลองใหม่' }, { status: 504 });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET() {
  try { return await relay(); }
  catch { return Response.json({ ok: false, message: 'เชื่อมต่อ Google ไม่สำเร็จ' }, { status: 502 }); }
}

export async function POST(request: Request) {
  try {
    const body = await request.text();
    return await relay({ method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body });
  } catch { return Response.json({ ok: false, message: 'เชื่อมต่อ Google ไม่สำเร็จ' }, { status: 502 }); }
}
