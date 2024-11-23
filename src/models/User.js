const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  steamId: { type: String, required: true, unique: true }, // Steam ID
  personaname: { type: String, required: true }, // Никнейм в Steam
  profileUrl: { type: String }, // URL профиля в Steam
  avatar: { type: String }, // Ссылка на аватар
  avatarhash: { type: String }, // Хэш аватара
  lastlogoff: { type: Number }, // Последний выход
  realname: { type: String }, // Настоящее имя
  timecreated: { type: Number }, // Время создания профиля
  loccountrycode: { type: String }, // Код страны
  steamIdentifier: { type: String }, // Поле "id"
  displayName: { type: String }, // Отображаемое имя
  photos: [{ type: String }], // Массив ссылок на аватары
  balance: { type: Number, default: 0 }, // Баланс пользователя
  openedCases: { type: Number, default: 0 }, // Количество открытых кейсов
  createdAt: { type: Date, default: Date.now }, // Дата создания записи
  role: { type: String, enum: ["user", "admin"], default: "user" }, // Роли
});

module.exports = mongoose.model("User", UserSchema);
