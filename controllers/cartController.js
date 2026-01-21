const Cart = require("../modals/Cart");
const { Restaurant } = require("../modals/Restaurant");

// Helper to get or create cart
const getOrCreateCart = async (sessionId, customerId = null) => {
  let cart = await Cart.findOne({
    $or: [
      { sessionId },
      ...(customerId ? [{ customer: customerId }] : []),
    ],
  });

  if (!cart) {
    cart = await Cart.create({
      sessionId,
      customer: customerId || null,
    });
  } else if (customerId && !cart.customer) {
    // Link cart to customer when they log in
    cart.customer = customerId;
    await cart.save();
  }

  return cart;
};

// Add item to cart
exports.addToCart = async (req, res, next) => {
  try {
    const sessionId = req.headers["x-session-id"] || req.cookies?.sessionId || req.user?._id?.toString() || "guest";
    const customerId = req.user?.role === "customer" ? req.user._id : null;

    const {
      restaurantId,
      categoryId,
      itemId,
      itemName,
      itemSize,
      itemPrice,
      quantity,
      dressing,
      freeAddons,
      extraMenu,
      extraMenuPrices,
      notes,
      restaurantNotes,
      postalCode,
    } = req.body;

    // Validate required fields
    if (!restaurantId || !itemName || !itemPrice || !quantity) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Get or create cart
    let cart = await getOrCreateCart(sessionId, customerId);

    // Check if cart already has items from a different restaurant
    if (cart.restaurantId && cart.restaurantId.toString() !== restaurantId) {
      return res.status(400).json({
        message: "Cart already contains items from another restaurant. Please clear cart first.",
      });
    }

    // Calculate totals
    const totalExtraPrice =
      extraMenuPrices?.reduce((sum, price) => sum + (price || 0), 0) || 0;
    const subtotal = itemPrice * quantity;
    const grandTotal = (itemPrice + totalExtraPrice) * quantity;

    // Check if same item already exists in cart
    const existingItemIndex = cart.items.findIndex(
      (item) =>
        item.itemId === itemId &&
        item.itemSize === itemSize &&
        item.dressing === dressing &&
        JSON.stringify(item.freeAddons) === JSON.stringify(freeAddons || []) &&
        JSON.stringify(item.extraMenu) === JSON.stringify(extraMenu || [])
    );

    if (existingItemIndex !== -1) {
      // Update existing item
      const existingItem = cart.items[existingItemIndex];
      existingItem.quantity += quantity;
      existingItem.subtotal = existingItem.itemPrice * existingItem.quantity;
      existingItem.grandTotal =
        (existingItem.itemPrice + existingItem.totalExtraPrice) *
        existingItem.quantity;
    } else {
      // Add new item
      cart.items.push({
        restaurantId,
        categoryId,
        itemId,
        itemName,
        itemSize,
        itemPrice,
        quantity,
        dressing,
        freeAddons: freeAddons || [],
        extraMenu: extraMenu || [],
        extraMenuPrices: extraMenuPrices || [],
        totalExtraPrice,
        subtotal,
        grandTotal,
        notes,
        restaurantNotes,
        postalCode,
      });
    }

    // Update cart restaurant and postal code
    cart.restaurantId = restaurantId;
    if (postalCode) cart.postalCode = postalCode;

    await cart.save();

    res.status(200).json({
      success: true,
      message: "Item added to cart",
      cart: {
        items: cart.items,
        itemCount: cart.items.reduce((sum, item) => sum + item.quantity, 0),
        total: cart.items.reduce((sum, item) => sum + item.grandTotal, 0),
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get cart
exports.getCart = async (req, res, next) => {
  try {
    const sessionId = req.headers["x-session-id"] || req.cookies?.sessionId || req.user?._id?.toString() || `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const customerId = req.user?.role === "customer" ? req.user._id : null;

    const cart = await getOrCreateCart(sessionId, customerId);

    // Populate restaurant info if cart has items
    let restaurant = null;
    if (cart.restaurantId) {
      restaurant = await Restaurant.findById(cart.restaurantId)
        .select("restaurant_name images.logo address delivering_at")
        .lean();
    }

    const total = cart.items.reduce((sum, item) => sum + item.grandTotal, 0);
    const itemCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);

    res.status(200).json({
      success: true,
      data: {
        items: cart.items,
        restaurant,
        itemCount,
        total,
        postalCode: cart.postalCode,
        orderType: cart.orderType,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Remove item from cart
exports.removeCartItem = async (req, res, next) => {
  try {
    const sessionId = req.headers["x-session-id"] || req.cookies?.sessionId || req.user?._id?.toString() || `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const customerId = req.user?.role === "customer" ? req.user._id : null;
    const { itemId } = req.params;

    const cart = await getOrCreateCart(sessionId, customerId);

    cart.items = cart.items.filter(
      (item) => item._id.toString() !== itemId
    );

    // Clear restaurant if no items left
    if (cart.items.length === 0) {
      cart.restaurantId = null;
      cart.postalCode = null;
    }

    await cart.save();

    res.status(200).json({
      success: true,
      message: "Item removed from cart",
      cart: {
        items: cart.items,
        itemCount: cart.items.reduce((sum, item) => sum + item.quantity, 0),
        total: cart.items.reduce((sum, item) => sum + item.grandTotal, 0),
      },
    });
  } catch (error) {
    next(error);
  }
};

// Clear cart
exports.clearCart = async (req, res, next) => {
  try {
    const sessionId = req.headers["x-session-id"] || req.cookies?.sessionId || req.user?._id?.toString() || `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const customerId = req.user?.role === "customer" ? req.user._id : null;

    const cart = await getOrCreateCart(sessionId, customerId);

    cart.items = [];
    cart.restaurantId = null;
    cart.postalCode = null;

    await cart.save();

    res.status(200).json({
      success: true,
      message: "Cart cleared",
    });
  } catch (error) {
    next(error);
  }
};

// Get cart count
exports.getCartCount = async (req, res, next) => {
  try {
    const sessionId = req.headers["x-session-id"] || req.cookies?.sessionId || req.user?._id?.toString() || `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const customerId = req.user?.role === "customer" ? req.user._id : null;

    const cart = await getOrCreateCart(sessionId, customerId);

    const itemCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);

    res.status(200).json({
      success: true,
      count: itemCount,
    });
  } catch (error) {
    next(error);
  }
};

// Update cart item quantity
exports.updateCartItemQuantity = async (req, res, next) => {
  try {
    const sessionId = req.headers["x-session-id"] || req.cookies?.sessionId || req.user?._id?.toString() || `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const customerId = req.user?.role === "customer" ? req.user._id : null;
    const { itemId } = req.params;
    const { quantity } = req.body;

    if (!quantity || quantity < 1) {
      return res.status(400).json({ message: "Invalid quantity" });
    }

    const cart = await getOrCreateCart(sessionId, customerId);

    const item = cart.items.id(itemId);
    if (!item) {
      return res.status(404).json({ message: "Item not found in cart" });
    }

    item.quantity = quantity;
    item.subtotal = item.itemPrice * quantity;
    item.grandTotal = (item.itemPrice + item.totalExtraPrice) * quantity;

    await cart.save();

    res.status(200).json({
      success: true,
      message: "Cart item updated",
      cart: {
        items: cart.items,
        itemCount: cart.items.reduce((sum, item) => sum + item.quantity, 0),
        total: cart.items.reduce((sum, item) => sum + item.grandTotal, 0),
      },
    });
  } catch (error) {
    next(error);
  }
};

