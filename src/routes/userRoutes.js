const express = require("express");
const {
  getUserById,
  getCurrentUser,
} = require("../controllers/userController");
const authenticateToken = require("../middleware/authenticateToken");

const router = express.Router();

// Эндпоинт для получения пользователя по ID
router.get("/:id", authenticateToken, getUserById);

router.get("/me", authenticateToken, getCurrentUser);

module.exports = router;
