import "dotenv/config";
import bcrypt from "bcryptjs";
import { sequelize } from "./db";
import { User } from "./models/User";

async function seed(): Promise<void> {
  await sequelize.authenticate();
  await User.sync({ alter: true });
  const email = "admin@example.com";
  const existing = await User.findOne({ where: { email } });
  if (existing) {
    console.log("Seed: admin zaten var");
    await sequelize.close();
    return;
  }
  const passwordHash = await bcrypt.hash("admin123", 10);
  await User.create({
    email,
    passwordHash,
    name: "Yönetici",
    role: "admin",
  });
  console.log("Seed: admin@example.com / admin123 oluşturuldu");
  await sequelize.close();
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
