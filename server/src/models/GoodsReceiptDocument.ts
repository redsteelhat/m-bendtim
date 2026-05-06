import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
} from "sequelize";
import { sequelize } from "../db";

export type GoodsReceiptSource = "manual" | "pdf";

export class GoodsReceiptDocument extends Model<
  InferAttributes<GoodsReceiptDocument>,
  InferCreationAttributes<GoodsReceiptDocument>
> {
  declare id: CreationOptional<number>;
  declare documentNo: string;
  declare documentDate: Date;
  declare source: GoodsReceiptSource;
  declare sourceFileName: CreationOptional<string | null>;
  declare sourceFileSha256: CreationOptional<string | null>;
  declare createdByUserId: CreationOptional<number | null>;
  declare rawParseJson: CreationOptional<Record<string, unknown> | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

GoodsReceiptDocument.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    documentNo: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    documentDate: { type: DataTypes.DATEONLY, allowNull: false },
    source: {
      type: DataTypes.STRING(24),
      allowNull: false,
      defaultValue: "manual",
      validate: { isIn: [["manual", "pdf"]] },
    },
    sourceFileName: { type: DataTypes.STRING(255), allowNull: true },
    sourceFileSha256: { type: DataTypes.STRING(64), allowNull: true },
    createdByUserId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      references: { model: "users", key: "id" },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    },
    rawParseJson: { type: DataTypes.JSONB, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: "goods_receipt_documents",
    modelName: "GoodsReceiptDocument",
    indexes: [{ unique: true, fields: ["documentNo"] }, { fields: ["documentDate"] }],
  }
);
