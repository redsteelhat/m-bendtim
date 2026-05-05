import { Router, Response } from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import { User } from "../models/User";
import {
  AuthRequest,
  signToken,
  requireAuth,
  attachUser,
} from "../middleware/auth";
import { trimmedString, validateBody, z } from "../middleware/validate";

const router = Router();

const loginSchema = z.object({
  email: trimmedString("E-posta", 255).pipe(z.email("Geçerli bir e-posta girin")),
  password: trimmedString("Şifre", 255),
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Çok fazla giriş denemesi. Lütfen daha sonra tekrar deneyin." },
});

router.post("/login", loginLimiter, validateBody(loginSchema), async (req, res: Response) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json({ error: "E-posta ve şifre gerekli" });
    return;
  }
  const user = await User.findOne({ where: { email: email.toLowerCase().trim() } });
  if (!user) {
    res.status(401).json({ error: "Geçersiz kimlik bilgileri" });
    return;
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    res.status(401).json({ error: "Geçersiz kimlik bilgileri" });
    return;
  }
  const token = signToken({ userId: user.id, role: user.role });
  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  });
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
