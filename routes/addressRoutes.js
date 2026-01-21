const express = require("express");
const router = express.Router();
const asyncHandler = require("../utils/asyncHandler");
const addressController = require("../controllers/addressController");
const { verifyToken, isCustomer } = require("../middlewares/auth");

// All routes require authentication
router.post("/", verifyToken, isCustomer, asyncHandler(addressController.addAddress));
router.get("/", verifyToken, isCustomer, asyncHandler(addressController.getAddresses));
router.put("/:addressId", verifyToken, isCustomer, asyncHandler(addressController.updateAddress));
router.delete("/:addressId", verifyToken, isCustomer, asyncHandler(addressController.deleteAddress));

module.exports = router;


