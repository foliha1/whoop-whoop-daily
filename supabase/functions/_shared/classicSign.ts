// ============================================================================
// classicSign — server signature for Classic channel messages sent by the
// claim-lock and release-lock functions (claim_grant, claim_reject).
//
// The private key is derived from the CLASSIC_SIGNING_SEED secret and never
// leaves this runtime. Only the public key ships in the app
// (SERVER_PUBLIC_KEY_B64 in src/lib/channelSigning.ts).
// Canonical encoding MUST match src/lib/channelSigning.ts.
// ============================================================================

import { p256 } from "npm:@noble/curves@1.4.0/p256";
import { sha256 } from "npm:@noble/hashes@1.4.0/sha256";

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

let priv: Uint8Array | null = null;
function privateKey(): Uint8Array | null {
  if (priv) return priv;
  const seed = Deno.env.get("CLASSIC_SIGNING_SEED");
  if (!seed) return null;
  priv = sha256(new TextEncoder().encode(`ww-classic-sign-v1:${seed}`));
  return priv;
}

function b64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

export function serverPublicKeyB64(): string | null {
  const k = privateKey();
  return k ? b64(p256.getPublicKey(k, false)) : null;
}

/** Returns the envelope with from:"server" and sig, or null if unconfigured. */
export function signServerEnvelope(
  roomId: string,
  env: Record<string, unknown>,
): Record<string, unknown> | null {
  const k = privateKey();
  if (!k) return null;
  const body: Record<string, unknown> = { ...env, from: "server" };
  delete body.sig;
  const msg = new TextEncoder().encode(`ww-classic:v2:${roomId}:${canonical(body)}`);
  const sig = p256.sign(sha256(msg), k).toCompactRawBytes();
  return { ...body, sig: b64(sig) };
}
