const PBKDF2_ITERATIONS = 100_000;
// Production deployments MUST set SESSION_SECRET via `npx convex env set`.
// The fallback only preserves local-dev behaviour before the env var is set.
const SESSION_SECRET =
  process.env.SESSION_SECRET ?? "mb-crunchy-admin-session-key-v1";

if (!process.env.SESSION_SECRET) {
  console.warn(
    "[mb-crunchy] SESSION_SECRET is not set — using the development fallback secret. " +
      "Set a strong random value in production with: npx convex env set SESSION_SECRET <random-string>",
  );
}

const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000;

function getWebCrypto(): Crypto {
  // Convex runtime and browser both expose globalThis.crypto
  return globalThis.crypto;
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateSalt(): string {
  const wc = getWebCrypto();
  const salt = new Uint8Array(32);
  wc.getRandomValues(salt);
  return bufferToHex(salt.buffer);
}

function generateRandomHex(length: number): string {
  const wc = getWebCrypto();
  const bytes = new Uint8Array(length);
  wc.getRandomValues(bytes);
  return bufferToHex(bytes.buffer);
}

export async function hashPassword(
  password: string,
  existingSalt?: string,
): Promise<{ hash: string; salt: string }> {
  const wc = getWebCrypto();
  const salt = existingSalt || generateSalt();
  const encoder = new TextEncoder();
  const keyMaterial = await wc.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const derivedBits = await wc.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: encoder.encode(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    256,
  );
  return { hash: bufferToHex(derivedBits), salt };
}

export async function verifyPassword(
  password: string,
  storedHash: string,
  salt: string,
): Promise<boolean> {
  const { hash } = await hashPassword(password, salt);
  if (hash.length !== storedHash.length) return false;
  let result = 0;
  for (let i = 0; i < hash.length; i++) {
    result |= hash.charCodeAt(i) ^ storedHash.charCodeAt(i);
  }
  return result === 0;
}

export function generateRecoveryKey(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const wc = getWebCrypto();
  const segments: string[] = ["MBCR"];
  for (let s = 0; s < 4; s++) {
    let segment = "";
    for (let i = 0; i < 4; i++) {
      segment += chars[secureRandomIndex(wc, chars.length)];
    }
    segments.push(segment);
  }
  return segments.join("-");
}

/** Uniform random index in [0, maxExclusive) using rejection sampling. */
function secureRandomIndex(wc: Crypto, maxExclusive: number): number {
  const buf = new Uint8Array(1);
  const limit = 256 - (256 % maxExclusive);
  let value: number;
  do {
    wc.getRandomValues(buf);
    value = buf[0];
  } while (value >= limit);
  return value % maxExclusive;
}

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(str: string): ArrayBuffer {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) base64 += "=";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function createSessionToken(
  adminId: string,
  username: string,
  role: string,
): Promise<string> {
  const wc = getWebCrypto();
  const encoder = new TextEncoder();
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: adminId,
    username,
    role,
    iat: now,
    exp: now + Math.floor(TOKEN_EXPIRY_MS / 1000),
  };

  const headerB64 = base64UrlEncode(
    encoder.encode(JSON.stringify(header)).buffer,
  );
  const payloadB64 = base64UrlEncode(
    encoder.encode(JSON.stringify(payload)).buffer,
  );
  const message = `${headerB64}.${payloadB64}`;

  const key = await wc.subtle.importKey(
    "raw",
    encoder.encode(SESSION_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await wc.subtle.sign(
    "HMAC",
    key,
    encoder.encode(message),
  );
  const sigB64 = base64UrlEncode(signature);

  return `${message}.${sigB64}`;
}

export async function verifySessionToken(
  token: string,
): Promise<{ adminId: string; username: string; role: string } | null> {
  try {
    const wc = getWebCrypto();
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, sigB64] = parts;
    const encoder = new TextEncoder();
    const message = `${headerB64}.${payloadB64}`;

    const key = await wc.subtle.importKey(
      "raw",
      encoder.encode(SESSION_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );

    const sigBuffer = base64UrlDecode(sigB64);
    const valid = await wc.subtle.verify(
      "HMAC",
      key,
      sigBuffer,
      encoder.encode(message),
    );
    if (!valid) return null;

    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(payloadB64)),
    );
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000))
      return null;

    return {
      adminId: payload.sub,
      username: payload.username,
      role: payload.role,
    };
  } catch {
    return null;
  }
}

export function generateDeviceFingerprint(): string {
  return generateRandomHex(16);
}
