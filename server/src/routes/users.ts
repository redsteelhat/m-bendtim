import { Router, Response } from "express";
import bcrypt from "bcryptjs";
import { User } from "../models/User";
import {
  AuthRequest,
  requireAuth,
  requireAdmin,
  attachUser,
} from "../middleware/auth";

const router = Router();

router.use(requireAuth, attachUser);

router.get("/", requireAdmin, async (_req, res: Response) => {
  const users = await User.findAll({
    attributes: ["id", "email", "name", "role", "createdAt", "updatedAt"],
    order: [["id", "ASC"]],
  });
  res.json(users);
});

router.get("/:id", requireAdmin, async (req, res: Response) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Geçersiz id" });
    return;
  }
  const user = await User.findByPk(id, {
    attributes: ["id", "email", "name", "role", "createdAt", "updatedAt"],
  });
  if (!user) {
    res.status(404).json({ error: "Kullanıcı bulunamadı" });
    return;
  }
  res.json(user);
});

router.post("/", requireAdmin, async (req, res: Response) => {
  const { email, password, name, role } = req.body as {
    email?: string;
    password?: string;
    name?: string;
    role?: "admin" | "editor";
  };
  if (!email || !password || !name) {
    res.status(400).json({ error: "E-posta, şifre ve ad zorunlu" });
    return;
  }
  const exists = await User.findOne({
    where: { email: email.toLowerCase().trim() },
  });
  if (exists) {
    res.status(409).json({ error: "Bu e-posta zaten kayıtlı" });
    return;
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({
    email: email.toLowerCase().trim(),
    passwordHash,
    name: name.trim(),
    role: role === "admin" ? "admin" : "editor",
  });
  res.status(201).json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  });
});

router.patch("/:id", requireAdmin, async (req, res: Response) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Geçersiz id" });
    return;
  }
  const user = await User.findByPk(id);
  if (!user) {
    res.status(404).json({ error: "Kullanıcı bulunamadı" });
    return;
  }
  const { email, password, name, role } = req.body as {
    email?: string;
    password?: string;
    name?: string;
    role?: "admin" | "editor";
  };
  if (email !== undefined) user.email = email.toLowerCase().trim();
  if (name !== undefined) user.name = name.trim();
  if (role !== undefined) user.role = role === "admin" ? "admin" : "editor";
  if (password !== undefined && password.length > 0) {
    user.passwordHash = await bcrypt.hash(password, 10);
  }
  try {
    await user.save();
  } catch {
    res.status(409).json({ error: "E-posta başka bir kullanıcıda kayıtlı olabilir" });
    return;
  }
  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  });
});

router.delete("/:id", requireAdmin, async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Geçersiz id" });
    return;
  }
  if (req.sessionUser?.id === id) {
    res.status(400).json({ error: "Kendi hesabınızı silemezsiniz" });
    return;
  }
  const n = await User.destroy({ where: { id } });
  if (n === 0) {
    res.status(404).json({ error: "Kullanıcı bulunamadı" });
    return;
  }
  res.status(204).send();
});

export default router;
