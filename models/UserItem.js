const mongoose = require("mongoose");

const UserItemSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  itemName: { type: String, required: true },
  itemType: { type: String },  // 벽지, 카펫, 가구 등
  price:{ type: Number, required: true },
  purchasedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("UserItem", UserItemSchema);
