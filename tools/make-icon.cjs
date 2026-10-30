// Eyetouch.ico üretir: mavi yuvarlatılmış kare + beyaz oynat üçgeni.
// 16/32/48/256 px PNG'leri ICO kapsayıcısına gömer (Vista+ PNG-in-ICO).
// Kullanım: node tools/make-icon.cjs  → kökte Eyetouch.ico
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

// --- PNG kodlayıcı (RGBA, filtresiz satırlar) ---
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function encodePng(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- Logo çizimi (32 birim ızgara, supersampling) ---
const BLUE = [76, 127, 240];
const WHITE = [255, 255, 255];
function roundedRectInside(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.max(x0 + r, Math.min(x, x1 - r));
  const cy = Math.max(y0 + r, Math.min(y, y1 - r));
  if ((x < x0 + r || x > x1 - r) && (y < y0 + r || y > y1 - r)) {
    return Math.hypot(x - cx, y - cy) <= r;
  }
  return true;
}
function inTriangle(px, py, a, b, c) {
  const s1 = (b[0] - a[0]) * (py - a[1]) - (b[1] - a[1]) * (px - a[0]);
  const s2 = (c[0] - b[0]) * (py - b[1]) - (c[1] - b[1]) * (px - b[0]);
  const s3 = (a[0] - c[0]) * (py - c[1]) - (a[1] - c[1]) * (px - c[0]);
  return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0);
}
function drawLogo(size) {
  const SS = 4; // supersample
  const k = size / 32;
  const buf = Buffer.alloc(size * size * 4);
  const tri = [[12.5, 9.5], [23.5, 16], [12.5, 22.5]];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let boxCov = 0;
      let triCov = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = ((x * SS + sx + 0.5) / (size * SS)) * 32;
          const v = ((y * SS + sy + 0.5) / (size * SS)) * 32;
          if (roundedRectInside(u, v, 2, 2, 30, 30, 7)) {
            boxCov++;
            if (inTriangle(u, v, tri[0], tri[1], tri[2])) triCov++;
          }
        }
      }
      const total = SS * SS;
      const boxA = boxCov / total;
      const triA = triCov / total;
      const o = (y * size + x) * 4;
      // üçgen beyaz, kalanı mavi; kapsam dışı şeffaf
      const r = Math.round(WHITE[0] * triA + BLUE[0] * (boxA - triA));
      const g = Math.round(WHITE[1] * triA + BLUE[1] * (boxA - triA));
      const b = Math.round(WHITE[2] * triA + BLUE[2] * (boxA - triA));
      const denom = Math.max(boxA, 0.0001);
      buf[o] = Math.min(255, Math.round(r / denom));
      buf[o + 1] = Math.min(255, Math.round(g / denom));
      buf[o + 2] = Math.min(255, Math.round(b / denom));
      buf[o + 3] = Math.round(boxA * 255);
    }
  }
  return encodePng(size, size, buf);
}

// --- ICO kapsayıcı ---
const sizes = [16, 32, 48, 256];
const pngs = sizes.map(drawLogo);
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2); // ikon
header.writeUInt16LE(sizes.length, 4);
const entries = [];
let offset = 6 + 16 * sizes.length;
for (let i = 0; i < sizes.length; i++) {
  const e = Buffer.alloc(16);
  e[0] = sizes[i] === 256 ? 0 : sizes[i];
  e[1] = sizes[i] === 256 ? 0 : sizes[i];
  e[2] = 0;
  e[3] = 0;
  e.writeUInt16LE(1, 4); // düzlemler
  e.writeUInt16LE(32, 6); // bit derinliği
  e.writeUInt32LE(pngs[i].length, 8);
  e.writeUInt32LE(offset, 12);
  entries.push(e);
  offset += pngs[i].length;
}
const ico = Buffer.concat([header, ...entries, ...pngs]);
const out = path.join(__dirname, '..', 'Eyetouch.ico');
fs.writeFileSync(out, ico);
console.log('OK:', out, (ico.length / 1024).toFixed(1) + ' KB', '(' + sizes.join(',') + ' px)');
