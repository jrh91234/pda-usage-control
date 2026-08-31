import { cookies } from 'next/headers';
import { base64UrlEncode, sign } from '../crypto';

type LoginUser = { username: string; fullName: string; role: 'admin' | 'operator'; status: 'active' | 'inactive' };

export async function POST(request: Request) {
  const body = await request.json() as { username?: string; password?: string };
  const username = body.username?.trim() || ''; const password = body.password || '';
  if (!username || !password) return Response.json({ ok: false, message: 'กรุณากรอก Username และรหัสผ่าน' }, { status: 400 });
  let user: LoginUser | null = null;
  const scriptUrl = process.env.GOOGLE_APPS_SCRIPT_URL || process.env.NEXT_PUBLIC_APPS_SCRIPT_URL;
  if (scriptUrl) {
    try {
      const response = await fetch(scriptUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'login', username, password }) });
      const data = await response.json() as { ok?: boolean; user?: LoginUser };
      if (data.ok && data.user?.status === 'active') user = data.user;
    } catch { /* Login remains unavailable until the configured user store responds. */ }
  }
  if (!user) return Response.json({ ok: false, message: 'Username หรือรหัสผ่านไม่ถูกต้อง' }, { status: 401 });
  const payload = base64UrlEncode(JSON.stringify({ ...user, exp: Date.now() + 8 * 60 * 60 * 1000 }));
  const token = `${payload}.${await sign(payload)}`;
  const cookieStore = await cookies();
  cookieStore.set('pda_session', token, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 8 * 60 * 60 });
  return Response.json({ ok: true, user });
}
