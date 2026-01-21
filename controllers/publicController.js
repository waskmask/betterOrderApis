const { Restaurant } = require("../modals/Restaurant");
const Cuisine = require("../modals/Cuisine");
const moment = require("moment-timezone");

// Get restaurants by postal code (public)
exports.getRestaurantsByPostalCode = async (req, res, next) => {
  try {
    const { postalCode, orderType } = req.query; // orderType: 'delivery' or 'takeaway'

    if (!postalCode) {
      return res.status(400).json({ message: "Postal code is required" });
    }

    const filter = {
      visibility: true, // Only show visible restaurants
      isActive: true, // Only active restaurants
    };

    // Filter by delivery zones if delivery
    if (orderType === "delivery") {
      filter.delivery = true;
      filter["delivering_at.postalCode"] = postalCode;
    } else if (orderType === "takeaway") {
      filter.take_away = true;
    }

    const restaurants = await Restaurant.find(filter)
      .select(
        "restaurant_name username customer_id address images logo cover cuisine_type description isHalal delivery take_away delivering_at delivery_radius discount opening_hours payment_methods coordinates"
      )
      .populate("cuisine_type", "name")
      .lean();

    // Calculate if restaurant is open now
    const now = moment().tz("Europe/Berlin");
    const currentDay = now.format("dddd").toLowerCase();
    const currentTime = parseFloat(now.format("HH.mm"));

    const restaurantsWithStatus = restaurants.map((restaurant) => {
      const hours = restaurant.opening_hours?.[currentDay];
      let isOpenNow = false;

      if (hours && !hours.ifClosed) {
        const open = parseFloat(hours.opening.replace(":", "."));
        let close = parseFloat(hours.closing.replace(":", "."));
        if (hours.nextDay && currentTime < open) {
          isOpenNow = currentTime < close;
        } else {
          isOpenNow =
            currentTime >= open && (hours.nextDay || currentTime < close);
        }
      }

      // Check break time
      if (isOpenNow && hours.break_from && hours.break_to) {
        const breakFrom = parseFloat(hours.break_from.replace(":", "."));
        const breakTo = parseFloat(hours.break_to.replace(":", "."));
        if (currentTime >= breakFrom && currentTime < breakTo) {
          isOpenNow = false;
        }
      }

      // Filter delivery zones for this postal code
      let deliveryZone = null;
      if (orderType === "delivery" && restaurant.delivering_at) {
        deliveryZone = restaurant.delivering_at.find(
          (zone) => zone.postalCode === postalCode
        );
      }

      return {
        ...restaurant,
        isOpenNow,
        deliveryZone,
        canDeliver: orderType === "delivery" ? !!deliveryZone : true,
      };
    });

    // Filter out restaurants that can't deliver to this postal code
    const filteredRestaurants =
      orderType === "delivery"
        ? restaurantsWithStatus.filter((r) => r.canDeliver)
        : restaurantsWithStatus;

    res.status(200).json({
      success: true,
      data: filteredRestaurants,
      count: filteredRestaurants.length,
    });
  } catch (error) {
    next(error);
  }
};

// Get restaurant details (public)
exports.getRestaurantDetails = async (req, res, next) => {
  try {
    const { restaurantId } = req.params;

    const restaurant = await Restaurant.findById(restaurantId)
      .select(
        "restaurant_name username customer_id address images logo cover cuisine_type description isHalal delivery take_away delivering_at delivery_radius discount opening_hours payment_methods coordinates"
      )
      .populate("cuisine_type", "name")
      .lean();

    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    if (!restaurant.visibility || !restaurant.isActive) {
      return res.status(404).json({ message: "Restaurant not available" });
    }

    // Calculate if restaurant is open now
    const now = moment().tz("Europe/Berlin");
    const currentDay = now.format("dddd").toLowerCase();
    const currentTime = parseFloat(now.format("HH.mm"));

    const hours = restaurant.opening_hours?.[currentDay];
    let isOpenNow = false;

    if (hours && !hours.ifClosed) {
      const open = parseFloat(hours.opening.replace(":", "."));
      let close = parseFloat(hours.closing.replace(":", "."));
      if (hours.nextDay && currentTime < open) {
        isOpenNow = currentTime < close;
      } else {
        isOpenNow =
          currentTime >= open && (hours.nextDay || currentTime < close);
      }
    }

    // Check break time
    if (isOpenNow && hours?.break_from && hours?.break_to) {
      const breakFrom = parseFloat(hours.break_from.replace(":", "."));
      const breakTo = parseFloat(hours.break_to.replace(":", "."));
      if (currentTime >= breakFrom && currentTime < breakTo) {
        isOpenNow = false;
      }
    }

    res.status(200).json({
      success: true,
      data: {
        ...restaurant,
        isOpenNow,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get restaurant menu (public)
exports.getRestaurantMenu = async (req, res, next) => {
  try {
    const { restaurantId } = req.params;

    const restaurant = await Restaurant.findById(restaurantId)
      .select("menu restaurant_name images")
      .lean();

    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    // Filter only active categories and items
    const menu = (restaurant.menu || [])
      .filter((category) => category.isActive)
      .map((category) => ({
        ...category,
        items: (category.items || []).filter((item) => item.isActive),
      }))
      .sort((a, b) => (a.index || 0) - (b.index || 0));

    res.status(200).json({
      success: true,
      data: {
        restaurantName: restaurant.restaurant_name,
        restaurantLogo: restaurant.images?.logo,
        menu,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get all cuisines (public)
exports.getAllCuisines = async (req, res, next) => {
  try {
    const cuisines = await Cuisine.find({ isActive: true })
      .select("name description")
      .sort({ name: 1 })
      .lean();

    res.status(200).json({
      success: true,
      data: cuisines,
    });
  } catch (error) {
    next(error);
  }
};


