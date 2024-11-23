const Case = require("../models/Case");

// Get all cases
exports.getAllCases = async (req, res) => {
  try {
    const cases = await Case.find().populate("skins"); // Adjust "skins" if it's a valid reference field in the schema
    res.status(200).json(cases);
  } catch (error) {
    console.error("Error fetching cases:", error.message);
    res.status(500).json({ message: "Error fetching cases" });
  }
};

// Get a single case by ID
exports.getCaseById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ message: "Case ID is required" });
    }

    const singleCase = await Case.findById(id);
    if (!singleCase) {
      return res.status(404).json({ message: "Case not found" });
    }

    res.status(200).json(singleCase);
  } catch (error) {
    console.error("Error fetching case:", error.message);
    res.status(500).json({ message: "Error fetching case" });
  }
};

// Create a new case (Admin-only)
exports.createCase = async (req, res) => {
  try {
    const { name, image, price, group, skins } = req.body;

    if (!name || !image || !price) {
      return res
        .status(400)
        .json({ message: "Name, image, and price are required" });
    }

    const newCase = new Case({ name, image, price, group, skins });
    await newCase.save();

    res.status(201).json(newCase);
  } catch (error) {
    console.error("Error creating case:", error.message);
    res.status(500).json({ message: "Error creating case" });
  }
};
