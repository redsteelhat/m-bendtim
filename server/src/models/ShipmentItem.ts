import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from "sequelize";
import { sequelize } from "../db";

export class ShipmentItem extends Model<
  InferAttributes<ShipmentItem>,
  InferCreationAttributes<ShipmentItem>
> {
  declare id: CreationOptional<number>;
  declare shipmentId: number;
  declare stockItemId: number;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

ShipmentItem.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    shipmentId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: { model: "shipments", key: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },
    stockItemId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: { model: "stock_items", key: "id" },
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: "shipment_items",
    modelName: "ShipmentItem",
    indexes: [
      { fields: ["shipmentId"] },
      { fields: ["stockItemId"] },
      { unique: true, fields: ["shipmentId", "stockItemId"] },
    ],
  }
);
