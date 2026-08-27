const encoder = new TextEncoder();

export function base64UrlEncode(value: string) {
  const bytes = encoder.encode(value);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlDecode(value: string) {
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4));
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

export async function sign(value: string) {
  const secret = process.env.PDA_AUTH_SECRET || 'pda-control-demo-secret-change-me';
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return base64UrlEncode(String.fromCharCode(...new Uint8Array(signature)));
}

export async function verify(value: string, signature: string) {
  return (await sign(value)) === signature;
}
