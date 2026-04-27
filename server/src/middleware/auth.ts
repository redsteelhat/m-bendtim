import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { User } from "../models/User";

const rawSecret = process.env.JWT_SECRET;
if (!rawSecret) {
  throw new Error("JWT_SECRET tanımlı değil");
}
const jwtSecret: string = rawSecret;

export interface AuthPayload {
  userId: number;
  role: string;
}

/** Oturum bilgisi; Express `Request.user` (Passport) ile karışmaması için ayrı alan. */
export interface AuthRequest extends Request {
  auth?: AuthPayload;
  sessionUser?: User;
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, jwtSecret, { expiresIn: "7d" });
}

export function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "Yetkisiz" });
    return;
  }
  try {
    const decoded = jwt.verify(token, jwtSecret);
    const payload = decoded as jwt.JwtPayload;
    const userId = Number(payload.userId);
    const role = typeof payload.role === "string" ? payload.role : "";
    if (!Number.isFinite(userId) || !role) {
      res.status(401).json({ error: "Geçersiz oturum" });
      return;
    }
    req.auth = { userId, role };
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
    attributes: ["id", "email", "name", "role", "createdAt"],
  });
  if (!row) {
    res.status(401).json({ error: "Kullanıcı bulunamadı" });
    return;
  }
  req.sessionUser = row;
  next();
}
