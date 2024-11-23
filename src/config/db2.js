const { Pool } = require("pg");

// Настройки подключения
const pool = new Pool({
  user: "droplock_user", // Имя пользователя из нового сервера
  host: "dpg-ct11ujt2ng1s73e3deu0-a.oregon-postgres.render.com", // Хост нового сервера
  database: "droplock", // Имя базы данных на новом сервере
  password: "fWD167Ds6xT1V2eHK5f66j3snydtSQNZ", // Пароль из настроек нового сервера
  port: 5432, // Порт PostgreSQL
  ssl: {
    rejectUnauthorized: false, // Разрешает небезопасные SSL-сертификаты
  },
});

const connectDB2 = async () => {
  try {
    // Проверяем подключение
    await pool.connect();
    console.log("✅ PostgreSQL Connected...");
  } catch (error) {
    console.error("❌ Error connecting to PostgreSQL:", error.message);
    process.exit(1);
  }
};

module.exports = { connectDB2, pool };
