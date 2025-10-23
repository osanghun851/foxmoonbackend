const express = require("express");
const router = express.Router();
const User = require("../models/User");

// 로그인 체크 미들웨어
function requireLogin(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ message: "로그인 필요" });
  next();
}

// foxhomeData 저장
router.post("/foxhomeData/save", requireLogin, async (req, res) => {
  try {
    const data = req.body; // { 벽지: "", 카펫: "카펫" }

    const user = await User.findByIdAndUpdate(
      req.session.userId,
      { foxhomeData: data }, // User 모델에 foxhome: Object 형태 필드 필요
      { new: true }
    );

    res.json({ message: `저장완료 : ${data}`, foxhomeData: user.foxhomeData });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
