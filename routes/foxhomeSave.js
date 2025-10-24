const express = require("express");
const router = express.Router();
const User = require("../models/User");
const jwt = require("jsonwebtoken");
// 로그인 체크 미들웨어
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "로그인 필요" });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // userId, username 등 저장됨
    next();
  } catch (err) {
    return res.status(401).json({ message: "토큰이 유효하지 않습니다." });
  }
}

// 🦊 여우집(foxhome) 데이터 저장
router.post("/foxhomeData/save", authMiddleware, async (req, res) => {
  try {
    const data = req.body; // { 벽지: "", 카펫: "" }

    const user = await User.findByIdAndUpdate(
      req.user.userId, // ✅ JWT에서 가져옴
      { foxhomeData: data },
      { new: true }
    );

    res.json({
      message: `저장완료`,
      foxhomeData: user.foxhomeData
    });
  } catch (err) {
    console.error("❌ foxhomeData 저장 실패:", err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
