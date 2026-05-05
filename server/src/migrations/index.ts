import path from "node:path";
import { SequelizeStorage, Umzug } from "umzug";
import { sequelize } from "../db";

const ext = path.extname(__filename);

export const migrator = new Umzug({
  migrations: {
    glob: path.join(__dirname, `*.migration${ext}`),
  },
  context: sequelize.getQueryInterface(),
  storage: new SequelizeStorage({ sequelize }),
  logger: console,
});
