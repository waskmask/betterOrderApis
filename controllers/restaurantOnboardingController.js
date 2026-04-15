const RestaurantOnboarding = require("../modals/RestaurantOnboarding");
const asyncHandler = require("../utils/asyncHandler");

// @desc    Submit restaurant onboarding request (Public)
// @route   POST /api/restaurant-onboarding
// @access  Public
const submitOnboarding = asyncHandler(async (req, res) => {
  const {
    restaurant_name,
    contact_name,
    phoneNumber,
    email,
    website,
    street,
    houseNumber,
    postalCode,
    city,
    country,
    notes,
  } = req.body;

  // Validation
  const errors = {};

  // Validate restaurant name
  if (!restaurant_name || !restaurant_name.trim()) {
    errors.restaurant_name = "Restaurant name is required";
  } else if (restaurant_name.trim().length < 2) {
    errors.restaurant_name = "Restaurant name must be at least 2 characters";
  }

  // Validate phone
  if (!phoneNumber || !phoneNumber.trim()) {
    errors.phoneNumber = "Phone number is required";
  } else {
    const digitsOnly = phoneNumber.replace(/\D/g, "");
    if (digitsOnly.length < 10) {
      errors.phoneNumber = "Phone number must have at least 10 digits";
    } else if (digitsOnly.length > 12) {
      errors.phoneNumber = "Phone number cannot exceed 12 digits";
    } else if (!/^[\d\s\-+()]+$/.test(phoneNumber)) {
      errors.phoneNumber = "Please enter a valid phone number";
    }
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

  // Return errors if any
  if (Object.keys(errors).length > 0) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors,
    });
  }

  // Check for existing onboarding with same email (excluding rejected)
  const existingByEmail = await RestaurantOnboarding.findOne({
    email: email.trim().toLowerCase(),
    status: { $nin: ["rejected"] },
  });

  if (existingByEmail) {
    return res.status(200).json({
      success: true,
      message: "Thank you! We have already received a registration request with this email. Our team will contact you soon.",
      data: {
        duplicate: true,
        type: "email",
      },
    });
  }

  // Check for existing onboarding with same restaurant name and postal code (excluding rejected)
  const existingByRestaurant = await RestaurantOnboarding.findOne({
    restaurant_name: { $regex: new RegExp(`^${restaurant_name.trim()}$`, "i") },
    "address.postalCode": postalCode.trim().toLowerCase(),
    status: { $nin: ["rejected"] },
  });

  if (existingByRestaurant) {
    return res.status(200).json({
      success: true,
      message: "Thank you! We have already received a registration request for this restaurant. Our team will contact you soon.",
      data: {
        duplicate: true,
        type: "restaurant",
      },
    });
  }

  // Create onboarding entry
  const onboarding = await RestaurantOnboarding.create({
    restaurant_name: restaurant_name.trim().toLowerCase(),
    contact_name: contact_name?.trim() || "",
    phoneNumber: phoneNumber.trim(),
    email: email.trim().toLowerCase(),
    website: website?.trim() || "",
    address: {
      street: street.trim().toLowerCase(),
      houseNumber: houseNumber.trim(),
      postalCode: postalCode.trim(),
      city: city.trim().toLowerCase(),
      country: country?.trim().toLowerCase() || "germany",
    },
    notes: notes?.trim() || "",
  });

  res.status(201).json({
    success: true,
    message: "Thank you for registering! Our team will contact you within 24-48 hours to schedule a consultation.",
    data: {
      id: onboarding._id,
      restaurant_name: onboarding.restaurant_name,
    },
  });
});

// @desc    Get all onboardings (Admin)
// @route   GET /api/restaurant-onboarding
// @access  Private/Admin
const getAllOnboardings = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 20, search } = req.query;

  const query = {};

  if (status && status !== "all") {
    query.status = status;
  }

  if (search) {
    query.$or = [
      { restaurant_name: { $regex: search, $options: "i" } },
      { contact_name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
      { phoneNumber: { $regex: search, $options: "i" } },
      { "address.city": { $regex: search, $options: "i" } },
    ];
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [onboardings, total] = await Promise.all([
    RestaurantOnboarding.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    RestaurantOnboarding.countDocuments(query),
  ]);

  res.json({
    success: true,
    data: onboardings,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit)),
    },
  });
});

// @desc    Get single onboarding (Admin)
// @route   GET /api/restaurant-onboarding/:id
// @access  Private/Admin
const getOnboarding = asyncHandler(async (req, res) => {
  const onboarding = await RestaurantOnboarding.findById(req.params.id);

  if (!onboarding) {
    return res.status(404).json({
      success: false,
      message: "Onboarding request not found",
    });
  }

  res.json({
    success: true,
    data: onboarding,
  });
});

// @desc    Update onboarding status (Admin)
// @route   PATCH /api/restaurant-onboarding/:id/status
// @access  Private/Admin
const updateOnboardingStatus = asyncHandler(async (req, res) => {
  const { status, notes } = req.body;

  const validStatuses = ["new", "contacted", "demo_scheduled", "onboarding", "registered", "rejected"];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      message: "Invalid status",
    });
  }

  const onboarding = await RestaurantOnboarding.findById(req.params.id);

  if (!onboarding) {
    return res.status(404).json({
      success: false,
      message: "Onboarding request not found",
    });
  }

  onboarding.status = status;
  if (notes !== undefined) onboarding.notes = notes;

  // Track who updated it - keep last 19 and add new one
  onboarding.updated_by = onboarding.updated_by.slice(-19);
  onboarding.updated_by.push({
    userType: req.user?.role || "admin",
    userId: req.user?._id,
    timestamp: new Date(),
  });

  await onboarding.save();

  res.json({
    success: true,
    message: "Onboarding status updated",
    data: onboarding,
  });
});

// @desc    Update onboarding details (Admin)
// @route   PATCH /api/restaurant-onboarding/:id
// @access  Private/Admin
const updateOnboarding = asyncHandler(async (req, res) => {
  const {
    restaurant_name,
    contact_name,
    phoneNumber,
    email,
    website,
    street,
    houseNumber,
    postalCode,
    city,
    country,
    notes,
    status,
  } = req.body;

  const onboarding = await RestaurantOnboarding.findById(req.params.id);

  if (!onboarding) {
    return res.status(404).json({
      success: false,
      message: "Onboarding request not found",
    });
  }

  // Update fields if provided
  if (restaurant_name) onboarding.restaurant_name = restaurant_name.trim().toLowerCase();
  if (contact_name) onboarding.contact_name = contact_name.trim();
  if (phoneNumber) onboarding.phoneNumber = phoneNumber.trim();
  if (email) onboarding.email = email.trim().toLowerCase();
  if (website !== undefined) onboarding.website = website.trim();
  if (notes !== undefined) onboarding.notes = notes.trim();
  if (status) onboarding.status = status;

  // Update address fields
  if (street) onboarding.address.street = street.trim().toLowerCase();
  if (houseNumber) onboarding.address.houseNumber = houseNumber.trim();
  if (postalCode) onboarding.address.postalCode = postalCode.trim();
  if (city) onboarding.address.city = city.trim().toLowerCase();
  if (country) onboarding.address.country = country.trim().toLowerCase();

  // Track who updated it
  onboarding.updated_by = onboarding.updated_by.slice(-19);
  onboarding.updated_by.push({
    userType: req.user?.role || "admin",
    userId: req.user?._id,
    timestamp: new Date(),
  });

  await onboarding.save();

  res.json({
    success: true,
    message: "Onboarding updated successfully",
    data: onboarding,
  });
});

// @desc    Delete onboarding (Admin)
// @route   DELETE /api/restaurant-onboarding/:id
// @access  Private/Admin
const deleteOnboarding = asyncHandler(async (req, res) => {
  const onboarding = await RestaurantOnboarding.findById(req.params.id);

  if (!onboarding) {
    return res.status(404).json({
      success: false,
      message: "Onboarding request not found",
    });
  }

  await onboarding.deleteOne();

  res.json({
    success: true,
    message: "Onboarding deleted successfully",
  });
});

// @desc    Get onboarding statistics (Admin)
// @route   GET /api/restaurant-onboarding/stats
// @access  Private/Admin
const getOnboardingStats = asyncHandler(async (req, res) => {
  const stats = await RestaurantOnboarding.aggregate([
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
  ]);

  const totalOnboardings = await RestaurantOnboarding.countDocuments();
  const todayOnboardings = await RestaurantOnboarding.countDocuments({
    createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
  });
  const thisWeekOnboardings = await RestaurantOnboarding.countDocuments({
    createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
  });

  const formattedStats = {
    total: totalOnboardings,
    today: todayOnboardings,
    thisWeek: thisWeekOnboardings,
    new: 0,
    contacted: 0,
    demo_scheduled: 0,
    onboarding: 0,
    registered: 0,
    rejected: 0,
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
  submitOnboarding,
  getAllOnboardings,
  getOnboarding,
  updateOnboardingStatus,
  updateOnboarding,
  deleteOnboarding,
  getOnboardingStats,
};
