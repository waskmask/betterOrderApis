const MobileDevice = require("../modals/MobileDevice");
const { isFirebaseConfigured } = require("../services/firebaseMessagingService");

function normalizePlatform(value) {
  const platform = String(value || "").toLowerCase();
  return ["android", "ios", "web"].includes(platform) ? platform : "unknown";
}

exports.mobileMe = async (req, res) => {
  return res.json({
    success: true,
    restaurant: {
      _id: String(req.user._id),
      name: req.user.restaurant_name || "",
      username: req.user.username || "",
      isActive: Boolean(req.user.isActive),
      isVisible: Boolean(req.user.isVisible),
      deliveryEnabled: Boolean(req.user.isDelivery),
      takeawayEnabled: Boolean(req.user.isPickup),
    },
    push: {
      firebaseConfigured: isFirebaseConfigured(),
    },
  });
};

exports.registerDevice = async (req, res) => {
  const token = String(req.body?.fcmToken || req.body?.token || "").trim();
  if (!token || token.length < 20) {
    return res.status(400).json({ success: false, message: "invalid_fcm_token" });
  }

  const device = await MobileDevice.findOneAndUpdate(
    { token },
    {
      $set: {
        restaurantId: req.user._id,
        token,
        platform: normalizePlatform(req.body?.platform),
        appVersion: String(req.body?.appVersion || "").trim().slice(0, 40),
        deviceName: String(req.body?.deviceName || "").trim().slice(0, 120),
        locale: String(req.body?.locale || "").trim().slice(0, 20),
        isActive: true,
        lastSeenAt: new Date(),
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  return res.json({
    success: true,
    device: {
      _id: String(device._id),
      platform: device.platform,
      isActive: device.isActive,
      lastSeenAt: device.lastSeenAt,
    },
  });
};

exports.unregisterDevice = async (req, res) => {
  const token = String(req.body?.fcmToken || req.body?.token || "").trim();
  if (!token) {
    return res.status(400).json({ success: false, message: "invalid_fcm_token" });
  }

  await MobileDevice.updateOne(
    { token, restaurantId: req.user._id },
    { $set: { isActive: false, lastSeenAt: new Date() } }
  );

  return res.json({ success: true });
};
