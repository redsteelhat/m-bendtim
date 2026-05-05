import "dotenv/config";
import bcrypt from "bcryptjs";
import { sequelize } from "./db";
import { User } from "./models/User";

async function seed(): Promise<void> {
  await sequelize.authenticate();
  await User.sync({ alter: true });
  const isProduction = process.env.NODE_ENV === "production";
  const email =
    process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase() ||
    (isProduction ? "" : "admin@example.com");
  const password = process.env.SEED_ADMIN_PASSWORD?.trim() || (isProduction ? "" : "admin123");
  const name = process.env.SEED_ADMIN_NAME?.trim() || "Yönetici";

  if (!email && !password) {
    console.log("Seed: admin kullanıcısı atlandı");
    await sequelize.close();
    return;
  }

  if (!email || !password) {
    throw new Error("SEED_ADMIN_EMAIL ve SEED_ADMIN_PASSWORD birlikte tanımlanmalı");
  }

  if (
    isProduction &&
    (password === "admin123" ||
      password.toLowerCase().startsWith("change-me") ||
      password.length < 10)
  ) {
    throw new Error("Production seed şifresi güvenli olmalı");
  }

  const existing = await User.findOne({ where: { email } });
  if (existing) {
    console.log("Seed: admin zaten var");
    await sequelize.close();
    return;
  }
  const passwordHash = await bcrypt.hash(password, 10);
  await User.create({
    email,
    passwordHash,
    name,
    role: "admin",
  });
  console.log(`Seed: ${email} oluşturuldu`);
  await sequelize.close();
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
