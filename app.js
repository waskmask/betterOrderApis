const express = require("express");
const cookieParser = require("cookie-parser");
const dotenv = require("dotenv");
const connectDB = require("./config/db");
const passport = require("./utils/passport");
const errorHandler = require("./middlewares/errorHandler");
const cors = require("cors");
const path = require("path");
const adminRoutes = require("./routes/adminAuthRoutes");
const cuisineRoutes = require("./routes/cuisineRoutes");
const restaurantRoutes = require("./routes/restaurantRoutes");
const restaurantAuthRoutes = require("./routes/restaurantAuthRoutes");
const adminUserRoutes = require("./routes/adminUserRoutes");
const restaurantMenuRoutes = require("./routes/restaurantMenuRoutes");
const restaurantProfileRoutes = require("./routes/restaurantProfileRoutes");
const contactRoutes = require("./routes/contactRoutes");
const suggestRestaurantRoutes = require("./routes/suggestRestaurantRoutes");
const restaurantOnboardingRoutes = require("./routes/restaurantOnboardingRoutes");

dotenv.config();

const app = express();
app.use(express.json());
app.use(cookieParser());

const whitelist = [
  "http://localhost:5000",
  "http://localhost:5173",  // Vite dev server
  "http://localhost:3000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5000",
  // Add your Netlify domain here
  // "https://your-app.netlify.app",
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
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
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
app.use("/api/contact", contactRoutes);
app.use("/api/suggest-restaurant", suggestRestaurantRoutes);
app.use("/api/restaurant-onboarding", restaurantOnboardingRoutes);

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

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    await connectDB();
    console.log("✅ MongoDB connected");
  } catch (err) {
    console.error("❌ MongoDB error:", err.message);
    console.warn("⚠️ Starting server without DB connection (offline mode)");
  }

  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
};

startServer();
