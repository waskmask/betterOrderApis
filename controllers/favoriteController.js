const Customer = require("../modals/Customer");
const { Restaurant } = require("../modals/Restaurant");

// Add restaurant to favorites
exports.addToFavorites = async (req, res, next) => {
  try {
    const customerId = req.user?._id;
    if (!customerId || req.user.role !== "customer") {
      return res.status(401).json({ message: "Authentication required" });
    }

    const { restaurantId } = req.body;

    if (!restaurantId) {
      return res.status(400).json({ message: "Restaurant ID is required" });
    }

    // Verify restaurant exists
    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    // Check if already in favorites
    if (customer.favorites.includes(restaurantId)) {
      return res.status(400).json({ message: "Restaurant already in favorites" });
    }

    customer.favorites.push(restaurantId);
    await customer.save();

    res.status(200).json({
      success: true,
      message: "Restaurant added to favorites",
    });
  } catch (error) {
    next(error);
  }
};

// Get favorite restaurants
exports.getFavorites = async (req, res, next) => {
  try {
    const customerId = req.user?._id;
    if (!customerId || req.user.role !== "customer") {
      return res.status(401).json({ message: "Authentication required" });
    }

    const customer = await Customer.findById(customerId)
      .populate({
        path: "favorites",
        select: "restaurant_name username customer_id address images logo cover cuisine_type description isHalal delivery take_away opening_hours coordinates",
        populate: {
          path: "cuisine_type",
          select: "name",
        },
      })
      .lean();

    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    res.status(200).json({
      success: true,
      data: customer.favorites || [],
    });
  } catch (error) {
    next(error);
  }
};

// Remove from favorites
exports.removeFromFavorites = async (req, res, next) => {
  try {
    const customerId = req.user?._id;
    if (!customerId || req.user.role !== "customer") {
      return res.status(401).json({ message: "Authentication required" });
    }

    const { restaurantId } = req.params;

    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    customer.favorites = customer.favorites.filter(
      (fav) => fav.toString() !== restaurantId
    );
    await customer.save();

    res.status(200).json({
      success: true,
      message: "Restaurant removed from favorites",
    });
  } catch (error) {
    next(error);
  }
};


