/**
 * One-time migration: create RestaurantStaff admin rows from legacy Restaurant logins.
 *
 * Usage: node scripts/migrate-restaurant-staff.js
 * Rollback: delete RestaurantStaff docs created in this run (see report output).
 */
require("dotenv").config();
const mongoose = require("mongoose");
const { Restaurant } = require("../modals/Restaurant");
const RestaurantStaff = require("../modals/RestaurantStaff");
const { normalizeStaffEmail } = require("../utils/restaurantRoles");

async function main() {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
  const report = {
    created: [],
    skippedExisting: [],
    skippedNoEmail: [],
    duplicates: [],
  };

  const restaurants = await Restaurant.find({
    email: { $exists: true, $ne: "" },
    password: { $exists: true, $ne: "" },
  }).select("_id email password restaurant_name tokenVersion");

  const seenEmails = new Set(
    (await RestaurantStaff.find({}, "email").lean()).map((row) => row.email)
  );

  for (const restaurant of restaurants) {
    const email = normalizeStaffEmail(restaurant.email);
    if (!email) {
      report.skippedNoEmail.push(String(restaurant._id));
      continue;
    }

    if (seenEmails.has(email)) {
      report.skippedExisting.push({ restaurantId: String(restaurant._id), email });
      continue;
    }

    const duplicateRestaurant = await Restaurant.findOne({
      email,
      _id: { $ne: restaurant._id },
    }).select("_id");

    if (duplicateRestaurant) {
      report.duplicates.push({
        restaurantId: String(restaurant._id),
        email,
        otherRestaurantId: String(duplicateRestaurant._id),
      });
      continue;
    }

    await RestaurantStaff.create({
      restaurantId: restaurant._id,
      name: restaurant.restaurant_name || "Owner",
      email,
      password: restaurant.password,
      role: "restaurant-admin",
      isActive: true,
      tokenVersion: restaurant.tokenVersion || 0,
      createdByRole: "migration",
    });

    seenEmails.add(email);
    report.created.push({ restaurantId: String(restaurant._id), email });
  }

  console.log(JSON.stringify(report, null, 2));
  console.log(
    `\nSummary: created=${report.created.length} skippedExisting=${report.skippedExisting.length} duplicates=${report.duplicates.length}`
  );

  if (report.duplicates.length > 0) {
    console.error("Resolve duplicate emails before enabling staff-only login.");
    process.exitCode = 1;
  }

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
