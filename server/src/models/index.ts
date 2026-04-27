import { User } from "./User";
import { Machine } from "./Machine";
import { StockItem } from "./StockItem";
import { GoodsReceiptLine } from "./GoodsReceiptLine";
import { Shipment } from "./Shipment";

Machine.hasMany(StockItem, { foreignKey: "machineId", as: "stockItems" });
StockItem.belongsTo(Machine, { foreignKey: "machineId", as: "machine" });

export const models = {
  User,
  Machine,
  StockItem,
  GoodsReceiptLine,
  Shipment,
};

export async function syncModels(): Promise<void> {
  const alter = process.env.NODE_ENV === "development";
  await User.sync({ alter });
  await Machine.sync({ alter });
  await StockItem.sync({ alter });
  await GoodsReceiptLine.sync({ alter });
  await Shipment.sync({ alter });
}
