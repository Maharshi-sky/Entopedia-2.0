import { createHmac, timingSafeEqual } from "node:crypto";

// Minimal HS256 verification for the Entopedia API's tokens (jsonwebtoken's
// default algorithm), using only node:crypto. The proxy runs on the Node.js
// runtime, so this needs no extra dependency.

export type TokenClaims = { id: string; email: string; role: string; exp?: number; iat?: number };

function base64url(input: Buffer): string {
  return input.toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function parsePart<T>(part: string): T | null {
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

/** Claims without checking the signature. Only for reading `exp` of a token the API just issued. */
export function decodeJwt(token: string): TokenClaims | null {
  const parts = token.split(".");
  return parts.length === 3 ? parsePart<TokenClaims>(parts[1]) : null;
}

/** Verified, unexpired claims, or null. */
export function verifyJwt(token: string, secret: string, nowSeconds = Math.floor(Date.now() / 1000)): TokenClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;

  const head = parsePart<{ alg?: string; typ?: string }>(header);
  if (!head || head.alg !== "HS256") return null;

  const expected = Buffer.from(base64url(createHmac("sha256", secret).update(`${header}.${payload}`).digest()));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

  const claims = parsePart<TokenClaims>(payload);
  if (!claims || typeof claims.role !== "string" || typeof claims.id !== "string") return null;
  if (typeof claims.exp === "number" && claims.exp <= nowSeconds) return null;
  return claims;
}
