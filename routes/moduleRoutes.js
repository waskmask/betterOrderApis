const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const moduleController = require("../controllers/moduleController");
const { isSuperAdmin, verifyToken } = require("../middlewares/auth");

const router = express.Router();

router.get("/", verifyToken, isSuperAdmin, asyncHandler(moduleController.getAppModules));
router.patch("/", verifyToken, isSuperAdmin, asyncHandler(moduleController.updateAppModules));

module.exports = router;
