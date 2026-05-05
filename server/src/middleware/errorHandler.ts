import { NextFunction, Request, Response } from "express";
import { BaseError, ValidationError } from "sequelize";
import jwt from "jsonwebtoken";

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: `Endpoint bulunamadı: ${req.method} ${req.path}` });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (res.headersSent) return;

  if (err instanceof ValidationError) {
    res.status(400).json({
      error: "Geçersiz veri",
      details: err.errors.map((item) => item.message),
    });
    return;
  }

  if (err instanceof jwt.JsonWebTokenError) {
    res.status(401).json({ error: "Geçersiz oturum" });
    return;
  }

  if (err instanceof BaseError) {
    console.error("[database]", err);
    res.status(500).json({ error: "Veritabanı işlemi başarısız" });
    return;
  }

  console.error("[unhandled]", err);
  res.status(500).json({ error: "Beklenmeyen sunucu hatası" });
}
