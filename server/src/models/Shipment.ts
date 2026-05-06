import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
} from "sequelize";
import { sequelize } from "../db";

export type ShipmentStatus = "hazirlik" | "sevk_edildi" | "iptal";

export class Shipment extends Model<
  InferAttributes<Shipment>,
  InferCreationAttributes<Shipment>
> {
  declare id: CreationOptional<number>;
  declare shipmentNo: string;
  declare shippedAt: Date;
  declare destination: string;
  declare notes: CreationOptional<string | null>;
  declare status: ShipmentStatus;
  declare createdByUserId: CreationOptional<number | null>;
  declare cancelledAt: CreationOptional<Date | null>;
  declare cancelledByUserId: CreationOptional<number | null>;
  declare cancelReason: CreationOptional<string | null>;
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
    shipmentNo: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    shippedAt: { type: DataTypes.DATEONLY, allowNull: false },
    destination: { type: DataTypes.STRING(240), allowNull: false },
    notes: { type: DataTypes.TEXT, allowNull: true },
    status: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: "sevk_edildi",
      validate: { isIn: [["hazirlik", "sevk_edildi", "iptal"]] },
    },
    createdByUserId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      references: { model: "users", key: "id" },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
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
  { sequelize, tableName: "shipments", modelName: "Shipment" }
);
