// routes/friends.js
const express = require("express");
const router = express.Router();
const User = require("../models/User");

// 세션 로그인 체크
function requireLogin(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "로그인이 필요합니다." });
  }
  next();
}

// 유틸: ObjectId 동일성 비교
const eqId = (a, b) => String(a) === String(b);

// [보조] username으로 유저 찾기
async function findByUsernameOr404(username, res) {
  const u = await User.findOne({ username });
  if (!u) {
    res.status(404).json({ error: "사용자를 찾을 수 없습니다." });
    return null;
  }
  return u;
}

/**
 * POST /friends/request
 * body: { friendName }
 * 동작:
 *  - 자기 자신 금지
 *  - 이미 친구면 금지
 *  - 중복 요청 금지
 *  - 상대가 이미 나에게 보낸 요청이 있으면: 그 자리에서 상호 친구 처리(자동 수락) or 에러
 *    → 여기서는 **자동 수락** 처리(UX 편의)
 */
router.post("/friends/request", requireLogin, async (req, res) => {
  const { friendName } = req.body;
  if (!friendName) return res.status(400).json({ error: "friendName 필요" });

  try {
    const me = await User.findById(req.session.userId);
    const friend = await findByUsernameOr404(friendName, res);
    if (!friend) return;

    if (eqId(me._id, friend._id)) {
      return res.status(400).json({ error: "자기 자신에게는 요청할 수 없습니다." });
    }

    // 이미 친구?
    if (me.friends.some(id => eqId(id, friend._id))) {
      return res.status(400).json({ error: "이미 친구입니다." });
    }

    // 내가 이미 보낸 요청?
    if (me.sentRequests.some(id => eqId(id, friend._id))) {
      return res.status(400).json({ error: "이미 친구 요청을 보냈습니다." });
    }

    // 내가 이미 받은 요청(상대가 보낸 요청)이 있으면 → 즉시 상호 친구 처리(자동 수락)
    if (me.friendRequests.some(id => eqId(id, friend._id))) {
      // 양쪽 friends에 추가
      if (!me.friends.some(id => eqId(id, friend._id))) me.friends.push(friend._id);
      if (!friend.friends.some(id => eqId(id, me._id))) friend.friends.push(me._id);

      // 대기중인 요청 제거
      me.friendRequests = me.friendRequests.filter(id => !eqId(id, friend._id));
      friend.sentRequests = friend.sentRequests.filter(id => !eqId(id, me._id));

      await me.save();
      await friend.save();
      return res.json({ message: "상대의 기존 요청을 자동 수락했습니다. 친구가 되었습니다." });
    }

    // 일반적 흐름: 요청 생성
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

/**
 * GET /friends/requests
 * 내가 받은 요청 목록 반환
 * 반환: { requests: [{ _id, username }] }
 */
router.get("/friends/requests", requireLogin, async (req, res) => {
  try {
    const me = await User.findById(req.session.userId).populate("friendRequests", "username");
    res.json({
      requests: me.friendRequests.map(u => ({ _id: u._id, username: u.username }))
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "요청 목록을 불러올 수 없습니다." });
  }
});

/**
 * POST /friends/accept
 * body: { friendName }
 * — 받은 요청을 수락 → 양쪽 friends에 추가, 대기열에서 제거
 */
router.post("/friends/accept", requireLogin, async (req, res) => {
  const { friendName } = req.body;
  if (!friendName) return res.status(400).json({ error: "friendName 필요" });

  try {
    const me = await User.findById(req.session.userId);
    const requester = await findByUsernameOr404(friendName, res);
    if (!requester) return;

    // 나에게 온 요청이 맞는지 확인
    if (!me.friendRequests.some(id => eqId(id, requester._id))) {
      return res.status(400).json({ error: "해당 사용자로부터 받은 요청이 없습니다." });
    }

    // 이미 친구인지 확인(중복 방지)
    if (!me.friends.some(id => eqId(id, requester._id))) {
      me.friends.push(requester._id);
    }
    if (!requester.friends.some(id => eqId(id, me._id))) {
      requester.friends.push(me._id);
    }

    // 대기 요청 제거
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

/**
 * POST /friends/reject
 * body: { friendName }
 * — 받은 요청을 거절 → 대기열에서만 제거, friends에는 추가하지 않음
 */
router.post("/friends/reject", requireLogin, async (req, res) => {
  const { friendName } = req.body;
  if (!friendName) return res.status(400).json({ error: "friendName 필요" });

  try {
    const me = await User.findById(req.session.userId);
    const requester = await findByUsernameOr404(friendName, res);
    if (!requester) return;

    // 나에게 온 요청인지 확인
    if (!me.friendRequests.some(id => eqId(id, requester._id))) {
      return res.status(400).json({ error: "해당 사용자로부터 받은 요청이 없습니다." });
    }

    // 대기 요청만 삭제
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

/**
 * GET /friends/list
 * 내 친구 목록 username 배열로 반환 (friend.html 기대 형태)
 * 반환: { friends: [ "alice", "bob", ... ] }
 */
router.get("/friends/list", requireLogin, async (req, res) => {
  try {
    const me = await User.findById(req.session.userId).populate("friends", "username");
    res.json({ friends: me.friends.map(u => u.username) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "친구 목록을 불러올 수 없습니다." });
  }
});

//친구집 정보
// 특정 친구의 foxhomeData 가져오기 (POST + body)
router.post("/friends/foxhomeData", async (req, res) => {
  try {
    const userId = req.session.userId; // 세션에서 로그인된 유저 ID
    const { friendName } = req.body;

    if (!userId) {
      return res.status(401).json({ message: "로그인이 필요합니다." });
    }

    if (!friendName) {
      return res.status(400).json({ message: "friendName이 필요합니다." });
    }

    // 현재 유저 정보 + friends populate
    const user = await User.findById(userId).populate("friends", "username foxhomeData");

    if (!user) {
      return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });
    }

    // 친구 목록에서 friendName 찾기
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

// 친구 삭제
router.delete("/friends/delete", async (req, res) => {
  try {
    const userId = req.session.userId;   // 세션에서 가져오기
    const { friendName } = req.body;

    if (!userId) {
      return res.status(401).json({ message: "로그인이 필요합니다." });
    }
    if (!friendName) {
      return res.status(400).json({ message: "friendName이 필요합니다." });
    }

    // 삭제할 친구 찾기
    const friend = await User.findOne({ username: friendName });
    if (!friend) {
      return res.status(404).json({ message: "해당 이름의 친구를 찾을 수 없습니다." });
    }

    // user의 친구 목록에서 삭제
    await User.findByIdAndUpdate(userId, {
      $pull: { friends: friend._id }
    });

    // 양방향 삭제
    await User.findByIdAndUpdate(friend._id, {
      $pull: { friends: userId }
    });

    res.json({ message: `${friendName} 친구가 성공적으로 삭제되었습니다.` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "서버 오류 발생" });
  }
});

//선물하기
router.post("/friends/gift", async (req, res) => {
  try {
    const userId = req.session.userId; // 세션에서 로그인된 유저 ID
    const { friendName } = req.body;
    const user = await User.findById(userId);
    if (user.coin>=10){
    user.coin-=10;
    await user.save();
    }
    else{
      throw new Error("코인이 부족합니다!")
    }
    const friend = await User.findOne({ username: friendName });
    friend.coin += 10;
    await friend.save();

    res.json({ message: `🎁 ${friend.username}님에게 선물을 전달했습니다!` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
