const { Restaurant, generateUsername } = require("../modals/Restaurant");
const bcrypt = require("bcryptjs");

exports.createRestaurant = async (req, res, next) => {
  try {
    const {
      restaurant_name,
      ownerName,
      companyName,
      taxId,
      registry,
      registry_number,
      vat_number,
      fax,
      phoneNumber,
      email,
      password,
      isHalal,
      address,
      cuisine_type,
    } = req.body;

    // check if restaurant is already registered with same name and same address
    const existingRestaurant = await Restaurant.findOne({
      restaurant_name: restaurant_name.trim(),
      "address.street": address.street.trim(),
      "address.houseNumber": address.houseNumber.trim(),
      "address.postalCode": address.postalCode.trim(),
      "address.city": address.city.trim(),
      "address.country": address.country?.trim() || "Germany",
    });

    if (existingRestaurant) {
      return res.status(400).json({
        message: "A restaurant with the same name and address already exists.",
      });
    }

    const username = await generateUsername(restaurant_name);

    const exists = await Restaurant.findOne({ email });
    if (exists)
      return res
        .status(400)
        .json({ message: "Email already exists for a restaurant" });

    // 🔐 Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    const restaurant = await Restaurant.create({
      restaurant_name,
      username,
      ownerName,
      companyName,
      taxId,
      registry,
      registry_number,
      vat_number,
      fax,
      phoneNumber,
      email,
      password: hashedPassword,
      isHalal,
      address,
      cuisine_type,
      created_by: req.user._id,
    });

    res.status(201).json({
      message: "Restaurant created successfully",
      restaurant,
    });
  } catch (error) {
    next(error);
  }
};

//get all restaurants
exports.getAllRestaurants = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      order = "desc",
      search = "",
      status,
      cuisine,
      city,
    } = req.query;

    const query = {};

    if (search) {
      query.restaurant_name = { $regex: search, $options: "i" };
    }

    if (status === "active") query.isActive = true;
    else if (status === "inactive") query.isActive = false;

    if (cuisine) query.cuisine_type = cuisine;
    if (city) query["address.city"] = { $regex: city, $options: "i" };

    const total = await Restaurant.countDocuments(query);

    const restaurants = await Restaurant.find(query)
      .select("-password")
      .populate("cuisine_type")
      .sort({ [sortBy]: order === "asc" ? 1 : -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.status(200).json({
      success: true,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / limit),
      restaurants,
    });
  } catch (err) {
    console.error("Get all restaurants error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// get single restaurant by id
exports.getSingleRestaurant = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const restaurant = await Restaurant.findById(restaurantId).select(
      "-password"
    );

    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    res.status(200).json({ success: true, restaurant });
  } catch (err) {
    console.error("❌ Get single restaurant error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// 3️⃣ Toggle isActive (activate/deactivate restaurant)
exports.toggleRestaurantStatus = async (req, res) => {
  try {
    const { restaurantId } = req.params;

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant)
      return res.status(404).json({ message: "Restaurant not found" });

    restaurant.isActive = !restaurant.isActive;

    restaurant.updated_by.push({
      userType: req.user.role,
      userId: req.user._id,
      timestamp: new Date(),
    });

    await restaurant.save();

    res.status(200).json({
      success: true,
      message: `Restaurant is now ${
        restaurant.isActive ? "active" : "inactive"
      }`,
      restaurant: {
        _id: restaurant._id,
        restaurant_name: restaurant.restaurant_name,
        isActive: restaurant.isActive,
      },
    });
  } catch (err) {
    console.error("Toggle status error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// get restaurant menu
exports.getRestaurantMenu = async (req, res) => {
  try {
    const { restaurantId } = req.params;

    const restaurant = await Restaurant.findById(restaurantId).select(
      "restaurant_name menu"
    );
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    res.status(200).json({
      success: true,
      menu: restaurant.menu,
      restaurant_name: restaurant.restaurant_name,
    });
  } catch (err) {
    console.error("❌ Get restaurant menu error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// get restaurant data for logged in restaurant
exports.getSelfRestaurant = async (req, res) => {
  try {
    const restaurant = await Restaurant.findById(req.user._id).select(
      "-password"
    );
    if (!restaurant)
      return res.status(404).json({ message: "Restaurant not found" });

    res.status(200).json({ success: true, restaurant });
  } catch (err) {
    console.error("❌ Get self restaurant error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// update restaurant
exports.updateRestaurant = async (req, res, next) => {
  try {
    const { restaurantId } = req.params;
    const updates = req.body;

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    // Fields allowed to be updated
    const updatableFields = [
      "restaurant_name",
      "ownerName",
      "companyName",
      "taxId",
      "registry",
      "registry_number",
      "vat_number",
      "fax",
      "phoneNumber",
      "isHalal",
      "address.street",
      "address.houseNumber",
      "address.postalCode",
      "address.city",
      "address.country",
      "cuisine_type",
    ];

    for (const field of updatableFields) {
      const fieldParts = field.split(".");
      const value =
        fieldParts.length === 1 ? updates[field] : updates[fieldParts[1]];

      if (value !== undefined) {
        if (typeof value === "string" && value.trim() === "") {
          return res.status(400).json({ message: `${field} cannot be empty` });
        }

        const finalValue = typeof value === "string" ? value.trim() : value;

        if (fieldParts.length === 1) {
          restaurant[fieldParts[0]] = finalValue;
        } else {
          restaurant.address[fieldParts[1]] = finalValue;
        }
      }
    }

    // Log update
    restaurant.updated_by.push({
      userType: req.user.role,
      userId: req.user._id,
    });

    await restaurant.save();

    res.status(200).json({
      success: true,
      message: "Restaurant updated successfully",
      restaurant,
    });
  } catch (error) {
    console.error("❌ Update restaurant error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// check username availability
exports.checkUsernameAvailability = async (req, res) => {
  const { username } = req.body;

  if (!username || typeof username !== "string") {
    return res.status(400).json({ message: "Username is required" });
  }

  const cleanUsername = username.trim().toLowerCase();

  // ✅ Must match allowed pattern
  const isValid = /^[a-z0-9\-]+$/.test(cleanUsername);
  if (!isValid) {
    return res.status(400).json({
      message:
        "Invalid username. Only lowercase letters, numbers, and hyphens are allowed.",
    });
  }

  const exists = await Restaurant.findOne({ username: cleanUsername });
  res.status(200).json({ available: !exists });
};

// change username
exports.changeUsername = async (req, res) => {
  const { restaurantId } = req.params;
  const { newUsername } = req.body;

  if (!newUsername || typeof newUsername !== "string") {
    return res.status(400).json({ message: "New username is required" });
  }

  const cleanUsername = newUsername.trim().toLowerCase();

  // ✅ Validate format
  const isValid = /^[a-z0-9\-]+$/.test(cleanUsername);
  if (!isValid) {
    return res.status(400).json({
      message:
        "Invalid username. Only lowercase letters, numbers, and hyphens are allowed.",
    });
  }

  const exists = await Restaurant.findOne({ username: cleanUsername });
  if (exists) {
    return res
      .status(400)
      .json({ message: "Username already in use. Try another." });
  }

  const restaurant = await Restaurant.findById(restaurantId);
  if (!restaurant) {
    return res.status(404).json({ message: "Restaurant not found" });
  }

  restaurant.username = cleanUsername;
  await restaurant.save();

  res.status(200).json({
    success: true,
    message: "Username updated successfully",
    username: restaurant.username,
  });
};
