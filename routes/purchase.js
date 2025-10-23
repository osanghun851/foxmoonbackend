const express = require("express");
const router = express.Router();
const UserItem = require("../models/UserItem");
const User = require("../models/User");

// 아이템 구매
router.post("/purchase", async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ message: "로그인이 필요합니다!" });
    }

    const userId = req.session.userId;
    const { itemName, itemType, price } = req.body;   // ✅ 아이템 가격도 받음

    if (!itemName || !price) {
        return res.status(400).json({ error: "아이템 이름과 가격이 필요합니다." });
    }

    try {
        // 유저 조회
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: "유저를 찾을 수 없습니다." });
        
        // 이미 아이템 보유 여부 확인
        const existingItem = await UserItem.findOne({ userId, itemName });
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
        const newItem = await UserItem.create({ userId, itemName, itemType, price });

        res.json({
            message: `아이템 구매 완료, 남은코인:${user.coin}`,
            item: newItem,
            remainCoin: user.coin
        });
    } catch (err) {
        res.status(400).json({ error: "구매 실패: " + err.message });
    }
});

module.exports = router;

