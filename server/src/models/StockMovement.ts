import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from "sequelize";
import { sequelize } from "../db";

export type StockMovementType =
  | "mal_kabul"
  | "mal_kabul_iptal"
  | "manual_create"
  | "manual_update"
  | "bulk_update"
  | "machine_assignment"
  | "status_change"
  | "ship"
  | "unship"
  | "ship_destination";

export class StockMovement extends Model<
  InferAttributes<StockMovement>,
  InferCreationAttributes<StockMovement>
> {
  declare id: CreationOptional<number>;
  declare stockItemId: number | null;
  declare actorUserId: number | null;
  declare type: StockMovementType;
  declare sku: string;
  declare name: string | null;
  declare quantityBefore: number | null;
  declare quantityAfter: number | null;
  declare quantityDelta: number;
  declare machineIdBefore: number | null;
  declare machineIdAfter: number | null;
  declare processStatusBefore: string | null;
  declare processStatusAfter: string | null;
  declare isShippedBefore: boolean | null;
  declare isShippedAfter: boolean | null;
  declare shipDestinationBefore: string | null;
  declare shipDestinationAfter: string | null;
  declare referenceType: string | null;
  declare referenceId: string | null;
  declare metadata: Record<string, unknown> | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

StockMovement.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    stockItemId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      references: { model: "stock_items", key: "id" },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    },
    actorUserId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      references: { model: "users", key: "id" },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    },
    type: { type: DataTypes.STRING(40), allowNull: false },
    sku: { type: DataTypes.STRING(80), allowNull: false },
    name: { type: DataTypes.STRING(200), allowNull: true },
    quantityBefore: { type: DataTypes.DECIMAL(14, 3), allowNull: true },
    quantityAfter: { type: DataTypes.DECIMAL(14, 3), allowNull: true },
    quantityDelta: { type: DataTypes.DECIMAL(14, 3), allowNull: false },
    machineIdBefore: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    machineIdAfter: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    processStatusBefore: { type: DataTypes.STRING(40), allowNull: true },
    processStatusAfter: { type: DataTypes.STRING(40), allowNull: true },
    isShippedBefore: { type: DataTypes.BOOLEAN, allowNull: true },
    isShippedAfter: { type: DataTypes.BOOLEAN, allowNull: true },
    shipDestinationBefore: { type: DataTypes.STRING(200), allowNull: true },
    shipDestinationAfter: { type: DataTypes.STRING(200), allowNull: true },
    referenceType: { type: DataTypes.STRING(80), allowNull: true },
    referenceId: { type: DataTypes.STRING(80), allowNull: true },
    metadata: { type: DataTypes.JSONB, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: "stock_movements",
    modelName: "StockMovement",
    indexes: [
      { fields: ["stockItemId"] },
      { fields: ["actorUserId"] },
      { fields: ["sku"] },
      { fields: ["type"] },
      { fields: ["createdAt"] },
    ],
  }
);
