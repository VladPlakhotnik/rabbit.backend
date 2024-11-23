const mongoose = require("mongoose");

const SectionSchema = new mongoose.Schema({
  name: { type: String, required: true },
  cases: [{ type: mongoose.Schema.Types.ObjectId, ref: "Case" }],
});

module.exports = mongoose.model("Section", SectionSchema);
