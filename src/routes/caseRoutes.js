const express = require("express");
const {
  getAllCases,
  getCaseById,
  createCase,
} = require("../controllers/caseController");
const authenticateToken = require("../middleware/authenticateToken");
const isAdmin = require("../middleware/isAdmin");

const router = express.Router();

router.get("/", getAllCases);

router.get("/:id", getCaseById);

router.post("/", authenticateToken, isAdmin, createCase);

module.exports = router;
