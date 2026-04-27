import { Router, Response } from "express";
import bcrypt from "bcryptjs";
import { User } from "../models/User";
import {
  AuthRequest,
  signToken,
  requireAuth,
  attachUser,
} from "../middleware/auth";

const router = Router();

router.post("/login", async (req, res: Response) => {
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
