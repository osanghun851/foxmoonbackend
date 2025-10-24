const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const UserItem = require("../models/UserItem");

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

// ================= 로그인한 유저 정보 =================
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId)
      .select("username coin foxhomeData");
    const items = await UserItem.find({ userId: req.user.userId })
      .select("itemName itemType");

    res.json({ user, userItems: items });
  } catch (err) {
    console.error("❌ /me 오류:", err);
    res.status(500).json({ error: "정보를 가져오는 중 오류 발생: " + err.message });
  }
});

// ================= 주소 정보 =================
router.get("/address", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("address");
    if (!user) return res.status(404).json({ error: "사용자를 찾을 수 없습니다." });

    res.json({ address: user.address }); // 예: "경기도/성남시"
  } catch (err) {
    console.error("❌ /address 오류:", err);
    res.status(500).json({ error: "서버 오류" });
  }
});

// ================= 마이페이지 로드 =================
router.get("/mypage-load", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId)
      .select("Rname username address birth email coin profile");

    res.json({ user });
  } catch (err) {
    console.error("❌ /mypage-load 오류:", err);
    res.status(500).json({ error: "정보를 가져오는 중 오류 발생: " + err.message });
  }
});

// ================= 유저 정보 수정 =================
router.post("/fix", authMiddleware, async (req, res) => {
  const updateData = req.body;

  try {
    const updatedUser = await User.findByIdAndUpdate(
      req.user.userId,
      { $set: updateData },
      { new: true } // 수정된 결과 반환
    );

    res.json({
      message: "유저 정보가 성공적으로 수정되었습니다.",
      user: updatedUser,
    });
  } catch (err) {
    console.error("❌ /fix 오류:", err);
    res.status(500).json({ error: "정보 수정 중 오류 발생: " + err.message });
  }
});

module.exports = router;

