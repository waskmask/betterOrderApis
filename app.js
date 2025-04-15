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
connectDB();

const app = express();
app.use(express.json());
app.use(cookieParser());

const whitelist = ["http://localhost:5000"]; // frontend origin

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || whitelist.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true, // ✅ allows cookies
  })
);
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(passport.initialize());

app.use("/api/admin", adminRoutes);
app.use("/api/cuisine", cuisineRoutes);
app.use("/api/restaurant", restaurantRoutes);
app.use("/api/restaurant-auth", restaurantAuthRoutes);
app.use("/api/admin-users", adminUserRoutes);
app.use("/api/restaurant-menu", restaurantMenuRoutes);
app.use("/api/restaurant-profile", restaurantProfileRoutes);

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
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
