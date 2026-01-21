const Order = require("../modals/Order");
const Cart = require("../modals/Cart");
const { Restaurant } = require("../modals/Restaurant");
const moment = require("moment-timezone");

// Helper to get cart
const getCart = async (sessionId, customerId = null) => {
  return await Cart.findOne({
    $or: [
      { sessionId },
      ...(customerId ? [{ customer: customerId }] : []),
    ],
  });
};

// Place order
exports.placeOrder = async (req, res, next) => {
  try {
    const sessionId = req.headers["x-session-id"] || req.cookies?.sessionId || req.user?._id?.toString() || "guest";
    const customerId = req.user?.role === "customer" ? req.user._id : null;

    const {
      restaurantId,
      customerInfo,
      deliveryInfo,
      orderType,
      paymentMode,
      notes,
      saveUserDetails,
    } = req.body;

    // Get cart
    const cart = await getCart(sessionId, customerId);
    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    if (cart.restaurantId.toString() !== restaurantId) {
      return res.status(400).json({
        message: "Cart items do not match selected restaurant",
      });
    }

    // Get restaurant for delivery charges and discount
    const restaurant = await Restaurant.findById(restaurantId).lean();
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    // Calculate delivery charge
    let deliveryCharge = 0;
    if (orderType === "delivery" && deliveryInfo.postalCode) {
      const deliveryZone = restaurant.delivering_at?.find(
        (zone) => zone.postalCode === deliveryInfo.postalCode
      );
      if (deliveryZone) {
        deliveryCharge = deliveryZone.free ? 0 : deliveryZone.charges || 0;
      }
    }

    // Calculate discount
    let discountPercent = 0;
    let discountAmount = 0;
    if (restaurant.discount) {
      discountPercent = restaurant.discount.value || 0;
      if (restaurant.discount.type === "percentage") {
        const subtotal = cart.items.reduce(
          (sum, item) => sum + item.grandTotal,
          0
        );
        discountAmount = (subtotal * discountPercent) / 100;
      } else {
        discountAmount = discountPercent; // Fixed amount
      }
    }

    // Calculate totals
    const subtotal = cart.items.reduce((sum, item) => sum + item.grandTotal, 0);
    const total = subtotal + deliveryCharge - discountAmount;

    // Get estimate time
    let estimateTime = 30; // Default 30 minutes
    if (orderType === "delivery" && deliveryInfo.postalCode) {
      const deliveryZone = restaurant.delivering_at?.find(
        (zone) => zone.postalCode === deliveryInfo.postalCode
      );
      if (deliveryZone?.delivery_time) {
        estimateTime = parseInt(deliveryZone.delivery_time) || 30;
      }
    }

    // Create order
    const order = await Order.create({
      customer: customerId || null,
      restaurant: restaurantId,
      items: cart.items.map((item) => ({
        menuId: item.restaurantId,
        categoryId: item.categoryId,
        itemId: item.itemId,
        itemName: item.itemName,
        itemSize: item.itemSize,
        itemPrice: item.itemPrice,
        quantity: item.quantity,
        dressing: item.dressing,
        freeAddons: item.freeAddons,
        extraMenu: item.extraMenu,
        extraMenuPrices: item.extraMenuPrices,
        totalExtraPrice: item.totalExtraPrice,
        subtotal: item.subtotal,
        grandTotal: item.grandTotal,
        notes: item.notes,
      })),
      customerInfo: {
        firstname: customerInfo.firstname || "",
        surname: customerInfo.surname,
        email: customerInfo.email,
        phone: customerInfo.phone || "",
        companyName: customerInfo.companyName || "",
      },
      deliveryInfo: {
        address: deliveryInfo.address,
        floor: deliveryInfo.floor || "",
        postalCode: deliveryInfo.postalCode,
        city: deliveryInfo.city || "",
        country: deliveryInfo.country || "Germany",
        coordinates: deliveryInfo.coordinates || null,
      },
      orderType,
      deliveryCharge,
      discountPercent,
      discountAmount,
      subtotal,
      total,
      paymentMode,
      paymentStatus: paymentMode === "cod" ? "pending" : "pending",
      estimateTime,
      notes,
    });

    // Clear cart after order
    cart.items = [];
    cart.restaurantId = null;
    cart.postalCode = null;
    await cart.save();

    // TODO: Save user details if requested
    // TODO: Send notification to restaurant
    // TODO: Send confirmation email to customer

    res.status(201).json({
      success: true,
      message: "Order placed successfully",
      data: order,
    });
  } catch (error) {
    next(error);
  }
};

// Get customer orders
exports.getCustomerOrders = async (req, res, next) => {
  try {
    const customerId = req.user?._id;
    if (!customerId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const filter = { customer: customerId };

    if (req.query.status) {
      filter.status = req.query.status;
    }

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .populate("restaurant", "restaurant_name images.logo address")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Order.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: orders,
      total,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    next(error);
  }
};

// Get order details
exports.getOrderDetails = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const customerId = req.user?._id;

    const order = await Order.findById(orderId)
      .populate("restaurant", "restaurant_name images.logo address phoneNumber email")
      .populate("customer", "firstname surname email phone")
      .lean();

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Check if user has access to this order (only if authenticated)
    if (customerId && order.customer?._id?.toString() !== customerId.toString()) {
      return res.status(403).json({ message: "Access denied" });
    }

    res.status(200).json({
      success: true,
      data: order,
    });
  } catch (error) {
    next(error);
  }
};

// Cancel order
exports.cancelOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const customerId = req.user?._id;
    const { reason } = req.body;

    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Check if user has access to this order (only if authenticated)
    if (customerId && order.customer?.toString() !== customerId.toString()) {
      return res.status(403).json({ message: "Access denied" });
    }
    
    // If not authenticated, allow cancellation by order number or email match
    if (!customerId && req.body.email && order.customerInfo?.email !== req.body.email) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Check if order can be cancelled
    if (order.status === "cancelled") {
      return res.status(400).json({ message: "Order is already cancelled" });
    }

    if (["delivered", "out_for_delivery"].includes(order.status)) {
      return res.status(400).json({
        message: "Order cannot be cancelled at this stage",
      });
    }

    // Update order
    order.status = "cancelled";
    order.cancelledAt = new Date();
    order.cancelledBy = customerId ? "customer" : "admin";
    order.cancellationReason = reason || "";

    // Refund payment if paid
    if (order.paymentStatus === "paid") {
      order.paymentStatus = "refunded";
      // TODO: Process refund through payment gateway
    }

    await order.save();

    // TODO: Send notification to restaurant
    // TODO: Send cancellation email to customer

    res.status(200).json({
      success: true,
      message: "Order cancelled successfully",
      data: order,
    });
  } catch (error) {
    next(error);
  }
};

