const express = require("express");
const router = express.Router();
const UserSetting = require("../models/UserSetting");

// 로그인한 유저의 설정 가져오기
router.get("/", async (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.status(401).json({ error: "로그인 필요" });

  try {
    const settings = await UserSetting.findOne({ userId });
    res.json(settings || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 로그인한 유저 설정 저장/업데이트
router.post("/", async (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.status(401).json({ error: "로그인 필요" });

  try {
    const data = req.body;
    const updated = await UserSetting.findOneAndUpdate(
      { userId },
      { ...data, userId },
      { upsert: true, new: true } // 없으면 생성
    );
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
