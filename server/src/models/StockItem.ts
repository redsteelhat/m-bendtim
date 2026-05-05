import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
} from "sequelize";
import { sequelize } from "../db";

export type StockProcessStatus = "bekliyor" | "isleniyor" | "tamamlandi";

export class StockItem extends Model<
  InferAttributes<StockItem>,
  InferCreationAttributes<StockItem>
> {
  declare id: CreationOptional<number>;
  declare sku: string;
  declare name: string;
  declare quantity: number;
  declare unit: string;
  declare machineId: CreationOptional<number | null>;
  declare goodsReceiptLineId: CreationOptional<number | null>;
  declare trackingCode: CreationOptional<string | null>;
  declare processStatus: StockProcessStatus;
  declare isShipped: CreationOptional<boolean>;
  declare shippedAt: CreationOptional<Date | null>;
  declare shipDestination: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

StockItem.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    sku: { type: DataTypes.STRING(80), allowNull: false },
    name: { type: DataTypes.STRING(200), allowNull: false },
    quantity: {
      type: DataTypes.DECIMAL(14, 3),
      allowNull: false,
      defaultValue: 0,
    },
    unit: { type: DataTypes.STRING(24), allowNull: false, defaultValue: "adet" },
    machineId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      references: { model: "machines", key: "id" },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    },
    goodsReceiptLineId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      references: { model: "goods_receipt_lines", key: "id" },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    },
    trackingCode: { type: DataTypes.STRING(120), allowNull: true },
    processStatus: {
      type: DataTypes.ENUM("bekliyor", "isleniyor", "tamamlandi"),
      allowNull: false,
      defaultValue: "bekliyor",
    },
    isShipped: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    shippedAt: { type: DataTypes.DATEONLY, allowNull: true },
    shipDestination: { type: DataTypes.STRING(200), allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: "stock_items",
    modelName: "StockItem",
    indexes: [{ fields: ["sku"] }, { fields: ["machineId"] }, { fields: ["goodsReceiptLineId"] }],
  }
);
