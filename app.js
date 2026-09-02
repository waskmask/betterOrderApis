const express = require("express");
const http = require("http");
const cookieParser = require("cookie-parser");
const dotenv = require("dotenv");
const connectDB = require("./config/db");
const { startOrderExpiryService } = require("./services/orderExpiryService");
const { startOutboxWorker } = require("./services/outboxService");
const { startScheduledReleaseService } = require("./services/orderReleaseService");
const { initOrderRealtimeRedis, shutdownOrderRealtimeRedis } = require("./services/orderRealtimeService");
const opsMonitoringController = require("./controllers/opsMonitoringController");
const passport = require("./utils/passport");
const errorHandler = require("./middlewares/errorHandler");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const adminRoutes = require("./routes/adminAuthRoutes");
const cuisineRoutes = require("./routes/cuisineRoutes");
const restaurantRoutes = require("./routes/restaurantRoutes");
const restaurantAuthRoutes = require("./routes/restaurantAuthRoutes");
const adminUserRoutes = require("./routes/adminUserRoutes");
const restaurantMenuRoutes = require("./routes/restaurantMenuRoutes");
const restaurantProfileRoutes = require("./routes/restaurantProfileRoutes");
const reviewRoutes = require("./routes/reviewRoutes");
const contactRoutes = require("./routes/contactRoutes");
const suggestRestaurantRoutes = require("./routes/suggestRestaurantRoutes");
const restaurantOnboardingRoutes = require("./routes/restaurantOnboardingRoutes");
const restaurantStaffRoutes = require("./routes/restaurantStaffRoutes");
const appUserRoutes = require("./routes/appUserRoutes");
const foodInfoRoutes = require("./routes/foodInfoRoutes");
const orderRoutes = require("./routes/orderRoutes");
const mobileRoutes = require("./routes/mobileRoutes");
const dineInRoutes = require("./routes/dineInRoutes");
const moduleRoutes = require("./routes/moduleRoutes");
const platformSettingsRoutes = require("./routes/platformSettingsRoutes");
const printRoutes = require("./routes/printRoutes");
const { getPublicUploadUrl, isR2Configured } = require("./utils/r2Storage");
const { initRealtimeSocket } = require("./services/realtimeSocketService");

dotenv.config();

const app = express();
const server = http.createServer(app);
const uploadsDir = path.join(__dirname, "uploads");
const publicDir = path.join(__dirname, "public");
const serveLocalUploads = express.static(uploadsDir);
const servePublicAssets = express.static(publicDir);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());

const whitelist = [
  "http://localhost:4001",
  "http://localhost:4002",
  "http://localhost:4003",
  "http://localhost:5173",  // Vite dev server
  "http://127.0.0.1:5173",
  "http://127.0.0.1:4001",
  "http://127.0.0.1:4002",
  "http://127.0.0.1:4003",
  "https://modest-colden.217-154-80-239.plesk.page",  // Production frontend
];

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl)
      if (!origin || whitelist.includes(origin)) {
        callback(null, true);
      } else {
        console.log("Blocked origin:", origin);
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true, // ✅ allows cookies
  })
);
app.use("/uploads", (req, res, next) => {
  const localPath = path.resolve(uploadsDir, `.${req.path}`);
  const isInsideUploads =
    localPath === uploadsDir || localPath.startsWith(`${uploadsDir}${path.sep}`);
  if (isInsideUploads && fs.existsSync(localPath)) {
    return serveLocalUploads(req, res, next);
  }

  if (isR2Configured()) {
    const publicUrl = getPublicUploadUrl(`/uploads${req.path}`);
    if (publicUrl) return res.redirect(302, publicUrl);
  }

  return next();
});
app.use("/public", servePublicAssets);
app.use(passport.initialize());

app.get("/ping", (req, res) => {
  return res.json({ success: true, dbConnected: global.dbConnected || false });
});

// Block all routes if DB is offline
app.use((req, res, next) => {
  if (req.path === "/ping") return next(); // allow /ping even if offline
  if (global.dbConnected === false) {
    return res
      .status(503)
      .json({
        success: false,
        message: "You are offline. Please try again later.",
      });
  }
  next();
});

app.use("/api/admin", adminRoutes);
app.use("/api/cuisine", cuisineRoutes);
app.use("/api/restaurant", restaurantRoutes);
app.use("/api/restaurant-auth", restaurantAuthRoutes);
app.use("/api/admin-users", adminUserRoutes);
app.use("/api/restaurant-menu", restaurantMenuRoutes);
app.use("/api/restaurant-profile", restaurantProfileRoutes);
app.use("/api/app-users", appUserRoutes);
app.use("/api/food-info", foodInfoRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/print", printRoutes);
app.get("/api/ops/monitoring", require("./middlewares/auth").verifyToken, opsMonitoringController.getOpsMonitoring);
app.use("/api/mobile", mobileRoutes);
app.use("/api/dine-in", dineInRoutes);
app.use("/api/modules", moduleRoutes);
app.use("/api/platform-settings", platformSettingsRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/suggest-restaurant", suggestRestaurantRoutes);
app.use("/api/restaurant-onboarding", restaurantOnboardingRoutes);
app.use("/api/restaurant-staff", restaurantStaffRoutes);
if (process.env.NODE_ENV !== "production") {
  app.use("/api/dev", require("./routes/devRoutes"));
}

app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// Global Error Handler
app.use(errorHandler);

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception thrown:", err);
});

const PORT = process.env.PORT || 4000;

initRealtimeSocket(server, { corsOrigins: whitelist });

const startServer = async () => {
  try {
    await connectDB();
    console.log("✅ MongoDB connected");
    startOrderExpiryService();
    startScheduledReleaseService();
    startOutboxWorker();
    await initOrderRealtimeRedis();
  } catch (err) {
    console.error("❌ MongoDB error:", err.message);
    console.warn("⚠️ Starting server without DB connection (offline mode)");
  }

  server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
};

async function gracefulShutdown(signal) {
  console.log(`${signal} received — shutting down`);
  try {
    await shutdownOrderRealtimeRedis();
  } catch (error) {
    console.warn("redis shutdown:", error.message);
  }
  process.exit(0);
}

process.on("SIGINT", () => void gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => void gracefulShutdown("SIGTERM"));

startServer();
