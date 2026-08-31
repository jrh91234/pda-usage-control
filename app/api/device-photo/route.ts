function detectImageContentType(bytes: Uint8Array) {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 6 && new TextDecoder().decode(bytes.slice(0, 6)).startsWith('GIF8')) return 'image/gif';
  if (bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP') return 'image/webp';
  if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) return 'image/bmp';

  const text = new TextDecoder().decode(bytes.slice(0, 512)).trimStart().toLowerCase();
  if (text.startsWith('<svg') || (text.startsWith('<?xml') && text.includes('<svg'))) return 'image/svg+xml';
  return null;
}

export async function GET(request: Request) {
  const fileId = new URL(request.url).searchParams.get('id')?.trim() || '';
  if (!/^[A-Za-z0-9_-]+$/.test(fileId)) {
    return Response.json({ ok: false, message: 'รหัสรูปไม่ถูกต้อง' }, { status: 400 });
  }

  try {
    const upstream = await fetch(`https://drive.google.com/uc?export=view&id=${encodeURIComponent(fileId)}`, { redirect: 'follow', cache: 'no-store' });
    if (!upstream.ok) return Response.json({ ok: false, message: 'โหลดรูปจาก Google Drive ไม่สำเร็จ' }, { status: 502 });

    const bytes = new Uint8Array(await upstream.arrayBuffer());
    const contentType = detectImageContentType(bytes);
    if (!contentType) return Response.json({ ok: false, message: 'ไฟล์ที่ได้ไม่ใช่รูปภาพ' }, { status: 502 });

    return new Response(bytes, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return Response.json({ ok: false, message: 'เชื่อมต่อ Google Drive ไม่สำเร็จ' }, { status: 502 });
  }
}
