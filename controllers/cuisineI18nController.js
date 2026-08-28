const { localizeContentFields } = require("../services/cuisineI18nAiService");
const { getPlatformSettings } = require("../services/platformSettingsService");
const { DEFAULT_ARABIC_DIALECT } = require("../utils/arabicDialects");

exports.translateCuisineFields = async (req, res, next) => {
  try {
    const {
      sourceLanguageCode,
      targetLanguageCode,
      targetLanguageCodes,
      targets,
      name,
      description,
      sizes,
      contentType,
      arabicDialect: dialectFromBody,
    } = req.body || {};

    let arabicDialect = dialectFromBody;
    const targetCodes = [
      ...(Array.isArray(targets) ? targets.map((item) => item?.code) : []),
      ...(Array.isArray(targetLanguageCodes) ? targetLanguageCodes : []),
      targetLanguageCode,
    ]
      .filter(Boolean)
      .map((code) => String(code).toLowerCase());

    if (targetCodes.includes("ar") && !arabicDialect) {
      try {
        const settings = await getPlatformSettings();
        arabicDialect = settings.arabicDialect || DEFAULT_ARABIC_DIALECT;
      } catch {
        arabicDialect = DEFAULT_ARABIC_DIALECT;
      }
    }

    const result = await localizeContentFields({
      sourceLanguageCode,
      targetLanguageCode,
      targetLanguageCodes,
      targets,
      name,
      description,
      sizes,
      arabicDialect,
      contentType: contentType || "cuisine",
    });

    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        message: err.message,
      });
    }
    next(err);
  }
};
