const express = require("express");
const User = require("../models/User");
const router = express.Router();

// username 중복 확인 API
router.get("/check-username", async (req, res) => {
  const { username } = req.query; // GET 쿼리스트링으로 전달
  if (!username) {
    return res.status(400).json({ available: false, message: "username이 필요합니다." });
  }

  try {
    const exists = await User.findOne({ username });
    if (exists) {
      return res.json({ available: false, message: "이미 존재하는 사용자명입니다." });
    } else {
      return res.json({ available: true, message: "사용 가능한 사용자명입니다." });
    }
  } catch (err) {
    return res.status(500).json({ available: false, message: "서버 오류: " + err.message });
  }
});

module.exports = router;
