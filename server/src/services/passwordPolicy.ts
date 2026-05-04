import bcrypt from "bcryptjs";

export function validatePassword(password: string, production = process.env.NODE_ENV === "production"): string | null {
  const minLength = production ? 10 : 8;
  if (password.length < minLength) return `Şifre en az ${minLength} karakter olmalı`;
  if (production && !/[A-Z]/.test(password)) return "Şifre en az bir büyük harf içermeli";
  if (production && !/[a-z]/.test(password)) return "Şifre en az bir küçük harf içermeli";
  if (production && !/[0-9]/.test(password)) return "Şifre en az bir rakam içermeli";
  if (production && !/[^A-Za-z0-9]/.test(password)) return "Şifre en az bir özel karakter içermeli";
  return null;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}
