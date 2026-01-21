const Review = require("../modals/Review");
const { Restaurant } = require("../modals/Restaurant");

// Submit review
exports.submitReview = async (req, res, next) => {
  try {
    const customerId = req.user?._id;
    const { restaurantId, name, email, rating, review } = req.body;

    if (!restaurantId || !name || !email || !rating) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({ message: "Rating must be between 1 and 5" });
    }

    // Verify restaurant exists
    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    // Check if customer already reviewed this restaurant
    const existingReview = await Review.findOne({
      restaurant: restaurantId,
      email: email.toLowerCase().trim(),
    });

    if (existingReview) {
      return res.status(400).json({ message: "You have already reviewed this restaurant" });
    }

    // Create review
    const newReview = await Review.create({
      restaurant: restaurantId,
      customer: customerId || null,
      name,
      email: email.toLowerCase().trim(),
      rating,
      review: review || "",
    });

    res.status(201).json({
      success: true,
      message: "Review submitted successfully",
      data: newReview,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: "You have already reviewed this restaurant" });
    }
    next(error);
  }
};

// Get restaurant reviews
exports.getRestaurantReviews = async (req, res, next) => {
  try {
    const { restaurantId } = req.params;

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Verify restaurant exists
    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    const filter = {
      restaurant: restaurantId,
      isActive: true,
    };

    const [reviews, total] = await Promise.all([
      Review.find(filter)
        .select("name rating review createdAt")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Review.countDocuments(filter),
    ]);

    // Calculate average rating
    const allReviews = await Review.find(filter).select("rating").lean();
    const averageRating =
      allReviews.length > 0
        ? allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length
        : 0;

    res.status(200).json({
      success: true,
      data: {
        reviews,
        averageRating: Math.round(averageRating * 10) / 10,
        totalRatings: allReviews.length,
        total,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};


