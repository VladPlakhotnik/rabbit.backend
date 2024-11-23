const mongoose = require("mongoose");

// Схема для скинов
const SkinSchema = new mongoose.Schema({
  name: { type: String, required: true }, // Название скина
  rarity: { type: String, required: true }, // Редкость скина
  chance: { type: Number, required: true }, // Шанс выпадения (в процентах)
});

// Схема для кейсов
const CaseSchema = new mongoose.Schema({
  name: { type: String, required: true }, // Название кейса
  image: { type: String, required: true }, // URL изображения кейса
  price: { type: Number, required: true }, // Цена кейса
  skins: [SkinSchema], // Список скинов в кейсе
  createdAt: { type: Date, default: Date.now }, // Дата создания
});

module.exports = mongoose.model("Case", CaseSchema);
