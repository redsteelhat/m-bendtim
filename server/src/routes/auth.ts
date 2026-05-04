import { Router, Response } from "express";
import bcrypt from "bcryptjs";
import { User } from "../models/User";
import {
  AuthRequest,
  clearSessionCookies,
  issueSessionCookies,
  signToken,
  requireAuth,
  attachUser,
} from "../middleware/auth";

const router = Router();
const dummyPasswordHash = bcrypt.hashSync("invalid-password-placeholder", 12);
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const loginWindowMs = 15 * 60 * 1000;
const maxLoginAttempts = 8;

function rateLimitKey(req: AuthRequest, email: string): string {
  const ip =
    req.ip ||
    String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim() ||
    req.socket.remoteAddress ||
    "unknown";
  return `${ip}:${email.toLowerCase().trim()}`;
}

function checkLoginLimit(req: AuthRequest, email: string): boolean {
  const now = Date.now();
  const key = rateLimitKey(req, email);
  const entry = loginAttempts.get(key);
  if (!entry || entry.resetAt <= now) {
    loginAttempts.set(key, { count: 0, resetAt: now + loginWindowMs });
    return true;
  }
  return entry.count < maxLoginAttempts;
}

function recordLoginFailure(req: AuthRequest, email: string): void {
  const now = Date.now();
  const key = rateLimitKey(req, email);
  const entry = loginAttempts.get(key) ?? { count: 0, resetAt: now + loginWindowMs };
  entry.count += 1;
  loginAttempts.set(key, entry);
}

function clearLoginFailures(req: AuthRequest, email: string): void {
  loginAttempts.delete(rateLimitKey(req, email));
}

router.post("/login", async (req: AuthRequest, res: Response) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json({ error: "E-posta ve şifre gerekli" });
    return;
  }
  const normalizedEmail = email.toLowerCase().trim();
  if (!checkLoginLimit(req, normalizedEmail)) {
    res.status(429).json({ error: "Çok fazla giriş denemesi. Bir süre sonra tekrar deneyin." });
    return;
  }

  const user = await User.findOne({ where: { email: normalizedEmail } });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? dummyPasswordHash);
  if (!user || !ok) {
    recordLoginFailure(req, normalizedEmail);
    res.status(401).json({ error: "Geçersiz kimlik bilgileri" });
    return;
  }
  clearLoginFailures(req, normalizedEmail);
  const token = signToken({
    userId: user.id,
    role: user.role,
    sessionVersion: user.sessionVersion,
  });
  const csrfToken = issueSessionCookies(res, token);
  res.json({
    csrfToken,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  });
});

router.post("/logout", requireAuth, (_req: AuthRequest, res: Response) => {
  clearSessionCookies(res);
  res.status(204).send();
});

router.get(
  "/me",
  requireAuth,
  attachUser,
  (req: AuthRequest, res: Response) => {
    const u = req.sessionUser!;
    res.json({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      createdAt: u.createdAt,
    });
  }
);

export default router;
