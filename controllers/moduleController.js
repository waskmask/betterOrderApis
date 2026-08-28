const { MODULE_KEYS, normalizeAppModules } = require("../utils/modules");
const {
  getAppModuleConfig,
  updateAppModuleConfig,
} = require("../services/moduleConfigService");

exports.getAppModules = async (_req, res, next) => {
  try {
    const modules = await getAppModuleConfig();
    res.json({ success: true, modules: normalizeAppModules(modules), keys: MODULE_KEYS });
  } catch (error) {
    next(error);
  }
};

exports.updateAppModules = async (req, res, next) => {
  try {
    const updates = {};
    MODULE_KEYS.forEach((key) => {
      if (req.body?.modules?.[key] !== undefined) updates[key] = req.body.modules[key];
      else if (req.body?.[key] !== undefined) updates[key] = req.body[key];
    });

    const modules = await updateAppModuleConfig(updates, req.user?._id);
    res.json({ success: true, modules, keys: MODULE_KEYS });
  } catch (error) {
    next(error);
  }
};
