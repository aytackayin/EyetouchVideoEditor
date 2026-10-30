import type { BundledAssetMeta, ProjectDoc } from '../types';

/**
 * Paketli .evproj formatı: ZIP (yalnız kayıtlı/sıkıştırmasız girdiler).
 * - project.json → belge (aynı şema + assets üst verisi)
 * - assets/<id>/<fileName> → orijinal medya baytları
 * Eski düz-JSON .evproj dosyaları da açılmaya devam eder (bkz. isZip).
 * Böylece orijinal dosyalar diskten silinse bile proje tek dosyadan
 * tam olarak geri yüklenir.
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(d: Date): { time: number; date: number } {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/** Baytları ZIP'e yazar (sıkıştırmasız — medya zaten sıkıştırılmış). */
function buildZip(entries: ZipEntry[]): Uint8Array {
  const enc = new TextEncoder();
  const now = dosDateTime(new Date());
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const u16 = (v: number) => new Uint8Array([v & 0xff, (v >>> 8) & 0xff]);
  const u32 = (v: number) => new Uint8Array([v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]);
  const cat = (arrs: Uint8Array[]): Uint8Array => {
    const total = arrs.reduce((n, a) => n + a.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const a of arrs) {
      out.set(a, o);
      o += a.length;
    }
    return out;
  };
  for (const e of entries) {
    const nameBytes = enc.encode(e.name);
    const crc = crc32(e.data);
    const local = cat([
      u32(0x04034b50), u16(0x0800), u16(0), u16(0), u16(now.time), u16(now.date),
      u32(crc), u32(e.data.length), u32(e.data.length), u16(nameBytes.length), u16(0),
      nameBytes, e.data,
    ]);
    parts.push(local);
    central.push(cat([
      u32(0x02014b50), u16(0x0800), u16(0x0800), u16(0), u16(0), u16(now.time), u16(now.date),
      u32(crc), u32(e.data.length), u32(e.data.length), u16(nameBytes.length),
      u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset),
      nameBytes,
    ]));
    offset += local.length;
  }
  const centralBytes = cat(central);
  const eocd = cat([
    u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length),
    u32(centralBytes.length), u32(offset), u16(0),
  ]);
  return cat([...parts, centralBytes, eocd]);
}

/** ZIP imzası 'PK\x03\x04' — paketli proje tespiti. */
export function isZip(data: Uint8Array): boolean {
  return data.length > 4 && data[0] === 0x50 && data[1] === 0x4b && data[2] === 0x03 && data[3] === 0x04;
}

function readZip(data: Uint8Array): Map<string, Uint8Array> {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  // EOCD: sondan 22..22+65535 tara
  let eocd = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 22 - 65535); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('ZIP sonlandırıcısı bulunamadı');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out = new Map<string, Uint8Array>();
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('ZIP dizini bozuk');
    const method = dv.getUint16(p + 10, true);
    if (method !== 0) throw new Error('Paket sıkıştırılmış girdi içeriyor (beklenmiyor)');
    const crc = dv.getUint32(p + 16, true);
    const size = dv.getUint32(p + 24, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const localOff = dv.getUint32(p + 42, true);
    const name = dec.decode(data.subarray(p + 46, p + 46 + nameLen));
    // yerel başlıktan gerçek veri konumu
    const lNameLen = dv.getUint16(localOff + 26, true);
    const lExtraLen = dv.getUint16(localOff + 28, true);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const bytes = data.subarray(dataStart, dataStart + size);
    if (crc32(bytes) !== crc) throw new Error('Paket girdisi bozuk: ' + name);
    out.set(name, new Uint8Array(bytes));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

export interface BundleResult {
  doc: ProjectDoc;
  assets: Array<{ meta: BundledAssetMeta; file: File }>;
}

/** Paketli .evproj dosyasını çözer: belge + gömülü medya dosyaları. */
export function readProjectBundle(bytes: Uint8Array): BundleResult {
  const files = readZip(bytes);
  const json = files.get('project.json');
  if (!json) throw new Error('Pakette project.json yok');
  const doc = JSON.parse(new TextDecoder().decode(json)) as ProjectDoc;
  const assets: BundleResult['assets'] = [];
  for (const meta of doc.assets ?? []) {
    const bytes2 = files.get('assets/' + meta.id + '/' + meta.fileName);
    if (!bytes2) continue;
    assets.push({ meta, file: new File([bytes2], meta.name, { type: meta.mimeType || 'application/octet-stream' }) });
  }
  return { doc, assets };
}

export interface BundleInput {
  doc: ProjectDoc;
  media: Array<{ meta: BundledAssetMeta; blob: Blob }>;
}

/** Proje belgesi + medya baytlarından paketli .evproj Blob'u üretir. */
export async function buildProjectBundle(input: BundleInput): Promise<Blob> {
  const entries: ZipEntry[] = [
    { name: 'project.json', data: new TextEncoder().encode(JSON.stringify(input.doc, null, 1)) },
  ];
  for (const m of input.media) {
    const ab = new Uint8Array(await m.blob.arrayBuffer());
    entries.push({ name: 'assets/' + m.meta.id + '/' + m.meta.fileName, data: ab });
  }
  return new Blob([buildZip(entries) as BlobPart], { type: 'application/octet-stream' });
}
