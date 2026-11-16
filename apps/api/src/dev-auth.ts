import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const DEV_TOKEN_PREFIX = "odfdev.v1.";
const DEFAULT_TTL_SECONDS = 8 * 60 * 60;

export interface DevAuthToken {
  sub: string;
  iat: number;
  exp: number;
}

let testSecretOverride: Buffer | undefined;

export function setDevAuthSecretForTests(secret: Buffer | string | null | undefined): void {
  if (secret == null) {
    testSecretOverride = undefined;
    return;
  }
  testSecretOverride = typeof secret === "string" ? Buffer.from(secret, "utf8") : Buffer.from(secret);
}

export function defaultDevAuthSecretPath(): string {
  if (process.env.ODF_DEV_AUTH_SECRET_FILE?.trim()) {
    return resolve(process.env.ODF_DEV_AUTH_SECRET_FILE.trim());
  }
  return resolve(dirname(fileURLToPath(import.meta.url)), "../data/.odf-dev-secret");
}

function decodeSecret(value: string): Buffer {
  const trimmed = value.trim();
  if (/^[0-9a-f]+$/i.test(trimmed) && trimmed.length >= 64) {
    return Buffer.from(trimmed, "hex");
  }
  return Buffer.from(trimmed, "utf8");
}

function loadOrCreateSecretFile(path = defaultDevAuthSecretPath()): Buffer {
  try {
    const existing = readFileSync(path);
    if (existing.length >= 32) return existing.subarray(0, 64);
  } catch {
    /* create below */
  }
  mkdirSync(dirname(path), { recursive: true });
  const created = randomBytes(32);
  const tmp = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  writeFileSync(tmp, created, { flag: "wx", mode: 0o600 });
  try {
    chmodSync(tmp, 0o600);
  } catch {
    /* best effort */
  }
  try {
    writeFileSync(path, created, { flag: "wx", mode: 0o600 });
    try { chmodSync(path, 0o600); } catch { /* best effort */ }
  } catch {
    // Lost the race; read the winner.
    try {
      const winner = readFileSync(path);
      if (winner.length >= 32) {
        try { chmodSync(tmp, 0o600); } catch { /* ignore */ }
        return winner.subarray(0, 64);
      }
    } catch {
      /* fall through */
    }
  }
  return created;
}

export function resolveDevAuthSecret(): Buffer {
  if (testSecretOverride && testSecretOverride.length >= 32) return testSecretOverride;
  const fromEnv = process.env.ODF_DEV_AUTH_SECRET?.trim();
  if (fromEnv) {
    const decoded = decodeSecret(fromEnv);
    if (decoded.length < 32) throw new Error("ODF_DEV_AUTH_SECRET must be at least 32 bytes");
    return decoded;
  }
  return loadOrCreateSecretFile();
}

function encodePart(value: Buffer | string): string {
  return Buffer.from(value).toString("base64url");
}

function sign(secret: Buffer, payloadPart: string): string {
  return encodePart(createHmac("sha256", secret).update(DEV_TOKEN_PREFIX + payloadPart).digest());
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function mintDevToken(
  userId: string,
  options: { secret?: Buffer; ttlSeconds?: number; now?: number } = {},
): string {
  const sub = userId.trim();
  if (!sub || sub.length > 255) throw new Error("dev token subject is invalid");
  const secret = options.secret ?? resolveDevAuthSecret();
  const now = options.now ?? Math.floor(Date.now() / 1000);
  const payload: DevAuthToken = {
    sub,
    iat: now,
    exp: now + (options.ttlSeconds ?? DEFAULT_TTL_SECONDS),
  };
  const payloadPart = encodePart(JSON.stringify(payload));
  return `${DEV_TOKEN_PREFIX}${payloadPart}.${sign(secret, payloadPart)}`;
}

export function verifyDevToken(
  token: string | undefined | null,
  options: { secret?: Buffer; now?: number } = {},
): DevAuthToken {
  if (!token || !token.startsWith(DEV_TOKEN_PREFIX)) {
    throw new Error("A signed development token is required");
  }
  const body = token.slice(DEV_TOKEN_PREFIX.length);
  const lastDot = body.lastIndexOf(".");
  if (lastDot <= 0) throw new Error("A signed development token is required");
  const payloadPart = body.slice(0, lastDot);
  const mac = body.slice(lastDot + 1);
  const secret = options.secret ?? resolveDevAuthSecret();
  const expected = sign(secret, payloadPart);
  if (!safeEqual(mac, expected)) throw new Error("A signed development token is required");
  let payload: DevAuthToken;
  try {
    payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")) as DevAuthToken;
  } catch {
    throw new Error("A signed development token is required");
  }
  const sub = typeof payload.sub === "string" ? payload.sub.trim() : "";
  const exp = Number(payload.exp);
  const now = options.now ?? Math.floor(Date.now() / 1000);
  if (!sub || sub.length > 255 || !Number.isFinite(exp) || exp <= now) {
    throw new Error("A signed development token is required");
  }
  return { sub, iat: Number(payload.iat) || now, exp };
}

export function extractBearerToken(authorization: string | undefined | null): string | undefined {
  if (!authorization) return undefined;
  const match = /^Bearer\s+(\S+)$/iu.exec(authorization.trim());
  return match?.[1];
}
