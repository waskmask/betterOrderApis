const SuggestRestaurant = require("../modals/SuggestRestaurant");
const asyncHandler = require("../utils/asyncHandler");
const { buildDiacriticInsensitiveRegex } = require("../utils/searchNormalize");

// @desc    Submit restaurant suggestion
// @route   POST /api/suggest-restaurant
// @access  Public
const submitSuggestion = asyncHandler(async (req, res) => {
  const { restaurantName, street, houseNumber, postalCode, city, yourName, email } = req.body;

  // Validation
  const errors = {};

  // Validate restaurant name
  if (!restaurantName || !restaurantName.trim()) {
    errors.restaurantName = "Restaurant name is required";
  } else if (restaurantName.trim().length < 2) {
    errors.restaurantName = "Restaurant name must be at least 2 characters";
  } else if (restaurantName.trim().length > 100) {
    errors.restaurantName = "Restaurant name cannot exceed 100 characters";
  }

  // Validate street
  if (!street || !street.trim()) {
    errors.street = "Street is required";
  }

  // Validate house number
  if (!houseNumber || !houseNumber.trim()) {
    errors.houseNumber = "House number is required";
  }

  // Validate postal code
  if (!postalCode || !postalCode.trim()) {
    errors.postalCode = "Postal code is required";
  } else if (!/^[0-9]{4,10}$/.test(postalCode.replace(/\s/g, ""))) {
    errors.postalCode = "Please enter a valid postal code";
  }

  // Validate city
  if (!city || !city.trim()) {
    errors.city = "City is required";
  } else if (city.trim().length < 2) {
    errors.city = "City must be at least 2 characters";
  }

  // Validate your name
  if (!yourName || !yourName.trim()) {
    errors.yourName = "Your name is required";
  } else if (yourName.trim().length < 2) {
    errors.yourName = "Name must be at least 2 characters";
  } else if (yourName.trim().length > 50) {
    errors.yourName = "Name cannot exceed 50 characters";
  } else if (!/^[a-zA-ZÀ-ÿ\u00C0-\u024F\s\-']+$/.test(yourName.trim())) {
    errors.yourName = "Name can only contain letters, spaces, hyphens and apostrophes";
  }

  // Validate email
  if (!email || !email.trim()) {
    errors.email = "Email is required";
  } else {
    const emailRegex = /^[a-zA-Z0-9](?:[a-zA-Z0-9._-]*[a-zA-Z0-9])?@[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z]{2,})+$/;
    if (!emailRegex.test(email.trim()) || email.includes("..") || email.includes(".-") || email.includes("-.")) {
      errors.email = "Please enter a valid email address";
    }
  }

  // Return errors if any
  if (Object.keys(errors).length > 0) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors,
    });
  }

  // Get IP and User Agent for tracking
  const ipAddress = req.ip || req.headers["x-forwarded-for"] || req.connection.remoteAddress;
  const userAgent = req.headers["user-agent"];

  // Check for duplicate suggestion (same restaurant name and postal code)
  const existingSuggestion = await SuggestRestaurant.findOne({
    restaurantName: { $regex: new RegExp(`^${restaurantName.trim()}$`, "i") },
    "address.postalCode": postalCode.trim(),
  });

  if (existingSuggestion) {
    return res.status(200).json({
      success: true,
      message: "Thank you! This restaurant has already been suggested. We're working on it!",
      data: {
        duplicate: true,
      },
    });
  }

  // Create suggestion entry
  const suggestion = await SuggestRestaurant.create({
    restaurantName: restaurantName.trim(),
    address: {
      street: street.trim(),
      houseNumber: houseNumber.trim(),
      postalCode: postalCode.trim(),
      city: city.trim(),
    },
    suggestedBy: {
      name: yourName.trim(),
      email: email.trim().toLowerCase(),
    },
    ipAddress,
    userAgent,
  });

  res.status(201).json({
    success: true,
    message: "Thank you for your suggestion! We will review it and reach out to the restaurant.",
    data: {
      id: suggestion._id,
      restaurantName: suggestion.restaurantName,
    },
  });
});

// @desc    Get all suggestions (Admin)
// @route   GET /api/suggest-restaurant
// @access  Private/Admin
const getAllSuggestions = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 20, search } = req.query;

  const query = {};

  if (status && status !== "all") {
    query.status = status;
  }

  if (search) {
    const searchRegex = buildDiacriticInsensitiveRegex(search);
    if (searchRegex) {
      query.$or = [
        { restaurantName: { $regex: searchRegex } },
        { "suggestedBy.name": { $regex: searchRegex } },
        { "suggestedBy.email": { $regex: searchRegex } },
        { "address.city": { $regex: searchRegex } },
      ];
    }
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [suggestions, total] = await Promise.all([
    SuggestRestaurant.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    SuggestRestaurant.countDocuments(query),
  ]);

  res.json({
    success: true,
    data: suggestions,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit)),
    },
  });
});

// @desc    Get single suggestion (Admin)
// @route   GET /api/suggest-restaurant/:id
// @access  Private/Admin
const getSuggestion = asyncHandler(async (req, res) => {
  const suggestion = await SuggestRestaurant.findById(req.params.id);

  if (!suggestion) {
    return res.status(404).json({
      success: false,
      message: "Suggestion not found",
    });
  }

  res.json({
    success: true,
    data: suggestion,
  });
});

// @desc    Update suggestion status (Admin)
// @route   PATCH /api/suggest-restaurant/:id/status
// @access  Private/Admin
const updateSuggestionStatus = asyncHandler(async (req, res) => {
  const { status, notes } = req.body;

  const validStatuses = ["pending", "contacted", "registered", "rejected", "duplicate"];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      message: "Invalid status",
    });
  }

  const suggestion = await SuggestRestaurant.findById(req.params.id);

  if (!suggestion) {
    return res.status(404).json({
      success: false,
      message: "Suggestion not found",
    });
  }

  suggestion.status = status;
  if (notes) suggestion.notes = notes;
  suggestion.processedAt = new Date();
  suggestion.processedBy = req.user?._id;

  await suggestion.save();

  res.json({
    success: true,
    message: "Suggestion status updated",
    data: suggestion,
  });
});

// @desc    Delete suggestion (Admin)
// @route   DELETE /api/suggest-restaurant/:id
// @access  Private/Admin
const deleteSuggestion = asyncHandler(async (req, res) => {
  const suggestion = await SuggestRestaurant.findById(req.params.id);

  if (!suggestion) {
    return res.status(404).json({
      success: false,
      message: "Suggestion not found",
    });
  }

  await suggestion.deleteOne();

  res.json({
    success: true,
    message: "Suggestion deleted successfully",
  });
});

// @desc    Get suggestion statistics (Admin)
// @route   GET /api/suggest-restaurant/stats
// @access  Private/Admin
const getSuggestionStats = asyncHandler(async (req, res) => {
  const stats = await SuggestRestaurant.aggregate([
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
  ]);

  const totalSuggestions = await SuggestRestaurant.countDocuments();
  const todaySuggestions = await SuggestRestaurant.countDocuments({
    createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
  });

  const formattedStats = {
    total: totalSuggestions,
    today: todaySuggestions,
    pending: 0,
    contacted: 0,
    registered: 0,
    rejected: 0,
    duplicate: 0,
  };

  stats.forEach((stat) => {
    formattedStats[stat._id] = stat.count;
  });

  res.json({
    success: true,
    data: formattedStats,
  });
});

module.exports = {
  submitSuggestion,
  getAllSuggestions,
  getSuggestion,
  updateSuggestionStatus,
  deleteSuggestion,
  getSuggestionStats,
};
