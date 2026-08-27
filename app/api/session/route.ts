import { headers } from 'next/headers';

export async function GET() {
  const requestHeaders = await headers();
  const email = requestHeaders.get('oai-authenticated-user-email');
  const fullName = requestHeaders.get('oai-authenticated-user-full-name');
  const encoding = requestHeaders.get('oai-authenticated-user-full-name-encoding');
  let displayName = email || '';
  if (fullName && encoding === 'percent-encoded-utf-8') displayName = decodeURIComponent(fullName);
  return Response.json({ authenticated: Boolean(email), username: displayName || 'ผู้ใช้งานที่ล็อกอินอยู่' });
}
