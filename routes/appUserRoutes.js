const express = require("express");
const router = express.Router();
const asyncHandler = require("../utils/asyncHandler");
const appUserController = require("../controllers/appUserController");
const { verifyToken, isAppUser } = require("../middlewares/auth");
const {
  authGoogleLimiter,
  authLoginLimiter,
  authRegisterLimiter,
  emailSendLimiter,
  passwordChangeLimiter,
  tokenActionLimiter,
} = require("../middlewares/rateLimit");

router.post("/register", authRegisterLimiter, asyncHandler(appUserController.register));
router.post("/login", authLoginLimiter, asyncHandler(appUserController.login));
router.post("/google", authGoogleLimiter, asyncHandler(appUserController.googleAuth));
router.post("/logout", asyncHandler(appUserController.logout));
router.post(
  "/forgot-password",
  emailSendLimiter,
  asyncHandler(appUserController.requestPasswordReset)
);
router.post("/reset-password", tokenActionLimiter, asyncHandler(appUserController.resetPassword));

router.post(
  "/verify-email/request",
  emailSendLimiter,
  asyncHandler(appUserController.requestEmailVerification)
);
router.post(
  "/verify-email/resend",
  emailSendLimiter,
  asyncHandler(appUserController.requestEmailVerification)
);
router.post("/verify-email/confirm", tokenActionLimiter, asyncHandler(appUserController.verifyEmail));

router.get("/me", verifyToken, isAppUser, asyncHandler(appUserController.getMe));
router.patch(
  "/me",
  verifyToken,
  isAppUser,
  asyncHandler(appUserController.updateMe)
);
router.delete(
  "/me",
  verifyToken,
  isAppUser,
  asyncHandler(appUserController.deleteMe)
);
router.post(
  "/change-password",
  verifyToken,
  isAppUser,
  passwordChangeLimiter,
  asyncHandler(appUserController.changePassword)
);
router.patch(
  "/me/marketing-email-consent",
  verifyToken,
  isAppUser,
  asyncHandler(appUserController.updateMarketingEmailConsent)
);

router.get(
  "/me/addresses",
  verifyToken,
  isAppUser,
  asyncHandler(appUserController.getAddresses)
);
router.post(
  "/me/addresses",
  verifyToken,
  isAppUser,
  asyncHandler(appUserController.createAddress)
);
router.patch(
  "/me/addresses/:addressId",
  verifyToken,
  isAppUser,
  asyncHandler(appUserController.updateAddress)
);
router.delete(
  "/me/addresses/:addressId",
  verifyToken,
  isAppUser,
  asyncHandler(appUserController.deleteAddress)
);
router.patch(
  "/me/addresses/:addressId/default",
  verifyToken,
  isAppUser,
  asyncHandler(appUserController.setDefaultAddress)
);

router.get(
  "/me/favorites",
  verifyToken,
  isAppUser,
  asyncHandler(appUserController.getFavorites)
);
router.get(
  "/me/orders",
  verifyToken,
  isAppUser,
  asyncHandler(appUserController.listMyOrders)
);
router.get(
  "/me/orders/:orderId",
  verifyToken,
  isAppUser,
  asyncHandler(appUserController.getMyOrder)
);
router.post(
  "/me/favorites/restaurants/:restaurantId",
  verifyToken,
  isAppUser,
  asyncHandler(appUserController.addFavoriteRestaurant)
);
router.delete(
  "/me/favorites/restaurants/:restaurantId",
  verifyToken,
  isAppUser,
  asyncHandler(appUserController.removeFavoriteRestaurant)
);
router.post(
  "/me/favorites/menu-items",
  verifyToken,
  isAppUser,
  asyncHandler(appUserController.addFavoriteMenuItem)
);
router.delete(
  "/me/favorites/menu-items/:restaurantId/:itemId",
  verifyToken,
  isAppUser,
  asyncHandler(appUserController.removeFavoriteMenuItem)
);

module.exports = router;
