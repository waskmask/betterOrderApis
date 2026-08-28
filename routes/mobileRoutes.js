const express = require("express");
const {
  mobileMe,
  registerDevice,
  unregisterDevice,
} = require("../controllers/mobileController");
const { isRestaurantSelf, verifyToken } = require("../middlewares/auth");

const router = express.Router();

router.get("/me", verifyToken, isRestaurantSelf, mobileMe);
router.post("/devices", verifyToken, isRestaurantSelf, registerDevice);
router.delete("/devices", verifyToken, isRestaurantSelf, unregisterDevice);

module.exports = router;
