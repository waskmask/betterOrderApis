const Cuisine = require("../modals/Cuisine");

// Create Cuisine
exports.createCuisine = async (req, res, next) => {
  try {
    const { name, description } = req.body;

    const exists = await Cuisine.findOne({ name: name.trim().toLowerCase() });
    if (exists)
      return res.status(400).json({ message: "Cuisine already exists" });

    const cuisine = await Cuisine.create({
      name: name.trim().toLowerCase(),
      description,
    });
    res
      .status(201)
      .json({ message: "Cuisine created", cuisine, success: true });
  } catch (err) {
    next(err);
  }
};

// Update Cuisine
exports.updateCuisine = async (req, res, next) => {
  try {
    const { name, description, isActive } = req.body;
    const lowercaseName = name.trim().toLowerCase();

    // 🛑 Check if another cuisine with the same name exists
    const exists = await Cuisine.findOne({
      name: lowercaseName,
      _id: { $ne: req.params.id }, // Exclude current cuisine
    });

    if (exists) {
      return res.status(400).json({ message: "Cuisine already exists" });
    }

    // ✅ Proceed to update
    const cuisine = await Cuisine.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          name: lowercaseName,
          description,
          isActive: isActive === true || isActive === "true", // ✅ convert string to boolean if needed
        },
      },
      { new: true }
    );

    if (!cuisine) return res.status(404).json({ message: "Cuisine not found" });

    res
      .status(200)
      .json({ message: "Cuisine updated", cuisine, success: true });
  } catch (err) {
    next(err);
  }
};

// List all Cuisines
exports.getAllCuisines = async (req, res, next) => {
  try {
    const cuisines = await Cuisine.find({}).sort({ name: 1 });
    res.status(200).json({ cuisines });
  } catch (err) {
    next(err);
  }
};

// Delete Cuisine
exports.deleteCuisine = async (req, res, next) => {
  try {
    const cuisine = await Cuisine.findByIdAndDelete(req.params.id);
    if (!cuisine) return res.status(404).json({ message: "Cuisine not found" });

    res.status(200).json({ message: "Cuisine deleted" });
  } catch (err) {
    next(err);
  }
};
