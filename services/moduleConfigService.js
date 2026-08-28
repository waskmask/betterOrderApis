const AppModuleConfig = require("../modals/AppModuleConfig");
const { DEFAULT_APP_MODULES, MODULE_KEYS, normalizeAppModules } = require("../utils/modules");

async function getAppModuleConfig() {
  const config = await AppModuleConfig.findOne({ key: "default" }).lean();
  if (!config) return { ...DEFAULT_APP_MODULES };

  const modules = {};
  MODULE_KEYS.forEach((key) => {
    modules[key] = config.modules?.[key]?.enabled;
  });
  return normalizeAppModules(modules);
}

async function updateAppModuleConfig(updates, userId) {
  const set = {};
  MODULE_KEYS.forEach((key) => {
    if (updates[key] === undefined) return;
    set[`modules.${key}.enabled`] = Boolean(updates[key]);
    set[`modules.${key}.updatedAt`] = new Date();
    set[`modules.${key}.updatedBy`] = userId || null;
  });

  const config = await AppModuleConfig.findOneAndUpdate(
    { key: "default" },
    { $set: set, $setOnInsert: { key: "default" } },
    { new: true, upsert: true }
  ).lean();

  const modules = {};
  MODULE_KEYS.forEach((key) => {
    modules[key] = config.modules?.[key]?.enabled;
  });
  return normalizeAppModules(modules);
}

module.exports = {
  getAppModuleConfig,
  updateAppModuleConfig,
};
