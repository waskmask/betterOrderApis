const {
  getPlatformSettings,
  updatePlatformSettings,
} = require("../services/platformSettingsService");

exports.getPlatformSettings = async (_req, res, next) => {
  try {
    const settings = await getPlatformSettings();
    res.json({ success: true, settings });
  } catch (error) {
    next(error);
  }
};

exports.getPublicPlatformBrand = async (_req, res, next) => {
  try {
    const settings = await getPlatformSettings();
    res.json({
      success: true,
      brand: {
        platformName: settings.platformName,
        platformCountryCode: settings.platformCountryCode,
        supportEmail: settings.supportEmail,
        supportPhone: settings.supportPhone,
        supportWhatsapp: settings.supportWhatsapp,
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.updatePlatformSettings = async (req, res, next) => {
  try {
    const settings = await updatePlatformSettings(req.body || {}, req.user?._id);

    res.json({
      success: true,
      message: "platform_settings_updated",
      settings,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};
