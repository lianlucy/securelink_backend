import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

export class User extends Model {
  declare id: string;
  declare pw: string;
  declare current_mode: string;
  declare is_online: number;
}

User.init({
  id: {
    type: DataTypes.STRING(50),
    primaryKey: true,
  },
  pw: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  current_mode: {
    type: DataTypes.STRING(20),
    defaultValue: 'NONE',
  },
  is_online: {
    type: DataTypes.SMALLINT,
    defaultValue: 0,
  }
}, {
  sequelize,
  modelName: 'User',
  tableName: 'users',
  timestamps: false,
});