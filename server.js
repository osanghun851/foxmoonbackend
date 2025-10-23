require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const session = require("express-session");
const bodyParser = require("body-parser");
const path = require("path");
const bcrypt = require("bcryptjs");
const axios = require("axios");
const { XMLParser } = require("fast-xml-parser");
const natural = require("natural");
const fetch = require("node-fetch");
const nodemailer = require("nodemailer");

// 모델 및 라우트
const User = require("./models/User");
const UserSetting = require("./models/UserSetting");
const UserDataCache = require("./models/UserDataCache");
const GlobalData = require("./models/GlobalData");
const purchaseRouter = require("./routes/purchase");
const userRouter = require("./routes/user");
const friendsRouter = require("./routes/friends");
const userSettingRouter = require("./routes/userSetting");
const foxhomeRouter = require("./routes/foxhomeSave");
const auth = require("./routes/auth");

// 앱 초기화
const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB Atlas 연결
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log("✅ MongoDB Atlas 연결 성공"))
.catch(err => console.error("❌ MongoDB 연결 실패", err));

// 미들웨어
app.use(cors({
  origin: [
    
    "https://foxmoon.vercel.app"
  ],
  credentials: true
}));
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use(session({
  secret: process.env.SESSION_SECRET || "foxmoon_secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 60 * 60 * 1000,
    httpOnly: true,
    sameSite: "none",         
    secure: true, 
  },
}));

// 라우터 연결
app.use("/api", purchaseRouter);
app.use("/api/user", userRouter);
app.use("/friends", friendsRouter);
app.use("/api/settings", userSettingRouter);
app.use(friendsRouter);
app.use(foxhomeRouter);
app.use(auth);

// ================= 회원가입 / 로그인 =================
app.post("/register", async (req, res) => {
  const { username, pw, Rname, address, birth, email } = req.body;
  try {
    const exists = await User.findOne({ username });
    if (exists) return res.status(400).json({ error: "이미 존재하는 사용자명입니다." });
    const hashedPassword = await bcrypt.hash(pw, 10);
    const newUser = await User.create({ username, password: hashedPassword, Rname, address, birth, email });
    res.json({ message: "회원가입 성공", user: newUser.username });
  } catch (err) {
    res.status(400).json({ error: "회원가입 실패: " + err.message });
  }
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  if (!user) return res.status(400).json({ error: "사용자를 찾을 수 없음" });
  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) return res.status(400).json({ error: "비밀번호 오류" });
  req.session.userId = user._id;
  req.session.username = user.username;
  res.json({ message: "로그인 성공", username: user.username });
});

app.post("/logout", (req, res) => {
  req.session.destroy();
  res.json({ message: "로그아웃 완료" });
});

app.get("/profile", (req, res) => {
  if (req.session.userId) res.json({ username: req.session.username });
  else res.status(401).json({ error: "로그인 필요" });
});

// ================= 네이버 지역검색 =================
const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID;
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;

app.get("/api/search/local", async (req, res) => {
  const query = req.query.query;
  if (!query) return res.status(400).json({ error: "query parameter is required" });
  try {
    const response = await axios.get("https://openapi.naver.com/v1/search/local.json", {
      params: { query, display: 5 },
      headers: {
        "X-Naver-Client-Id": NAVER_CLIENT_ID,
        "X-Naver-Client-Secret": NAVER_CLIENT_SECRET,
      },
    });
    res.json(response.data);
  } catch (err) {
    console.error("네이버 검색 API 오류:", err.response?.data || err.message);
    res.status(500).json({ error: "네이버 API 호출 실패" });
  }
});

// ================= GPT 코멘트 =================
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

app.post("/api/gpt-comment", async (req, res) => {
  const { title, content } = req.body;
  if (!title || !content) return res.status(400).json({ error: "title과 content 필요" });
  const prompt = `일기의 제목은 "${title}"이고, 내용은 다음과 같아:\n\n"${content}"\n\n이 일기를 쓴 사람에게 따뜻하고 진심 어린 공감 또는 위로의 말을 공백 포함 250characters 이내로 해줘.`;
  try {
    const response = await axios.post("https://api.openai.com/v1/chat/completions", {
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "당신은 따뜻하고 공감 잘하는 상담자입니다." },
        { role: "user", content: prompt }
      ],
      max_tokens: 300,
      temperature: 0.7
    }, {
      headers: { "Authorization": `Bearer ${OPENAI_API_KEY}` }
    });
    const message = response.data.choices?.[0]?.message?.content?.trim() || "오늘 하루 수고했어요.";
    res.json({ message });
  } catch (err) {
    console.error("GPT 서버 오류:", err.response?.data || err.message);
    res.status(500).json({ message: "GPT 요청 실패" });
  }
});

// ================= 코인 지급 =================
app.post("/api/scoreup", async (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.status(401).json({ error: "로그인 필요" });
  try {
    const updatedUser = await User.findByIdAndUpdate(userId, { $inc: { coin: 10 } }, { new: true });
    res.json({ message: "코인 지급 완료", coin: updatedUser.coin });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "코인 지급 실패" });
  }
});

// ================= 기러기 알림 (캐시 조회) =================
app.get("/api/user-data", async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: "로그인 필요" });
  try {
    const cache = await UserDataCache.findOne({ userId: req.session.userId });
    res.json({
      leaseItems: cache?.leaseItems || [],
      newsItems: cache?.newsItems || [],
      workItems: cache?.workItems || []
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "데이터 조회 실패" });
  }
});

// ================= 사용자 설정 저장 =================
app.post("/api/goosettings", async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) return res.status(401).json({ error: "로그인 필요" });
    let setting = await UserSetting.findOneAndUpdate(
      { userId },
      { ...req.body },
      { upsert: true, new: true }
    );
    res.json({ success: true, settings: setting });
  } catch (err) {
    console.error("설정 저장 실패:", err);
    res.status(500).json({ error: "Failed to save settings" });
  }
});

// ================= 서버 시작 =================
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
