const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const UserSetting = require("../models/UserSetting");

// ================= JWT 인증 미들웨어 =================
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "로그인이 필요합니다." });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { userId, username }
    next();
  } catch (err) {
    return res.status(401).json({ error: "유효하지 않은 토큰입니다." });
  }
}

// ================= 로그인한 유저의 설정 가져오기 =================
router.get("/", authMiddleware, async (req, res) => {
  try {
    const settings = await UserSetting.findOne({ userId: req.user.userId });
    res.json(settings || {});
  } catch (err) {
    console.error("❌ 설정 불러오기 실패:", err);
    res.status(500).json({ error: err.message });
  }
});

// ================= 로그인한 유저 설정 저장/업데이트 =================
router.post("/", authMiddleware, async (req, res) => {
  try {
    const data = req.body;
    const updated = await UserSetting.findOneAndUpdate(
      { userId: req.user.userId },
      { ...data, userId: req.user.userId },
      { upsert: true, new: true } // 없으면 생성
    );

    res.json(updated);
  } catch (err) {
    console.error("❌ 설정 저장 실패:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
