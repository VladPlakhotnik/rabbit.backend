const express = require("express");
const morgan = require("morgan");
const passport = require("passport");
const connectDB = require("./config/db");
const { connectDB2, pool } = require("./config/db2");
const authRoutes = require("./routes/authRoutes");
const caseRoutes = require("./routes/caseRoutes");
const userRoutes = require("./routes/userRoutes");

require("./config/passport");

// Initialize the app
const app = express();

// Middleware
app.use(express.json());
app.use(morgan("dev"));
app.use(passport.initialize());

// Connect to DB
// connectDB();

connectDB2();

// Routes
app.use("/auth", authRoutes);
app.use("/cases", caseRoutes);
app.use("/users", userRoutes);

app.get("/test-data", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM test_table");
    res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error("Ошибка получения данных:", error.message);
    res.status(500).json({
      success: false,
      message: "Ошибка получения данных",
    });
  }
});

// Default route
app.get("/", (req, res) => res.send("API is running..."));

module.exports = app;
