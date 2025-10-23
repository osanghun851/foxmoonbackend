const mongoose = require("mongoose");


const LhItemSchema = new mongoose.Schema({
regionName: String, // e.g., "서울특별시 종로구"
provinceName: String, // e.g., "서울특별시" ← NEW
provinceCode: String, // e.g., "11" ← NEW
supplyTypeName: String,
complexName: String,
totalHouseholds: Number,
exclusiveArea: Number,
deposit: Number,
monthlyRent: Number,
firstMoveInYM: String // YYYYMM
}, { _id: false });


const WorknetItemSchema = new mongoose.Schema({
empSeqno: String,
title: String,
company: String,
type: String, // coClcdNm
period: String,
link: String,
// Raw filters to enable per-user selection later
empWantedEduCd: String, // e.g., "10", "20", "99"(무관)
coClcd: String // e.g., "10", "40"
}, { _id: false });


const GlobalDataSchema = new mongoose.Schema({
lh: { type: [LhItemSchema], default: [] },
worknet: { type: [WorknetItemSchema], default: [] },
updatedAt: { type: Date, default: Date.now }
});


module.exports = mongoose.model("GlobalData", GlobalDataSchema);