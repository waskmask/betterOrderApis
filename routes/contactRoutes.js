const express = require("express");
const router = express.Router();
const {
  submitContact,
  getAllContacts,
  getContact,
  updateContactStatus,
  deleteContact,
  getContactStats,
} = require("../controllers/contactController");
const { verifyToken, allAdminUsers } = require("../middlewares/auth");

// Public route - Submit contact form
router.post("/", submitContact);

// Admin routes (protected)
router.get("/stats", verifyToken, allAdminUsers, getContactStats);
router.get("/", verifyToken, allAdminUsers, getAllContacts);
router.get("/:id", verifyToken, allAdminUsers, getContact);
router.patch("/:id/status", verifyToken, allAdminUsers, updateContactStatus);
router.delete("/:id", verifyToken, allAdminUsers, deleteContact);

module.exports = router;
