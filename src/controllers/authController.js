const passport = require("passport");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

exports.steamLogin = passport.authenticate("steam", { session: false });

exports.steamLoginCallback = (req, res) => {
  const { user, token } = req.user;

  if (!user || !token) {
    return res.status(400).json({ message: "Authentication failed" });
  }

  res.status(200).json({
    message: "Login successful",
    user,
    token,
  });
};

exports.logout = (req, res) => {
  req.logout((err) => {
    if (err) return res.status(500).json({ message: "Error logging out" });
    res.status(200).json({ message: "Logged out successfully" });
  });
};

exports.getCurrentUser = async (req, res) => {
  try {
    // `req.user` contains data from the JWT token
    const userId = req.user.id;

    // Fetch the user from the database, excluding sensitive fields if needed
    const user = await User.findById(userId).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json(user);
  } catch (error) {
    console.error("Error fetching user:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};
