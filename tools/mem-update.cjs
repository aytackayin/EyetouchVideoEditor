// hafıza güncelleyici (tek seferlik)
const fs = require('fs');
const p = 'C:/Users/Eyetourch/.zcode/cli/memories/projects/eyetouch-video-editor-4ce4f3dce783e5f4/memory/eyetouch-session-state.md';
let s = fs.readFileSync(p, 'utf8');
const marker = '**v13 (EXE + GitHub hazırlığı, testli):**';
const blok = [
'**v14 (5 büyük özellik, testli):** (1) **MASKE-KLİP MİMARİSİ**: Clip.maskClipId (hedef klibe maske klibi bağlanır); projectStore.attachMaskClip(maskId,targetId|null) — maske kendi aralığında etkin, kendisi KATMAN OLARAK ÇİZİLMEZ (renderFrame maskIds skip), konum/boyut maske klibin DÖNÜŞÜMÜNDEN (linkedMaskRect: crop+fit+eff.scale), feather/invert klibin mask alanından; applyEffects linked override (u_maskType=3, lmv:/lmi: doku önbelleği, FLIP_Y=0); playback clipsNeedingElements maskeleri de içerir + maskeler SESSİZ oynar; exporter drawFrame maske klibini seek eder; Inspector Klip Bilgisinde "Maske olarak→hedef" Select; timeline daire rozet. TEST: görsel maske klibi 172→124 ✓; video klibi IAB-throttle yüzünden GL-e beyaz örnekledi (2D kare OK — gerçek tarayıcıda beklenen OK; klip-içi video maskesi aynı upload yoluyla testli). (2) **13 metin animasyonu** (fade/4 yön slide/typewriter/pop/zoom/blur/bounce/flip/tracking-ctx.letterSpacing/spin) + otomatik AYNA ÇIKIŞ (pout). (3) **Renk**: tint (yeşil↔magenta), shadows, highlights, vibrance — shader+Inspector; eski klipler loadDocument/restore backfill NEUTRAL_COLOR. (4) **Eyetouch.exe YENİDEN**: gömülü HttpListener (node GEREKMEZ, localhost:5173-5182, dist, SPA, COOP/COEP → ffmpeg wasm çalışır — testli 200+başlıklar), tek exe+dist=PORTABLE; server.cjs de COOP/COEP aldı; release-olustur.bat: dist+server.cjs+README+LICENSE+Eyetouch.exe. (5) vite build DISTİ SİLER — dist/ornek-medya test kopyası her build sonrası yeniden konmalı.',
'',
marker,
].join('\n');
if (!s.includes(marker)) { console.log('v13 isareti yok'); process.exit(1); }
s = s.replace(marker, blok);
fs.writeFileSync(p, s);

const idx = 'C:/Users/Eyetourch/.zcode/cli/memories/projects/eyetouch-video-editor-4ce4f3dce783e5f4/memory/MEMORY.md';
let m = fs.readFileSync(idx, 'utf8');
m = m.replace('+ v13 (Eyetouch.exe tepsi başlatıcı, server.cjs, README, GitHub hazır) testli', '+ v13 (EXE) + v14 (maske-KLİP, 13 animasyon, renk araçları, taşınabilir node-suz EXE) testli');
fs.writeFileSync(idx, m);
console.log('v14 kayit + index');
