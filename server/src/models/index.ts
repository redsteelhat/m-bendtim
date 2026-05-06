import { User } from "./User";
import { Machine } from "./Machine";
import { StockItem } from "./StockItem";
import { GoodsReceiptDocument } from "./GoodsReceiptDocument";
import { GoodsReceiptLine } from "./GoodsReceiptLine";
import { Shipment } from "./Shipment";
import { ShipmentItem } from "./ShipmentItem";
import { AuditLog } from "./AuditLog";
import { StockMovement } from "./StockMovement";
import { sequelize } from "../db";

Machine.hasMany(StockItem, { foreignKey: "machineId", as: "stockItems" });
StockItem.belongsTo(Machine, { foreignKey: "machineId", as: "machine" });
User.hasMany(GoodsReceiptLine, { foreignKey: "cancelledByUserId", as: "cancelledGoodsReceipts" });
GoodsReceiptLine.belongsTo(User, { foreignKey: "cancelledByUserId", as: "cancelledByUser" });
User.hasMany(GoodsReceiptDocument, { foreignKey: "createdByUserId", as: "createdGoodsReceiptDocuments" });
GoodsReceiptDocument.belongsTo(User, { foreignKey: "createdByUserId", as: "createdByUser" });
GoodsReceiptDocument.hasMany(GoodsReceiptLine, { foreignKey: "documentId", as: "lines" });
GoodsReceiptLine.belongsTo(GoodsReceiptDocument, { foreignKey: "documentId", as: "document" });
GoodsReceiptLine.hasMany(StockItem, { foreignKey: "goodsReceiptLineId", as: "stockItems" });
StockItem.belongsTo(GoodsReceiptLine, { foreignKey: "goodsReceiptLineId", as: "goodsReceiptLine" });
StockItem.hasMany(StockMovement, { foreignKey: "stockItemId", as: "movements" });
StockMovement.belongsTo(StockItem, { foreignKey: "stockItemId", as: "stockItem" });
User.hasMany(StockMovement, { foreignKey: "actorUserId", as: "stockMovements" });
StockMovement.belongsTo(User, { foreignKey: "actorUserId", as: "actorUser" });
User.hasMany(AuditLog, { foreignKey: "actorUserId", as: "auditLogs" });
AuditLog.belongsTo(User, { foreignKey: "actorUserId", as: "actorUser" });
User.hasMany(Shipment, { foreignKey: "createdByUserId", as: "createdShipments" });
Shipment.belongsTo(User, { foreignKey: "createdByUserId", as: "createdByUser" });
User.hasMany(Shipment, { foreignKey: "cancelledByUserId", as: "cancelledShipments" });
Shipment.belongsTo(User, { foreignKey: "cancelledByUserId", as: "cancelledByUser" });
Shipment.hasMany(ShipmentItem, { foreignKey: "shipmentId", as: "items" });
ShipmentItem.belongsTo(Shipment, { foreignKey: "shipmentId", as: "shipment" });
StockItem.hasMany(ShipmentItem, { foreignKey: "stockItemId", as: "shipmentItems" });
ShipmentItem.belongsTo(StockItem, { foreignKey: "stockItemId", as: "stockItem" });

export const models = {
  User,
  Machine,
  GoodsReceiptDocument,
  StockItem,
  GoodsReceiptLine,
  Shipment,
  ShipmentItem,
  AuditLog,
  StockMovement,
};

async function applyShipmentStatusCompatFix(): Promise<void> {
  if (sequelize.getDialect() !== "postgres") return;

  await sequelize.query(`
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'shipments'
      AND column_name = 'status'
      AND udt_name = 'enum_shipments_status'
  ) THEN
    ALTER TABLE "shipments" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "shipments"
      ALTER COLUMN "status" TYPE VARCHAR(32) USING
      CASE
        WHEN "status"::TEXT IN ('yolda', 'teslim') THEN 'sevk_edildi'
        WHEN "status"::TEXT IN ('hazirlik', 'sevk_edildi', 'iptal') THEN "status"::TEXT
        ELSE 'sevk_edildi'
      END;
    ALTER TABLE "shipments" ALTER COLUMN "status" SET DEFAULT 'sevk_edildi';
  END IF;
END $$;
  `);
}

export async function syncModels(): Promise<void> {
  const alter = process.env.NODE_ENV === "development";
  await User.sync({ alter });
  await Machine.sync({ alter });
  await GoodsReceiptDocument.sync({ alter });
  await GoodsReceiptLine.sync({ alter });
  await StockItem.sync({ alter });
  await applyShipmentStatusCompatFix();
  await Shipment.sync({ alter });
  await ShipmentItem.sync({ alter });
  await AuditLog.sync({ alter });
  await StockMovement.sync({ alter });
}
