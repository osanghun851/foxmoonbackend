const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const User = require("../models/User");

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
    return res.status(401).json({ error: "토큰이 유효하지 않습니다." });
  }
}

// ================= 유틸 함수 =================
const eqId = (a, b) => String(a) === String(b);

async function findByUsernameOr404(username, res) {
  const u = await User.findOne({ username });
  if (!u) {
    res.status(404).json({ error: "사용자를 찾을 수 없습니다." });
    return null;
  }
  return u;
}

// ================= 친구 요청 =================
router.post("/friends/request", authMiddleware, async (req, res) => {
  const { friendName } = req.body;
  if (!friendName) return res.status(400).json({ error: "friendName 필요" });

  try {
    const me = await User.findById(req.user.userId);
    const friend = await findByUsernameOr404(friendName, res);
    if (!friend) return;

    if (eqId(me._id, friend._id)) {
      return res.status(400).json({ error: "자기 자신에게는 요청할 수 없습니다." });
    }

    if (me.friends.some(id => eqId(id, friend._id))) {
      return res.status(400).json({ error: "이미 친구입니다." });
    }

    if (me.sentRequests.some(id => eqId(id, friend._id))) {
      return res.status(400).json({ error: "이미 친구 요청을 보냈습니다." });
    }

    // 상대가 이미 나에게 요청 보냈다면 → 자동 수락
    if (me.friendRequests.some(id => eqId(id, friend._id))) {
      if (!me.friends.some(id => eqId(id, friend._id))) me.friends.push(friend._id);
      if (!friend.friends.some(id => eqId(id, me._id))) friend.friends.push(me._id);

      me.friendRequests = me.friendRequests.filter(id => !eqId(id, friend._id));
      friend.sentRequests = friend.sentRequests.filter(id => !eqId(id, me._id));

      await me.save();
      await friend.save();
      return res.json({ message: "상대의 기존 요청을 자동 수락했습니다. 친구가 되었습니다." });
    }

    // 일반 친구 요청
    me.sentRequests.push(friend._id);
    friend.friendRequests.push(me._id);
    await me.save();
    await friend.save();

    res.json({ message: "친구 요청을 보냈습니다." });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "친구 요청 실패" });
  }
});

// ================= 요청 목록 조회 =================
router.get("/friends/requests", authMiddleware, async (req, res) => {
  try {
    const me = await User.findById(req.user.userId).populate("friendRequests", "username");
    res.json({
      requests: me.friendRequests.map(u => ({ _id: u._id, username: u.username }))
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "요청 목록을 불러올 수 없습니다." });
  }
});

// ================= 친구 요청 수락 =================
router.post("/friends/accept", authMiddleware, async (req, res) => {
  const { friendName } = req.body;
  if (!friendName) return res.status(400).json({ error: "friendName 필요" });

  try {
    const me = await User.findById(req.user.userId);
    const requester = await findByUsernameOr404(friendName, res);
    if (!requester) return;

    if (!me.friendRequests.some(id => eqId(id, requester._id))) {
      return res.status(400).json({ error: "해당 사용자로부터 받은 요청이 없습니다." });
    }

    if (!me.friends.some(id => eqId(id, requester._id))) {
      me.friends.push(requester._id);
    }
    if (!requester.friends.some(id => eqId(id, me._id))) {
      requester.friends.push(me._id);
    }

    me.friendRequests = me.friendRequests.filter(id => !eqId(id, requester._id));
    requester.sentRequests = requester.sentRequests.filter(id => !eqId(id, me._id));

    await me.save();
    await requester.save();

    res.json({ message: "친구 요청을 수락했습니다." });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "친구 요청 수락 실패" });
  }
});

// ================= 친구 요청 거절 =================
router.post("/friends/reject", authMiddleware, async (req, res) => {
  const { friendName } = req.body;
  if (!friendName) return res.status(400).json({ error: "friendName 필요" });

  try {
    const me = await User.findById(req.user.userId);
    const requester = await findByUsernameOr404(friendName, res);
    if (!requester) return;

    if (!me.friendRequests.some(id => eqId(id, requester._id))) {
      return res.status(400).json({ error: "해당 사용자로부터 받은 요청이 없습니다." });
    }

    me.friendRequests = me.friendRequests.filter(id => !eqId(id, requester._id));
    requester.sentRequests = requester.sentRequests.filter(id => !eqId(id, me._id));

    await me.save();
    await requester.save();

    res.json({ message: "친구 요청을 거절했습니다." });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "친구 요청 거절 실패" });
  }
});

// ================= 친구 목록 조회 =================
router.get("/friends/list", authMiddleware, async (req, res) => {
  try {
    const me = await User.findById(req.user.userId).populate("friends", "username");
    res.json({ friends: me.friends.map(u => u.username) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "친구 목록을 불러올 수 없습니다." });
  }
});

// ================= 친구의 여우집 보기 =================
router.post("/friends/foxhomeData", authMiddleware, async (req, res) => {
  try {
    const { friendName } = req.body;
    if (!friendName) {
      return res.status(400).json({ message: "friendName이 필요합니다." });
    }

    const user = await User.findById(req.user.userId).populate("friends", "username foxhomeData");
    if (!user) {
      return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });
    }

    const friend = user.friends.find(f => f.username === friendName);
    if (!friend) {
      return res.status(404).json({ message: "친구 목록에 없는 사용자입니다." });
    }

    res.json({ username: friend.username, foxhomeData: friend.foxhomeData });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "서버 오류 발생" });
  }
});

// ================= 친구 삭제 =================
router.delete("/friends/delete", authMiddleware, async (req, res) => {
  try {
    const { friendName } = req.body;
    if (!friendName) {
      return res.status(400).json({ message: "friendName이 필요합니다." });
    }

    const friend = await User.findOne({ username: friendName });
    if (!friend) {
      return res.status(404).json({ message: "해당 이름의 친구를 찾을 수 없습니다." });
    }

    await User.findByIdAndUpdate(req.user.userId, {
      $pull: { friends: friend._id }
    });
    await User.findByIdAndUpdate(friend._id, {
      $pull: { friends: req.user.userId }
    });

    res.json({ message: `${friendName} 친구가 성공적으로 삭제되었습니다.` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "서버 오류 발생" });
  }
});

// ================= 선물하기 =================
router.post("/friends/gift", authMiddleware, async (req, res) => {
  try {
    const { friendName } = req.body;
    const user = await User.findById(req.user.userId);
    if (user.coin >= 10) {
      user.coin -= 10;
      await user.save();
    } else {
      throw new Error("코인이 부족합니다!");
    }

    const friend = await User.findOne({ username: friendName });
    friend.coin += 10;
    await friend.save();

    res.json({ message: `🎁 ${friend.username}님에게 선물을 전달했습니다!` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
