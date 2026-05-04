import { Request, Response, NextFunction } from "express";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { User } from "../models/User";

const rawSecret = process.env.JWT_SECRET;
if (!rawSecret) {
  throw new Error("JWT_SECRET tanımlı değil");
}
const jwtSecret: string = rawSecret;
const isProduction = process.env.NODE_ENV === "production";
const tokenTtl = (process.env.AUTH_TOKEN_TTL || "8h") as jwt.SignOptions["expiresIn"];
const cookieMaxAgeMs = Number(process.env.AUTH_COOKIE_MAX_AGE_MS) || 8 * 60 * 60 * 1000;
const sessionCookieName = "mbendtim_session";
const csrfCookieName = "mbendtim_csrf";
const jwtIssuer = "m-bendtim-api";
const jwtAudience = "m-bendtim-panel";

export interface AuthPayload {
  userId: number;
  role: string;
  sessionVersion: number;
}

/** Oturum bilgisi; Express `Request.user` (Passport) ile karışmaması için ayrı alan. */
export interface AuthRequest extends Request {
  auth?: AuthPayload & { source: "cookie" | "bearer" };
  sessionUser?: User;
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, jwtSecret, {
    expiresIn: tokenTtl,
    issuer: jwtIssuer,
    audience: jwtAudience,
  });
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

function cookieBase(): string {
  const attrs = [
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(cookieMaxAgeMs / 1000)}`,
  ];
  if (isProduction) attrs.push("Secure");
  return attrs.join("; ");
}

function csrfCookieBase(): string {
  const attrs = [
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${Math.floor(cookieMaxAgeMs / 1000)}`,
  ];
  if (isProduction) attrs.push("Secure");
  return attrs.join("; ");
}

export function issueSessionCookies(res: Response, token: string): string {
  const csrfToken = crypto.randomBytes(32).toString("base64url");
  res.append("Set-Cookie", `${sessionCookieName}=${encodeURIComponent(token)}; ${cookieBase()}`);
  res.append("Set-Cookie", `${csrfCookieName}=${encodeURIComponent(csrfToken)}; ${csrfCookieBase()}`);
  return csrfToken;
}

export function clearSessionCookies(res: Response): void {
  const secure = isProduction ? "; Secure" : "";
  res.append(
    "Set-Cookie",
    `${sessionCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`
  );
  res.append("Set-Cookie", `${csrfCookieName}=; Path=/; SameSite=Lax; Max-Age=0${secure}`);
}

function readToken(req: Request): { token: string | null; source: "cookie" | "bearer" | null } {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    return { token: header.slice(7), source: "bearer" };
  }
  const cookies = parseCookies(req.headers.cookie);
  return {
    token: cookies[sessionCookieName] || null,
    source: cookies[sessionCookieName] ? "cookie" : null,
  };
}

function verifyCsrf(req: AuthRequest): boolean {
  if (req.auth?.source !== "cookie") return true;
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return true;
  const cookies = parseCookies(req.headers.cookie);
  const cookieToken = cookies[csrfCookieName];
  const headerToken = req.header("x-csrf-token");
  if (!cookieToken || !headerToken) return false;
  const a = Buffer.from(cookieToken);
  const b = Buffer.from(headerToken);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  const { token, source } = readToken(req);
  if (!token) {
    res.status(401).json({ error: "Yetkisiz" });
    return;
  }
  try {
    const decoded = jwt.verify(token, jwtSecret, {
      issuer: jwtIssuer,
      audience: jwtAudience,
    });
    const payload = decoded as jwt.JwtPayload;
    const userId = Number(payload.userId);
    const role = typeof payload.role === "string" ? payload.role : "";
    const sessionVersion = Number(payload.sessionVersion);
    if (!Number.isInteger(userId) || !role || !Number.isInteger(sessionVersion)) {
      res.status(401).json({ error: "Geçersiz oturum" });
      return;
    }
    req.auth = { userId, role, sessionVersion, source: source ?? "bearer" };
    if (!verifyCsrf(req)) {
      res.status(403).json({ error: "Güvenlik doğrulaması başarısız" });
      return;
    }
    next();
  } catch {
    res.status(401).json({ error: "Geçersiz veya süresi dolmuş oturum" });
  }
}

export function requireAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  if (req.auth?.role !== "admin") {
    res.status(403).json({ error: "Bu işlem için yönetici gerekli" });
    return;
  }
  next();
}

export async function attachUser(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.auth?.userId) {
    res.status(401).json({ error: "Yetkisiz" });
    return;
  }
  const row = await User.findByPk(req.auth.userId, {
    attributes: ["id", "email", "name", "role", "sessionVersion", "createdAt"],
  });
  if (!row) {
    res.status(401).json({ error: "Kullanıcı bulunamadı" });
    return;
  }
  if (row.sessionVersion !== req.auth.sessionVersion) {
    res.status(401).json({ error: "Oturum geçersiz kılındı" });
    return;
  }
  req.sessionUser = row;
  next();
}
