require("dotenv").config();

const mongoose = require("mongoose");
const { Restaurant } = require("../modals/Restaurant");

function toCents(value) {
  if (value === undefined || value === null || value === "") return value;
  const parsed =
    typeof value === "number"
      ? value
      : Number.parseFloat(String(value).replace(",", "."));
  return Number.isFinite(parsed)
    ? Math.round((parsed + Number.EPSILON) * 100)
    : value;
}

function migrateZone(zone) {
  let changed = false;

  for (const field of ["charges", "min_order_value", "free_delivery_min_order"]) {
    const next = toCents(zone[field]);
    if (next !== zone[field]) {
      zone[field] = next;
      changed = true;
    }
  }

  return changed;
}

async function main() {
  if (process.env.CONFIRM_MIGRATE_DELIVERY_ZONE_AMOUNTS_TO_CENTS !== "yes") {
    throw new Error(
      "Refusing to run. Set CONFIRM_MIGRATE_DELIVERY_ZONE_AMOUNTS_TO_CENTS=yes after confirming this migration has not already been run."
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

    for (const zone of restaurant.delivering_at || []) {
      changed = migrateZone(zone) || changed;
    }

    if (changed) {
      restaurant.markModified("delivering_at");
      await restaurant.save();
      updated += 1;
    }
  }

  await mongoose.disconnect();
  console.log(
    `Migrated delivery zone amounts to cents for ${updated}/${scanned} restaurants.`
  );
}

main().catch(async (error) => {
  console.error(error.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
