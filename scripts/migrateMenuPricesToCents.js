require("dotenv").config();

const mongoose = require("mongoose");
const { Restaurant } = require("../modals/Restaurant");

function toCents(value) {
  if (value === undefined || value === null || value === "") return value;
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? Math.round((parsed + Number.EPSILON) * 100) : value;
}

function migrateCategory(category) {
  let changed = false;

  for (const item of category.items || []) {
    for (const row of item.price || []) {
      const next = toCents(row.item_price);
      if (next !== row.item_price) {
        row.item_price = next;
        changed = true;
      }
    }
  }

  for (const extra of category.extra_menu?.extras || []) {
    for (const row of extra.prices || []) {
      const next = toCents(row.price);
      if (next !== row.price) {
        row.price = next;
        changed = true;
      }
    }
  }

  for (const addon of category.addons || []) {
    for (const option of addon.options || []) {
      const next = toCents(option.addon_price);
      if (next !== option.addon_price) {
        option.addon_price = next;
        changed = true;
      }
    }
  }

  return changed;
}

async function main() {
  if (process.env.CONFIRM_MIGRATE_MENU_PRICES_TO_CENTS !== "yes") {
    throw new Error(
      "Refusing to run. Set CONFIRM_MIGRATE_MENU_PRICES_TO_CENTS=yes after confirming this migration has not already been run."
    );
  }

  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is required.");
  }

  await mongoose.connect(process.env.MONGO_URI);

  let scanned = 0;
  let updated = 0;

  for await (const restaurant of Restaurant.find().cursor()) {
    scanned += 1;
    let changed = false;
    for (const category of restaurant.menu || []) {
      changed = migrateCategory(category) || changed;
    }

    if (changed) {
      restaurant.markModified("menu");
      await restaurant.save();
      updated += 1;
    }
  }

  await mongoose.disconnect();
  console.log(`Migrated menu prices to cents for ${updated}/${scanned} restaurants.`);
}

main().catch(async (error) => {
  console.error(error.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
