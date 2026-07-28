import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

export class TransactionLog extends Model {
  declare id: number;
  declare user_id: string;
  declare action_type: string;
  declare details: string | null;
}

TransactionLog.init({
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  user_id: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  action_type: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  details: {
    type: DataTypes.TEXT, // PostgreSQL 및 MySQL 모두 호환되도록 TEXT형 처리 (JSON은 문자열화하여 저장)
    allowNull: true,
  }
}, {
  sequelize,
  modelName: 'TransactionLog',
  tableName: 'transaction_logs',
  timestamps: false,
});