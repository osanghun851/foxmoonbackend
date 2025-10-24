const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const UserItem = require("../models/UserItem");
const User = require("../models/User");

// 🔑 JWT 인증 미들웨어
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "로그인이 필요합니다!" });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { userId, username }
    next();
  } catch (err) {
    return res.status(401).json({ message: "유효하지 않은 토큰입니다." });
  }
}

// ===================== 아이템 구매 =====================
router.post("/purchase", authMiddleware, async (req, res) => {
  const { itemName, itemType, price } = req.body;

  if (!itemName || !price) {
    return res.status(400).json({ error: "아이템 이름과 가격이 필요합니다." });
  }

  try {
    // 유저 조회
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: "유저를 찾을 수 없습니다." });

    // 이미 아이템 보유 여부 확인
    const existingItem = await UserItem.findOne({ userId: req.user.userId, itemName });
    if (existingItem) {
      return res.status(400).json({ error: "이미 보유하고 있는 아이템입니다." });
    }

    // 보유 코인 확인
    if (user.coin < price) {
      return res.status(400).json({ error: "코인이 부족합니다." });
    }

    // 코인 차감
    user.coin -= price;
    await user.save();

    // 아이템 저장
    const newItem = await UserItem.create({
      userId: req.user.userId,
      itemName,
      itemType,
      price
    });

    res.json({
      message: `아이템 구매 완료, 남은 코인: ${user.coin}`,
      item: newItem,
      remainCoin: user.coin
    });
  } catch (err) {
    console.error("❌ 아이템 구매 실패:", err);
    res.status(500).json({ error: "구매 실패: " + err.message });
  }
});

module.exports = router;

