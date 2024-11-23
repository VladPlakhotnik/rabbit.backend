const { Pool } = require("pg");

// Настройки подключения
const pool = new Pool({
  user: "postgres", // Замените на ваше имя пользователя PostgreSQL
  host: "localhost", // Адрес сервера
  database: "deadlockDb", // Название вашей базы данных
  password: "Admin2002", // Пароль, который вы задали при установке PostgreSQL
  port: 5432, // Порт PostgreSQL (по умолчанию 5432)
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
