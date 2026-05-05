import { User } from "./User";
import { Machine } from "./Machine";
import { StockItem } from "./StockItem";
import { GoodsReceiptLine } from "./GoodsReceiptLine";
import { Shipment } from "./Shipment";
import { AuditLog } from "./AuditLog";
import { StockMovement } from "./StockMovement";

Machine.hasMany(StockItem, { foreignKey: "machineId", as: "stockItems" });
StockItem.belongsTo(Machine, { foreignKey: "machineId", as: "machine" });
StockItem.hasMany(StockMovement, { foreignKey: "stockItemId", as: "movements" });
StockMovement.belongsTo(StockItem, { foreignKey: "stockItemId", as: "stockItem" });

export const models = {
  User,
  Machine,
  StockItem,
  GoodsReceiptLine,
  Shipment,
  AuditLog,
  StockMovement,
};

export async function syncModels(): Promise<void> {
  const alter = process.env.NODE_ENV === "development";
  await User.sync({ alter });
  await Machine.sync({ alter });
  await StockItem.sync({ alter });
  await GoodsReceiptLine.sync({ alter });
  await Shipment.sync({ alter });
  await AuditLog.sync({ alter });
  await StockMovement.sync({ alter });
}
