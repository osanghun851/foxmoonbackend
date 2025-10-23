const mongoose = require("mongoose");

const UserDataCacheSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  leaseItems: { type: Array, default: [] },
  newsItems: { type: Array, default: [] },
  workItems: { type: Array, default: [] },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("UserDataCache", UserDataCacheSchema);