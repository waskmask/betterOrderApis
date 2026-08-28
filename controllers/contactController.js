const Contact = require("../modals/Contact");
const asyncHandler = require("../utils/asyncHandler");
const { buildDiacriticInsensitiveRegex } = require("../utils/searchNormalize");

// @desc    Submit contact form
// @route   POST /api/contact
// @access  Public
const submitContact = asyncHandler(async (req, res) => {
  const { fullName, email, phone, message } = req.body;

  // Validation
  const errors = {};

  // Validate fullName
  if (!fullName || !fullName.trim()) {
    errors.fullName = "Full name is required";
  } else if (fullName.trim().length < 2) {
    errors.fullName = "Name must be at least 2 characters";
  } else if (fullName.trim().length > 50) {
    errors.fullName = "Name cannot exceed 50 characters";
  } else if (!/^[a-zA-ZÀ-ÿ\u00C0-\u024F\s\-']+$/.test(fullName.trim())) {
    errors.fullName = "Name can only contain letters, spaces, hyphens and apostrophes";
  }

  // Validate email
  if (!email || !email.trim()) {
    errors.email = "Email is required";
  } else {
    const emailRegex = /^[a-zA-Z0-9](?:[a-zA-Z0-9._-]*[a-zA-Z0-9])?@[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z]{2,})+$/;
    if (!emailRegex.test(email.trim()) || email.includes("..") || email.includes(".-") || email.includes("-.")) {
      errors.email = "Please enter a valid email address";
    }
  }

  // Validate phone
  if (!phone || !phone.trim()) {
    errors.phone = "Phone number is required";
  } else {
    const digitsOnly = phone.replace(/\D/g, "");
    if (digitsOnly.length < 10) {
      errors.phone = "Phone number must have at least 10 digits";
    } else if (digitsOnly.length > 12) {
      errors.phone = "Phone number cannot exceed 12 digits";
    } else if (!/^[\d\s\-+()]+$/.test(phone)) {
      errors.phone = "Please enter a valid phone number";
    }
  }

  // Validate message
  if (!message || !message.trim()) {
    errors.message = "Message is required";
  } else if (message.trim().length < 10) {
    errors.message = "Message must be at least 10 characters";
  } else if (message.trim().length > 2000) {
    errors.message = "Message cannot exceed 2000 characters";
  }

  // Return errors if any
  if (Object.keys(errors).length > 0) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors,
    });
  }

  // Get IP and User Agent for tracking
  const ipAddress = req.ip || req.headers["x-forwarded-for"] || req.connection.remoteAddress;
  const userAgent = req.headers["user-agent"];

  // Create contact entry
  const contact = await Contact.create({
    fullName: fullName.trim(),
    email: email.trim().toLowerCase(),
    phone: phone.trim(),
    message: message.trim(),
    ipAddress,
    userAgent,
    source: "website",
  });

  res.status(201).json({
    success: true,
    message: "Your message has been sent successfully. We will get back to you soon.",
    data: {
      id: contact._id,
      fullName: contact.fullName,
      email: contact.email,
    },
  });
});

// @desc    Get all contacts (Admin)
// @route   GET /api/contact
// @access  Private/Admin
const getAllContacts = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 20, search } = req.query;

  const query = {};

  if (status && status !== "all") {
    query.status = status;
  }

  if (search) {
    const searchRegex = buildDiacriticInsensitiveRegex(search);
    if (searchRegex) {
      query.$or = [
        { fullName: { $regex: searchRegex } },
        { email: { $regex: searchRegex } },
        { phone: { $regex: searchRegex } },
      ];
    }
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [contacts, total] = await Promise.all([
    Contact.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    Contact.countDocuments(query),
  ]);

  res.json({
    success: true,
    data: contacts,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit)),
    },
  });
});

// @desc    Get single contact (Admin)
// @route   GET /api/contact/:id
// @access  Private/Admin
const getContact = asyncHandler(async (req, res) => {
  const contact = await Contact.findById(req.params.id);

  if (!contact) {
    return res.status(404).json({
      success: false,
      message: "Contact not found",
    });
  }

  // Mark as read if new
  if (contact.status === "new") {
    contact.status = "read";
    await contact.save();
  }

  res.json({
    success: true,
    data: contact,
  });
});

// @desc    Update contact status (Admin)
// @route   PATCH /api/contact/:id/status
// @access  Private/Admin
const updateContactStatus = asyncHandler(async (req, res) => {
  const { status, notes } = req.body;

  const validStatuses = ["new", "read", "replied", "archived"];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      message: "Invalid status",
    });
  }

  const contact = await Contact.findById(req.params.id);

  if (!contact) {
    return res.status(404).json({
      success: false,
      message: "Contact not found",
    });
  }

  contact.status = status;
  if (notes) contact.notes = notes;
  if (status === "replied") {
    contact.repliedAt = new Date();
    contact.repliedBy = req.user?._id;
  }

  await contact.save();

  res.json({
    success: true,
    message: "Contact status updated",
    data: contact,
  });
});

// @desc    Delete contact (Admin)
// @route   DELETE /api/contact/:id
// @access  Private/Admin
const deleteContact = asyncHandler(async (req, res) => {
  const contact = await Contact.findById(req.params.id);

  if (!contact) {
    return res.status(404).json({
      success: false,
      message: "Contact not found",
    });
  }

  await contact.deleteOne();

  res.json({
    success: true,
    message: "Contact deleted successfully",
  });
});

// @desc    Get contact statistics (Admin)
// @route   GET /api/contact/stats
// @access  Private/Admin
const getContactStats = asyncHandler(async (req, res) => {
  const stats = await Contact.aggregate([
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
  ]);

  const totalContacts = await Contact.countDocuments();
  const todayContacts = await Contact.countDocuments({
    createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
  });

  const formattedStats = {
    total: totalContacts,
    today: todayContacts,
    new: 0,
    read: 0,
    replied: 0,
    archived: 0,
  };

  stats.forEach((stat) => {
    formattedStats[stat._id] = stat.count;
  });

  res.json({
    success: true,
    data: formattedStats,
  });
});

module.exports = {
  submitContact,
  getAllContacts,
  getContact,
  updateContactStatus,
  deleteContact,
  getContactStats,
};
