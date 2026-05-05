import { User } from "./User";
import { Machine } from "./Machine";
import { StockItem } from "./StockItem";
import { GoodsReceiptLine } from "./GoodsReceiptLine";
import { Shipment } from "./Shipment";
import { AuditLog } from "./AuditLog";
import { StockMovement } from "./StockMovement";

Machine.hasMany(StockItem, { foreignKey: "machineId", as: "stockItems" });
StockItem.belongsTo(Machine, { foreignKey: "machineId", as: "machine" });
User.hasMany(GoodsReceiptLine, { foreignKey: "cancelledByUserId", as: "cancelledGoodsReceipts" });
GoodsReceiptLine.belongsTo(User, { foreignKey: "cancelledByUserId", as: "cancelledByUser" });
GoodsReceiptLine.hasMany(StockItem, { foreignKey: "goodsReceiptLineId", as: "stockItems" });
StockItem.belongsTo(GoodsReceiptLine, { foreignKey: "goodsReceiptLineId", as: "goodsReceiptLine" });
StockItem.hasMany(StockMovement, { foreignKey: "stockItemId", as: "movements" });
StockMovement.belongsTo(StockItem, { foreignKey: "stockItemId", as: "stockItem" });
User.hasMany(StockMovement, { foreignKey: "actorUserId", as: "stockMovements" });
StockMovement.belongsTo(User, { foreignKey: "actorUserId", as: "actorUser" });

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
  await GoodsReceiptLine.sync({ alter });
  await StockItem.sync({ alter });
  await Shipment.sync({ alter });
  await AuditLog.sync({ alter });
  await StockMovement.sync({ alter });
}
