// --- Medya ---

export type MediaKind = 'video' | 'audio' | 'image';

export interface MediaAsset {
  id: string;
  name: string;
  kind: MediaKind;
  mimeType: string;
  sizeBytes: number;
  /** saniye; görseller için 0 */
  duration: number;
  width: number;
  height: number;
  /** yalnızca video; henüz bilinmiyorsa true kabul edilir */
  hasAudio: boolean;
  createdAt: number;
  /** İçe aktarımda hesaplanan dalga formu tepe değerleri (0..1) */
  waveform?: Float32Array;
  /** Runtime-only, kalıcı depoya yazılmaz */
  url?: string;
  thumbUrl?: string;
  /** Filmstrip sprite'ı (runtime-only) */
  stripUrl?: string;
  /** Sprite kare sayısı */
  stripFrames?: number;
  /** Sprite kareleri arasındaki kaynak zaman adımı (sn) */
  stripStep?: number;
}

// --- Proje ---

export type TrackKind = 'video' | 'audio';

export interface Track {
  id: string;
  kind: TrackKind;
  name: string;
  muted: boolean;
  locked: boolean;
  hidden: boolean;
}

/** Kaynak yüzdesi olarak kırpma (her kenar 0..0.45) */
export interface CropEdges {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ClipTransform {
  /** px cinsinden proje uzayında kaydırma */
  x: number;
  y: number;
  /** 1 = çerçeveye sığdır */
  scale: number;
  /** derece */
  rotation: number;
  /** 0..1 */
  opacity: number;
  crop: CropEdges;
}

/** Tüm değerler nötr varsayılanlarla (1/0) */
export interface ColorEffects {
  brightness: number; // 0..2, nötr 1
  contrast: number; // 0..2, nötr 1
  gamma: number; // 0.2..3, nötr 1
  saturation: number; // 0..3, nötr 1
  hue: number; // -180..180, nötr 0
  exposure: number; // -3..3 stop, nötr 0
  temperature: number; // -1..1 (mavi↔amber), nötr 0
  /** yeşil↔magenta ekseni (denizaltı yeşilini gidermek için) */
  tint: number; // -1..1, nötr 0
  /** gölgeleri açar/karartır */
  shadows: number; // -1..1, nötr 0
  /** parlak alanları açar/karartır */
  highlights: number; // -1..1, nötr 0
  /** doygunluğu düşük alanları daha çok artıran akıllı doygunluk */
  vibrance: number; // -1..1, nötr 0
  sharpen: number; // 0..1, nötr 0
  blur: number; // 0..20 px, nötr 0
  /** Pus giderme 0..1, nötr 0 */
  defog: number;
  /** Renk çarkları (Lift/Gamma/Gain) — nokta konumu -1..1, merkez nötr.
   *  Sağ=kırmızı, sol=siyan, alt=sarı-yeşil, üst=mavi-macenta ekseni. */
  liftX: number; liftY: number; liftMaster: number;
  gammaX: number; gammaY: number; gammaMaster: number;
  gainX: number; gainY: number; gainMaster: number;
}

/** Maske: dikdörtgen, elips, PNG görseli veya animasyonlu video; uv uzayında (0..1) */
export interface ClipMask {
  enabled: boolean;
  shape: 'rect' | 'ellipse' | 'image' | 'video';
  /** merkez x, merkez y, genişlik, yükseklik (0..1, proje çerçevesine göre) */
  x: number;
  y: number;
  width: number;
  height: number;
  /** 0..0.5 yumuşaklık */
  feather: number;
  invert: boolean;
  /** PNG görsel maskesi (shape='image' iken). useAlpha=false ise parlaklık maskeler. */
  image?: { name: string; dataUrl: string; useAlpha: boolean };
  /** Animasyonlu maske videosu — medya kutusundaki varlık id'si (shape='video' iken). Parlaklık maskeler. */
  videoAssetId?: string;
}

/** Yeşil perde: anahtar rengi + benzerlik + yumuşaklık */
export interface ChromaKey {
  enabled: boolean;
  color: string;
  /** 0..1 */
  similarity: number;
  /** 0..1 */
  smoothness: number;
}

export interface AudioClipProps {
  /** 0..2, nötr 1 */
  volume: number;
  muted: boolean;
  /** saniye */
  fadeIn: number;
  fadeOut: number;
  /** Basit gürültü azaltma (kapı + yüksek geçiren) */
  noiseReduce: boolean;
}

export type TextAnimation =
  | 'none' | 'fade' | 'slideUp' | 'slideDown' | 'slideLeft' | 'slideRight'
  | 'typewriter' | 'pop' | 'zoomIn' | 'blurIn' | 'bounceIn' | 'flipIn'
  | 'tracking' | 'spinIn';

export interface TextProperties {
  content: string;
  fontFamily: string;
  /** px, proje uzayında */
  fontSize: number;
  color: string;
  bold: boolean;
  italic: boolean;
  align: 'left' | 'center' | 'right';
  strokeColor: string;
  strokeWidth: number;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  backgroundColor: string;
  backgroundPadding: number;
  animation: TextAnimation;
  animationDuration: number;
}

export type TransitionType =
  | 'crossfade'
  | 'dipBlack'
  | 'dipWhite'
  | 'wipeLeft'
  | 'wipeRight'
  | 'wipeUp'
  | 'wipeDown';

export interface Transition {
  type: TransitionType;
  /** saniye */
  duration: number;
}

export type ClipKind = 'media' | 'text';

// --- Keyframe'ler ---

export type KeyframableProp = 'x' | 'y' | 'scale' | 'rotation' | 'opacity' | 'volume';
export type EasingType = 'linear' | 'easeIn' | 'easeOut';

export interface Keyframe {
  /** klibe yerel zaman (sn) */
  t: number;
  v: number;
  ease: EasingType;
}

export type KeyframeMap = Partial<Record<KeyframableProp, Keyframe[]>>;

export interface Clip {
  id: string;
  trackId: string;
  /** null => text klibi */
  assetId: string | null;
  kind: ClipKind;
  name: string;
  /** timeline üzerinde başlangıç (sn) */
  start: number;
  /** timeline süresi (sn) */
  duration: number;
  /** kaynak dosya içi başlangıç (sn) */
  srcIn: number;
  /** 0.25..4; kaynak zamanı = srcIn + geçen süre × hız */
  speed: number;
  /** ters oynatma (kaynak sondan başa) */
  reverse: boolean;
  transform: ClipTransform;
  color: ColorEffects;
  audio: AudioClipProps;
  mask: ClipMask;
  chroma: ChromaKey;
  /** LUT dosya içeriği (.cube metni) — uygulanmışsa */
  lut?: { name: string; size: number; data: Float32Array; strength: number };
  text?: TextProperties;
  /** Klip başındaki geçiş (önceki kliple) */
  transitionIn?: Transition;
  /** Bu klibi MASKE OLARAK kullanan hedef klip id'si (maske klibi katman
   *  olarak çizilmez; hedef clip.maskClipId ile geri bağ kurar) */
  maskClipId?: string | null;
  keyframes?: KeyframeMap;
}

/** Zaman çizgisi işaretçisi */
export interface Marker {
  id: string;
  t: number;
  color: string;
  label: string;
}

export interface ProjectSettings {
  name: string;
  width: number;
  height: number;
  fps: number;
}

export interface ProjectDoc {
  settings: ProjectSettings;
  tracks: Track[];
  clips: Clip[];
  markers: Marker[];
  currentTime: number;
  updatedAt: number;
  /** Paketli .evproj (ZIP) içinde gömülü medya kayıtları — dosya adı
   * 'assets/<id>/<fileName>' girdisidir. Eski düz-JSON projelerde yoktur. */
  assets?: BundledAssetMeta[];
}

/** Gömülü medyanın üst verisi (baytlar ZIP gövdesindedir) */
export interface BundledAssetMeta {
  id: string;
  name: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  kind: MediaKind;
  duration: number;
  width: number;
  height: number;
  hasAudio: boolean;
  createdAt: number;
}

// --- Varsayılanlar ---

export const NEUTRAL_COLOR: ColorEffects = {
  brightness: 1,
  contrast: 1,
  gamma: 1,
  saturation: 1,
  hue: 0,
  exposure: 0,
  temperature: 0,
  tint: 0,
  shadows: 0,
  highlights: 0,
  vibrance: 0,
  sharpen: 0,
  blur: 0,
  defog: 0,
  liftX: 0, liftY: 0, liftMaster: 0,
  gammaX: 0, gammaY: 0, gammaMaster: 0,
  gainX: 0, gainY: 0, gainMaster: 0,
};

export const NEUTRAL_TRANSFORM: ClipTransform = {
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
  opacity: 1,
  crop: { top: 0, right: 0, bottom: 0, left: 0 },
};

export const NEUTRAL_AUDIO: AudioClipProps = {
  volume: 1,
  muted: false,
  fadeIn: 0,
  fadeOut: 0,
  noiseReduce: false,
};

export const NEUTRAL_MASK: ClipMask = {
  enabled: false,
  shape: 'rect',
  x: 0.5,
  y: 0.5,
  width: 0.5,
  height: 0.5,
  feather: 0.05,
  invert: false,
};

export const NEUTRAL_CHROMA: ChromaKey = {
  enabled: false,
  color: '#00b140',
  similarity: 0.4,
  smoothness: 0.1,
};

export const DEFAULT_TEXT: TextProperties = {
  content: '',
  fontFamily: 'Arial',
  fontSize: 96,
  color: '#ffffff',
  bold: false,
  italic: false,
  align: 'center',
  strokeColor: '#000000',
  strokeWidth: 0,
  shadowColor: '#000000',
  shadowBlur: 8,
  shadowOffsetX: 0,
  shadowOffsetY: 2,
  backgroundColor: 'transparent',
  backgroundPadding: 12,
  animation: 'none',
  animationDuration: 0.5,
};

/** Keyframe yapılabilir özelliklerin slider varsayılanları (çift tık sıfırlama) */
export const PROP_DEFAULTS: Record<KeyframableProp, number> = {
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
  opacity: 1,
  volume: 1,
};

export const IMAGE_CLIP_DEFAULT_DURATION = 5;
export const MIN_CLIP_DURATION = 0.2;
