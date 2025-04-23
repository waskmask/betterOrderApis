const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    global.dbConnected = true;
  } catch (error) {
    console.error("❌ MongoDB error:", error.message);
    global.dbConnected = false; // Important: mark DB as offline
    // Don't throw, let app continue running
  }
};

module.exports = connectDB;

// const mongoose = require("mongoose");

// const connectDB = async () => {
//   try {
//     await mongoose.connect(process.env.MONGO_URI);
//     console.log("✅ MongoDB connected");
//   } catch (error) {
//     console.error("❌ MongoDB error:", error.message);
//     process.exit(1);
//   }
// };

// module.exports = connectDB;
