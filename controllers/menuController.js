const { Restaurant, RestaurantLog } = require("../modals/Restaurant");
const path = require("path");
const fs = require("fs");

// Add Category (with image support)
exports.addCategory = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    let { category_name, category_desc, index } = req.body;

    if (!category_name || !category_name.trim()) {
      return res.status(400).json({ message: "category_name_is_required" });
    }

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: "restaurant_not_found" });
    }

    const duplicate = restaurant.menu.find(
      (cat) =>
        cat.category_name.trim().toLowerCase() ===
        category_name.trim().toLowerCase()
    );

    if (duplicate) {
      return res.status(400).json({ message: "category_name_already_exists" });
    }

    const category = {
      category_name: category_name.trim(),
      category_desc,
      index: typeof index === "number" ? index : restaurant.menu.length,
      category_image: req.categoryImagePath || undefined,
    };

    restaurant.menu.push(category);
    await restaurant.save();
    console.log("Image path assigned:", req.categoryImagePath);

    res.status(201).json({
      success: true,
      message: "category_added",
      category: restaurant.menu[restaurant.menu.length - 1],
    });
  } catch (error) {
    console.error("Add category error:", error);
    res.status(500).json({ success: false, message: "server_error" });
  }
};

// Get Single Category by restaurantId and categoryId
exports.getSingleCategory = async (req, res) => {
  try {
    const { restaurantId, categoryId } = req.params;

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: "restaurant_not_found" });
    }

    const category = restaurant.menu.id(categoryId);
    if (!category) {
      return res.status(404).json({ message: "category_not_found" });
    }

    // Convert Mongoose subdocument to plain JS object
    const categoryObj = JSON.parse(JSON.stringify(category));

    // 🔁 Normalize item prices
    if (Array.isArray(categoryObj.items)) {
      categoryObj.items = categoryObj.items.map((item) => {
        if (Array.isArray(item.price)) {
          item.price = item.price.map((p) => ({
            ...p,
            item_price:
              typeof p.item_price === "string"
                ? parseFloat(p.item_price.replace(",", "."))
                : p.item_price,
          }));
        }
        return item;
      });
    }

    // 🔁 Normalize addon option prices
    if (Array.isArray(categoryObj.addons)) {
      categoryObj.addons = categoryObj.addons.map((addon) => {
        if (Array.isArray(addon.options)) {
          addon.options = addon.options.map((opt) => ({
            ...opt,
            addon_price:
              typeof opt.addon_price === "string"
                ? parseFloat(opt.addon_price.replace(",", "."))
                : opt.addon_price,
          }));
        }
        return addon;
      });
    }

    // 🔁 Normalize extra menu prices
    if (categoryObj.extra_menu?.extras) {
      categoryObj.extra_menu.extras = categoryObj.extra_menu.extras.map(
        (extra) => {
          if (Array.isArray(extra.prices)) {
            extra.prices = extra.prices.map((p) => ({
              ...p,
              price:
                typeof p.price === "string"
                  ? parseFloat(p.price.replace(",", "."))
                  : p.price,
            }));
          }
          return extra;
        }
      );
    }

    res.status(200).json({
      success: true,
      category: categoryObj,
    });
  } catch (error) {
    console.error("❌ getSingleCategory error:", error);
    res.status(500).json({ success: false, message: "server_error" });
  }
};

//sort categories
exports.sortCategories = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const { sortedIds } = req.body;

    if (!Array.isArray(sortedIds)) {
      return res.status(400).json({ message: "sortedIds_must_be_an_array" });
    }

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: "restaurant_not_found" });
    }

    // Reorder restaurant.menu based on sortedIds
    const newMenu = sortedIds
      .map((id) => restaurant.menu.find((cat) => cat._id.toString() === id))
      .filter((cat) => cat); // Remove undefined entries
    restaurant.menu = newMenu;

    await restaurant.save();
    res.status(200).json({
      success: true,
      message: "categories_sorted",
      menu: restaurant.menu,
    });
  } catch (err) {
    console.error("sort_error:", err);
    res.status(500).json({ message: "server_error" });
  }
};

// Update Category (with image replace)
exports.updateCategory = async (req, res) => {
  try {
    const { restaurantId, categoryId } = req.params;
    const { category_name, category_desc, removeImage } = req.body;

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: "restaurant_not_found" });
    }

    const category = restaurant.menu.id(categoryId);
    if (!category) {
      return res.status(404).json({ message: "category_not_found" });
    }

    // ✅ Check duplicate name
    if (category_name) {
      const duplicate = restaurant.menu.find(
        (cat) =>
          cat._id.toString() !== categoryId &&
          cat.category_name.trim().toLowerCase() ===
            category_name.trim().toLowerCase()
      );

      if (duplicate) {
        return res
          .status(400)
          .json({ message: "category_name_already_exists" });
      }

      category.category_name = category_name.trim();
    }

    // ✅ Update category_desc (handle empty strings)
    if (category_desc !== undefined) {
      category.category_desc = category_desc;
    }

    // ✅ Handle image removal
    // Check for both string "true" and boolean true
    if (
      (removeImage === "true" || removeImage === true) &&
      category.category_image
    ) {
      const imagePath = path.join(__dirname, "..", category.category_image);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath); // 🧹 delete old image
      }
      category.category_image = undefined;
    }

    // ✅ Handle image replacement
    if (req.categoryImagePath) {
      // Delete old image
      if (category.category_image) {
        const oldImagePath = path.join(
          __dirname,
          "..",
          category.category_image
        );
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }
      category.category_image = req.categoryImagePath;
    }

    await restaurant.save();
    res.status(200).json({
      success: true,
      message: "category_updated",
      category,
    });
  } catch (error) {
    console.error("update_category_error:", error);
    res.status(500).json({ success: false, message: "server_error" });
  }
};

// toggel menu category active or inactive
exports.toggleCategoryActiveStatus = async (req, res) => {
  try {
    const { restaurantId, categoryId } = req.params;

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: "restaurant_not_found" });
    }

    const category = restaurant.menu.id(categoryId);
    if (!category) {
      return res.status(404).json({ message: "category_not_found" });
    }

    category.isActive = !category.isActive;
    await restaurant.save();
    // Return message without spaces
    const message = category.isActive
      ? "category_is_now_active"
      : "category_is_now_inactive";

    res.status(200).json({
      success: true,
      message,
      category,
    });
  } catch (err) {
    console.error("❌ Toggle category error:", err);
    res.status(500).json({ message: "server_error", success: false });
  }
};

// Delete Category (also remove image)
exports.deleteCategory = async (req, res) => {
  try {
    const { restaurantId, categoryId } = req.params;

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: "restaurant_not_found" });
    }

    const category = restaurant.menu.id(categoryId);
    if (!category) {
      return res.status(404).json({ message: "category_not_found" });
    }

    // Prevent deletion if items exist
    if (category.items && category.items.length > 0) {
      return res.status(400).json({
        message: "cannot_delete_category_with_menu_items.",
      });
    }

    // ✅ Remove image if exists
    if (category.category_image) {
      const imagePath = path.join(__dirname, "../", category.category_image);
      if (fs.existsSync(imagePath)) {
        try {
          fs.unlinkSync(imagePath);
        } catch (err) {
          console.warn("⚠️ Failed to delete image:", err.message);
        }
      }
    }

    // ✅ Log deletion
    await RestaurantLog.create({
      restaurant: restaurantId,
      log_type: "category_deleted",
      data: {
        categoryId: category._id.toString(),
        categoryName: category.category_name,
      },
      deleted_by: {
        userType: req.user.role,
        userId: req.user._id,
      },
    });

    // ✅ Remove from restaurant.menu array
    restaurant.menu.pull({ _id: categoryId });
    await restaurant.save();

    res.status(200).json({
      success: true,
      message: "category_deleted",
    });
  } catch (error) {
    console.error("❌ Delete category error:", error);
    res.status(500).json({ success: false, message: "server_error" });
  }
};

// add menu item
exports.addMenuItem = async (req, res) => {
  try {
    const { restaurantId, categoryId } = req.params;
    const { item_name, item_desc, price, isActive } = req.body;

    if (!item_name || !Array.isArray(price) || price.length === 0) {
      return res.status(400).json({ message: "item_name_price_required" });
    }

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: "restaurant_not_found" });
    }

    const category = restaurant.menu.id(categoryId);
    if (!category) {
      return res.status(404).json({ message: "category_not_found" });
    }

    // ✅ Check for duplicate item name in this category
    const duplicateItem = category.items.find(
      (item) =>
        item.item_name.trim().toLowerCase() === item_name.trim().toLowerCase()
    );
    if (duplicateItem) {
      return res
        .status(400)
        .json({ message: "item_name_already_exists_category" });
    }

    // ✅ Convert price & check for duplicate sizes
    const normalizedPrices = [];
    const seenSizes = new Set();

    for (const entry of price) {
      if (!entry.item_size || !entry.item_price) {
        return res
          .status(400)
          .json({ message: "each_price_must_include_size_and_price" });
      }

      const size = entry.item_size.trim();
      if (seenSizes.has(size.toLowerCase())) {
        return res
          .status(400)
          .json({ message: `Duplicate size "${size}" is not allowed` });
      }

      seenSizes.add(size.toLowerCase());

      const normalizedPrice = parseFloat(
        typeof entry.item_price === "string"
          ? entry.item_price.replace(",", ".")
          : entry.item_price
      );

      if (isNaN(normalizedPrice)) {
        return res
          .status(400)
          .json({ message: `invalid_price_value: "${entry.item_price}"` });
      }

      normalizedPrices.push({
        item_size: size,
        item_price: normalizedPrice,
      });
    }

    // ✅ Auto-generate index
    const newItem = {
      item_name: item_name.trim(),
      item_desc,
      price: normalizedPrices,
      index: category.items.length, // 👈 auto-increment based on item count
      isActive: isActive !== false, // default true
    };

    category.items.push(newItem);
    // ✅ Update count_of_prices dynamically
    const maxPriceLength = Math.max(
      ...category.items.map((i) => i.price.length)
    );
    category.count_of_prices = maxPriceLength;
    6;
    await restaurant.save();

    res.status(201).json({
      success: true,
      message: "menu_item_added",
      item: newItem,
    });
  } catch (error) {
    console.error("❌ Add menu item error:", error);
    res.status(500).json({ message: "server_error", success: false });
  }
};

//sort menu item
exports.sortMenuItems = async (req, res) => {
  try {
    const { restaurantId, categoryId } = req.params;
    const { sortedIds } = req.body;

    if (!Array.isArray(sortedIds)) {
      return res.status(400).json({ message: "sortedIds must be an array" });
    }

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant)
      return res.status(404).json({ message: "Restaurant not found" });

    const category = restaurant.menu.id(categoryId);
    if (!category)
      return res.status(404).json({ message: "Category not found" });

    category.items.forEach((item) => {
      const newIndex = sortedIds.indexOf(item._id.toString());
      if (newIndex > -1) {
        item.index = newIndex;
      }
    });

    await restaurant.save();
    res
      .status(200)
      .json({ success: true, message: "Items sorted", items: category.items });
  } catch (err) {
    console.error("Sort items error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// update menu item
exports.updateMenuItem = async (req, res) => {
  try {
    const { restaurantId, categoryId, itemId } = req.params;
    const { item_name, item_desc, price, isActive } = req.body;

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant)
      return res.status(404).json({ message: "restaurant_not_found" });

    const category = restaurant.menu.id(categoryId);
    if (!category)
      return res.status(404).json({ message: "category_not_found" });

    const item = category.items.id(itemId);
    if (!item) return res.status(404).json({ message: "menu_item_not_found" });

    // ✅ Check for duplicate item name (if updating)
    if (
      item_name &&
      item_name.trim().toLowerCase() !== item.item_name.trim().toLowerCase()
    ) {
      const exists = category.items.find(
        (i) =>
          i._id.toString() !== itemId &&
          i.item_name.trim().toLowerCase() === item_name.trim().toLowerCase()
      );
      if (exists) {
        return res
          .status(400)
          .json({ message: "Item name already exists in this category" });
      }
      item.item_name = item_name.trim();
    }

    if (item_desc !== undefined) item.item_desc = item_desc;
    if (typeof isActive === "boolean") item.isActive = isActive;

    // ✅ If price is being updated
    if (price) {
      if (!Array.isArray(price) || price.length === 0) {
        return res
          .status(400)
          .json({ message: "price_must_be_a_non_empty_array" });
      }

      const normalizedPrices = [];
      const seenSizes = new Set();

      for (const entry of price) {
        if (!entry.item_size || !entry.item_price) {
          return res
            .status(400)
            .json({ message: "each_price_must_include_size_and_price" });
        }

        const size = entry.item_size.trim();
        if (seenSizes.has(size.toLowerCase())) {
          return res
            .status(400)
            .json({ message: `Duplicate size "${size}" is not allowed` });
        }

        seenSizes.add(size.toLowerCase());

        const normalizedPrice = parseFloat(
          typeof entry.item_price === "string"
            ? entry.item_price.replace(",", ".")
            : entry.item_price
        );

        if (isNaN(normalizedPrice)) {
          return res
            .status(400)
            .json({ message: `Invalid price value: "${entry.item_price}"` });
        }

        normalizedPrices.push({ item_size: size, item_price: normalizedPrice });
      }

      item.price = normalizedPrices;

      // ✅ Update count_of_prices dynamically
      const maxPriceLength = Math.max(
        ...category.items.map((i) => i.price.length)
      );
      category.count_of_prices = maxPriceLength;
    }

    await restaurant.save();

    res.status(200).json({
      success: true,
      message: "menu_item_updated",
      item,
    });
  } catch (error) {
    console.error("❌ Update menu item error:", error);
    res.status(500).json({ message: "server_error", success: false });
  }
};

// toggel menu item active or inactive
exports.toggleItemActiveStatus = async (req, res) => {
  try {
    const { restaurantId, categoryId, itemId } = req.params;

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant)
      return res.status(404).json({ message: "Restaurant not found" });

    const category = restaurant.menu.id(categoryId);
    if (!category)
      return res.status(404).json({ message: "Category not found" });

    const item = category.items.id(itemId);
    if (!item) return res.status(404).json({ message: "Menu item not found" });

    item.isActive = !item.isActive;
    await restaurant.save();
    // Return message without spaces
    const message = item.isActive
      ? "item_is_now_active"
      : "item_is_now_inactive";
    res.status(200).json({
      success: true,
      message,
      item,
    });
  } catch (err) {
    console.error("❌ Toggle item error:", err);
    res.status(500).json({ message: "Server error", success: false });
  }
};

// add extra menu
exports.addExtraMenu = async (req, res) => {
  try {
    const { restaurantId, categoryId } = req.params;
    const { label, prices } = req.body;

    if (!label || !Array.isArray(prices)) {
      return res
        .status(400)
        .json({ message: "label_and_atleast-1_price_required" });
    }

    const restaurant = await Restaurant.findById(restaurantId);
    const category = restaurant?.menu.id(categoryId);

    if (!category)
      return res.status(404).json({ message: "category_not_found" });

    // ✅ Check for duplicate label (case-insensitive)
    const isDuplicate = category.extra_menu.extras.some(
      (extra) => extra.label.trim().toLowerCase() === label.trim().toLowerCase()
    );
    if (isDuplicate) {
      return res.status(400).json({ message: "extra_with_this_name_exist" });
    }

    // ✅ Normalize each price object (comma/dot fix)
    const normalizedPrices = prices.map((p) => {
      const rawPrice = p?.price;

      const parsed =
        typeof rawPrice === "string"
          ? parseFloat(rawPrice.replace(",", "."))
          : rawPrice;

      if (isNaN(parsed)) {
        throw new Error(`Invalid price value: "${rawPrice}"`);
      }

      return { price: parsed };
    });

    // ✅ Ensure extra_menu is initialized
    if (!category.extra_menu) {
      category.extra_menu = { extras: [] };
    }

    category.extra_menu.extras.push({
      label: label.trim(),
      isActive: true,
      prices: normalizedPrices,
    });

    await restaurant.save();
    res.status(201).json({
      success: true,
      message: "extra_added",
      extras: category.extra_menu.extras,
    });
  } catch (err) {
    console.error("❌ Add extra error:", err);
    res.status(500).json({ message: "server_error" });
  }
};

// get extra menu
exports.getExtraMenu = async (req, res) => {
  try {
    const { restaurantId, categoryId } = req.params;

    const restaurant = await Restaurant.findById(restaurantId);
    const category = restaurant?.menu.id(categoryId);

    if (!category)
      return res.status(404).json({ message: "Category not found" });

    res.status(200).json({
      success: true,
      extras: category.extra_menu.extras,
      count: category.extra_menu.extras.length,
    });
  } catch (err) {
    console.error("❌ Get extra menu error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// update extra menu
exports.updateExtraMenu = async (req, res) => {
  try {
    const { restaurantId, categoryId } = req.params;
    const { extraId, label, prices, isActive } = req.body;

    const restaurant = await Restaurant.findById(restaurantId);
    const category = restaurant?.menu.id(categoryId);
    if (!category) {
      return res.status(404).json({ message: "category_not_found" });
    }

    const extra = category.extra_menu.extras.id(extraId);
    if (!extra) {
      return res.status(404).json({ message: "extra_not_found" });
    }

    // ✅ Check for duplicate label (excluding current)
    if (
      label &&
      category.extra_menu.extras.some(
        (e) =>
          e._id.toString() !== extraId &&
          e.label.toLowerCase() === label.toLowerCase()
      )
    ) {
      return res.status(400).json({ message: "extra_with_this_name_exist" });
    }

    // Update label if provided
    if (label) extra.label = label.trim();

    // ✅ Normalize and update prices if provided
    if (prices && Array.isArray(prices)) {
      const normalizedPrices = prices.map((p) => {
        const rawPrice = p?.price;
        const parsed =
          typeof rawPrice === "string"
            ? parseFloat(rawPrice.replace(",", "."))
            : rawPrice;
        if (isNaN(parsed)) {
          throw new Error(`Invalid price value: "${rawPrice}"`);
        }
        return { price: parsed };
      });
      extra.prices = normalizedPrices; // Explicitly update the prices field
    }

    // Update isActive if provided
    if (typeof isActive === "boolean") {
      extra.isActive = isActive;
    }

    await restaurant.save();
    res.status(200).json({ success: true, message: "extra_updated", extra });
  } catch (err) {
    console.error("❌ Update extra error:", err);
    res.status(500).json({ message: "server_error" });
  }
};

// toggle extra menu status
exports.toggleExtraActiveStatus = async (req, res) => {
  try {
    const { restaurantId, categoryId, extraIndex } = req.params;

    const restaurant = await Restaurant.findById(restaurantId);
    const category = restaurant?.menu.id(categoryId);

    if (!category)
      return res.status(404).json({ message: "category_not_found" });

    const extra = category.extra_menu.extras[extraIndex];
    if (!extra) return res.status(404).json({ message: "extra_not_found" });

    extra.isActive = !extra.isActive;
    await restaurant.save();

    // Return message without spaces
    const message = extra.isActive
      ? "extra_is_now_active"
      : "extra_is_now_inactive";

    res.status(200).json({
      success: true,
      message,
      extra,
    });
  } catch (err) {
    console.error("❌ Toggle extra error:", err);
    res.status(500).json({ message: "server_error" });
  }
};

// delete extra menu
exports.deleteExtraMenu = async (req, res) => {
  try {
    const { restaurantId, categoryId, extraIndex } = req.params;

    const restaurant = await Restaurant.findById(restaurantId);
    const category = restaurant?.menu.id(categoryId);

    if (!category)
      return res.status(404).json({ message: "Category not found" });

    category.extra_menu.extras.splice(extraIndex, 1);
    await restaurant.save();

    res.status(200).json({ success: true, message: "Extra deleted" });
  } catch (err) {
    console.error("❌ Delete extra error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// add / update dressing
exports.upsertDressing = async (req, res) => {
  try {
    const { restaurantId, categoryId } = req.params;
    const { dressing_label, multiple, options } = req.body;

    // Basic validation
    if (!dressing_label || !Array.isArray(options) || options.length === 0) {
      return res.status(400).json({
        message: "dressing_label_and_at_least_one_option",
      });
    }

    const restaurant = await Restaurant.findById(restaurantId);
    const category = restaurant?.menu.id(categoryId);
    if (!category)
      return res.status(404).json({ message: "category_not_found" });

    const newDressing = {
      dressing_label: dressing_label.trim(),
      multiple: !!multiple,
      isActive: true,
      options: options.map((opt) => ({
        dressing_name: opt.dressing_name?.trim(),
        isActive: true,
      })),
    };

    if (!category.dressing) {
      // Create new dressing
      category.dressing = newDressing;
      await restaurant.save();
      return res.status(201).json({
        success: true,
        message: "dressing_created",
        dressing: category.dressing,
      });
    } else {
      // Update existing dressing
      category.dressing.dressing_label = newDressing.dressing_label;
      category.dressing.multiple = newDressing.multiple;
      category.dressing.options = newDressing.options;

      await restaurant.save();
      return res.status(200).json({
        success: true,
        message: "dressing_updated",
        dressing: category.dressing,
      });
    }
  } catch (err) {
    console.error("❌ Upsert dressing error:", err);
    res.status(500).json({ message: "server_error" });
  }
};

// //add dressings
// exports.addDressing = async (req, res) => {
//   try {
//     const { restaurantId, categoryId } = req.params;
//     const { dressing_label, multiple, options } = req.body;

//     if (!dressing_label || !Array.isArray(options) || options.length === 0) {
//       return res
//         .status(400)
//         .json({ message: "Dressing label and options are required" });
//     }

//     const restaurant = await Restaurant.findById(restaurantId);
//     const category = restaurant?.menu.id(categoryId);
//     if (!category)
//       return res.status(404).json({ message: "Category not found" });

//     const exists =
//       category.dressing?.dressing_label?.trim().toLowerCase() ===
//       dressing_label.trim().toLowerCase();

//     if (exists) {
//       return res.status(400).json({ message: "Dressing already exists" });
//     }

//     category.dressing = {
//       dressing_label: dressing_label.trim(),
//       multiple: !!multiple,
//       options: options.map((opt) => ({
//         dressing_name: opt.dressing_name?.trim(),
//       })),
//     };

//     await restaurant.save();
//     res.status(201).json({
//       success: true,
//       message: "Dressing added",
//       dressing: category.dressing,
//     });
//   } catch (err) {
//     console.error("❌ Add dressing error:", err);
//     res.status(500).json({ message: "Server error" });
//   }
// };

// get all dressings
exports.getAllDressings = async (req, res) => {
  try {
    const { restaurantId, categoryId } = req.params;

    const restaurant = await Restaurant.findById(restaurantId);
    const category = restaurant?.menu.id(categoryId);
    if (!category)
      return res.status(404).json({ message: "category_not_found" });

    res.status(200).json({
      success: true,
      dressing: category.dressing,
    });
  } catch (err) {
    console.error("❌ Get dressings error:", err);
    res.status(500).json({ message: "server_error" });
  }
};

// toggle dressing option
exports.toggleDressingOption = async (req, res) => {
  try {
    const { restaurantId, categoryId, optionIndex } = req.params;

    const restaurant = await Restaurant.findById(restaurantId);
    const category = restaurant?.menu.id(categoryId);
    if (!category)
      return res.status(404).json({ message: "category_not_found" });

    const dressing = category.dressing;
    if (!dressing)
      return res.status(404).json({ message: "dressing_not_found" });

    const option = dressing?.options?.[optionIndex];
    if (!option) return res.status(404).json({ message: "option_not_found" });

    option.isActive = !option.isActive;

    await restaurant.save();

    // Return message without spaces
    const message = option.isActive
      ? "option_is_now_active"
      : "option_is_now_inactive";

    res.status(200).json({
      success: true,
      message,
      option,
    });
  } catch (err) {
    console.error("❌ Toggle dressing option error:", err);
    res.status(500).json({ message: "server_error" });
  }
};

// delete dressing option
exports.deleteDressingOption = async (req, res) => {
  try {
    const { restaurantId, categoryId, optionIndex } = req.params;

    const restaurant = await Restaurant.findById(restaurantId);
    const category = restaurant?.menu.id(categoryId);
    if (!category)
      return res.status(404).json({ message: "category_not_found" });

    const dressing = category.dressing;
    if (!dressing || !dressing.options?.[optionIndex]) {
      return res.status(404).json({ message: "dressing_option_not_found" });
    }

    dressing.options.splice(optionIndex, 1);
    await restaurant.save();

    res.status(200).json({
      success: true,
      message: "dressing_option_deleted",
    });
  } catch (err) {
    console.error("❌ Delete dressing option error:", err);
    res.status(500).json({ message: "server_error" });
  }
};

// // update dressing
// exports.updateDressing = async (req, res) => {
//   try {
//     const { restaurantId, categoryId } = req.params;
//     const { dressing_label, multiple, options } = req.body;

//     const restaurant = await Restaurant.findById(restaurantId);
//     const category = restaurant?.menu.id(categoryId);
//     if (!category)
//       return res.status(404).json({ message: "Category not found" });

//     const dressing = category.dressing;
//     if (!dressing)
//       return res.status(404).json({ message: "Dressing not found" });

//     if (dressing_label) dressing.dressing_label = dressing_label.trim();
//     if (typeof multiple === "boolean") dressing.multiple = multiple;
//     if (Array.isArray(options)) {
//       dressing.options = options.map((opt) => ({
//         dressing_name: opt.dressing_name?.trim(),
//       }));
//     }

//     await restaurant.save();
//     res
//       .status(200)
//       .json({ success: true, message: "Dressing updated", dressing });
//   } catch (err) {
//     console.error("❌ Update dressing error:", err);
//     res.status(500).json({ message: "Server error" });
//   }
// };

// toggle dressing status
exports.toggleDressing = async (req, res) => {
  try {
    const { restaurantId, categoryId } = req.params;

    const restaurant = await Restaurant.findById(restaurantId);
    const category = restaurant?.menu.id(categoryId);
    if (!category)
      return res.status(404).json({ message: "Category not found" });

    const dressing = category.dressing;
    if (!dressing)
      return res.status(404).json({ message: "Dressing not found" });

    dressing.isActive = !dressing.isActive;
    await restaurant.save();

    res.status(200).json({
      success: true,
      message: `Dressing is now ${dressing.isActive ? "active" : "inactive"}`,
      dressing,
    });
  } catch (err) {
    console.error("❌ Toggle dressing error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// add addons, send addon_price only if addon is not
// free as well as item specific if not for all
exports.addAddon = async (req, res) => {
  try {
    const { restaurantId, categoryId } = req.params;
    const {
      addon_label,
      optional = true,
      multiple = false,
      options,
      applyToAll = true,
      appliesTo = [],
    } = req.body;

    if (!addon_label || !Array.isArray(options) || options.length === 0) {
      return res
        .status(400)
        .json({ message: "addon_label_and_option_required" });
    }

    const restaurant = await Restaurant.findById(restaurantId);
    const category = restaurant?.menu.id(categoryId);
    if (!category)
      return res.status(404).json({ message: "category_not_found" });

    // Check for duplicate addon_label
    const exists = category.addons.some(
      (a) =>
        a.addon_label.trim().toLowerCase() === addon_label.trim().toLowerCase()
    );
    if (exists)
      return res.status(400).json({ message: "addon_label_already_exists" });

    // ✅ Validate item IDs if applyToAll is false
    let validatedAppliesTo = [];
    if (!applyToAll) {
      const validItemIds = new Set(
        category.items.map((item) => item._id.toString())
      );
      for (let id of appliesTo) {
        if (!validItemIds.has(id)) {
          return res
            .status(400)
            .json({ message: `Invalid menu item ID: ${id}` });
        }
        validatedAppliesTo.push(id); // keep only valid ones
      }

      if (validatedAppliesTo.length === 0) {
        return res
          .status(400)
          .json({ message: "no_valid_menu_item_ids_provided" });
      }
    }

    // ✅ Normalize addon options
    const normalizedOptions = [];
    const seenNames = new Set();

    for (let opt of options) {
      if (!opt.addon_name || !opt.addon_name.trim()) {
        return res
          .status(400)
          .json({ message: "each_option_must_have_a_name" });
      }

      const nameKey = opt.addon_name.trim().toLowerCase();
      if (seenNames.has(nameKey)) {
        return res
          .status(400)
          .json({ message: `Duplicate option: ${opt.addon_name}` });
      }
      seenNames.add(nameKey);

      let addon_price = 0;
      if (opt.addon_price) {
        const price =
          typeof opt.addon_price === "string"
            ? parseFloat(opt.addon_price.replace(",", "."))
            : opt.addon_price;

        if (isNaN(price)) {
          return res
            .status(400)
            .json({ message: `Invalid price: ${opt.addon_price}` });
        }
        addon_price = price;
      }

      normalizedOptions.push({
        addon_name: opt.addon_name.trim(),
        addon_price,
      });
    }

    category.addons.push({
      addon_label: addon_label.trim(),
      optional,
      multiple,
      options: normalizedOptions,
      applyToAll: !!applyToAll,
      appliesTo: applyToAll ? [] : validatedAppliesTo,
    });

    await restaurant.save();
    const newAddon = category.addons[category.addons.length - 1];
    res.status(201).json({
      success: true,
      message: "addon_added",
      addon: newAddon,
    });
  } catch (err) {
    console.error("❌ Add addon error:", err);
    res.status(500).json({ message: "server_error" });
  }
};

// get all addons
exports.getAllAddons = async (req, res) => {
  try {
    const { restaurantId, categoryId } = req.params;

    const restaurant = await Restaurant.findById(restaurantId);
    const category = restaurant?.menu.id(categoryId);
    if (!category)
      return res.status(404).json({ message: "Category not found" });

    res.status(200).json({
      success: true,
      addons: category.addons,
    });
  } catch (err) {
    console.error("❌ Get addons error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.updateAddon = async (req, res) => {
  try {
    const { restaurantId, categoryId, index } = req.params;
    const {
      addon_label,
      optional,
      multiple,
      options,
      applyToAll = true,
      appliesTo = [],
    } = req.body;

    const restaurant = await Restaurant.findById(restaurantId);
    const category = restaurant?.menu.id(categoryId);
    if (!category)
      return res.status(404).json({ message: "category_not_found" });

    const addon = category.addons[index];
    if (!addon) return res.status(404).json({ message: "addon_not_found" });

    if (addon_label) addon.addon_label = addon_label.trim();
    if (typeof optional === "boolean") addon.optional = optional;
    if (typeof multiple === "boolean") addon.multiple = multiple;

    // ✅ Validate applyToAll and appliesTo
    if (typeof applyToAll === "boolean") {
      addon.applyToAll = applyToAll;

      if (!applyToAll) {
        const validItemIds = new Set(
          category.items.map((i) => i._id.toString())
        );
        const validatedAppliesTo = [];

        for (let id of appliesTo) {
          if (!validItemIds.has(id)) {
            return res
              .status(400)
              .json({ message: `Invalid menu item ID: ${id}` });
          }
          validatedAppliesTo.push(id);
        }

        if (validatedAppliesTo.length === 0) {
          return res
            .status(400)
            .json({ message: "no_valid_menu_item_ids_provided" });
        }

        addon.appliesTo = validatedAppliesTo;
      } else {
        addon.appliesTo = []; // Clear appliesTo if applyToAll is true
      }
    }

    // ✅ Normalize options
    if (Array.isArray(options)) {
      const normalizedOptions = [];
      const seenNames = new Set();

      for (let opt of options) {
        if (!opt.addon_name || !opt.addon_name.trim()) {
          return res
            .status(400)
            .json({ message: "Each option must have a name" });
        }

        const nameKey = opt.addon_name.trim().toLowerCase();
        if (seenNames.has(nameKey)) {
          return res
            .status(400)
            .json({ message: `Duplicate option: ${opt.addon_name}` });
        }
        seenNames.add(nameKey);

        let addon_price = 0;
        if (opt.addon_price) {
          const price =
            typeof opt.addon_price === "string"
              ? parseFloat(opt.addon_price.replace(",", "."))
              : opt.addon_price;

          if (isNaN(price)) {
            return res
              .status(400)
              .json({ message: `Invalid price: ${opt.addon_price}` });
          }
          addon_price = price;
        }

        normalizedOptions.push({
          addon_name: opt.addon_name.trim(),
          addon_price,
        });
      }

      addon.options = normalizedOptions;
    }

    await restaurant.save();
    res.status(200).json({
      success: true,
      message: "Addon updated",
      addon,
    });
  } catch (err) {
    console.error("❌ Update addon error:", err);
    res.status(500).json({ message: "server_error" });
  }
};

// toggle addon group active or inactive
exports.toggleAddon = async (req, res) => {
  try {
    const { restaurantId, categoryId, index } = req.params;

    const restaurant = await Restaurant.findById(restaurantId);
    const category = restaurant?.menu.id(categoryId);
    if (!category)
      return res.status(404).json({ message: "category_not_found" });

    const addon = category.addons[index];
    if (!addon) return res.status(404).json({ message: "addon_not_found" });

    addon.isActive = !addon.isActive;
    await restaurant.save();

    // Return message without spaces
    const message = addon.isActive
      ? "addon_is_now_active"
      : "addon_is_now_inactive";

    res.status(200).json({
      success: true,
      message,
      addon,
    });
  } catch (err) {
    console.error("❌ Toggle addon error:", err);
    res.status(500).json({ message: "server_error" });
  }
};

//delete addons
exports.deleteAddon = async (req, res) => {
  try {
    const { restaurantId, categoryId, index } = req.params;

    const restaurant = await Restaurant.findById(restaurantId);
    const category = restaurant?.menu.id(categoryId);
    if (!category)
      return res.status(404).json({ message: "category_not_found" });

    if (!category.addons || !category.addons[index]) {
      return res.status(404).json({ message: "addon_not_found" });
    }

    category.addons.splice(index, 1);
    await restaurant.save();

    res.status(200).json({ success: true, message: "addon_deleted" });
  } catch (err) {
    console.error("❌ Delete addon error:", err);
    res.status(500).json({ message: "server_error" });
  }
};

// toggle addon option
exports.toggleAddonOptionStatus = async (req, res) => {
  try {
    const { restaurantId, categoryId, addonIndex, optionIndex } = req.params;

    const restaurant = await Restaurant.findById(restaurantId);
    const category = restaurant?.menu.id(categoryId);
    if (!category)
      return res.status(404).json({ message: "category_not_found" });

    const addon = category.addons[addonIndex];
    if (!addon) return res.status(404).json({ message: "addon_not_found" });

    const option = addon.options[optionIndex];
    if (!option) return res.status(404).json({ message: "option_not_found" });

    option.isActive = !option.isActive;

    await restaurant.save();
    // Return message without spaces
    const message = option.isActive
      ? "option_is_now_active"
      : "option_is_now_inactive";

    res.status(200).json({
      success: true,
      message,
      option,
    });
  } catch (err) {
    console.error("❌ Toggle addon option error:", err);
    res.status(500).json({ message: "server_error" });
  }
};

// delete addon option
exports.deleteAddonOption = async (req, res) => {
  try {
    const { restaurantId, categoryId, addonIndex, optionIndex } = req.params;

    const restaurant = await Restaurant.findById(restaurantId);
    const category = restaurant?.menu.id(categoryId);
    if (!category)
      return res.status(404).json({ message: "category_not_found" });

    const addon = category.addons[addonIndex];
    if (!addon || !addon.options[optionIndex]) {
      return res.status(404).json({ message: "addon_option_not_found" });
    }

    addon.options.splice(optionIndex, 1);
    await restaurant.save();

    res.status(200).json({
      success: true,
      message: "addon_option_deleted",
    });
  } catch (err) {
    console.error("❌ Delete addon option error:", err);
    res.status(500).json({ message: "server_error" });
  }
};
