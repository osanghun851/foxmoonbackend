const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  Rname:{type:String},
  address:{type:String},
  birth:{type:String},
  email:{type:String},
  password: { type: String, required: true },
  friends: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  coin:       { type: Number, default: 200 } ,
  profile:{ type: String, default: "profile.svg" },
  // 친구 요청(양방향 절차)
  friendRequests: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], // 내가 받은 요청 (상대 → 나)
  sentRequests:    [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], // 내가 보낸 요청 (나 → 상대)
  foxhomeData: {
    벽지: { type: String, default: "undefined" },
    카펫: { type: String, default: "카펫" },
    가구1: { type: String, default: "undefined,undefined,undefined,undefined" },
    가구2: { type: String, default: "undefined" },
    악세사리: { type: String, default: "undefined"  }
  }
},
 { timestamps: true });

module.exports = mongoose.model("User", UserSchema);