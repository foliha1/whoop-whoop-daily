import { THEME_MP3, THEME_OGG } from "@/lib/assetUrls";
// Synthesized audio effects + persisted settings.
//
// Every effect is built at play time from Web Audio nodes — there are no
// recorded effect files any more. The technique: physical sounds are filtered
// noise, not pitch. Each cue is a short white-noise burst shaped by a filter
// and a fast gain envelope, with a tuned oscillator only where a real object
// would resonate (the wood knock in `correct`, the body under `whoop`).
//
// Every effect jitters its filter frequency, decay and level slightly, so a
// repeated tap never sounds like the same sample twice.
//
// Two independent flags: sfxEnabled controls the effect functions; musicEnabled
// controls the background theme (real recordings; each screen passes its own
// track to startTheme, defaulting to the Daily's theme).
// Both persist to localStorage so a refresh preserves the user's choice.
//
// unlockAudio() must be called from a user gesture — it resumes the context and
// starts the theme if a screen has asked for it.





let audioCtx: AudioContext | null = null;

const SFX_KEY = "ww_sfx_enabled";
const MUSIC_KEY = "ww_music_enabled";

function readFlag(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    // Only an explicit "false" silences things — a stale or malformed value
    // must never mute the app.
    return raw !== "false";
  } catch { return fallback; }
}
function writeFlag(key: string, value: boolean) {
  try { localStorage.setItem(key, value ? "true" : "false"); } catch { /* ignore */ }
}

let sfxEnabled = readFlag(SFX_KEY, true);
let musicEnabled = readFlag(MUSIC_KEY, true);

export function getSfxEnabled(): boolean { return sfxEnabled; }
export function setSfxEnabled(value: boolean): void {
  sfxEnabled = value;
  writeFlag(SFX_KEY, value);
  // Effects are scheduled ahead of time (a cue can carry offsets of a second
  // or more), so flipping the flag off must also silence what is already on
  // the graph. The master bus is cut to zero immediately and every scheduled
  // source is stopped; turning it back on restores unity gain.
  if (!value) silenceSfxNow();
  else if (sfxBus) sfxBus.gain.value = 1;
}
export function getMusicEnabled(): boolean { return musicEnabled; }
export function setMusicEnabled(value: boolean): void {
  musicEnabled = value;
  writeFlag(MUSIC_KEY, value);
  // Honour the flag live, with no remount: off stops and drops the element, on
  // starts again when the current screen still wants music.
  if (!value) killTheme();
  else if (themeDesired) startTheme(themeUrl);
}

// Back-compat wrappers — GameWindow (solo) uses these. `muted` is the inverse
// of sfxEnabled.
export function setMuted(value: boolean): void { setSfxEnabled(!value); }
export function isMuted(): boolean { return !sfxEnabled; }

// Master sound toggle — both effects and theme music.
export function getSoundEnabled(): boolean { return sfxEnabled && musicEnabled; }
export function setSoundEnabled(value: boolean): void {
  setSfxEnabled(value);
  setMusicEnabled(value);
}

/**
 * The context is created lazily and reused. Safari (and older iOS webviews)
 * only expose `webkitAudioContext`, and constructing one can throw when the
 * page has no audio permission at all — in that case every cue becomes a
 * no-op instead of an exception.
 */
type CtxCtor = new (options?: AudioContextOptions) => AudioContext;
function ctxCtor(): CtxCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { AudioContext?: CtxCtor; webkitAudioContext?: CtxCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

function getCtx(): AudioContext {
  if (!audioCtx) {
    const Ctor = ctxCtor();
    if (!Ctor) throw new Error("no AudioContext");
    audioCtx = new Ctor({ latencyHint: "interactive" });
  }
  return audioCtx;
}

/**
 * iOS reports `"interrupted"` (not `"suspended"`) after a phone call, Siri or
 * a screen lock, and the graph stays silent until something resumes it. Treat
 * anything other than `"running"` as needing a resume.
 */
function needsResume(ctx: AudioContext): boolean {
  return ctx.state !== "running";
}

/** Runs `fn` once the context is running; resumes first when it is not. */
function whenRunning(ctx: AudioContext, fn: () => void): void {
  if (!needsResume(ctx)) { fn(); return; }
  void Promise.resolve(ctx.resume()).then(fn, fn);
}


// ---------------------------------------------------------------------------
// Mix balance — one place to tune every effect's level
// ---------------------------------------------------------------------------

type ClipName =
  | "flip"
  | "deal"
  | "dice"
  | "correct"
  | "wrong"
  | "whoop"
  | "peek"
  | "reveal"
  | "start"
  | "select"
  | "dieLand"
  | "tick"
  | "deselect"
  | "roundAdvance"
  | "subscribed";

/**
 * Single place to tune the mix. `correct` is the loudest thing in the app.
 *
 * These numbers were set by measuring each cue's real output peak (filtered
 * noise loses a lot of energy in the bandpass, so the raw levels inside the
 * effects are not comparable). Each gain is scaled so the cue hits its
 * intended peak, keeping the old hierarchy: correct loudest, flip and deal
 * near-subliminal.
 */
export const CLIP_GAIN: Record<ClipName, number> = {
  flip: 0.95,
  deal: 1.0,
  dice: 0.55,
  wrong: 1.8,
  whoop: 0.72,
  correct: 1.7,
  peek: 1.5,
  reveal: 0.9,
  start: 0.95,
  select: 0.6,
  dieLand: 2.2,
  tick: 1.3,
  deselect: 0.66,
  roundAdvance: 1.2,
  subscribed: 1.1,
};



// ---------------------------------------------------------------------------
// Master effect bus
//
// Every cue connects here instead of straight to the destination, so a mid-run
// `sfxEnabled = false` can cut all sound on the spot — including the tails of
// cues whose envelopes were already scheduled. Nodes register themselves so
// they can be stopped as well as muted (a stopped source frees itself).
// ---------------------------------------------------------------------------

let sfxBus: GainNode | null = null;
const liveSources = new Set<AudioScheduledSourceNode>();

function getBus(ctx: AudioContext): GainNode {
  if (!sfxBus) {
    sfxBus = ctx.createGain();
    sfxBus.gain.value = sfxEnabled ? 1 : 0;
    sfxBus.connect(ctx.destination);
  }
  return sfxBus;
}

/** Registers a scheduled source so it can be killed when SFX are disabled. */
function track(src: AudioScheduledSourceNode): void {
  liveSources.add(src);
  src.onended = () => { liveSources.delete(src); };
}

function silenceSfxNow(): void {
  try {
    if (sfxBus) sfxBus.gain.value = 0;
    liveSources.forEach((src) => { try { src.stop(); } catch { /* ignore */ } });
    liveSources.clear();
  } catch { /* never throw from audio */ }
}

/**
 * Test/instrumentation hook. When `window.__WW_SFX_LOG` is an array, every cue
 * appends `{ name, t }` (t = performance.now() at the moment the cue fires).
 * Costs nothing in production: the array only exists if a harness made it.
 */
function logCue(name: ClipName, detail?: number[]): void {
  try {
    const log = (window as unknown as {
      __WW_SFX_LOG?: { name: string; t: number; detail?: number[] }[];
    }).__WW_SFX_LOG;
    if (Array.isArray(log)) log.push({ name, t: performance.now(), detail });
  } catch { /* ignore */ }
}

/** True once a user gesture has run through unlockAudio(). */
let audioUnlocked = false;
export function hasAudioUnlocked(): boolean { return audioUnlocked; }

/**
 * iOS only really hands over the audio hardware once a source has been started
 * inside the gesture that resumed the context. Starting a one-sample silent
 * buffer is inaudible and makes the first real cue reliable.
 */
function primeGraph(ctx: AudioContext): void {
  try {
    const buf = ctx.createBuffer(1, 1, ctx.sampleRate);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(getBus(ctx));
    src.start(0);
  } catch { /* ignore */ }
}

// Safe to call repeatedly. Resumes a suspended/interrupted context (browsers
// require a user gesture before audio starts) and starts the theme if one is
// wanted. Only flags success once the context is actually running, so a blocked
// attempt does not stop the next gesture from trying again.
export function unlockAudio(): void {
  // Music first, and synchronously: a media element only starts if play() is
  // called inside the gesture itself, before any await.
  if (themeDesired) startTheme(themeUrl);
  try {
    const ctx = getCtx();
    primeGraph(ctx);
    const settle = () => {
      if (ctx.state === "running") {
        audioUnlocked = true;
        primeGraph(ctx);
      }
      // A screen that wants music may have asked for it before the gesture.
      if (themeDesired) startTheme(themeUrl);
    };
    if (needsResume(ctx)) void Promise.resolve(ctx.resume()).then(settle, settle);
    else settle();
  } catch { /* ignore — no AudioContext available */ }
}

/**
 * Site-wide safety net: whatever the user touches first unlocks audio, on every
 * route, including screens that never call `unlockAudio()` themselves. The
 * listeners stay attached until the context is genuinely running, so a gesture
 * the browser refuses (e.g. a scroll on iOS) does not burn the one chance.
 */
if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  const kinds = ["pointerdown", "touchend", "mousedown", "keydown"] as const;
  const onGesture = () => {
    unlockAudio();
    if (audioCtx && audioCtx.state === "running") {
      kinds.forEach((k) => window.removeEventListener(k, onGesture, true));
    }
  };
  kinds.forEach((k) => window.addEventListener(k, onGesture, true));
}


// ---------------------------------------------------------------------------
// Background theme — music, behind musicEnabled, never an effect
//
// A media element's `loop = true` is NOT gapless in Chrome or Safari: the
// element seeks back to 0 and re-buffers, leaving an audible hole at the loop
// point. The theme therefore plays as a decoded AudioBuffer through a looping
// AudioBufferSourceNode — the browser wraps it sample-accurately, so the loop
// is seamless. Leading/trailing encoder padding (MP3 fallback) is trimmed via
// loopStart/loopEnd. A plain <audio> element remains only as the fallback when
// Web Audio or decoding is unavailable. No fades: start and stop are hard.
// ---------------------------------------------------------------------------

/** The Daily's theme. `startTheme()` with no argument always means this one. */
const DEFAULT_THEME_FILE = THEME_MP3.daily;
/** Classic's own tracks, build-hashed from src/assets. */
export const CLASSIC_THEME_FILE = THEME_MP3.classic;
export const HOW_TO_PLAY_THEME_FILE = THEME_MP3.howTo;
const THEME_GAIN = 0.15;

/** OGG masters, keyed by the MP3 path each screen asks for. */
const OGG_FOR_MP3: Record<string, string> = {
  [DEFAULT_THEME_FILE]: THEME_OGG.daily,
  [CLASSIC_THEME_FILE]: THEME_OGG.classic,
  [HOW_TO_PLAY_THEME_FILE]: THEME_OGG.howTo,
};

let oggSupport: boolean | null = null;
function canPlayOgg(): boolean {
  if (oggSupport !== null) return oggSupport;
  try {
    const probe = new Audio();
    const verdict = probe.canPlayType('audio/ogg; codecs="vorbis"') || probe.canPlayType("audio/ogg");
    oggSupport = verdict === "probably" || verdict === "maybe";
  } catch { oggSupport = false; }
  return oggSupport;
}

/** The file actually loaded for a requested track: OGG when decodable. */
export function themeSourceFor(url: string): string {
  const ogg = OGG_FOR_MP3[url];
  return ogg && canPlayOgg() ? ogg : url;
}

/** The track the current screen wants. */
let themeUrl = DEFAULT_THEME_FILE;
/** The screen wants music, regardless of whether it is audible right now. */
let themeDesired = false;
let themeZoneRelease: number | null = null;

// iOS: Web Audio defaults to the "ambient" session, which the ring/silent
// switch mutes. Declaring a playback session keeps the theme audible.
function preferPlaybackSession(): void {
  try {
    const nav = navigator as unknown as { audioSession?: { type: string } };
    if (nav.audioSession && nav.audioSession.type !== "playback") nav.audioSession.type = "playback";
  } catch { /* ignore */ }
}

// ---- Web Audio path (seamless) ----
interface LoopBuffer { buffer: AudioBuffer; loopStart: number; loopEnd: number }
const loopBuffers = new Map<string, Promise<LoopBuffer | null>>();
let themeBus: GainNode | null = null;
let themeSrc: AudioBufferSourceNode | null = null;
let themeSrcUrl: string | null = null;
let themeStartedAt = 0;
let themeLoop: LoopBuffer | null = null;
/** Position to resume from after a stop (seconds into the loop). */
let themeOffset = 0;
/** Set when decoding failed: fall back to the media element for that track. */
const elementFallback = new Set<string>();

/** First/last sample above the noise floor — trims encoder padding only. */
function findLoopBounds(buffer: AudioBuffer): { loopStart: number; loopEnd: number } {
  const floor = 1e-4;
  const n = buffer.length;
  let first = n, last = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    let i = 0;
    while (i < first && Math.abs(d[i]) < floor) i++;
    first = Math.min(first, i);
    let j = n - 1;
    while (j > last && Math.abs(d[j]) < floor) j--;
    last = Math.max(last, j);
  }
  if (last <= first) return { loopStart: 0, loopEnd: buffer.duration };
  return { loopStart: first / buffer.sampleRate, loopEnd: (last + 1) / buffer.sampleRate };
}

function loadLoop(url: string): Promise<LoopBuffer | null> {
  const cached = loopBuffers.get(url);
  if (cached) return cached;
  const p = (async () => {
    try {
      const ctx = getCtx();
      const res = await fetch(themeSourceFor(url), { cache: "force-cache" });
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.arrayBuffer();
      const buffer = await new Promise<AudioBuffer>((resolve, reject) => {
        const r = ctx.decodeAudioData(data, resolve, reject);
        if (r && typeof (r as Promise<AudioBuffer>).then === "function") {
          (r as Promise<AudioBuffer>).then(resolve, reject);
        }
      });
      return { buffer, ...findLoopBounds(buffer) };
    } catch {
      elementFallback.add(url);
      loopBuffers.delete(url);
      return null;
    }
  })();
  loopBuffers.set(url, p);
  return p;
}

function getThemeBus(ctx: AudioContext): GainNode {
  if (!themeBus) {
    themeBus = ctx.createGain();
    themeBus.gain.value = THEME_GAIN;
    themeBus.connect(ctx.destination);
  }
  return themeBus;
}

function startBufferLoop(ctx: AudioContext, loop: LoopBuffer): void {
  if (themeSrc) return;
  const src = ctx.createBufferSource();
  src.buffer = loop.buffer;
  src.loop = true;
  src.loopStart = loop.loopStart;
  src.loopEnd = loop.loopEnd;
  src.connect(getThemeBus(ctx));
  const span = loop.loopEnd - loop.loopStart;
  const offset = loop.loopStart + (span > 0 ? themeOffset % span : 0);
  src.start(0, offset);
  themeSrc = src;
  themeSrcUrl = themeUrl;
  themeLoop = loop;
  themeStartedAt = ctx.currentTime - (offset - loop.loopStart);
}

/** Stop the buffer loop, remembering where it was (keepPosition) or not. */
function stopBufferLoop(keepPosition: boolean): void {
  if (!themeSrc) { if (!keepPosition) themeOffset = 0; return; }
  try {
    if (keepPosition && audioCtx && themeLoop) {
      const span = themeLoop.loopEnd - themeLoop.loopStart;
      themeOffset = span > 0 ? (audioCtx.currentTime - themeStartedAt) % span : 0;
    } else {
      themeOffset = 0;
    }
    themeSrc.stop();
    themeSrc.disconnect();
  } catch { /* ignore */ }
  themeSrc = null;
  themeSrcUrl = null;
}

// ---- Media element fallback ----
let themeEl: HTMLAudioElement | null = null;

function makeThemeEl(url: string, volume: number): HTMLAudioElement {
  const el = new Audio(themeSourceFor(url));
  el.loop = true;
  el.preload = "auto";
  el.volume = volume;
  el.setAttribute("playsinline", "");
  return el;
}

function playElement(): void {
  if (typeof Audio === "undefined") return;
  try {
    if (!themeEl) themeEl = makeThemeEl(themeUrl, THEME_GAIN);
    themeEl.volume = THEME_GAIN;
    void Promise.resolve(themeEl.play()).catch(() => { /* retried on next gesture */ });
  } catch { /* never throw from audio */ }
}

/**
 * Begin fetching and decoding a screen's theme before anything wants to hear
 * it, so the first note is not waiting on the download. Never plays.
 */
export function prewarmTheme(trackUrl?: string): void {
  const url = trackUrl ?? DEFAULT_THEME_FILE;
  if (!ctxCtor()) return;
  void loadLoop(url);
}

/**
 * Start the looping theme at full level. Playback waits for a gesture to have
 * unlocked audio; unlockAudio() retries it. Never restarts a running loop.
 */
export function startTheme(trackUrl?: string): void {
  if (themeZoneRelease !== null) {
    window.clearTimeout(themeZoneRelease);
    themeZoneRelease = null;
  }
  const next = trackUrl ?? DEFAULT_THEME_FILE;
  themeDesired = true;
  if (next !== themeUrl) {
    themeUrl = next;
    killTheme();
  }
  if (!musicEnabled) return;
  if (themeSrc && themeSrcUrl === themeUrl) return;

  let ctx: AudioContext | null = null;
  try { ctx = ctxCtor() && !elementFallback.has(themeUrl) ? getCtx() : null; } catch { ctx = null; }
  if (!ctx) { playElement(); return; }

  preferPlaybackSession();
  const wanted = themeUrl;
  const c = ctx;
  void loadLoop(wanted).then((loop) => {
    if (!themeDesired || !musicEnabled || themeUrl !== wanted) return;
    if (!loop) { playElement(); return; }
    whenRunning(c, () => {
      if (c.state !== "running") return; // no gesture yet: retried on the next one
      if (!themeDesired || !musicEnabled || themeUrl !== wanted) return;
      try { startBufferLoop(c, loop); } catch { /* never throw from audio */ }
    });
  });
}

/** Stop and drop the running loop right now (used when switching tracks). */
function killTheme(): void {
  stopBufferLoop(false);
  try { themeEl?.pause(); } catch { /* ignore */ }
  themeEl = null;
}

/** Stop the theme immediately — no fade. Resumes from the same spot later. */
export function stopTheme(): void {
  if (themeZoneRelease !== null) {
    window.clearTimeout(themeZoneRelease);
    themeZoneRelease = null;
  }
  themeDesired = false;
  stopBufferLoop(true);
  try { themeEl?.pause(); } catch { /* ignore */ }
}

/** Enter a route-level music zone without restarting an already-running loop. */
export function enterThemeZone(trackUrl?: string): void {
  startTheme(trackUrl);
}

/**
 * Leave a route-level music zone after the route transition has had time to
 * mount its destination. Entering another music screen cancels this release,
 * preserving the same source and playback position.
 */
export function leaveThemeZone(delayMs = 300): void {
  if (themeZoneRelease !== null) window.clearTimeout(themeZoneRelease);
  themeZoneRelease = window.setTimeout(() => {
    themeZoneRelease = null;
    stopTheme();
  }, delayMs);
}

// iOS suspends (or "interrupts") the AudioContext when the page is backgrounded,
// a call comes in or the screen locks, and never resumes it on return, so the
// theme stays silent until some unrelated cue happens to wake the graph. Resume
// explicitly on the way back — from every signal a browser might give us — and
// restart the loop when the current screen still wants music.
if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
  const wake = () => {
    try {
      if (themeDesired && musicEnabled) startTheme(themeUrl);
      const ctx = audioCtx;
      if (!ctx) return;
      whenRunning(ctx, () => {
        if (ctx.state === "running" && sfxBus && sfxEnabled) sfxBus.gain.value = 1;
      });
    } catch { /* never throw from audio */ }
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") wake();
  });
  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener("focus", wake);
    window.addEventListener("pageshow", wake);
  }
}



// ---------------------------------------------------------------------------
// Synthesis primitives
// ---------------------------------------------------------------------------

/** One second of white noise, generated once and reused by every burst. */
let noiseBuffer: AudioBuffer | null = null;
function getNoise(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) return noiseBuffer;
  const len = Math.floor(ctx.sampleRate);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buf;
  return buf;
}

/** Random number in [a, b). */
function rand(a: number, b: number): number { return a + Math.random() * (b - a); }
/** Multiplicative jitter around 1, e.g. jitter(0.08) → 0.92..1.08. */
function jitter(amount: number): number { return 1 + rand(-amount, amount); }

/**
 * Small forward offset for every scheduled cue. `AudioContext.resume()` is
 * asynchronous: right after a gesture the clock has not advanced yet, so events
 * scheduled at raw `currentTime` land in the past and are silently dropped.
 * Scheduling a hair into the future is inaudible and always lands.
 */
const LEAD = 0.03;

/**
 * Runs a cue against a live context. If the context is still resuming, the cue
 * waits for the resume to land and is then scheduled against the fresh clock.
 */
function run(
  name: ClipName,
  fn: (b: { ctx: AudioContext; t0: number }) => void,
  detail?: number[]
): void {
  if (!sfxEnabled) return;
  logCue(name, detail);
  try {
    const ctx = getCtx();
    if (sfxBus) sfxBus.gain.value = 1;
    const fire = () => {
      if (!sfxEnabled) return;
      // A cue scheduled while the context is still suspended/interrupted lands
      // in a stopped clock and is never heard. Drop it rather than queueing a
      // stale sound that would fire late, out of sync with the animation.
      if (ctx.state !== "running") return;
      try { fn({ ctx, t0: ctx.currentTime + LEAD }); } catch { /* ignore */ }
    };
    whenRunning(ctx, fire);
  } catch { /* ignore — no AudioContext available */ }
}


interface NoiseOpts {
  /** Start time, seconds from now. */
  at?: number;
  /** Burst length in seconds — also the envelope's decay. */
  dur: number;
  /** Peak level before the master gain is applied. */
  level: number;
  filter?: BiquadFilterType;
  freq?: number;
  q?: number;
  /** Attack in seconds; keep tiny for a click. */
  attack?: number;
  /** Optional filter sweep target, for rising/falling textures. */
  freqTo?: number;
}

/** A filtered, enveloped white-noise burst — the workhorse of every effect. */
function noise(ctx: AudioContext, t0: number, master: number, o: NoiseOpts): void {
  const start = t0 + (o.at ?? 0);
  const src = ctx.createBufferSource();
  src.buffer = getNoise(ctx);
  src.loop = true;
  // A random read position keeps the grain different on every hit.
  const readAt = Math.random() * 0.9;

  const biquad = ctx.createBiquadFilter();
  biquad.type = o.filter ?? "bandpass";
  const freq = Math.max(40, Math.min(18000, o.freq ?? 3000));
  biquad.frequency.setValueAtTime(freq, start);
  if (o.freqTo !== undefined) {
    biquad.frequency.exponentialRampToValueAtTime(
      Math.max(40, Math.min(18000, o.freqTo)),
      start + o.dur
    );
  }
  biquad.Q.value = o.q ?? 1;

  const g = ctx.createGain();
  const peak = Math.max(0.0001, o.level * master);
  const attack = o.attack ?? 0.002;
  g.gain.setValueAtTime(0.0001, start);
  g.gain.linearRampToValueAtTime(peak, start + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, start + o.dur);

  src.connect(biquad);
  biquad.connect(g);
  g.connect(getBus(ctx));
  track(src);
  src.start(start, readAt);
  src.stop(start + o.dur + 0.02);
}

interface ToneOpts {
  at?: number;
  dur: number;
  level: number;
  freq: number;
  /** Optional glide target. */
  freqTo?: number;
  type?: OscillatorType;
  attack?: number;
}

/** A short enveloped oscillator — only for things that would truly resonate. */
function tone(ctx: AudioContext, t0: number, master: number, o: ToneOpts): void {
  const start = t0 + (o.at ?? 0);
  const osc = ctx.createOscillator();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(o.freq, start);
  if (o.freqTo !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.freqTo), start + o.dur);
  }
  const g = ctx.createGain();
  const peak = Math.max(0.0001, o.level * master);
  const attack = o.attack ?? 0.004;
  g.gain.setValueAtTime(0.0001, start);
  g.gain.linearRampToValueAtTime(peak, start + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, start + o.dur);
  osc.connect(g);
  g.connect(getBus(ctx));
  track(osc);
  osc.start(start);
  osc.stop(start + o.dur + 0.02);
}

// ---------------------------------------------------------------------------
// The card textures, shared by flip / deal / select / reveal
// ---------------------------------------------------------------------------

function flipTexture(
  ctx: AudioContext,
  t0: number,
  master: number,
  at = 0,
  scale = 1
): void {
  noise(ctx, t0, master, {
    at,
    dur: 0.06 * jitter(0.15),
    level: 0.9 * scale,
    filter: "bandpass",
    freq: 3000 * jitter(0.18),
    q: 1.1 * jitter(0.2),
    attack: 0.001,
  });
}

/** Low-frequency body: the card, palm or die meeting the table. */
function thump(
  ctx: AudioContext,
  t0: number,
  master: number,
  at: number,
  freq: number,
  dur: number,
  level: number
): void {
  noise(ctx, t0, master, {
    at,
    dur: dur * jitter(0.15),
    level,
    filter: "lowpass",
    freq: freq * jitter(0.15),
    q: 0.8,
    attack: 0.002,
  });
}

/** A wood knock: resonant lowpassed noise plus a fast-dying low sine. */
function woodKnock(
  ctx: AudioContext,
  t0: number,
  master: number,
  at: number,
  level = 1
): void {
  noise(ctx, t0, master, {
    at,
    dur: 0.085 * jitter(0.12),
    level: 0.85 * level,
    filter: "lowpass",
    freq: 1100 * jitter(0.14),
    q: 6 * jitter(0.2),
    attack: 0.001,
  });
  tone(ctx, t0, master, {
    at,
    dur: 0.08 * jitter(0.12),
    level: 0.45 * level,
    freq: 190 * jitter(0.1),
    freqTo: 120,
    attack: 0.002,
  });
}

// ---------------------------------------------------------------------------
// Public effects — signatures unchanged
// ---------------------------------------------------------------------------

export function playFlip(): void {
  run("flip", (b) => flipTexture(b.ctx, b.t0, CLIP_GAIN.flip));
}

/**
 * One cue for a whole batch of cards arriving. `count` and `stepMs` are kept
 * for call-site compatibility but ignored — the deal is now a single soft
 * landing sound rather than a click per card. Repeat calls inside
 * DEAL_DEDUPE_MS collapse into the first one.
 */
const DEAL_DEDUPE_MS = 250;
let lastDealAt = 0;

/**
 * The deal cue: a single card-landing click for the whole batch.
 *
 * `startMs` is the delay from now to when the batch lands — the daily passes
 * DEAL_MOVE_MS, because the deal-in animation ends (the cards "land") at the
 * end of the move, not at its start.
 *
 * The cue is scheduled inside a single Web Audio call, and a repeat call
 * inside DEAL_DEDUPE_MS (a re-render firing the same effect twice) collapses
 * into the first one.
 */
export function playDeal(
  _count: number = 1,
  opts: { startMs?: number; stepMs?: number } = {}
): void {
  const now = Date.now();
  if (now - lastDealAt < DEAL_DEDUPE_MS) return;
  lastDealAt = now;
  const start = Math.max(0, opts.startMs ?? 0) / 1000;
  run("deal", (b) => {
    flipTexture(b.ctx, b.t0, CLIP_GAIN.deal, start, 1);
    thump(b.ctx, b.t0, CLIP_GAIN.deal, start + 0.012, 320, 0.07, 0.4);
  });
}

/**
 * Card-select cue: a very short, bright tick — quieter than flip.
 */
export function playSelect(): void {
  run("select", (b) => {
    noise(b.ctx, b.t0, CLIP_GAIN.select, {
      dur: 0.03 * jitter(0.15),
      level: 0.9,
      filter: "highpass",
      freq: 5200 * jitter(0.15),
      q: 0.9,
      attack: 0.0008,
    });
  });
}

/** Deselect: the same tick, lower and softer. */
export function playDeselect(): void {
  run("deselect", (b) => {
    noise(b.ctx, b.t0, CLIP_GAIN.deselect, {
      dur: 0.045 * jitter(0.15),
      level: 0.85,
      filter: "bandpass",
      freq: 1500 * jitter(0.18),
      q: 1.2,
      attack: 0.001,
    });
  });
}

/** A palm on a table: broadband slap with a short low body under it. */
export function playWhoopCall(): void {
  run("whoop", (b) => {
    noise(b.ctx, b.t0, CLIP_GAIN.whoop, {
      dur: 0.075 * jitter(0.12),
      level: 1,
      filter: "highpass",
      freq: 900 * jitter(0.2),
      q: 0.7,
      attack: 0.0006,
    });
    thump(b.ctx, b.t0, CLIP_GAIN.whoop, 0.004, 240, 0.13, 0.8);
  });
}

/** Wood knock, then two soft filtered tones. Warm, not a chime. */
export function playCorrect(): void {
  run("correct", (b) => {
    // No knock in front: the thud read as a mis-hit just before the payoff.
    const base = 392 * jitter(0.02);
    noise(b.ctx, b.t0, CLIP_GAIN.correct, {
      dur: 0.16,
      level: 0.22,
      filter: "bandpass",
      freq: base * 2,
      q: 9,
      attack: 0.01,
    });
    tone(b.ctx, b.t0, CLIP_GAIN.correct, {
      dur: 0.2 * jitter(0.1), level: 0.2, freq: base, attack: 0.012,
    });
    tone(b.ctx, b.t0, CLIP_GAIN.correct, {
      at: 0.14, dur: 0.28 * jitter(0.1), level: 0.18, freq: base * 1.5, attack: 0.014,
    });
  });
}

/** A dull, short lowpassed thud. No buzz. */
export function playWrong(): void {
  run("wrong", (b) => {
    thump(b.ctx, b.t0, CLIP_GAIN.wrong, 0, 320, 0.16, 1);
    tone(b.ctx, b.t0, CLIP_GAIN.wrong, {
      dur: 0.14 * jitter(0.12), level: 0.3, freq: 130 * jitter(0.08), freqTo: 80,
    });
  });
}

/** Two soft tumbles into a settle — the simplest read of a die rolling. */
export function playDiceRoll(): void {
  run("dice", (b) => {
    const click = (at: number, level: number) =>
      noise(b.ctx, b.t0, CLIP_GAIN.dice, {
        at,
        dur: 0.03,
        level,
        filter: "bandpass",
        freq: 1500 * jitter(0.15),
        q: 1.6,
        attack: 0.0015,
      });
    click(0.02, 0.55);
    click(0.14 * jitter(0.1), 0.5);
    // The settle, on the beat the tumble ends.
    noise(b.ctx, b.t0, CLIP_GAIN.dice, {
      at: 0.32 * jitter(0.08),
      dur: 0.055,
      level: 0.5,
      filter: "lowpass",
      freq: 1000 * jitter(0.12),
      q: 2,
      attack: 0.0015,
    });
  });
}

/** The die landing: one firm knock with a little body. */
export function playDieLand(): void {
  run("dieLand", (b) => {
    noise(b.ctx, b.t0, CLIP_GAIN.dieLand, {
      dur: 0.055 * jitter(0.15),
      level: 0.95,
      filter: "lowpass",
      freq: 1800 * jitter(0.18),
      q: 4 * jitter(0.2),
      attack: 0.0008,
    });
    thump(b.ctx, b.t0, CLIP_GAIN.dieLand, 0.008, 280, 0.1, 0.55);
  });
}

/** A soft rising filtered sweep — an intake of breath. */
export function playPeek(): void {
  run("peek", (b) => {
    noise(b.ctx, b.t0, CLIP_GAIN.peek, {
      dur: 0.34 * jitter(0.12),
      level: 0.9,
      filter: "bandpass",
      freq: 500 * jitter(0.15),
      freqTo: 4200 * jitter(0.15),
      q: 1.6,
      attack: 0.07,
    });
  });
}

/** One flip texture with a little body — a single cue for the whole board. */
let lastRevealAt = 0;
export function playReveal(): void {
  const now = Date.now();
  if (now - lastRevealAt < DEAL_DEDUPE_MS) return;
  lastRevealAt = now;
  run("reveal", (b) => {
    flipTexture(b.ctx, b.t0, CLIP_GAIN.reveal, 0, 1);
    thump(b.ctx, b.t0, CLIP_GAIN.reveal, 0.012, 320, 0.08, 0.4);
  });
}

/** Run-start cue: a low swell into a single wood knock. */
export function playStart(): void {
  run("start", (b) => {
    noise(b.ctx, b.t0, CLIP_GAIN.start, {
      dur: 0.42 * jitter(0.1),
      level: 0.5,
      filter: "lowpass",
      freq: 220 * jitter(0.15),
      freqTo: 900,
      q: 1,
      attack: 0.3,
    });
    woodKnock(b.ctx, b.t0, CLIP_GAIN.start, 0.42, 1);
  });
}

/** A brief marker between rounds. */
export function playRoundAdvance(): void {
  run("roundAdvance", (b) => {
    noise(b.ctx, b.t0, CLIP_GAIN.roundAdvance, {
      dur: 0.12 * jitter(0.15),
      level: 0.7,
      filter: "bandpass",
      freq: 1600 * jitter(0.2),
      freqTo: 3000,
      q: 2,
      attack: 0.006,
    });
    tone(b.ctx, b.t0, CLIP_GAIN.roundAdvance, {
      at: 0.02, dur: 0.16 * jitter(0.12), level: 0.16, freq: 300 * jitter(0.06), freqTo: 440,
    });
  });
}

/** A soft tick for the closing seconds of the study countdown. */
export function playTick(): void {
  run("tick", (b) => {
    noise(b.ctx, b.t0, CLIP_GAIN.tick, {
      dur: 0.025 * jitter(0.2),
      level: 0.9,
      filter: "bandpass",
      freq: 2600 * jitter(0.2),
      q: 3,
      attack: 0.0008,
    });
  });
}

/** One small confirm when the email signup lands. */
export function playSubscribed(): void {
  run("subscribed", (b) => {
    const base = 523 * jitter(0.02);
    tone(b.ctx, b.t0, CLIP_GAIN.subscribed, {
      dur: 0.13 * jitter(0.1), level: 0.3, freq: base, attack: 0.008,
    });
    tone(b.ctx, b.t0, CLIP_GAIN.subscribed, {
      at: 0.1, dur: 0.2 * jitter(0.1), level: 0.26, freq: base * 1.5, attack: 0.01,
    });
    noise(b.ctx, b.t0, CLIP_GAIN.subscribed, {
      dur: 0.05, level: 0.3, filter: "highpass", freq: 4000 * jitter(0.15), attack: 0.001,
    });
  });
}
