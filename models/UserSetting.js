const mongoose = require("mongoose");

const UserSettingSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // ← 추가
  
  region: { type: String, default: ""},
  district: { type: String, default: "" },
  work: { type: Boolean, default: false },
  workEdu: { type: String, default: "" }, // 예: "10", "20", ... 또는 ""
  workCo:  { type: String, default: "" },
  home: { type: Boolean, default: false },
  news: { type: Boolean, default: false },
  newskeyword: { type: String, default: "" },
  emailrecive: { type: Boolean, default: true },
  lastSent: { type: Date, default: null }
});

module.exports = mongoose.model("UserSetting", UserSettingSchema);
