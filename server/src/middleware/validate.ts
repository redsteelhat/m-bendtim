import { NextFunction, Request, Response } from "express";
import { z, ZodType } from "zod";

export { z };

export function validateBody<T>(schema: ZodType<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Geçersiz istek verisi",
        details: parsed.error.issues.map((issue) => issue.message),
      });
      return;
    }
    req.body = parsed.data;
    next();
  };
}

export function trimmedString(label: string, max: number) {
  return z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    z.string().min(1, `${label} gerekli`).max(max, `${label} en fazla ${max} karakter olabilir`)
  );
}

export function optionalTrimmedString(label: string, max: number) {
  return z.preprocess(
    (value) => {
      if (value === undefined) return undefined;
      if (typeof value !== "string") return value;
      const trimmed = value.trim();
      return trimmed === "" ? undefined : trimmed;
    },
    z.string().max(max, `${label} en fazla ${max} karakter olabilir`).optional()
  );
}

export function nullableTrimmedString(label: string, max: number) {
  return z.preprocess(
    (value) => {
      if (value === null || value === undefined) return value;
      if (typeof value !== "string") return value;
      const trimmed = value.trim();
      return trimmed === "" ? null : trimmed;
    },
    z.string().max(max, `${label} en fazla ${max} karakter olabilir`).nullable().optional()
  );
}

export const optionalId = z.preprocess((value) => {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return Number(value);
}, z.number().int("Id tam sayı olmalı").positive("Id pozitif olmalı").nullable().optional());

export const idList = z
  .array(z.coerce.number().int("Id tam sayı olmalı").positive("Id pozitif olmalı"))
  .min(1, "En az bir kayıt seçilmeli");

export const nonNegativeQuantity = z.preprocess((value) => {
  if (value === undefined || value === "") return 0;
  return Number(value);
}, z.number().finite("Miktar geçerli bir sayı olmalı").nonnegative("Miktar negatif olamaz"));

export const positiveQuantity = z.preprocess(
  (value) => Number(value),
  z.number().finite("Miktar geçerli bir sayı olmalı").positive("Miktar sıfırdan büyük olmalı")
);
