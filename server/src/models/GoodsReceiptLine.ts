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
  declare irsaliyeNo: string;
  declare irsaliyeTarihi: Date;
  declare materialCode: string;
  declare materialDescription: string;
  declare quantity: number;
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
    irsaliyeNo: { type: DataTypes.STRING(64), allowNull: false },
    irsaliyeTarihi: { type: DataTypes.DATEONLY, allowNull: false },
    materialCode: { type: DataTypes.STRING(80), allowNull: false },
    materialDescription: { type: DataTypes.STRING(240), allowNull: false },
    quantity: {
      type: DataTypes.DECIMAL(14, 3),
      allowNull: false,
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: "goods_receipt_lines", modelName: "GoodsReceiptLine" }
);
