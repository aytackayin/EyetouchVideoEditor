import type { Clip, ColorEffects, MediaAsset, ProjectSettings, Track } from '../types';
import { effectiveValues } from '../utils';

/**
 * Render motoru:
 * - WebGL2 shader: renk düzeltme + netleştirme/blur + pus giderme +
 *   yeşil perde (chroma key) + LUT (3D doku) + maske (alfa)
 * - 2D canvas: katman kompoziti (konum/ölçek/dönme/opaklık/kırpma), metin,
 *   geçişler (crossfade, dip, wipe)
 * Durumsuzdur; medya elementleri çağıran tarafından sağlanır.
 * Transform değerleri keyframe değerlendirmesinden geçirilir.
 */

/** Bağlı maske klibi bilgisi — hedef klip çizilirken hesaplanır. */
export interface LinkedMaskInfo {
  maskId: string;
  /** canvas uzayında merkez x/y + genişlik/yükseklik */
  rect: { x: number; y: number; w: number; h: number };
  feather: number;
  invert: boolean;
  video: HTMLVideoElement | null;
  img: HTMLImageElement | null;
  useAlpha: boolean;
}

/** Maskenin canvas uzayındaki kutusu — maske klibinin dönüşümünden. */
function linkedMaskRect(maskClip: Clip, natW: number, natH: number, W: number, H: number, t: number): { x: number; y: number; w: number; h: number } {
  const crop = maskClip.transform.crop;
  const sw = Math.max(2, natW * (1 - crop.left - crop.right));
  const sh = Math.max(2, natH * (1 - crop.top - crop.bottom));
  const fit = Math.min(W / sw, H / sh);
  const eff = effectiveValues(maskClip, t);
  const w = sw * fit * eff.scale;
  const h = sh * fit * eff.scale;
  return { x: W / 2 + eff.x, y: H / 2 + eff.y, w, h };
}

export interface RenderData {
  settings: ProjectSettings;
  tracks: Track[];
  clips: Clip[];
  assets: MediaAsset[];
  getElement: (clipId: string) => HTMLVideoElement | HTMLAudioElement | null;
}

const VERT_SRC = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG_SRC = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 frag;
uniform sampler2D u_tex;
uniform sampler2D u_lut;
uniform float u_lutSize;
uniform float u_lutOn;
uniform vec2 u_texel;
uniform float u_brightness;
uniform float u_contrast;
uniform float u_gamma;
uniform float u_saturation;
uniform float u_hue;
uniform float u_exposure;
uniform float u_temperature;
uniform float u_tint;
uniform float u_shadows;
uniform float u_highlights;
uniform float u_vibrance;
uniform vec3 u_liftWheel;
uniform vec3 u_gammaWheel;
uniform vec3 u_gainWheel;
uniform vec3 u_wheelMaster;
uniform float u_sharpen;
uniform float u_blur;
uniform float u_defog;
uniform float u_ckOn;uniform vec3 u_ckColor;
uniform float u_ckSimilarity;
uniform float u_ckSmoothness;
uniform float u_maskType; // 0 yok, 1 rect, 2 ellipse, 3 png görsel
uniform vec4 u_maskRect;  // cx, cy, w, h (0..1)
uniform float u_maskFeather;
uniform float u_maskInvert;
uniform sampler2D u_maskTex;
uniform float u_maskImgAlpha;

vec3 samp(vec2 uv) {
  return texture(u_tex, clamp(uv, vec2(0.0), vec2(1.0))).rgb;
}

void main() {
  vec3 c = samp(v_uv);
  vec3 result = c;
  if (u_blur > 0.01) {
    float r = 1.0 + u_blur * 0.6;
    vec2 o = u_texel * r;
    vec3 b = (
      samp(v_uv + vec2(o.x, 0.0)) + samp(v_uv - vec2(o.x, 0.0)) +
      samp(v_uv + vec2(0.0, o.y)) + samp(v_uv - vec2(0.0, o.y)) +
      samp(v_uv + o) + samp(v_uv - o) +
      samp(v_uv + vec2(o.x, -o.y)) + samp(v_uv + vec2(-o.x, o.y))
    ) / 8.0;
    result = mix(result, b, clamp(u_blur / 14.0, 0.0, 1.0));
  }
  if (u_sharpen > 0.01) {
    // Unsharp mask: merkez ile komşu ortalaması farkini EKLE (netlestirir)
    vec2 o = u_texel * (1.5 + u_sharpen * 1.5);
    vec3 blurAvg = (
      samp(v_uv + vec2(o.x, 0.0)) + samp(v_uv - vec2(o.x, 0.0)) +
      samp(v_uv + vec2(0.0, o.y)) + samp(v_uv - vec2(0.0, o.y))
    ) / 4.0;
    vec3 detail = result - blurAvg;
    result = result + detail * u_sharpen * 2.5;
  }
  // Pus giderme: siyah nokta cekme + kontrast + doygunluk
  if (u_defog > 0.001) {
    float black = min(min(result.r, result.g), result.b);
    result = (result - black * u_defog * 0.65) / max(0.35, 1.0 - u_defog * 0.3);
    result = clamp(result, 0.0, 1.0);
    float lg = dot(result, vec3(0.2126, 0.7152, 0.0722));
    result = mix(vec3(lg), result, 1.0 + u_defog * 0.35);
  }
  result *= pow(2.0, u_exposure);
  result *= u_brightness;
  // beyaz dengesi: sıcaklık (mavi↔amber) + ton (yeşil↔magenta)
  result.r += u_temperature * 0.08;
  result.b -= u_temperature * 0.08;
  result.g -= u_tint * 0.09;
  result.r += u_tint * 0.045;
  result.b += u_tint * 0.045;
  // Renk carklari: Lift (golgeler) / Gamma (orta tonlar) / Gain (parlak alanlar)
  result += u_liftWheel * (1.0 - result);
  result += u_wheelMaster.x * 0.2 * (1.0 - result);
  vec3 wg = max(vec3(1.0) - u_gammaWheel * 2.0, vec3(0.1));
  result = pow(clamp(result, vec3(0.0), vec3(1.0)), wg / max(vec3(1.0) + u_wheelMaster.y * 0.5, vec3(0.1)));
  result *= (vec3(1.0) + u_gainWheel + vec3(u_wheelMaster.z * 0.3));
  result = clamp(result, vec3(0.0), vec3(2.0));
  // gölgeler / parlak alanlar
  float lumaW = dot(clamp(result, vec3(0.0), vec3(1.0)), vec3(0.2126, 0.7152, 0.0722));
  result += u_shadows * 0.16 * (1.0 - smoothstep(0.0, 0.55, lumaW));
  result += u_highlights * 0.16 * smoothstep(0.45, 1.0, lumaW);
  result = (result - 0.5) * u_contrast + 0.5;
  float luma = dot(result, vec3(0.2126, 0.7152, 0.0722));
  // doygunluk + vibrance (doygun olmayan alanları daha çok artırır)
  float mx = max(max(result.r, result.g), result.b);
  float mn = min(min(result.r, result.g), result.b);
  float satEst = clamp(mx - mn, 0.0, 1.0);
  float satMul = u_saturation * (1.0 + u_vibrance * (1.0 - satEst));
  result = mix(vec3(luma), result, satMul);
  if (abs(u_hue) > 0.01) {
    float a = radians(u_hue);
    float ca = cos(a);
    float sa = sin(a);
    mat3 m = mat3(
      0.299 + 0.701 * ca + 0.168 * sa, 0.587 - 0.587 * ca + 0.330 * sa, 0.114 - 0.114 * ca - 0.497 * sa,
      0.299 - 0.299 * ca - 0.328 * sa, 0.587 + 0.413 * ca + 0.035 * sa, 0.114 - 0.114 * ca + 0.292 * sa,
      0.299 - 0.300 * ca + 1.250 * sa, 0.587 - 0.588 * ca - 1.050 * sa, 0.114 + 0.886 * ca - 0.203 * sa
    );
    result = m * result;
  }
  result.r += u_temperature * 0.08;
  result.b -= u_temperature * 0.08;
  result = pow(max(result, vec3(0.0)), vec3(1.0 / max(u_gamma, 0.01)));
  result = clamp(result, 0.0, 1.0);

  if (u_lutOn > 0.001) {
    float sz = u_lutSize;
    float b0 = result.b * (sz - 1.0);
    float bFloor = floor(b0);
    float bFrac = b0 - bFloor;
    float b1 = min(bFloor + 1.0, sz - 1.0);
    vec2 uv0 = vec2(result.r, (bFloor * sz + result.g * (sz - 1.0) + 0.5) / (sz * sz));
    vec2 uv1 = vec2(result.r, (b1 * sz + result.g * (sz - 1.0) + 0.5) / (sz * sz));
    vec3 s0 = texture(u_lut, uv0).rgb;
    vec3 s1 = texture(u_lut, uv1).rgb;
    vec3 sampled = mix(s0, s1, bFrac);
    result = mix(result, sampled, u_lutOn);
  }
  frag = vec4(result, 1.0);

  float alpha = 1.0;
  // Yesil perde
  if (u_ckOn > 0.5) {
    float dist = distance(frag.rgb, u_ckColor);
    float edge = max(u_ckSimilarity, 0.0001);
    float ck = smoothstep(edge, edge + max(u_ckSmoothness, 0.001), dist);
    alpha *= ck;
  }
  // Maske (proje cercevesi uv uzayinda; v ekseni asagi)
  if (u_maskType > 2.5) {
    // PNG gorsel maskesi: maske dikdortgenine yerlesir; alfa (veya parlaklik) degeri maskeler
    vec2 p = vec2(v_uv.x, 1.0 - v_uv.y);
    vec2 half_ = u_maskRect.zw * 0.5;
    vec2 d = (p - u_maskRect.xy) / max(half_, vec2(0.0001));
    vec2 muv = d * 0.5 + 0.5;
    vec4 mi = texture(u_maskTex, clamp(muv, vec2(0.0), vec2(1.0)));
    // Kural: SIYAH = görünür, beyaz/şeffaf = gizli. Parlaklık maskesi ters çevrilir;
    // alfa maskesinde opak (ör. siyah mürekkep) alan görünürdür.
    float mval = mix(1.0 - dot(mi.rgb, vec3(0.299, 0.587, 0.114)), mi.a, u_maskImgAlpha);
    float feather = max(u_maskFeather, 0.001);
    float dd = max(abs(d.x), abs(d.y));
    float m = mval * (1.0 - smoothstep(1.0 - feather, 1.0, dd));
    if (u_maskInvert > 0.5) m = 1.0 - m;
    alpha *= m;
  } else if (u_maskType > 0.5) {
    vec2 p = vec2(v_uv.x, 1.0 - v_uv.y);
    vec2 half_ = u_maskRect.zw * 0.5;
    vec2 d = (p - u_maskRect.xy) / max(half_, vec2(0.0001));
    float dist;
    if (u_maskType < 1.5) {
      dist = max(abs(d.x), abs(d.y));
    } else {
      dist = length(d);
    }
    float feather = max(u_maskFeather, 0.001);
    float m = 1.0 - smoothstep(1.0 - feather, 1.0, dist);
    if (u_maskInvert > 0.5) m = 1.0 - m;
    alpha *= m;
  }
  frag.a = alpha;
}`;

/** HSL(0..360, 0..1, 0..1) -> RGB (0..1) */
function hslToRgb(hIn: number, s: number, l: number): [number, number, number] {
  const h = ((((hIn % 360) + 360) % 360) / 60);
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h % 2) - 1));
  let r = 0; let g = 0; let b = 0;
  if (h < 1) { r = c; g = x; } else if (h < 2) { r = x; g = c; }
  else if (h < 3) { g = c; b = x; } else if (h < 4) { g = x; b = c; }
  else if (h < 5) { r = x; b = c; } else { r = c; b = x; }
  const m = l - c / 2;
  return [r + m, g + m, b + m];
}

/** Renk carki noktasi -> kanal deltalarI */
function wheelToRgb(x: number, y: number, strength: number): [number, number, number] {
  const sat = Math.min(1, Math.hypot(x, y));
  if (sat < 0.001) return [0, 0, 0];
  const rgb = hslToRgb((Math.atan2(y, x) * 180) / Math.PI, 1, 0.5);
  return [(rgb[0] - 0.5) * sat * strength, (rgb[1] - 0.5) * sat * strength, (rgb[2] - 0.5) * sat * strength];
}

function isNeutral(c: ColorEffects): boolean {
  return (
    c.brightness === 1 && c.contrast === 1 && c.gamma === 1 && c.saturation === 1 &&
    c.hue === 0 && c.exposure === 0 && c.temperature === 0 && c.tint === 0 &&
    c.shadows === 0 && c.highlights === 0 && c.vibrance === 0 &&
    (c.liftX || 0) === 0 && (c.liftY || 0) === 0 && (c.liftMaster || 0) === 0 &&
    (c.gammaX || 0) === 0 && (c.gammaY || 0) === 0 && (c.gammaMaster || 0) === 0 &&
    (c.gainX || 0) === 0 && (c.gainY || 0) === 0 && (c.gainMaster || 0) === 0 &&
    c.sharpen === 0 && c.blur === 0 && c.defog === 0
  );
}

const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);

function hexToRgb01(hex: string): [number, number, number] {
  const h = hex.trim().replace('#', '');
  if (h.length !== 6) return [0, 1, 0];
  const n = parseInt(h, 16);
  if (!Number.isFinite(n)) return [0, 1, 0];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Efekt uygulanmasi gerekiyor mu? (GL yolu) */
function needsGl(clip: Clip): boolean {
  return (
    !isNeutral(clip.color) ||
    clip.chroma.enabled ||
    clip.mask.enabled ||
    (clip.lut != null && clip.lut.strength > 0.001)
  );
}

export class Renderer {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private glCanvas: HTMLCanvasElement | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private tex: WebGLTexture | null = null;
  
  private lutCache = new Map<string, { size: number; tex: WebGLTexture }>();
  private uni: Record<string, WebGLUniformLocation | null> = {};
  private images = new Map<string, HTMLImageElement>();
  /** PNG görsel maskeleri: klip bazlı doku önbelleği */
  private maskImages = new Map<string, { img: HTMLImageElement; tex: WebGLTexture | null }>();
  /** Animasyonlu maske videoları: varlık bazlı element + doku havuzu */
  private maskVideos = new Map<string, HTMLVideoElement>();
  private maskVideoTex = new Map<string, WebGLTexture>();
  private whiteMaskTex: WebGLTexture | null = null;
  onNeedRedraw: (() => void) | null = null;

  /** Gorunur hedef canvas'i bagla. */
  attach(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
  }

  setSize(w: number, h: number): void {
    if (this.canvas && (this.canvas.width !== w || this.canvas.height !== h)) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  private initGl(): boolean {
    if (this.program) return true;
    try {
      const glCanvas = document.createElement('canvas');
      const gl = glCanvas.getContext('webgl2', {
        preserveDrawingBuffer: true,
        alpha: true,
        premultipliedAlpha: false,
      });
      if (!gl) return false;
      this.glCanvas = glCanvas;
      this.gl = gl;
      const compile = (type: number, src: string): WebGLShader | null => {
        const sh = gl.createShader(type);
        if (!sh) return null;
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
          console.error('Shader derleme hatası:', gl.getShaderInfoLog(sh));
          return null;
        }
        return sh;
      };
      const vs = compile(gl.VERTEX_SHADER, VERT_SRC);
      const fs = compile(gl.FRAGMENT_SHADER, FRAG_SRC);
      if (!vs || !fs) return false;
      const prog = gl.createProgram();
      if (!prog) return false;
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        console.error('Program bağlama hatası:', gl.getProgramInfoLog(prog));
        return false;
      }
      this.program = prog;
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'a_pos');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      for (const name of [
        'u_tex', 'u_lut', 'u_lutOn', 'u_lutSize', 'u_texel', 'u_brightness', 'u_contrast', 'u_gamma',
        'u_saturation', 'u_hue', 'u_exposure', 'u_temperature', 'u_tint', 'u_shadows', 'u_highlights',
        'u_vibrance', 'u_liftWheel', 'u_gammaWheel', 'u_gainWheel', 'u_wheelMaster', 'u_sharpen', 'u_blur', 'u_defog',
        'u_ckOn', 'u_ckColor', 'u_ckSimilarity', 'u_ckSmoothness',
        'u_maskType', 'u_maskRect', 'u_maskFeather', 'u_maskInvert', 'u_maskTex', 'u_maskImgAlpha',
      ]) {
        this.uni[name] = gl.getUniformLocation(prog, name);
      }
      this.tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      this.tex = this.tex; // 3D dummy kaldirildi (2D LUT)
      return true;
    } catch {
      return false;
    }
  }

  private getImage(asset: MediaAsset): HTMLImageElement | null {
    if (!asset.url) return null;
    let img = this.images.get(asset.id);
    if (!img) {
      img = new Image();
      img.onload = () => this.onNeedRedraw?.();
      img.src = asset.url!;
      this.images.set(asset.id, img);
    }
    return img.complete && img.naturalWidth > 0 ? img : null;
  }

  private ensureLutTexture(key: string, size: number, data: Float32Array): WebGLTexture | null {
    if (!this.initGl() || !this.gl) return null;
    const cached = this.lutCache.get(key);
    if (cached && cached.size === size) return cached.tex;
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    const n = size * size * size;
    const rgba = new Uint8Array(n * 4);
    for (let i = 0; i < n; i++) {
      rgba[i * 4] = Math.round(Math.min(1, Math.max(0, data[i * 3])) * 255);
      rgba[i * 4 + 1] = Math.round(Math.min(1, Math.max(0, data[i * 3 + 1])) * 255);
      rgba[i * 4 + 2] = Math.round(Math.min(1, Math.max(0, data[i * 3 + 2])) * 255);
      rgba[i * 4 + 3] = 255;
    }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, size, size * size, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    if (tex) this.lutCache.set(key, { size, tex });
    return tex;
  }

  /** 1×1 beyaz doku — görsel maskesi henüz yüklenmemişken tam görünür. */
  private getWhiteMaskTex(): WebGLTexture | null {
    if (this.whiteMaskTex || !this.gl) return this.whiteMaskTex;
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.whiteMaskTex = tex;
    return tex;
  }

  /** Klibin PNG maske görselini önbellekten döndürür; yüklenmişse dokuyu oluşturur. */
  private maskImageEntry(clip: Clip): { img: HTMLImageElement; tex: WebGLTexture | null } | null {
    const mi = clip.mask.image;
    if (!mi) return null;
    const key = clip.id + '|' + mi.name + '|' + mi.dataUrl.length + '|' + mi.dataUrl.slice(0, 64);
    let entry = this.maskImages.get(key);
    if (!entry) {
      const img = new Image();
      const e: { img: HTMLImageElement; tex: WebGLTexture | null } = { img, tex: null };
      img.onload = () => {
        e.tex = null; // yeniden yüklensin
        this.onNeedRedraw?.();
      };
      img.src = mi.dataUrl;
      entry = e;
      this.maskImages.set(key, e);
    }
    const gl = this.gl;
    if (gl && !entry.tex && entry.img.complete && entry.img.naturalWidth > 0) {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      // FLIP_Y=0: maske doku satır 0 = görselin ÜSTÜ; örnekleyici muv.y=0'u kare
      // üstüne koyar → üst üste gelir (çeyrek testiyle doğrulandı)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, entry.img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
      entry.tex = tex;
    }
    return entry;
  }

  /** Klibin animasyonlu maske videosu elementi (varlık id'sine göre havuzda). */
  getMaskVideo(clip: Clip, assets: MediaAsset[]): HTMLVideoElement | null {
    const id = clip.mask.videoAssetId;
    if (!id) return null;
    const asset = assets.find((a) => a.id === id);
    if (!asset || !asset.url || asset.kind !== 'video') return null;
    let el = this.maskVideos.get(id);
    if (!el) {
      el = document.createElement('video');
      el.muted = true;
      el.playsInline = true;
      el.preload = 'auto';
      el.src = asset.url;
      el.addEventListener('seeked', () => this.onNeedRedraw?.());
      el.addEventListener('loadeddata', () => this.onNeedRedraw?.());
      this.maskVideos.set(id, el);
    }
    return el;
  }

  /**
   * Maske videolarını timeline ile senkronlar: klip oynarken onlar da oynar,
   * duraklatılınca/scrub'da klibin yerel zamanına (kısa videoda döngüyle) seek eder.
   */
  syncMaskVideos(t: number, playing: boolean, clips: Clip[], assets: MediaAsset[]): void {
    const used = new Set<string>();
    for (const clip of clips) {
      if (!clip.mask.enabled || clip.mask.shape !== 'video' || !clip.mask.videoAssetId) continue;
      const el = this.getMaskVideo(clip, assets);
      if (!el) continue;
      used.add(clip.mask.videoAssetId);
      const dur = Number.isFinite(el.duration) && el.duration > 0.1 ? el.duration : 0;
      let mt = Math.max(0, t - clip.start);
      if (dur > 0) mt = mt % dur;
      if (playing) {
        el.playbackRate = 1;
        if (el.paused) el.play().catch(() => undefined);
        if (Math.abs(el.currentTime - mt) > 0.3) el.currentTime = mt;
      } else {
        if (!el.paused) el.pause();
        if (el.readyState >= 1 && Math.abs(el.currentTime - mt) > 0.034) el.currentTime = mt;
      }
    }
    // Artık hiçbir klip kullanmıyor → temizle
    for (const [id, el] of Array.from(this.maskVideos.entries())) {
      if (used.has(id)) continue;
      if (!clips.some((c) => c.mask.enabled && c.mask.shape === 'video' && c.mask.videoAssetId === id)) {
        el.pause();
        el.removeAttribute('src');
        el.load();
        this.maskVideos.delete(id);
        this.maskVideoTex.delete('vid:' + id);
      }
    }
  }

  /** Dışa aktarım öncesi maske görsellerini/videoslarını ısıtır. */
  preloadMaskImages(clips: Clip[], assets: MediaAsset[] = []): void {
    for (const c of clips) {
      if (!c.mask.enabled) continue;
      if (c.mask.shape === 'image' && c.mask.image) this.maskImageEntry(c);
      if (c.mask.shape === 'video') this.getMaskVideo(c, assets);
    }
  }

  /** Efektleri uygulanmis kareyi glCanvas'a cizer (alfa dahil). */
  private applyEffects(
    source: HTMLVideoElement | HTMLImageElement,
    sw: number,
    sh: number,
    clip: Clip,
    assets: MediaAsset[],
    linked?: LinkedMaskInfo | null,
  ): { canvas: HTMLCanvasElement; w: number; h: number } | null {
    if (!this.initGl() || !this.gl || !this.glCanvas || !this.program || !this.tex) return null;
    const gl = this.gl;
    const color = clip.color;
    const w = Math.max(2, Math.round(sw));
    const h = Math.max(2, Math.round(sh));
    if (this.glCanvas.width !== w || this.glCanvas.height !== h) {
      this.glCanvas.width = w;
      this.glCanvas.height = h;
    }
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    } catch {
      return null;
    }
    gl.uniform1i(this.uni.u_tex!, 0);

    let lutOn = 0;
    const lut = clip.lut;
    if (lut && lut.strength > 0.001) {
      const lutTex = this.ensureLutTexture(lut.name + ':' + lut.size + ':' + lut.data.length, lut.size, lut.data);
      if (lutTex) {
        gl.activeTexture(gl.TEXTURE1);
        if (lutTex) if (lutTex) gl.bindTexture(gl.TEXTURE_2D, lutTex || this.tex);
        gl.uniform1i(this.uni.u_lut!, 1);
        lutOn = Math.min(1, lut.strength);
      }
    } else {
      gl.activeTexture(gl.TEXTURE1);
      
    }
    gl.uniform1f(this.uni.u_lutOn!, lutOn);
    gl.uniform1f(this.uni.u_lutSize!, lut ? lut.size : 2);

    gl.uniform2f(this.uni.u_texel!, 1 / w, 1 / h);
    gl.uniform1f(this.uni.u_brightness!, color.brightness);
    gl.uniform1f(this.uni.u_contrast!, color.contrast);
    gl.uniform1f(this.uni.u_gamma!, color.gamma);
    gl.uniform1f(this.uni.u_saturation!, color.saturation);
    gl.uniform1f(this.uni.u_hue!, color.hue);
    gl.uniform1f(this.uni.u_exposure!, color.exposure);
    gl.uniform1f(this.uni.u_temperature!, color.temperature);
    // eski kayıtlarda olmayabilecek alanlar için varsayılanlar
    gl.uniform1f(this.uni.u_tint!, color.tint || 0);
    gl.uniform1f(this.uni.u_shadows!, color.shadows || 0);
    gl.uniform1f(this.uni.u_highlights!, color.highlights || 0);
    gl.uniform1f(this.uni.u_vibrance!, color.vibrance || 0);
    gl.uniform3f(this.uni.u_liftWheel!, ...wheelToRgb(color.liftX || 0, color.liftY || 0, 0.32));
    gl.uniform3f(this.uni.u_gammaWheel!, ...wheelToRgb(color.gammaX || 0, color.gammaY || 0, 0.32));
    gl.uniform3f(this.uni.u_gainWheel!, ...wheelToRgb(color.gainX || 0, color.gainY || 0, 0.32));
    gl.uniform3f(this.uni.u_wheelMaster!, color.liftMaster || 0, color.gammaMaster || 0, color.gainMaster || 0);
    gl.uniform1f(this.uni.u_sharpen!, color.sharpen);
    gl.uniform1f(this.uni.u_blur!, color.blur);
    gl.uniform1f(this.uni.u_defog!, color.defog);

    const ck = clip.chroma;
    gl.uniform1f(this.uni.u_ckOn!, ck.enabled ? 1 : 0);
    const ckc = hexToRgb01(ck.color);
    gl.uniform3f(this.uni.u_ckColor!, ckc[0], ckc[1], ckc[2]);
    gl.uniform1f(this.uni.u_ckSimilarity!, ck.similarity);
    gl.uniform1f(this.uni.u_ckSmoothness!, ck.smoothness);

    const mask = clip.mask;
    gl.uniform1f(
      this.uni.u_maskType!,
      !mask.enabled ? 0 : mask.shape === 'rect' ? 1 : mask.shape === 'ellipse' ? 2 : 3,
    );
    gl.uniform4f(this.uni.u_maskRect!, mask.x, mask.y, mask.width, mask.height);
    gl.uniform1f(this.uni.u_maskFeather!, Math.max(0.001, mask.feather));
    gl.uniform1f(this.uni.u_maskInvert!, mask.invert ? 1 : 0);

    // Maske dokusu (PNG / video): birim 2; hazır değilse beyaz (tam görünür)
    gl.activeTexture(gl.TEXTURE2);
    let maskImgAlpha = 0;
    if (mask.enabled && (mask.shape === 'image' || mask.shape === 'video')) {
      if (mask.shape === 'image') {
        const entry = this.maskImageEntry(clip);
        gl.bindTexture(gl.TEXTURE_2D, entry?.tex ?? this.getWhiteMaskTex());
        maskImgAlpha = clip.mask.image?.useAlpha ? 1 : 0;
      } else {
        const el = this.getMaskVideo(clip, assets);
        let bound = false;
        if (el && el.readyState >= 2) {
          const key = 'vid:' + (clip.mask.videoAssetId ?? '');
          let tex = this.maskVideoTex.get(key);
          if (!tex) {
            const created = gl.createTexture();
            if (created) {
              this.maskVideoTex.set(key, created);
              tex = created;
            }
          }
          if (tex) {
            gl.bindTexture(gl.TEXTURE_2D, tex);
            // FLIP_Y=0 — PNG maskesiyle aynı yön kuralı
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
            try {
              gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, el);
              gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
              gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
              gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
              gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
              bound = true;
            } catch {
              // kare hazır değil
            }
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
          }
        }
        if (!bound) gl.bindTexture(gl.TEXTURE_2D, this.getWhiteMaskTex());
        // video maskesi parlaklıktan türetilir (shader siyah=görünür çevirir)
        maskImgAlpha = 0;
      }
    } else {
      gl.bindTexture(gl.TEXTURE_2D, this.getWhiteMaskTex());
    }
    gl.uniform1i(this.uni.u_maskTex!, 2);
    gl.uniform1f(this.uni.u_maskImgAlpha!, maskImgAlpha);

    // BAGLI MASKE KLIPi: kendi maskesinin yerine gecer (klip uzayinda konumlanir)
    if (linked) {
      gl.uniform1f(this.uni.u_maskType!, 3);
      gl.uniform4f(this.uni.u_maskRect!, linked.rect.x, linked.rect.y, linked.rect.w, linked.rect.h);
      gl.uniform1f(this.uni.u_maskFeather!, Math.max(0.001, linked.feather));
      gl.uniform1f(this.uni.u_maskInvert!, linked.invert ? 1 : 0);
      gl.activeTexture(gl.TEXTURE2);
      let bound = false;
      const bindTex = (tex: WebGLTexture) => {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
        try {
          const src: TexImageSource = linked.video ?? linked.img!;
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          bound = true;
        } catch { /* kare hazir degil */ }
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
      };
      if (linked.video && linked.video.readyState >= 2) {
        const key = 'lmv:' + linked.maskId;
        let tex = this.maskVideoTex.get(key);
        if (!tex) {
          const created = gl.createTexture();
          if (created) { this.maskVideoTex.set(key, created); tex = created; }
        }
        if (tex) bindTex(tex);
      } else if (linked.img && linked.img.complete && linked.img.naturalWidth > 0) {
        const key = 'lmi:' + linked.maskId;
        let entry = this.maskImages.get(key);
        if (!entry) {
          entry = { img: linked.img, tex: null };
          this.maskImages.set(key, entry);
        }
        if (!entry.tex) {
          const created = gl.createTexture();
          if (created) entry.tex = created;
        }
        if (entry.tex) bindTex(entry.tex);
      }
      if (!bound) gl.bindTexture(gl.TEXTURE_2D, this.getWhiteMaskTex());
      gl.uniform1i(this.uni.u_maskTex!, 2);
      gl.uniform1f(this.uni.u_maskImgAlpha!, linked.useAlpha ? 1 : 0);
    }

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return { canvas: this.glCanvas, w, h };
  }

  /** Gorselin saydamligi var mi (bagli gorsel maskeler icin alfa/luma secimi). */
  private alphaDetectCache = new Map<string, boolean>();
  private imageHasAlpha(asset: MediaAsset): boolean {
    const hit = this.alphaDetectCache.get(asset.id);
    if (hit !== undefined) return hit;
    let result = false;
    const img = this.images.get(asset.id);
    if (img && img.complete && img.naturalWidth > 0) {
      try {
        const c = document.createElement('canvas');
        c.width = 32; c.height = 32;
        const x = c.getContext('2d');
        if (x) {
          x.drawImage(img, 0, 0, 32, 32);
          const d = x.getImageData(0, 0, 32, 32).data;
          for (let i = 3; i < d.length; i += 4) {
            if (d[i] < 250) { result = true; break; }
          }
        }
      } catch { result = true; }
    }
    this.alphaDetectCache.set(asset.id, result);
    return result;
  }

  renderFrame(t: number, data: RenderData): void {
    const ctx = this.ctx;
    const canvas = this.canvas;
    if (!ctx || !canvas) return;
    const W = data.settings.width;
    const H = data.settings.height;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    // bağlı maske haritası: hedefId → maske klibi; maske klibi id'leri katman
    // olarak ÇİZİLMEZ (yalnız maske kaynağıdırlar)
    const linkedByTarget = new Map<string, Clip>();
    for (const c of data.clips) {
      if (c.maskClipId) {
        const mc = data.clips.find((x) => x.id === c.maskClipId);
        if (mc) linkedByTarget.set(c.id, mc);
      }
    }
    const maskIds = new Set<string>();
    for (const mc of linkedByTarget.values()) maskIds.add(mc.id);

    /** Hedef klibin bağlı maske tanımı (zaman aralığındaysa). */
    const buildLinked = (target: Clip): LinkedMaskInfo | null => {
      const mc = linkedByTarget.get(target.id);
      if (!mc || !mc.assetId) return null;
      if (t < mc.start - 0.001 || t >= mc.start + mc.duration) return null;
      const asset = data.assets.find((a) => a.id === mc.assetId);
      if (!asset) return null;
      const natW = asset.width || 16;
      const natH = asset.height || 9;
      let video: HTMLVideoElement | null = null;
      let img: HTMLImageElement | null = null;
      let useAlpha = false;
      if (asset.kind === 'video') {
        const el = data.getElement(mc.id);
        if (el && el instanceof HTMLVideoElement) video = el;
      } else if (asset.kind === 'image') {
        img = this.getImage(asset);
        useAlpha = img ? this.imageHasAlpha(asset) : false;
      } else {
        return null;
      }
      return {
        maskId: mc.id,
        rect: linkedMaskRect(mc, natW, natH, W, H, t),
        feather: mc.mask.feather,
        invert: mc.mask.invert,
        video,
        img,
        useAlpha,
      };
    };

    const videoTracks = data.tracks.filter((tr) => tr.kind === 'video').reverse();
    for (const track of videoTracks) {
      if (track.hidden) continue;
      const trackClips = data.clips
        .filter((c) => c.trackId === track.id && t >= c.start - 1e-6 && t < c.start + c.duration + 1e-6)
        .sort((a, b) => a.start - b.start);
      for (const clip of trackClips) {
        if (maskIds.has(clip.id)) continue; // maske klibi katman değil
        const linked = buildLinked(clip);
        let alphaMul = 1;
        let wipe: { dir: 'left' | 'right' | 'up' | 'down'; p: number } | null = null;
        let overlay: { color: string; alpha: number } | null = null;
        const tr = clip.transitionIn;
        if (tr && t < clip.start + tr.duration) {
          const p = Math.min(1, Math.max(0, (t - clip.start) / Math.max(0.01, tr.duration)));
          const prev = data.clips
            .filter((c) => c.trackId === clip.trackId && c.id !== clip.id && c.start + c.duration <= clip.start + 0.001)
            .sort((a, b) => b.start + b.duration - (a.start + a.duration))[0];
          if (prev && t >= prev.start) {
            this.drawClip(ctx, prev, t, data, W, H, 1, null, null);
          }
          switch (tr.type) {
            case 'crossfade': alphaMul = p; break;
            case 'dipBlack': alphaMul = p; overlay = { color: '#000', alpha: 1 - Math.abs(2 * p - 1) }; break;
            case 'dipWhite': alphaMul = p; overlay = { color: '#fff', alpha: 1 - Math.abs(2 * p - 1) }; break;
            case 'wipeLeft': wipe = { dir: 'left', p }; break;
            case 'wipeRight': wipe = { dir: 'right', p }; break;
            case 'wipeUp': wipe = { dir: 'up', p }; break;
            case 'wipeDown': wipe = { dir: 'down', p }; break;
          }
        }
        this.drawClip(ctx, clip, t, data, W, H, alphaMul, wipe, overlay, linked);
      }
    }
  }

  private drawClip(
    ctx: CanvasRenderingContext2D,
    clip: Clip,
    t: number,
    data: RenderData,
    W: number,
    H: number,
    alphaMul: number,
    wipe: { dir: string; p: number } | null,
    overlay: { color: string; alpha: number } | null,
    linked?: LinkedMaskInfo | null,
  ): void {
    ctx.save();
    if (wipe) {
      const p = wipe.p;
      ctx.beginPath();
      if (wipe.dir === 'left') ctx.rect(0, 0, W * p, H);
      else if (wipe.dir === 'right') ctx.rect(W * (1 - p), 0, W * p, H);
      else if (wipe.dir === 'up') ctx.rect(0, 0, W, H * p);
      else ctx.rect(0, H * (1 - p), W, H * p);
      ctx.clip();
    }
    if (clip.kind === 'text') {
      this.drawTextClip(ctx, clip, t, W, H, alphaMul);
    } else {
      const asset = clip.assetId ? data.assets.find((a) => a.id === clip.assetId) : undefined;
      const el = data.getElement(clip.id);
      if (asset && el && el instanceof HTMLVideoElement && el.readyState >= 2) {
        this.drawMediaClip(ctx, clip, el, t, W, H, alphaMul, (needsGl(clip) || !!linked), data.assets, linked);
      } else if (asset && asset.kind === 'image') {
        const img = this.getImage(asset);
        if (img) this.drawMediaClip(ctx, clip, img, t, W, H, alphaMul, (needsGl(clip) || !!linked), data.assets, linked);
      }
    }
    if (overlay && overlay.alpha > 0.002) {
      ctx.globalAlpha = overlay.alpha;
      ctx.fillStyle = overlay.color;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }

  private drawMediaClip(
    ctx: CanvasRenderingContext2D,
    clip: Clip,
    element: HTMLVideoElement | HTMLImageElement,
    t: number,
    W: number,
    H: number,
    alphaMul: number,
    useGl: boolean,
    assets: MediaAsset[],
    linked?: LinkedMaskInfo | null,
  ): void {
    const natW = element instanceof HTMLVideoElement ? element.videoWidth : element.naturalWidth;
    const natH = element instanceof HTMLVideoElement ? element.videoHeight : element.naturalHeight;
    if (!natW || !natH) return;
    const crop = clip.transform.crop;
    const sx = natW * crop.left;
    const sy = natH * crop.top;
    const sw = natW * (1 - crop.left - crop.right);
    const sh = natH * (1 - crop.top - crop.bottom);
    if (sw < 2 || sh < 2) return;

    const eff = effectiveValues(clip, t);

    let src: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement = element;
    let srcX = sx;
    let srcY = sy;
    let srcW = sw;
    let srcH = sh;
    if (useGl) {
      const glOut = this.applyEffects(element, sw, sh, clip, assets, linked);
      if (glOut) {
        src = glOut.canvas;
        srcX = 0;
        srcY = 0;
        srcW = glOut.w;
        srcH = glOut.h;
      }
    }

    const fit = Math.min(W / srcW, H / srcH);
    const w = srcW * fit * eff.scale;
    const h = srcH * fit * eff.scale;

    ctx.save();
    ctx.globalAlpha = Math.min(1, Math.max(0, eff.opacity * alphaMul));
    ctx.translate(W / 2 + eff.x, H / 2 + eff.y);
    if (eff.rotation !== 0) ctx.rotate((eff.rotation * Math.PI) / 180);
    try {
      ctx.drawImage(src as CanvasImageSource, srcX, srcY, srcW, srcH, -w / 2, -h / 2, w, h);
    } catch {
      // kare hazır değil
    }
    ctx.restore();
  }

  private drawTextClip(
    ctx: CanvasRenderingContext2D,
    clip: Clip,
    t: number,
    W: number,
    H: number,
    alphaMul: number,
  ): void {
    const tp = clip.text;
    if (!tp || !tp.content) return;
    const eff = effectiveValues(clip, t);
    const local = t - clip.start;
    const ad = Math.max(0.05, tp.animationDuration);
    // giriş/çıkış ilerlemeleri: çıkış, animasyonun ayna görüntüsü
    const pin = Math.min(1, Math.max(0, local / ad));
    const pout = Math.min(1, Math.max(0, (clip.duration - local) / ad));
    const ease = (x: number) => 1 - Math.pow(1 - x, 3);
    const backOut = (x: number) => 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2);

    let alpha = eff.opacity * alphaMul;
    let dx = 0;
    let dy = 0;
    let sx = 1;
    let sy = 1;
    let rot = 0;
    let blurPx = 0;
    let tracking = 0;
    let content = tp.content;

    switch (tp.animation) {
      case 'fade':
        alpha *= pin * pout;
        break;
      case 'slideUp':
        dy = (1 - ease(pin)) * tp.fontSize * 0.6 + (1 - ease(pout)) * tp.fontSize * 0.6;
        alpha *= Math.min(1, pin * 1.4) * Math.min(1, pout * 1.4);
        break;
      case 'slideDown':
        dy = -((1 - ease(pin)) * tp.fontSize * 0.6) - (1 - ease(pout)) * tp.fontSize * 0.6;
        alpha *= Math.min(1, pin * 1.4) * Math.min(1, pout * 1.4);
        break;
      case 'slideLeft':
        dx = (1 - ease(pin)) * tp.fontSize * 1.6 + (1 - ease(pout)) * tp.fontSize * 1.6;
        alpha *= Math.min(1, pin * 1.4) * Math.min(1, pout * 1.4);
        break;
      case 'slideRight':
        dx = -((1 - ease(pin)) * tp.fontSize * 1.6) - (1 - ease(pout)) * tp.fontSize * 1.6;
        alpha *= Math.min(1, pin * 1.4) * Math.min(1, pout * 1.4);
        break;
      case 'zoomIn':
        sx = sy = (0.35 + 0.65 * Math.min(ease(pin), 1)) * (0.35 + 0.65 * Math.min(ease(pout), 1));
        alpha *= Math.min(1, pin * 1.6) * Math.min(1, pout * 1.6);
        break;
      case 'blurIn':
        blurPx = (1 - pin) * tp.fontSize * 0.35 + (1 - pout) * tp.fontSize * 0.35;
        alpha *= Math.min(1, pin * 1.2) * Math.min(1, pout * 1.2);
        break;
      case 'bounceIn':
        sx = sy = 0.5 + 0.5 * Math.min(1.12, Math.max(0, backOut(Math.min(pin, 1))));
        alpha *= Math.min(1, pin * 2);
        break;
      case 'flipIn':
        sy = 0.04 + 0.96 * ease(pin);
        sx = 1;
        alpha *= Math.min(1, pin * 1.3);
        break;
      case 'tracking':
        tracking = (1 - ease(pin)) * tp.fontSize * 0.55;
        alpha *= Math.min(1, pin * 1.2);
        break;
      case 'spinIn':
        sx = sy = 0.2 + 0.8 * ease(pin);
        rot = (1 - ease(pin)) * 120;
        alpha *= Math.min(1, pin * 1.5);
        break;
      case 'typewriter':
        content = content.slice(0, Math.ceil(content.length * pin));
        break;
      case 'pop':
      default:
        break;
    }
    if (tp.animation === 'pop') {
      const p = pin;
      alpha *= p;
      const pop = 0.7 + 0.3 * ease(p);
      sx = pop;
      sy = pop;
    }
    if (alpha <= 0.002 || !content) return;

    ctx.save();
    ctx.globalAlpha = Math.min(1, Math.max(0, alpha));
    ctx.translate(W / 2 + eff.x + dx, H / 2 + eff.y + dy);
    const totalRot = eff.rotation + rot;
    if (totalRot !== 0) ctx.rotate((totalRot * Math.PI) / 180);
    ctx.scale(sx * eff.scale, sy * eff.scale);
    if (blurPx > 0.5) ctx.filter = `blur(${blurPx.toFixed(1)}px)`;
    if (tracking > 0.5) {
      (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${tracking.toFixed(1)}px`;
    }
    try {
      this.drawTextBody(ctx, clip, content);
    } finally {
      ctx.filter = 'none';
      (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '0px';
    }
    ctx.restore();
  }

  /** Metin gövdesi (arka plan kutusu + satırlar). */
  private drawTextBody(ctx: CanvasRenderingContext2D, clip: Clip, content: string): void {
    const tp = clip.text!;
    const font = `${tp.italic ? 'italic ' : ''}${tp.bold ? '700' : '400'} ${tp.fontSize}px "${tp.fontFamily}", sans-serif`;
    ctx.font = font;
    ctx.textBaseline = 'middle';
    ctx.textAlign = tp.align === 'left' ? 'left' : tp.align === 'right' ? 'right' : 'center';
    const lines = content.split('\n');
    const lineH = tp.fontSize * 1.25;
    let maxW = 0;
    for (const line of lines) maxW = Math.max(maxW, ctx.measureText(line).width);

    if (tp.backgroundColor && tp.backgroundColor !== 'transparent') {
      const pad = tp.backgroundPadding;
      const boxW = maxW + pad * 2;
      const boxH = lines.length * lineH + pad * 2;
      const bx = tp.align === 'left' ? -pad : tp.align === 'right' ? -boxW + pad : -boxW / 2;
      ctx.fillStyle = tp.backgroundColor;
      ctx.fillRect(bx, -boxH / 2, boxW, boxH);
    }
    lines.forEach((line, i) => {
      const y = (i - (lines.length - 1) / 2) * lineH;
      if (tp.shadowBlur > 0 || tp.shadowOffsetX !== 0 || tp.shadowOffsetY !== 0) {
        ctx.shadowColor = tp.shadowColor;
        ctx.shadowBlur = tp.shadowBlur;
        ctx.shadowOffsetX = tp.shadowOffsetX;
        ctx.shadowOffsetY = tp.shadowOffsetY;
      }
      if (tp.strokeWidth > 0) {
        ctx.lineJoin = 'round';
        ctx.strokeStyle = tp.strokeColor;
        ctx.lineWidth = tp.strokeWidth;
        ctx.strokeText(line, 0, y);
      }
      ctx.fillStyle = tp.color;
      ctx.fillText(line, 0, y);
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    });
  }
}

export const renderer = new Renderer();
