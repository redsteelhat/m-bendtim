import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
} from "sequelize";
import { sequelize } from "../db";

export type ShipmentStatus = "hazirlik" | "yolda" | "teslim" | "iptal";

export class Shipment extends Model<
  InferAttributes<Shipment>,
  InferCreationAttributes<Shipment>
> {
  declare id: CreationOptional<number>;
  declare documentNo: string;
  declare shippedAt: Date;
  declare destination: string;
  declare notes: CreationOptional<string | null>;
  declare status: ShipmentStatus;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Shipment.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    documentNo: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    shippedAt: { type: DataTypes.DATEONLY, allowNull: false },
    destination: { type: DataTypes.STRING(240), allowNull: false },
    notes: { type: DataTypes.TEXT, allowNull: true },
    status: {
      type: DataTypes.ENUM("hazirlik", "yolda", "teslim", "iptal"),
      allowNull: false,
      defaultValue: "hazirlik",
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: "shipments", modelName: "Shipment" }
);
