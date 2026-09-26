// ============================================================================
// channelSigning — authenticity for the Classic room channel.
//
// The room channel is a public Realtime channel: anyone with the code can
// join it. So every message that matters is signed:
//   • host broadcasts (state, roll, events, rejections, game_starting) by the
//     host's per-join key,
//   • intents and heartbeats by the sender's per-join key,
//   • claim grants / arbiter rejections by the server key (claim-lock,
//     release-lock).
// Each browser makes a fresh ECDSA P-256 key pair per room join. The private
// key is non-extractable and lives in memory only; the public key is
// registered with the server (join_room_session). Receivers fetch public keys
// ONLY from the server (room_sign_keys) — never from the channel — and drop
// anything that fails to verify.
// ============================================================================

/** Public half of the server key used by claim-lock and release-lock. */
export const SERVER_PUBLIC_KEY_B64 = "BAIv38x0BEZthCDSnuabbkJVnqEWbTVbOhMQdtVfQGiFw4RCynSlGLhHZ6PLFwOIxT+SJ25jedV7QznohxkOkSY=";
export const SERVER_SIGNER = "server";
/**
 * Intents whose sentAt is further than this from server time are dropped.
 * Generous on purpose: a host resuming from a long suspension still applies
 * intents queued while it slept. Replays are stopped by the nonce, and
 * cross-game replays by the signed gameId.
 */
export const INTENT_MAX_SKEW_MS = 10 * 60 * 1000;
/** Minimum gap between key-directory refetches triggered by a bad message. */
export const KEY_REFETCH_MIN_MS = 2000;

// ---------- canonical encoding (must match supabase/functions/_shared/classicSign.ts) ----------

export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value ?? null);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => (v === undefined ? "null" : canonical(v))).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(",")}}`;
}

export function signingInput(roomId: string, payload: Record<string, unknown>): Uint8Array<ArrayBuffer> {
  const { sig: _sig, ...rest } = payload;
  return new TextEncoder().encode(`ww-classic:v2:${roomId}:${canonical(rest)}`) as Uint8Array<ArrayBuffer>;
}

// ---------- base64 ----------

export function toB64(bytes: ArrayBuffer | Uint8Array): string {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s);
}

export function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

// ---------- timing (sign / verify cost per message) ----------

const MAX_SAMPLES = 2000;
const signMs: number[] = [];
const verifyMs: number[] = [];
function note(arr: number[], ms: number) {
  arr.push(ms);
  if (arr.length > MAX_SAMPLES) arr.shift();
}
function pct(arr: number[], p: number): number | null {
  if (!arr.length) return null;
  const s = arr.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}
export function signingStats() {
  return {
    sign: { n: signMs.length, p50: pct(signMs, 50), p95: pct(signMs, 95) },
    verify: { n: verifyMs.length, p50: pct(verifyMs, 50), p95: pct(verifyMs, 95) },
  };
}
if (typeof window !== "undefined") {
  (window as unknown as { __wwSigningStats?: typeof signingStats }).__wwSigningStats = signingStats;
}
const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

// ---------- keys ----------

const ECDSA = { name: "ECDSA", namedCurve: "P-256" } as const;
const SIGN_ALG = { name: "ECDSA", hash: "SHA-256" } as const;

export interface SigningKey {
  privateKey: CryptoKey;
  publicKeyB64: string;
}

export async function generateSigningKey(): Promise<SigningKey> {
  // extractable=false: the private key can never be exported from this tab.
  const pair = (await crypto.subtle.generateKey(ECDSA, false, ["sign", "verify"])) as CryptoKeyPair;
  const raw = await crypto.subtle.exportKey("raw", pair.publicKey);
  return { privateKey: pair.privateKey, publicKeyB64: toB64(raw) };
}

const importCache = new Map<string, Promise<CryptoKey | null>>();
export function importVerifyKey(b64: string): Promise<CryptoKey | null> {
  let p = importCache.get(b64);
  if (!p) {
    p = crypto.subtle
      .importKey("raw", fromB64(b64), ECDSA, false, ["verify"])
      .catch(() => null);
    importCache.set(b64, p);
  }
  return p;
}

export async function signEnvelope<T extends object>(
  payload: T,
  from: string,
  privateKey: CryptoKey,
  roomId: string,
): Promise<T & { from: string; sig: string }> {
  const t0 = now();
  const body = { ...(payload as Record<string, unknown>), from } as Record<string, unknown>;
  delete body.sig;
  const sig = await crypto.subtle.sign(SIGN_ALG, privateKey, signingInput(roomId, body));
  note(signMs, now() - t0);
  return { ...(body as T), from, sig: toB64(sig) };
}

export async function verifyEnvelope(
  payload: Record<string, unknown>,
  key: CryptoKey,
  roomId: string,
): Promise<boolean> {
  const sig = payload.sig;
  if (typeof sig !== "string" || sig.length > 200) return false;
  const t0 = now();
  try {
    const bytes = fromB64(sig);
    if (bytes.length !== 64) return false;
    return await crypto.subtle.verify(SIGN_ALG, key, bytes, signingInput(roomId, payload));
  } catch {
    return false;
  } finally {
    note(verifyMs, now() - t0);
  }
}

// ---------- which signer may send what ----------

export type SenderClass = "host" | "server" | "member" | "open";

export function senderClassOf(payload: unknown): SenderClass | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as { type?: unknown; kind?: unknown };
  if (p.kind === "game_starting") return "host";
  if (p.kind === "seat_rekey") return "open"; // a nudge to re-read the server; carries nothing
  switch (p.type) {
    case "state":
    case "roll_committed":
    case "roll_reject":
    case "event":
    case "claim_reject": // host OR server; `from` decides
      return "host";
    case "claim_grant":
      return "server";
    case "intent":
    case "heartbeat":
      return "member";
    case "state_request":
      return "open"; // only asks the host to reply
    default:
      return null;
  }
}

// ---------- replay guard ----------

export class NonceStore {
  private seen = new Set<string>();
  constructor(public readonly gameId: string) {}
  /** True the first time a fresh nonce is seen; false for replays and stale times. */
  accept(nonce: unknown, sentAt: unknown, serverNowMs: number): boolean {
    if (typeof nonce !== "string" || nonce.length < 16 || nonce.length > 64) return false;
    if (typeof sentAt !== "number" || !Number.isFinite(sentAt)) return false;
    if (Math.abs(serverNowMs - sentAt) > INTENT_MAX_SKEW_MS) return false;
    if (this.seen.has(nonce)) return false;
    this.seen.add(nonce);
    if (this.seen.size > 20000) this.seen = new Set(Array.from(this.seen).slice(-10000));
    return true;
  }
}

export function randomNonce(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

// ---------- key directory (server-sourced) ----------

export interface SignKeyRow {
  role: string;
  seat: number | null;
  pub_id: string;
  sign_pubkey: string;
}

interface DirEntry {
  role: "host" | "seat";
  seat: number | null;
  key: CryptoKey;
}

export class KeyDirectory {
  hostPid: string | null = null;
  private entries = new Map<string, DirEntry>();
  private seats = new Map<number, string>();
  private inflight: Promise<void> | null = null;
  private lastFetch = -Infinity;
  private listeners = new Set<() => void>();

  constructor(private readonly fetchRows: () => Promise<SignKeyRow[] | null>) {}

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  }

  keyFor(pid: string): CryptoKey | null {
    return this.entries.get(pid)?.key ?? null;
  }
  seatOf(pid: string): number | null {
    const e = this.entries.get(pid);
    return e && e.role === "seat" ? e.seat : null;
  }
  seatPids(): Array<{ seat: number; pid: string }> {
    return Array.from(this.seats.entries()).map(([seat, pid]) => ({ seat, pid }));
  }

  /** Refetch from the server. Non-forced calls are throttled and coalesced. */
  refresh(force = false): Promise<void> {
    if (this.inflight) return this.inflight;
    const t = Date.now();
    if (!force && t - this.lastFetch < KEY_REFETCH_MIN_MS) return Promise.resolve();
    this.lastFetch = t;
    this.inflight = (async () => {
      try {
        const rows = await this.fetchRows();
        if (!rows) return;
        await this.load(rows);
      } finally {
        this.inflight = null;
      }
    })();
    return this.inflight;
  }

  async load(rows: SignKeyRow[]): Promise<void> {
    const entries = new Map<string, DirEntry>();
    const seats = new Map<number, string>();
    let hostPid: string | null = null;
    for (const r of rows) {
      if (!r?.pub_id || !r.sign_pubkey) continue;
      const key = await importVerifyKey(r.sign_pubkey);
      if (!key) continue;
      if (r.role === "host") {
        hostPid = r.pub_id;
        if (!entries.has(r.pub_id)) entries.set(r.pub_id, { role: "host", seat: null, key });
      } else if (r.role === "seat" && typeof r.seat === "number") {
        entries.set(r.pub_id, { role: "seat", seat: r.seat, key });
        seats.set(r.seat, r.pub_id);
      }
    }
    const changed =
      hostPid !== this.hostPid ||
      JSON.stringify(Array.from(seats.entries())) !== JSON.stringify(Array.from(this.seats.entries()));
    this.entries = entries;
    this.seats = seats;
    this.hostPid = hostPid;
    if (changed) this.listeners.forEach((cb) => { try { cb(); } catch { /* isolate */ } });
  }
}

let serverKeyPromise: Promise<CryptoKey | null> | null = null;
function serverKey(): Promise<CryptoKey | null> {
  if (!serverKeyPromise) serverKeyPromise = importVerifyKey(SERVER_PUBLIC_KEY_B64);
  return serverKeyPromise;
}

export type IncomingVerifier = (payload: unknown) => Promise<boolean>;

/**
 * Decides whether an incoming channel message is authentic for this client.
 * Host: accepts intents/heartbeats from seated players (bound to their own
 * seat / id) and server-signed grants. Joiner: accepts host-signed
 * broadcasts, the host's heartbeat, and server-signed rejections. A failed
 * check refetches keys once (throttled) — the sender may have just rejoined.
 */
export function createVerifier(opts: {
  roomId: string;
  role: "host" | "joiner";
  directory: KeyDirectory;
  serverKeyOverride?: () => Promise<CryptoKey | null>;
}): IncomingVerifier {
  const { roomId, role, directory } = opts;
  const getServerKey = opts.serverKeyOverride ?? serverKey;

  const check = async (p: Record<string, unknown>, cls: SenderClass, from: string): Promise<boolean> => {
    if (cls === "host") {
      if (role !== "joiner" || from !== directory.hostPid) return false;
      const k = directory.keyFor(from);
      return !!k && verifyEnvelope(p, k, roomId);
    }
    // member
    if (p.type === "heartbeat") {
      const hb = p.payload as { pid?: unknown } | undefined;
      if (hb?.pid !== from) return false;
      const allowed = role === "host" ? directory.seatOf(from) !== null : from === directory.hostPid;
      if (!allowed) return false;
    } else {
      // intent: only the host acts on them, and only for the sender's own seat.
      if (role !== "host") return false;
      const ip = p.payload as { seat?: unknown; pid?: unknown } | undefined;
      const seat = directory.seatOf(from);
      if (seat === null || ip?.seat !== seat || ip?.pid !== from) return false;
    }
    const k = directory.keyFor(from);
    return !!k && verifyEnvelope(p, k, roomId);
  };

  return async (payload) => {
    const cls = senderClassOf(payload);
    if (cls === null) return false;
    if (cls === "open") return true;
    const p = payload as Record<string, unknown>;
    const from = p.from;
    if (typeof from !== "string" || !from) return false;

    if (from === SERVER_SIGNER) {
      if (p.type !== "claim_grant" && p.type !== "claim_reject") return false;
      if (p.type === "claim_grant" && role !== "host") return false;
      const k = await getServerKey();
      return !!k && verifyEnvelope(p, k, roomId);
    }
    if (cls === "server") return false;

    if (await check(p, cls, from)) return true;
    // A joiner hears other joiners' heartbeats; those are not its to judge,
    // so they never trigger a refetch. Host-signed traffic does: a refreshed
    // host arrives with a new id and key.
    if (role === "joiner" && cls === "member") return false;
    await directory.refresh();
    return check(p, cls, from);
  };
}
