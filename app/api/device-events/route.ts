const DEFAULT_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwGAfrkDX5mfwiFpp-j_vngJLeKRf2YCHSN3R07qu2tRju4Q5-0K2drZdWGhY9IV2x-/exec';
const appScriptUrl = process.env.GOOGLE_APPS_SCRIPT_URL || process.env.NEXT_PUBLIC_APPS_SCRIPT_URL || DEFAULT_APPS_SCRIPT_URL;

async function relay(init?: RequestInit) {
  const response = await fetch(appScriptUrl, { ...init, redirect: 'follow', cache: 'no-store' });
  const body = await response.text();
  return new Response(body, { status: response.ok ? 200 : 502, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
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
