const express = require("express");
const router = express.Router();
const User = require("../models/User");
const UserItem = require("../models/UserItem");

// 로그인한 유저 정보 가져오기
router.get("/me", async (req, res) => {
    const userId = req.session.userId;
    if(!userId) return res.status(401).json({ error: "로그인이 필요합니다." });

    try {
        const user = await User.findById(userId).select("username coin foxhomeData"); // coin 정보 포함
        const items = await UserItem.find({ userId }).select("itemName itemType");

        res.json({ user, userItems: items });
    } catch(err) {
        res.status(500).json({ error: "정보를 가져오는 중 오류 발생: " + err.message });
    }
});
router.get("/address", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ error: "로그인이 필요합니다." });
  
      const user = await User.findById(userId).select("address");
      if (!user) return res.status(404).json({ error: "사용자를 찾을 수 없습니다." });
  
      res.json({ address: user.address }); // 예: "경기도/성남시"
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "서버 오류" });
    }
  });
  router.get("/mypage-load", async (req, res) => {
    const userId = req.session.userId;
    if(!userId) return res.status(401).json({ error: "로그인이 필요합니다." });

    try {
        const user = await User.findById(userId).select("Rname username address birth email coin profile");

        res.json({ user });
    } catch(err) {
        res.status(500).json({ error: "정보를 가져오는 중 오류 발생: " + err.message });
    }
});

router.post("/fix",async (req, res)=>{
    const userId = req.session.userId;
    //const { Rname, birth, address, email, profile } = req.body;
    const updateData = req.body;

    if(!userId) return res.status(401).json({ error: "로그인이 필요합니다." });
    try {
      const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true } // 수정된 결과를 반환
    );
    res.json({
      message: "유저 정보가 성공적으로 수정되었습니다.",
      user: updatedUser,
    });
    } catch(err) {
        res.status(500).json({ error: "정보를 가져오는 중 오류 발생: " + err.message });
    }
})
module.exports = router;

