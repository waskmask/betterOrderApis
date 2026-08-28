const Cuisine = require("../modals/Cuisine");
const {
  DEFAULT_LEGACY_LANG,
  migrateCuisineDocs,
  getActiveContentLanguageCodes,
  getPrimaryContentLanguageCode,
  serializeCuisine,
  parseCuisinePayload,
  resolveLocalizedValue,
} = require("../utils/cuisineI18n");

async function normalizeCuisinePositions() {
  try {
    await Cuisine.collection.dropIndex("name_1");
  } catch {
    // Index may already be gone after Mixed migration
  }

  const cuisines = await Cuisine.find({})
    .sort({ position: 1, createdAt: 1 })
    .select("_id position");

  const needsNormalization = cuisines.some(
    (cuisine, index) => cuisine.position !== index
  );

  if (!needsNormalization) {
    return Cuisine.find({}).sort({ position: 1, createdAt: 1 });
  }

  await Cuisine.bulkWrite(
    cuisines.map((cuisine, index) => ({
      updateOne: {
        filter: { _id: cuisine._id },
        update: { $set: { position: index } },
      },
    }))
  );

  return Cuisine.find({}).sort({ position: 1, createdAt: 1 });
}

async function findDuplicateByLocalizedName(nameI18n, excludeId = null) {
  const values = Object.values(nameI18n || {})
    .map((value) => String(value).trim().toLowerCase())
    .filter(Boolean);

  if (values.length === 0) return null;

  const cuisines = await Cuisine.find(excludeId ? { _id: { $ne: excludeId } } : {});
  await migrateCuisineDocs(cuisines);

  return (
    cuisines.find((cuisine) => {
      const map =
        cuisine.name && typeof cuisine.name === "object" ? cuisine.name : { [DEFAULT_LEGACY_LANG]: cuisine.name };
      const existing = Object.values(map || {})
        .map((value) => String(value).trim().toLowerCase())
        .filter(Boolean);
      return existing.some((value) => values.includes(value));
    }) || null
  );
}

// Create Cuisine
exports.createCuisine = async (req, res, next) => {
  try {
    const { nameI18n, descriptionI18n } = parseCuisinePayload(req.body);
    const primaryCode = await getPrimaryContentLanguageCode();
    const primaryName = resolveLocalizedValue(nameI18n, [primaryCode, DEFAULT_LEGACY_LANG]);

    if (!primaryName) {
      return res.status(400).json({ message: "Cuisine name is required", success: false });
    }

    const exists = await findDuplicateByLocalizedName(nameI18n);
    if (exists) {
      return res.status(400).json({ message: "Cuisine already exists", success: false });
    }

    await normalizeCuisinePositions();
    const position = await Cuisine.countDocuments();

    const cuisine = await Cuisine.create({
      name: nameI18n,
      description: descriptionI18n,
      position,
    });

    const activeCodes = await getActiveContentLanguageCodes();
    res.status(201).json({
      message: "Cuisine created",
      cuisine: serializeCuisine(cuisine, primaryCode, activeCodes),
      success: true,
    });
  } catch (err) {
    next(err);
  }
};

// Update Cuisine
exports.updateCuisine = async (req, res, next) => {
  try {
    const { nameI18n, descriptionI18n } = parseCuisinePayload(req.body);
    const { isActive } = req.body;
    const primaryCode = await getPrimaryContentLanguageCode();
    const primaryName = resolveLocalizedValue(nameI18n, [primaryCode, DEFAULT_LEGACY_LANG]);

    if (!primaryName) {
      return res.status(400).json({ message: "Cuisine name is required", success: false });
    }

    const exists = await findDuplicateByLocalizedName(nameI18n, req.params.id);
    if (exists) {
      return res.status(400).json({ message: "Cuisine already exists", success: false });
    }

    const update = {
      name: nameI18n,
      description: descriptionI18n,
    };

    if (isActive !== undefined) {
      update.isActive = isActive === true || isActive === "true";
    }

    const cuisine = await Cuisine.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true }
    );

    if (!cuisine) return res.status(404).json({ message: "Cuisine not found", success: false });

    const activeCodes = await getActiveContentLanguageCodes();
    res.status(200).json({
      message: "Cuisine updated",
      cuisine: serializeCuisine(cuisine, primaryCode, activeCodes),
      success: true,
    });
  } catch (err) {
    next(err);
  }
};

// List all Cuisines
exports.getAllCuisines = async (req, res, next) => {
  try {
    const isRestaurant = req.user?.role === "restaurant";
    const docs = isRestaurant
      ? await Cuisine.find({ isActive: true }).sort({ position: 1, createdAt: 1 })
      : await normalizeCuisinePositions();

    if (!isRestaurant) {
      await migrateCuisineDocs(docs);
    }

    const primaryCode = await getPrimaryContentLanguageCode();
    const activeCodes = await getActiveContentLanguageCodes();

    res.status(200).json({
      cuisines: docs.map((doc) => serializeCuisine(doc, primaryCode, activeCodes)),
      contentLanguages: {
        primaryCode,
        activeCodes,
      },
    });
  } catch (err) {
    next(err);
  }
};

// Update Cuisine Status
exports.updateCuisineStatus = async (req, res, next) => {
  try {
    const { isActive } = req.body;

    if (typeof isActive !== "boolean" && isActive !== "true" && isActive !== "false") {
      return res.status(400).json({ message: "Invalid cuisine status" });
    }

    const cuisine = await Cuisine.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          isActive: isActive === true || isActive === "true",
        },
      },
      { new: true }
    );

    if (!cuisine) return res.status(404).json({ message: "Cuisine not found" });

    await migrateCuisineDocIfNeededSafe(cuisine);
    const primaryCode = await getPrimaryContentLanguageCode();
    const activeCodes = await getActiveContentLanguageCodes();

    res.status(200).json({
      message: "Cuisine status updated",
      cuisine: serializeCuisine(cuisine, primaryCode, activeCodes),
      success: true,
    });
  } catch (err) {
    next(err);
  }
};

async function migrateCuisineDocIfNeededSafe(doc) {
  try {
    const { migrateCuisineDocIfNeeded } = require("../utils/cuisineI18n");
    await migrateCuisineDocIfNeeded(doc);
  } catch {
    // ignore
  }
}

// Delete Cuisine
exports.deleteCuisine = async (req, res, next) => {
  try {
    const cuisine = await Cuisine.findByIdAndDelete(req.params.id);
    if (!cuisine) return res.status(404).json({ message: "Cuisine not found" });

    if (cuisine.icon) {
      const { deleteObjectByRelativePath } = require("../utils/r2Storage");
      await deleteObjectByRelativePath(cuisine.icon);
    }

    const docs = await normalizeCuisinePositions();
    await migrateCuisineDocs(docs);
    const primaryCode = await getPrimaryContentLanguageCode();
    const activeCodes = await getActiveContentLanguageCodes();

    res.status(200).json({
      message: "Cuisine deleted",
      cuisines: docs.map((doc) => serializeCuisine(doc, primaryCode, activeCodes)),
      success: true,
    });
  } catch (err) {
    next(err);
  }
};

// Reorder Cuisines
exports.reorderCuisines = async (req, res, next) => {
  try {
    const { movedId, targetId, orderedIds } = req.body;
    const cuisines = await normalizeCuisinePositions();
    const existingIds = new Set(cuisines.map((cuisine) => String(cuisine._id)));

    if (movedId && targetId) {
      const movedCuisine = cuisines.find(
        (cuisine) => String(cuisine._id) === String(movedId)
      );
      const targetCuisine = cuisines.find(
        (cuisine) => String(cuisine._id) === String(targetId)
      );

      if (!movedCuisine || !targetCuisine) {
        return res.status(400).json({ message: "Invalid cuisine order" });
      }

      const fromPosition = movedCuisine.position;
      const toPosition = targetCuisine.position;

      if (fromPosition !== toPosition) {
        if (fromPosition < toPosition) {
          await Cuisine.updateMany(
            {
              _id: { $ne: movedCuisine._id },
              position: { $gt: fromPosition, $lte: toPosition },
            },
            { $inc: { position: -1 } }
          );
        } else {
          await Cuisine.updateMany(
            {
              _id: { $ne: movedCuisine._id },
              position: { $gte: toPosition, $lt: fromPosition },
            },
            { $inc: { position: 1 } }
          );
        }

        await Cuisine.updateOne(
          { _id: movedCuisine._id },
          { $set: { position: toPosition } }
        );
      }
    } else if (Array.isArray(orderedIds) && orderedIds.length > 0) {
      if (orderedIds.length !== cuisines.length) {
        return res.status(400).json({ message: "Invalid cuisine order" });
      }

      const orderedIdSet = new Set(orderedIds.map(String));

      if (
        orderedIds.some((id) => !existingIds.has(String(id))) ||
        orderedIdSet.size !== existingIds.size
      ) {
        return res.status(400).json({ message: "Invalid cuisine order" });
      }

      await Cuisine.bulkWrite(
        orderedIds.map((id, index) => ({
          updateOne: {
            filter: { _id: id },
            update: { $set: { position: index } },
          },
        }))
      );
    } else {
      return res.status(400).json({ message: "Invalid cuisine order" });
    }

    const nextCuisines = await Cuisine.find({}).sort({ position: 1, createdAt: 1 });
    await migrateCuisineDocs(nextCuisines);
    const primaryCode = await getPrimaryContentLanguageCode();
    const activeCodes = await getActiveContentLanguageCodes();

    res.status(200).json({
      message: "Cuisine order updated",
      cuisines: nextCuisines.map((doc) => serializeCuisine(doc, primaryCode, activeCodes)),
      success: true,
    });
  } catch (err) {
    next(err);
  }
};
