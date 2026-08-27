import { cookies } from 'next/headers';
import { base64UrlDecode, verify } from '../crypto';

export async function GET() {
  const token = (await cookies()).get('pda_session')?.value;
  if (!token) return Response.json({ authenticated: false });
  const [payload, signature] = token.split('.');
  if (!payload || !signature || !(await verify(payload, signature))) return Response.json({ authenticated: false });
  try {
    const user = JSON.parse(base64UrlDecode(payload)) as { exp?: number };
    if (!user.exp || user.exp < Date.now()) return Response.json({ authenticated: false });
    delete user.exp;
    return Response.json({ authenticated: true, user });
  } catch { return Response.json({ authenticated: false }); }
}
