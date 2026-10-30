import { Output, BufferTarget, Mp4OutputFormat, CanvasSource, QUALITY_HIGH } from 'mediabunny';

// KURAL: SIYAH = klip görünür, BEYAZ = gizli.
const W = 640;
const H = 360;
const FPS = 24;
const DUR = 5;

function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = ((h ^ (h >>> 13)) * 1274126177) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

// Mürekkep PNG'sini SİYAH silüete çevirir (alfa şekli korunur)
function blackSilhouette(img) {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = '#000';
  x.fillRect(0, 0, c.width, c.height);
  return c;
}

window.__enc2 = { phase: 'yukleniyor', done: [], results: {}, error: null };

window.encodeInkMasks = async () => {
  const st = window.__enc2;
  try {
    // mürekkep + grunge PNG'lerini yükle
    const loads = {};
    for (const n of ['maske-murekkep-1', 'maske-murekkep-2', 'maske-murekkep-3', 'maske-murekkep-4', 'maske-grunge-1']) {
      const res = await fetch('/ornek-medya/' + n + '.png');
      const img = new Image();
      const blob = await res.blob();
      await new Promise((r, e) => { img.onload = r; img.onerror = e; img.src = URL.createObjectURL(blob); });
      loads[n] = img;
    }
    const sil = {};
    for (const k of Object.keys(loads)) sil[k] = blackSilhouette(loads[k]);

    // grunge kenar gürültüsü: sütun başına ortalama alfa (kenar ofseti kaynağı)
    const gImg = loads['maske-grunge-1'];
    const gc = document.createElement('canvas');
    gc.width = 160; gc.height = 90;
    const gx = gc.getContext('2d');
    gx.drawImage(gImg, 0, 0, 160, 90);
    const gd = gx.getImageData(0, 0, 160, 90).data;
    const edgeNoise = [];
    for (let col = 0; col < 160; col++) {
      let s = 0;
      for (let row = 0; row < 90; row++) s += gd[(row * 160 + col) * 4 + 3];
      edgeNoise.push(s / 90 / 255);
    }
    // yumuşat
    const smoothN = edgeNoise.map((v, i) => {
      const a = edgeNoise[Math.max(0, i - 2)], b = edgeNoise[Math.max(0, i - 1)], c = v;
      const d = edgeNoise[Math.min(159, i + 1)], e = edgeNoise[Math.min(159, i + 2)];
      return (a + 2 * b + 3 * c + 2 * d + e) / 9;
    });

    const ease = (t) => 1 - Math.pow(1 - t, 3);

    const DRAWS = {
      // 1) Mürekkep yayılımı: büyük sıçrama merkezden büyür (sonunda tüm kare görünür)
      'maske-video-01-murekkep-yayilim': (ctx, t) => {
        const p = ease(Math.min(1, t / (DUR * 0.8)));
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, W, H);
        const s = 0.18 + p * 1.5;
        const img = sil['maske-murekkep-2'];
        const w = Math.max(2, W * s), h = Math.max(2, (img.height / img.width) * W * s);
        ctx.save();
        ctx.translate(W / 2, H / 2);
        ctx.rotate(Math.sin(t * 1.7) * 0.05 * (1 - p));
        ctx.drawImage(img, -w / 2, -h / 2, w, h);
        ctx.restore();
      },
      // 2) Mürekkep serisi: sıçramalar sırayla patlar, büyük kapanışla biter
      'maske-video-02-murekkep-seri': (ctx, t) => {
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, W, H);
        const spots = [
          { img: 'maske-murekkep-3', at: 0.00, x: 0.22, y: 0.35, s: 0.55 },
          { img: 'maske-murekkep-4', at: 0.18, x: 0.68, y: 0.28, s: 0.6 },
          { img: 'maske-murekkep-1', at: 0.36, x: 0.42, y: 0.72, s: 0.65 },
          { img: 'maske-murekkep-3', at: 0.54, x: 0.8, y: 0.75, s: 0.5 },
          { img: 'maske-murekkep-4', at: 0.66, x: 0.12, y: 0.8, s: 0.45 },
        ];
        for (const sp of spots) {
          const local = Math.min(1, Math.max(0, (t / DUR - sp.at) / 0.14));
          if (local <= 0) continue;
          const img = sil[sp.img];
          const s = sp.s * (0.4 + 0.6 * ease(local));
          const w = Math.max(2, W * s), h = Math.max(2, (img.height / img.width) * W * s);
          ctx.globalAlpha = Math.min(1, local * 1.6);
          ctx.drawImage(img, sp.x * W - w / 2, sp.y * H - h / 2, w, h);
        }
        ctx.globalAlpha = 1;
        // kapanış: tüm kareyi kaplayan büyük sıçrama
        const fin = Math.min(1, Math.max(0, (t / DUR - 0.74) / 0.26));
        if (fin > 0) {
          const img = sil['maske-murekkep-2'];
          const s = 1.1 + fin * 0.6;
          const w = W * s, h = (img.height / img.width) * W * s;
          ctx.globalAlpha = ease(fin);
          ctx.drawImage(img, W / 2 - w / 2, H / 2 - h / 2, w, h);
          ctx.globalAlpha = 1;
        }
      },
      // 3) Grunge silme: kenarı grunge dokusuyla yırtık olan geçiş
      'maske-video-03-grunge-silme': (ctx, t) => {
        const p = ease(Math.min(1, t / (DUR * 0.85)));
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#000';
        const amp = 70;
        const base = p * (W + amp);
        for (let x = 0; x < W; x++) {
          const n = smoothN[Math.floor((x / W) * 159)] + hash(x, 7) * 0.25;
          const edge = base - n * amp;
          if (edge > x) ctx.fillRect(x, 0, 1, H);
        }
        // silinen tarafın üstüne hafif grunge dokusu (yeni görünür kısmı kirlet)
        const g = sil['maske-grunge-1'];
        ctx.globalAlpha = 0.12;
        ctx.drawImage(g, 0, 0, W, H);
        ctx.globalAlpha = 1;
      },
      // 4) Gürültü geçişi (film dissolve): pikseller sırayla siyahlaştır
      'maske-video-04-gurultu-gecis': (ctx, t, img) => {
        const p = t / DUR;
        const d = img.data;
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const v = hash(x, y) < p ? 0 : 255;
            const o = (y * W + x) * 4;
            d[o] = v; d[o + 1] = v; d[o + 2] = v; d[o + 3] = 255;
          }
        }
        ctx.putImageData(img, 0, 0);
      },
    };

    for (const [name, draw] of Object.entries(DRAWS)) {
      st.phase = 'kodlaniyor: ' + name;
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');
      const img = ctx.createImageData(W, H);
      const out = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
      const src = new CanvasSource(canvas, { codec: 'avc', quality: QUALITY_HIGH, keyFrameInterval: 2 });
      out.addVideoTrack(src, { frameRate: FPS });
      await out.start();
      const frames = FPS * DUR;
      for (let f = 0; f < frames; f++) {
        draw(ctx, f / FPS, img);
        await src.add(f / FPS, 1 / FPS);
      }
      await out.finalize();
      const arr = new Uint8Array(out.target.buffer);
      let b64 = '';
      for (let i = 0; i < arr.length; i += 8192) b64 += String.fromCharCode.apply(null, arr.subarray(i, i + 8192));
      st.results[name] = btoa(b64);
      st.done.push(name + ':' + arr.length + 'B');
    }
    st.phase = 'bitti';
  } catch (e) {
    st.phase = 'hata: ' + (e && e.message);
    st.error = String((e && e.stack) || e);
  }
};
