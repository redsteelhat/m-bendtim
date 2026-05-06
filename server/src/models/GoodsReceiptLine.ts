import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
} from "sequelize";
import { sequelize } from "../db";

/** Mal kabul satırı: stokta yalnızca malzeme kodu (makinasız satır) miktarı artırır. */
export class GoodsReceiptLine extends Model<
  InferAttributes<GoodsReceiptLine>,
  InferCreationAttributes<GoodsReceiptLine>
> {
  declare id: CreationOptional<number>;
  declare documentId: CreationOptional<number | null>;
  declare rowNo: CreationOptional<number | null>;
  declare irsaliyeNo: string;
  declare irsaliyeTarihi: Date;
  declare materialCode: string;
  declare materialDescription: string;
  declare quantity: number;
  declare unit: CreationOptional<string>;
  declare isCancelled: CreationOptional<boolean>;
  declare cancelledAt: CreationOptional<Date | null>;
  declare cancelledByUserId: CreationOptional<number | null>;
  declare cancelReason: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

GoodsReceiptLine.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    documentId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      references: { model: "goods_receipt_documents", key: "id" },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    },
    rowNo: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    irsaliyeNo: { type: DataTypes.STRING(64), allowNull: false },
    irsaliyeTarihi: { type: DataTypes.DATEONLY, allowNull: false },
    materialCode: { type: DataTypes.STRING(80), allowNull: false },
    materialDescription: { type: DataTypes.STRING(240), allowNull: false },
    quantity: {
      type: DataTypes.DECIMAL(14, 3),
      allowNull: false,
    },
    unit: { type: DataTypes.STRING(24), allowNull: false, defaultValue: "Adet" },
    isCancelled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    cancelledAt: { type: DataTypes.DATE, allowNull: true },
    cancelledByUserId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      references: { model: "users", key: "id" },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    },
    cancelReason: { type: DataTypes.STRING(500), allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: "goods_receipt_lines",
    modelName: "GoodsReceiptLine",
    indexes: [{ fields: ["documentId"] }, { fields: ["irsaliyeNo"] }],
  }
);
