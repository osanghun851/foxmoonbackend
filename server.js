const dotenv = require("dotenv");
dotenv.config();
const express = require("express");
const fetch = require("node-fetch");
const mongoose = require("mongoose");
const UserSetting = require("./models/UserSetting");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");
const axios = require('axios');
const User = require("./models/User");
const UserItem = require("./models/UserItem");
const purchaseRouter = require("./routes/purchase");
const userRouter = require("./routes/user");
const friendsRouter = require("./routes/friends");
const nodemailer = require("nodemailer");
const { XMLParser } = require("fast-xml-parser");
const natural = require("natural");
const TfIdf = natural.TfIdf;
const cron = require("node-cron");
const userSettingRouter = require("./routes/userSetting");
const foxhomeRouter = require("./routes/foxhomeSave");
const auth = require("./routes/auth");
const app = express();
const PORT = process.env.PORT || 3000;
const SERVICE_KEY = process.env.LH_SERVICE_KEY;
const LH_BASE = "http://apis.data.go.kr/B552555/lhLeaseInfo1/lhLeaseInfo1";
const typeOrder = ["07","08","09","10","11","13","17"];
const UserDataCache = require("./models/UserDataCache");
const { fetchAllLH, fetchAllWorknet } = require("./functions/globalFetchers");
const GlobalData = require("./models/GlobalData");

// ===================== MongoDB 연결 =====================



// MongoDB Atlas 연결
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log("✅ MongoDB Atlas 연결 성공"))
.catch(err => console.error("❌ MongoDB 연결 실패", err));

// 미들웨어
app.use(cors({
  origin: 
    
    "https://foxmoon.vercel.app"
  ,
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
app.set('trust proxy', 1);
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



// --- 네이버 지역검색 API ---
const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID;
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;


app.get('/api/search/local', async (req, res) => {
  const query = req.query.query;
  if (!query) return res.status(400).json({ error: 'query parameter is required' });

  try {
    const response = await axios.get('https://openapi.naver.com/v1/search/local.json', {
      params: { query, display: 5 },
      headers: {
        'X-Naver-Client-Id': NAVER_CLIENT_ID,
        'X-Naver-Client-Secret': NAVER_CLIENT_SECRET,
      },
    });

    res.json(response.data);
  } catch (err) {
    console.error('네이버 검색 API 오류:', err.response?.data || err.message);
    res.status(500).json({ error: '네이버 API 호출 실패' });
  }
});
//------------------------gpt
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

app.post('/api/gpt-comment', async (req, res) => {
  const { title, content } = req.body;

  if (!title || !content) {
    return res.status(400).json({ error: 'title과 content 필요' });
  }

  const prompt = `일기의 제목은 "${title}"이고, 내용은 다음과 같아:\n\n"${content}"\n\n이 일기를 쓴 사람에게 따뜻하고 진심 어린 공감 또는 위로의 말을 공백 포함 250characters 이내로 해줘.`;

  try {
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "당신은 따뜻하고 공감 잘하는 상담자입니다." },
        { role: "user", content: prompt }
      ],
      max_tokens: 300,
      temperature: 0.7
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      }
    });

    const message = response.data.choices?.[0]?.message?.content?.trim() || "오늘 하루 수고했어요. 당신의 이야기를 들을 수 있어 기뻐요.";
    res.json({ message });
  } catch (err) {
    console.error('GPT 서버 오류:', err.response?.data || err.message);
    res.status(500).json({ message: "GPT 요청 실패" });
  }
});
// 일기 제출 시 코인 지급
app.post("/api/scoreup", async (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.status(401).json({ error: "로그인 필요" });

  try {
    // 코인 10 증가
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $inc: { coin: 10 } },
      { new: true }
    );

    res.json({ message: "코인 지급 완료", coin: updatedUser.coin });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "코인 지급 실패" });
  }
});
//============================================기러기알림
app.get("/api/user-data", async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: "로그인 필요" });

  try {
    // UserDataCache에서 바로 가져오기
    const cache = await UserDataCache.findOne({ userId: req.session.userId });
    if (!cache) return res.json({ leaseItems: [], newsItems: [], workItems: [] });

    res.json({
      leaseItems: cache.leaseItems || [],
      newsItems: cache.newsItems || [],
      workItems: cache.workItems || []
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ leaseItems: [], newsItems: [], workItems: [] });
  }
});
// ===================== Nodemailer 설정 =====================
// ===================== Nodemailer (Gmail) 설정 =====================
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// ===================== HTML 태그 제거 =====================
function stripHtml(html) { return html.replace(/<[^>]*>?/gm, ""); }
// ===================== 뉴스 검색 =====================
const blacklist = [
  "연예","스타","방송","범죄","사건","사고","폭력","살인","강도","흉기",
  "스포츠","축구","야구","농구","사망","약물","불륜",
  "유흥","클럽","술","게임","오락","영화","갈등","혐오","스캔들",
  "사기","폭로","범죄","비난","폭력","논란","도박","징역","의혹","이혼",
  "마약","불법","성관계","협박","폭행","학대","가스라이팅","스토킹","살해","자살","보이스피싱",
  "시댁","시동생","시부모"
];

async function fetchNews(keyword) {
  if (!keyword) return [];
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(keyword)}&hl=ko&gl=KR&ceid=KR:ko`;
    const r = await fetch(url);
    const xml = await r.text();
    const parser = new XMLParser({ ignoreAttributes: false });
    const json = parser.parse(xml);
    let items = json?.rss?.channel?.item || [];
    const today = new Date();
    const sevenDaysAgo = new Date(today); sevenDaysAgo.setDate(today.getDate() - 7);

    items = (Array.isArray(items) ? items : [items])
      .map(item => ({
        title: item.title || "",
        link: item.link || "",
        pubDate: item.pubDate || "",
        source: item.source?.["#text"] || "",
        description: stripHtml(item.description || "")
      }))
      .filter(a => { 
        const d = new Date(a.pubDate);
        return !isNaN(d.getTime()) && d >= sevenDaysAgo;
      });

    const tfidf = new TfIdf();
    items.forEach(a => tfidf.addDocument(a.title + " " + a.description));

    items = items.map((a, idx) => {
      let score = 0;
      keyword.split(" ").forEach(tok => score += tfidf.tfidf(tok, idx));
      if (!score || isNaN(score)) score = 0.0001;
      const titleText = a.title.toLowerCase(), descText = a.description.toLowerCase();
      blacklist.forEach(w => { if(titleText.includes(w.toLowerCase()) || descText.includes(w.toLowerCase())) score *= 0.2; });
      return { ...a, score };
    });

    items.sort((a,b) => b.score - a.score);
    return items.slice(0,3);
  } catch(e) { console.error(e); return []; }
}
// ===================== LH API 조회 =====================

// ---------------- 이메일 발송 ----------------
async function sendEmail(user, leaseItems = [], newsItems = [], workItems = []) {
  if (!user.emailrecive) return;
  let body = "";

  // 뉴스
  if (user.news && newsItems.length > 0) {
    body += "<h3>뉴스 알림</h3>";
    body += newsItems.map(n => `
      <div>
        <b>${n.title}</b> (${n.source})<br>
        ${n.description}<br>
        <a href="${n.link}" target="_blank">보기</a>
      </div><hr>
    `).join("");
  } else {
    body += `<p>관련 뉴스 없음</p>`;
  }

  // 일자리
  if (user.work && workItems.length > 0) {
    body += "<h3>일자리 알림</h3>";
    body += workItems.map(w => `
      <div>
        <b>${w.title}</b> (${w.company}, ${w.type})<br>
        기간: ${w.period}<br>
        <a href="${w.link}" target="_blank">채용사이트</a>
      </div><hr>
    `).join("");
  } else {
    body += `<p>일자리 공고 없음</p>`;
  }

  // LH 임대
  if (user.home && leaseItems.length > 0) {
    body += "<h3>집찾기 알림</h3>";
    body += leaseItems.map(i => `
      <div>
        <b>${i.complexName}</b> (${i.regionName})<br>
        유형: ${i.supplyTypeName} / 전용면적: ${i.exclusiveArea}㎡<br>
        보증금: ${i.deposit.toLocaleString()} / 월세: ${i.monthlyRent.toLocaleString()}<br>
        입주예정: ${i.firstMoveInYM.slice(0,4)}년 ${i.firstMoveInYM.slice(4,6)}월
      </div><hr>
    `).join("");
  } else {
    body += `<p>LH 공고 없음</p>`;
  }

  const mailOptions = {
    from: `"알림 서비스" <${process.env.EMAIL_USER}>`, // Gmail 계정 사용
    to: user.email,
    subject: "오늘의 맞춤 알림 🦊",
    html: body,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ 메일 전송 성공 → ${user.email}`);
  } catch (err) {
    console.error(`❌ 메일 전송 실패 → ${user.email}`, err);
  }
}







// ================= GlobalData 갱신 크론 =================
cron.schedule("0 3 * * *", async () => { // 매일 03:00
  console.log("⏰ [03:00] Global refresh start", new Date());
  try {
    const SERVICE_KEY = process.env.LH_SERVICE_KEY;
    const WORKNET_KEY = process.env.WORKNET_KEY;

    const [lh, worknetRaw] = await Promise.all([
      fetchAllLH(SERVICE_KEY),       // 기존 LH fetch
      fetchAllWorknet(WORKNET_KEY)  // 원본 Worknet API fetch
    ]);

    // 기존 글로벌 데이터 모두 삭제 후 새로 저장
    await GlobalData.deleteMany({});

    // Worknet은 필터용 코드도 포함해서 그대로 저장
    await GlobalData.create({
      lh,
      worknet: worknetRaw,  // 여기서 원본 그대로
      updatedAt: new Date()
    });

    console.log(`✅ [03:00] Global refresh done: LH ${lh.length}, Worknet ${worknetRaw.length}`);
  } catch (err) {
    console.error("❌ [03:00] Global refresh failed:", err);
  }
});

// ---------------- 설정 저장 ----------------
app.post("/api/goosettings", async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      console.warn("⚠️ 세션에 userId 없음");
      return res.status(401).json({ error: "Unauthorized" });
    }

    // 1️⃣ UserSetting 저장 및 populate
    let setting = await UserSetting.findOneAndUpdate(
      { userId },
      { ...req.body },
      { upsert: true, new: true }
    ).populate("userId", "email username");

    console.log("✅ UserSetting 저장 완료:", setting);

    // 2️⃣ GlobalData 불러오기
    const global = await GlobalData.findOne();
    if (!global) {
      console.warn("⚠️ GlobalData 없음, 캐시/이메일 처리 건너뜀");
      return res.json({ success: true, settings: setting });
    }

    // 3️⃣ 캐시용 데이터 준비
    console.log("📝 캐시/이메일 처리 시작");
    console.log("→ setting.home:", setting.home);
    console.log("→ setting.news:", setting.news, ", newskeyword:", setting.newskeyword);
    console.log("→ setting.work:", setting.work);

    const leaseItems = setting.home ? selectLeaseFromGlobal(global.lh, setting.region) : [];
    const newsItems  = (setting.news && setting.newskeyword) ? await fetchNews(setting.newskeyword) : [];
    const workItems  = setting.work ? selectWorknetFromGlobal(global.worknet, setting.workEdu, setting.workCo) : [];

    // 4️⃣ UserDataCache 갱신
    try {
      console.log("💾 캐시 갱신 시도");
      await UserDataCache.deleteOne({ userId });
      await new UserDataCache({
        userId,
        leaseItems,
        newsItems,
        workItems,
        updatedAt: new Date()
      }).save();
      console.log(`💾 UserDataCache 갱신 완료 → userId: ${userId}`);
    } catch (cacheErr) {
      console.error("❌ 캐시 갱신 실패:", cacheErr);
    }

    // 5️⃣ 이메일 발송
    try {
      if (setting.userId) {
        console.log("✉️ 이메일 발송 시도 → setting.userId:", setting.userId);
        if (setting.userId.email) {
          await sendEmail({ ...setting.toObject(), ...setting.userId.toObject() }, leaseItems, newsItems, workItems);
          console.log(`📧 이메일 발송 완료 → ${setting.userId.email}`);
        } else {
          console.warn("⚠️ 이메일 정보 없음, 발송 건너뜀");
        }
      } else {
        console.warn("⚠️ populate 실패: setting.userId가 null");
      }
    } catch (emailErr) {
      console.error("❌ 이메일 발송 실패:", emailErr);
    }

    res.json({ success: true, settings: setting });
  } catch (err) {
    console.error("❌ Save settings failed:", err);
    res.status(500).json({ error: "Failed to save settings" });
  }
});



// Runs daily at 03:00 Asia/Seoul
async function refreshGlobalData() {
  console.log("⏰ Global refresh start", new Date());
  try {
    const SERVICE_KEY = process.env.LH_SERVICE_KEY;
    const WORKNET_KEY = process.env.WORKNET_KEY;

    const [lh, worknet] = await Promise.all([
      fetchAllLH(SERVICE_KEY),
      fetchAllWorknet(WORKNET_KEY)
    ]);

    // 기존 글로벌 데이터 모두 삭제 후 새로 저장
    await GlobalData.deleteMany({});
    await GlobalData.create({ lh, worknet, updatedAt: new Date() });

    console.log(`✅ Global refresh done: LH ${lh.length}, Worknet ${worknet.length}`);
  } catch (err) {
    console.error("❌ Global refresh failed:", err);
  }
}

// 서버 시작 시 한 번 실행
//refreshGlobalData();


cron.schedule("0 3 * * *", refreshGlobalData);
  function selectLeaseFromGlobal(globalLh, region, district) {
    // region == provinceName (e.g., "서울특별시"), district may be empty
    let list = globalLh.filter(x => x.provinceName === region);
    if (district) {
    list = list.filter(x => (x.regionName || "").includes(district));
    }
    return list;
    }
    
    
    function selectWorknetFromGlobal(globalWk, workEdu, workCo) {
    // If workEdu given, include '99'(무관) as well
    const eduSet = new Set();
    if (workEdu) { eduSet.add(workEdu); eduSet.add("99"); }
    const coSet = new Set();
    if (workCo) {
    if (workCo === "10|40") { coSet.add("10"); coSet.add("40"); }
    else { coSet.add(workCo); }
    }
    return globalWk.filter(x => {
    const eduOk = eduSet.size === 0 || eduSet.has(x.empWantedEduCd);
    const coOk = coSet.size === 0 || coSet.has(String(x.coClcd));
    return eduOk && coOk;
    });
    }
    cron.schedule("0 5 * * *", async () => {
      console.log("⏰ [05:00] UserDataCache refresh start");
      try {
        const global = await GlobalData.findOne();
        if (!global) { 
          console.warn("⚠️ No GlobalData; skipping"); 
          return; 
        }
    
        const settings = await UserSetting.find({});
    
        for (const s of settings) {
          const userId = s.userId;
          if (!userId) continue;
    
          // 유저 조건에 맞는 데이터 추출
          const leaseItems = s.home ? selectLeaseFromGlobal(global.lh, s.region) : [];
          const newsItems  = (s.news && s.newskeyword) ? await fetchNews(s.newskeyword) : [];
          const workItems  = s.work ? selectWorknetFromGlobal(global.worknet, s.workEdu, s.workCo) : [];
    
          // 캐시 갱신
          await UserDataCache.deleteOne({ userId });
          await new UserDataCache({ userId, leaseItems, newsItems, workItems, updatedAt: new Date() }).save();
    
          console.log(`💾 Cache updated → userId: ${userId}`);
        }
    
        console.log("✅ UserDataCache refresh done");
      } catch (err) {
        console.error("❌ UserDataCache refresh failed:", err);
      }
    });
    
    cron.schedule("0 6 * * *", async () => {
      console.log("⏰ [06:00] Email send start");
      try {
        const settings = await UserSetting.find({}).populate("userId", "email username");
    
        for (const s of settings) {
          const userId = s.userId?._id;
          if (!userId) continue;
    
          // 캐시에서 데이터 가져오기
          const cache = await UserDataCache.findOne({ userId });
          if (!cache) continue;
    
          // 이메일 발송
          await sendEmail({ ...s.toObject(), ...s.userId.toObject() }, cache.leaseItems, cache.newsItems, cache.workItems);
          console.log(`📧 Sent → ${s.userId.email}`);
        }
    
        console.log("✅ Email send done");
      } catch (err) {
        console.error("❌ Email send failed:", err);
      }
    });
// ---------------- 서버 실행 ----------------

// --- 서버 실행 ---
app.listen(PORT, () => {
  console.log(`✅ 서버 실행중: http://localhost:${PORT}`);
});
