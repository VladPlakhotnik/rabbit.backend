const express = require("express");
const morgan = require("morgan");
const passport = require("passport");
// const connectDB = require("./config/db");
const { connectDB, pool } = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const caseRoutes = require("./routes/caseRoutes");
const userRoutes = require("./routes/userRoutes");

require("./config/passport");

const app = express();

// Middleware
app.use(express.json());
app.use(morgan("dev"));
app.use(passport.initialize());

connectDB();

// Routes
app.use("/auth", authRoutes);
//app.use("/cases", caseRoutes);
//app.use("/users", userRoutes);

app.get("/cases", async (req, res) => {
  const caseId = req.query.caseId || 4;
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const offset = (page - 1) * limit;

  if (!caseId) {
    return res.status(400).json({
      success: false,
      message: "Не указан caseId",
    });
  }

  try {
    const result = await pool.query(
      `
      SELECT 
          skins.id AS skin_id,
          skins.name AS skin_name,
          skins.imgUrl AS skin_image,
          skins.rarity AS skin_rarity,
          skins.marketPrice AS skin_market_price,
          skinCase.chance AS drop_chance,
          skinCase.hiddenChance AS hidden_drop_chance
      FROM cases
      JOIN skinCase ON cases.id = skinCase.caseId
      JOIN skins ON skinCase.skinId = skins.id
      WHERE cases.id = $1
      LIMIT $2 OFFSET $3;
      `,
      [caseId, limit, offset]
    );

    res.status(200).json({
      success: true,
      data: result.rows,
      pagination: {
        currentPage: page,
        pageSize: limit,
        totalRecords: result.rows.length,
      },
    });
  } catch (error) {
    console.error("Ошибка получения данных:", error.message);
    res.status(500).json({
      success: false,
      message: "Ошибка получения данных",
    });
  }
});

app.get("/users", async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const offset = (page - 1) * limit;
  const name = req.query.name || "";

  try {
    const filteredResult = await pool.query(
      `
      SELECT * 
      FROM users
      WHERE displayName ILIKE $1
      LIMIT $2 OFFSET $3;
      `,
      [`%${name}%`, limit, offset]
    );
    const totalResult = await pool.query("SELECT * FROM users");

    res.status(200).json({
      success: true,
      data: filteredResult.rows,
      pagination: {
        currentPage: page,
        pageSize: limit,
        totalRecords: totalResult.rows.length,
      },
    });
  } catch (error) {
    console.error("Ошибка получения данных:", error.message);
    res.status(500).json({
      success: false,
      message: "Ошибка получения данных",
    });
  }
});

app.get("/", (req, res) => res.send("API is running..."));

module.exports = app;
