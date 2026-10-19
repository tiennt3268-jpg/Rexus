import { scryptSync, randomBytes, timingSafeEqual, createHmac } from "node:crypto";
import { getDatabase } from "@netlify/database";
import { gateState } from "./survey.mts";

/* =========================================================
   Password hashing (Node's built-in scrypt — no extra deps).
   Stored format: "<saltHex>:<hashHex>"
   ========================================================= */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return salt + ":" + hash;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hashHex] = stored.split(":");
  if (!salt || !hashHex) return false;
  const hash = scryptSync(password, salt, 64);
  const storedHash = Buffer.from(hashHex, "hex");
  if (hash.length !== storedHash.length) return false;
  return timingSafeEqual(hash, storedHash);
}

/* =========================================================
   Session and password-reset signing key (v2.1.2 hotfix)

   No Netlify SESSION_SECRET configuration is required. A 256-bit
   cryptographically random signing key is created once and persisted in
   the existing Netlify database; all serverless instances share it.

   Never derive a key from a public identifier, username, or fixed source
   value. Do not generate a new ephemeral key for each serverless instance.
   The lazy table creation also permits login before migration 032 runs;
   the same schema is shipped as a versioned migration for deployments.
   ========================================================= */
let signingKeyPromise: Promise<Buffer> | null = null;

async function loadSigningKey(): Promise<Buffer> {
  const db = getDatabase();
  const keyName = "rexus-auth-v1";
  const lookup = async () => db.sql`SELECT secret_hex FROM rexus_session_signing_keys
    WHERE key_id = ${keyName}`;
  let rows;
  try {
    rows = await lookup();
  } catch (error: any) {
    // Supports urgent recovery on installations where migration 032 was
    // not run yet, without requiring an environment variable or hardcoding
    // the key. Normal post-migration sign-in performs no DDL at all.
    const message = String(error?.message || "");
    if (error?.code !== "42P01" && error?.cause?.code !== "42P01" &&
        !(message.includes("rexus_session_signing_keys") && message.includes("does not exist"))) {
      throw error;
    }
    try {
      await db.sql`CREATE TABLE IF NOT EXISTS rexus_session_signing_keys (
        key_id TEXT PRIMARY KEY,
        secret_hex TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`;
    } catch (createError) {
      // An instance may have created the table concurrently. If it now
      // exists, continue; otherwise report the original failure.
      try { await lookup(); } catch { throw createError; }
    }
    rows = await lookup();
  }
  if (!rows.length) {
    // A single randomly generated key is shared by every serverless
    // instance; the database uniqueness constraint resolves races.
    const candidate = randomBytes(32).toString("hex");
    await db.sql`INSERT INTO rexus_session_signing_keys (key_id, secret_hex)
      VALUES (${keyName}, ${candidate}) ON CONFLICT (key_id) DO NOTHING`;
    rows = await lookup();
  }
  const secret = rows[0]?.secret_hex;
  if (typeof secret !== "string" || !/^[a-f0-9]{64}$/i.test(secret)) {
    throw new Error("REXUS database signing key is invalid");
  }
  return Buffer.from(secret, "hex");
}

async function getSigningKey(): Promise<Buffer> {
  if (!signingKeyPromise) {
    signingKeyPromise = loadSigningKey().catch((err) => {
      signingKeyPromise = null; // permit retry after transient database failures
      throw err;
    });
  }
  return signingKeyPromise;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

export async function createSessionToken(userId: string, username: string): Promise<string> {
  const payload = base64url(JSON.stringify({ uid: userId, username: username, iat: Date.now() }));
  const signature = createHmac("sha256", await getSigningKey()).update(payload).digest("base64url");
  return payload + "." + signature;
}

export async function verifySessionToken(token: string): Promise<{ uid: string; username: string } | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  const expected = createHmac("sha256", await getSigningKey()).update(payload).digest("base64url");
  if (signature.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if(typeof data.uid!=='string'||typeof data.username!=='string'||!Number.isFinite(data.iat))return null;
    if(data.iat>Date.now()+60000 || data.iat<Date.now()-30*24*60*60*1000)return null;
    return { uid: data.uid, username: data.username };
  } catch {
    return null;
  }
}

/* =========================================================
   Password-reset tokens: short-lived, single-purpose signed tokens
   issued after a "forgot password" identity check (username + email
   match), then redeemed once to set a new password. Same HMAC scheme
   as session tokens but tagged "pwreset" and time-boxed, so a leaked
   session token can never be replayed here and vice versa.
   ========================================================= */
const PASSWORD_RESET_TTL_MS = 15 * 60 * 1000; // 15 minutes

export async function createPasswordResetToken(userId: string): Promise<string> {
  const payload = base64url(JSON.stringify({ purpose: "pwreset", uid: userId, iat: Date.now() }));
  const signature = createHmac("sha256", await getSigningKey()).update(payload).digest("base64url");
  return payload + "." + signature;
}

export async function verifyPasswordResetToken(token: string): Promise<{ uid: string } | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  const expected = createHmac("sha256", await getSigningKey()).update(payload).digest("base64url");
  if (signature.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (data.purpose !== "pwreset") return null;
    if (!data.iat || Date.now() - data.iat > PASSWORD_RESET_TTL_MS) return null;
    return { uid: data.uid };
  } catch {
    return null;
  }
}

function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  header.split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx === -1) return;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    out[key] = decodeURIComponent(val);
  });
  return out;
}

export const SESSION_COOKIE = "wm_session";

/** Returns the authenticated user (uid, username) for a request, or null.
 *  v2.3.0 (F07 / F02–F04): while the account still has a First Login step or a mandatory survey to complete,
 *  business APIs see it as signed out. Only the endpoints that run those steps pass { allowGate: true }. */
export async function getUserFromRequest(req: Request, opts: { allowGate?: boolean } = {}): Promise<{ uid: string; username: string } | null> {
  const cookies = parseCookies(req.headers.get("cookie"));
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;
  const session = await verifySessionToken(token);
  if (!session) return null;
  // v2.2.2 (ACC-02): a deactivated or deleted account loses API access immediately,
  // not only on the next page load — signed tokens themselves cannot be revoked.
  const rows = await getDatabase().sql`SELECT status, deleted_at FROM users WHERE id = ${session.uid}`;
  if (!rows.length || (rows[0].status && rows[0].status !== "Active") || rows[0].deleted_at) return null;
  // shortcut: one extra query per request; cache it for a few seconds if traffic grows to thousands of concurrent users.
  if (!opts.allowGate && (await gateState(getDatabase(), session.uid)).step) return null;
  return session;
}

/**
 * Set-Cookie header value for logging a user in.
 * remember=true (default): persists for 30 days, so the browser keeps the
 * person signed in across restarts ("Remember me" checked).
 * remember=false: a session cookie with no Max-Age — the browser drops it
 * when the browser itself is closed, so the login doesn't outlive that.
 */
export function sessionCookieHeader(token: string, remember: boolean = true): string {
  const base = `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax`;
  return remember ? `${base}; Max-Age=2592000` : base;
}

/** Set-Cookie header value for logging a user out. */
export function clearSessionCookieHeader(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function unauthorized(): Response {
  return Response.json({ error: "Not signed in" }, { status: 401 });
}
