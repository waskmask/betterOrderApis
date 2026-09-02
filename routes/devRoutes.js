const express = require("express");
const router = express.Router();
const asyncHandler = require("../utils/asyncHandler");
const { renderEmail } = require("../services/email/renderEmail");
const Order = require("../modals/Order");
const { buildOrderEmailData } = require("../services/email/orderEmailData");

router.get(
  "/email-preview",
  asyncHandler(async (req, res) => {
    if (process.env.NODE_ENV === "production") {
      return res.status(404).json({ message: "Not found" });
    }

    const template = String(req.query.template || "auth.welcome");
    const lang = String(req.query.lang || "en");
    let data = {
      name: "Preview User",
      actionUrl: "https://example.com/action",
    };

    if (req.query.orderId) {
      const order = await Order.findById(req.query.orderId);
      if (order) {
        data = await buildOrderEmailData(order, lang);
      }
    }

    const rendered = await renderEmail({ template, lang, data });
    return res.json({
      success: true,
      template,
      lang,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
  })
);

module.exports = router;
