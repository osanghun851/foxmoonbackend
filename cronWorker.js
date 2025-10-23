require("dotenv").config();
const mongoose = require("mongoose");
const cron = require("node-cron");
const nodemailer = require("nodemailer");
const { XMLParser } = require("fast-xml-parser");
const natural = require("natural");
const fetch = require("node-fetch");
const { fetchAllLH, fetchAllWorknet } = require("./functions/globalFetchers");

// 모델
const UserSetting = require("./models/UserSetting");
const UserDataCache = require("./models/UserDataCache");
const GlobalData = require("./models/GlobalData");

// MongoDB 연결
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log("✅ MongoDB Atlas 연결 성공 (Worker)"))
.catch(err => console.error("❌ MongoDB 연결 실패:", err));

// ===================== 공통 함수 =====================
function stripHtml(html) {
  return html.replace(/<[^>]*>?/gm, "");
}

// 뉴스 필터용
const blacklist = [
  "연예","스타","범죄","사건","폭력","살인","강도","스포츠",
  "도박","약물","불륜","마약","성관계","스토킹","자살"
];

// ===================== 뉴스 크롤링 =====================
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
    const weekAgo = new Date(today);
    weekAgo.setDate(today.getDate() - 7);

    items = (Array.isArray(items) ? items : [items])
      .map(item => ({
        title: item.title || "",
        link: item.link || "",
        pubDate: item.pubDate || "",
        description: stripHtml(item.description || "")
      }))
      .filter(a => {
        const d = new Date(a.pubDate);
        return !isNaN(d.getTime()) && d >= weekAgo;
      });

    // 단어 점수 계산
    const tfidf = new natural.TfIdf();
    items.forEach(a => tfidf.addDocument(a.title + " " + a.description));
    items = items.map((a, idx) => {
      let score = 0;
      keyword.split(" ").forEach(tok => (score += tfidf.tfidf(tok, idx)));
      if (!score || isNaN(score)) score = 0.0001;
      blacklist.forEach(w => {
        if (a.title.includes(w) || a.description.includes(w)) score *= 0.2;
      });
      return { ...a, score };
    });

    return items.sort((a, b) => b.score - a.score).slice(0, 3);
  } catch (err) {
    console.error("❌ 뉴스 크롤링 실패:", err);
    return [];
  }
}

// ===================== 이메일 발송 설정 =====================
const transporter = nodemailer.createTransport({
  host: process.env.SES_HOST,
  port: Number(process.env.SES_PORT),
  secure: false,
  auth: { user: process.env.SES_USER, pass: process.env.SES_PASS }
});

async function sendEmail(user, leaseItems = [], newsItems = [], workItems = []) {
  if (!user.emailrecive) return;
  let body = "";

  if (user.news && newsItems.length > 0) {
    body += "<h3>📰 뉴스 알림</h3>";
    body += newsItems.map(n => `<div><b>${n.title}</b><br>${n.description}<br><a href="${n.link}" target="_blank">보기</a></div><hr>`).join("");
  }
  if (user.work && workItems.length > 0) {
    body += "<h3>💼 일자리 알림</h3>";
    body += workItems.map(w => `<div><b>${w.title}</b><br>${w.company || ''}</div><hr>`).join("");
  }
  if (user.home && leaseItems.length > 0) {
    body += "<h3>🏠 집찾기 알림</h3>";
    body += leaseItems.map(i => `<div><b>${i.complexName}</b> (${i.regionName})</div><hr>`).join("");
  }

  try {
    await transporter.sendMail({
      from: `"기러기 알림" <${process.env.SES_VERIFIED_EMAIL}>`,
      to: user.email,
      subject: "알림 도착 🕊️",
      html: body
    });
    console.log(`📧 메일 전송 성공 → ${user.email}`);
  } catch (err) {
    console.error(`메일 전송 실패 → ${user.email}`, err);
  }
}

// ===================== Helper =====================
function selectLeaseFromGlobal(globalLh, region, district) {
  let list = globalLh.filter(x => x.provinceName === region);
  if (district) list = list.filter(x => (x.regionName || "").includes(district));
  return list;
}
function selectWorknetFromGlobal(globalWk, workEdu, workCo) {
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

// ===================== 03:00 GlobalData 갱신 =====================
cron.schedule("0 3 * * *", async () => {
  console.log("⏰ [03:00] Global refresh 시작");
  try {
    const [lh, worknetRaw] = await Promise.all([
      fetchAllLH(process.env.LH_SERVICE_KEY),
      fetchAllWorknet(process.env.WORKNET_KEY)
    ]);
    await GlobalData.deleteMany({});
    await GlobalData.create({ lh, worknet: worknetRaw, updatedAt: new Date() });
    console.log(`✅ GlobalData 갱신 완료: LH ${lh.length}, Worknet ${worknetRaw.length}`);
  } catch (err) {
    console.error("❌ GlobalData 갱신 실패:", err);
  }
});

// ===================== 05:00 UserDataCache 갱신 =====================
cron.schedule("0 5 * * *", async () => {
  console.log("⏰ [05:00] UserDataCache refresh 시작");
  try {
    const global = await GlobalData.findOne();
    if (!global) return console.warn("⚠️ GlobalData 없음, 스킵");
    const settings = await UserSetting.find({});
    for (const s of settings) {
      const userId = s.userId;
      if (!userId) continue;
      const leaseItems = s.home ? selectLeaseFromGlobal(global.lh, s.region) : [];
      const newsItems = (s.news && s.newskeyword) ? await fetchNews(s.newskeyword) : [];
      const workItems = s.work ? selectWorknetFromGlobal(global.worknet, s.workEdu, s.workCo) : [];
      await UserDataCache.deleteOne({ userId });
      await new UserDataCache({ userId, leaseItems, newsItems, workItems, updatedAt: new Date() }).save();
      console.log(`💾 캐시 갱신 완료 → userId: ${userId}`);
    }
  } catch (err) {
    console.error("❌ UserDataCache refresh 실패:", err);
  }
});

// ===================== 06:00 이메일 발송 =====================
cron.schedule("0 6 * * *", async () => {
  console.log("⏰ [06:00] 이메일 발송 시작");
  try {
    const settings = await UserSetting.find({}).populate("userId", "email username");
    for (const s of settings) {
      const cache = await UserDataCache.findOne({ userId: s.userId });
      if (!cache) continue;
      await sendEmail({ ...s.toObject(), ...s.userId.toObject() }, cache.leaseItems, cache.newsItems, cache.workItems);
    }
    console.log("✅ 이메일 발송 완료");
  } catch (err) {
    console.error("❌ 이메일 발송 실패:", err);
  }
});
