import "dotenv/config";
import { sequelize } from "./db";
import { validateProductionEnv } from "./config/env";
import { migrator } from "./migrations";

async function main(): Promise<void> {
  validateProductionEnv();
  const command = process.argv[2] ?? "up";

  if (command === "up") {
    const migrations = await migrator.up();
    console.log(`Migrations applied: ${migrations.length}`);
  } else if (command === "down") {
    const migrations = await migrator.down();
    console.log(`Migrations reverted: ${migrations.length}`);
  } else if (command === "pending") {
    const migrations = await migrator.pending();
    console.table(migrations.map((m) => ({ name: m.name })));
  } else if (command === "executed") {
    const migrations = await migrator.executed();
    console.table(migrations.map((m) => ({ name: m.name })));
  } else {
    throw new Error("Kullanım: npm run migrate -- up|down|pending|executed");
  }

  await sequelize.close();
}

main().catch(async (error) => {
  console.error(error);
  try {
    await sequelize.close();
  } catch {
    // ignore close errors while reporting original failure
  }
  process.exit(1);
});
