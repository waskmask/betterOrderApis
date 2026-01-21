const express = require("express");
const router = express.Router();
const asyncHandler = require("../utils/asyncHandler");
const favoriteController = require("../controllers/favoriteController");
const { verifyToken, isCustomer } = require("../middlewares/auth");

// All routes require authentication
router.post("/", verifyToken, isCustomer, asyncHandler(favoriteController.addToFavorites));
router.get("/", verifyToken, isCustomer, asyncHandler(favoriteController.getFavorites));
router.delete("/:restaurantId", verifyToken, isCustomer, asyncHandler(favoriteController.removeFromFavorites));

module.exports = router;


