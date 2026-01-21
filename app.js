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

dotenv.config();

const app = express();
app.use(express.json());
app.use(cookieParser());

const whitelist = ["http://localhost:5000", "http://localhost:5173", "http://localhost:3001"]; // frontend origins

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      
      if (whitelist.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true, // ✅ allows cookies
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-session-id"],
    exposedHeaders: ["Set-Cookie"],
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
app.use("/api/customer", require("./routes/customerAuthRoutes"));
app.use("/api/public", require("./routes/publicRoutes"));
app.use("/api/cart", require("./routes/cartRoutes"));
app.use("/api/orders", require("./routes/orderRoutes"));
app.use("/api/favorites", require("./routes/favoriteRoutes"));
app.use("/api/customer/address", require("./routes/addressRoutes"));
app.use("/api/reviews", require("./routes/reviewRoutes"));

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
