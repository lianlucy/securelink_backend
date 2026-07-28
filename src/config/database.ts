import { Sequelize, Options } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';

let sequelize: Sequelize;

if (isProduction) {
  // 🚀 Render(Production) 배포 환경: PostgreSQL 연결
  const connectionString = process.env.DATABASE_URL;
  
  if (!connectionString) {
    throw new Error("Production 환경이지만 DATABASE_URL 변수가 설정되지 않았습니다.");
  }

  sequelize = new Sequelize(connectionString, {
    dialect: 'postgres',
    protocol: 'postgres',
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    },
    logging: false
  });
} else {
  // 💻 로컬(Development) 환경: MySQL 연결 + Pool 설정 보완
  const dbOptions: Options = {
    username: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'password',
    database: process.env.DB_NAME || 'secure_link_db',
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    dialect: 'mysql',
    
    // 💡 실행된 순수 SQL 쿼리문만 한 줄로 깔끔하게 출력
    logging: (msg) => console.log(`🔍 [SQL] ${msg}`),
    
    // 💡 자동 커넥션 끊김 방지를 위한 Pool 세팅 활성화
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  };

  sequelize = new Sequelize(
    dbOptions.database!,
    dbOptions.username!,
    dbOptions.password,
    dbOptions
  );
}

// ⭕ 파일 최하단에서 깔끔하게 인스턴스 내보내기
export default sequelize;