require("dotenv").config();
const mongoose = require("mongoose");

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const restaurantId = new mongoose.Types.ObjectId("67f6dab0655faf9843288537");
  const jobs = await mongoose.connection.db
    .collection("printjobs")
    .find({ restaurantId })
    .sort({ createdAt: -1 })
    .limit(30)
    .project({
      orderNumber: 1,
      orderId: 1,
      status: 1,
      printRole: 1,
      printerKey: 1,
      idempotencyKey: 1,
      source: 1,
      createdAt: 1,
      sentAt: 1,
      failedAt: 1,
      lastError: 1,
      retryCount: 1,
    })
    .toArray();
  console.log(JSON.stringify(jobs, null, 2));
  const byStatus = await mongoose.connection.db
    .collection("printjobs")
    .aggregate([{ $match: { restaurantId } }, { $group: { _id: "$status", n: { $sum: 1 } } }])
    .toArray();
  console.log("byStatus", byStatus);
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
