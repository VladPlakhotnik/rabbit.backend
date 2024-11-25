const express = require("express");
const passport = require("passport");
const authenticateToken = require("../middleware/authenticateToken");
const {
  getCurrentUser,
  steamLoginCallback,
  logout,
} = require("../controllers/authController");

const router = express.Router();

// Начало авторизации через Steam
router.get("/steam", passport.authenticate("steam", { session: false }));

// Обработка возврата от Steam
router.get(
  "/steam/return",
  passport.authenticate("steam", { session: false, failureRedirect: "/" }),
  steamLoginCallback
);

// Маршрут выхода
router.get("/logout", logout);

// Fetch current user details
router.get("/me", authenticateToken, getCurrentUser);

module.exports = router;
