import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

export class SignalQueue extends Model {
  declare idx: number;
  declare sender_id: string;
  declare target_id: string;
  declare type: string;
  declare from: string;
  declare content: string;
  declare is_fetched: number;
}

SignalQueue.init({
  idx: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  sender_id: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  target_id: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  type: {
    type: DataTypes.STRING(10),
    allowNull: false,
  },
  from: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  is_fetched: {
    type: DataTypes.TINYINT,
    defaultValue: 0,
  }
}, {
  sequelize,
  modelName: 'SignalQueue',
  tableName: 'signal_queue',
  timestamps: false,
});