const dotenv = require("dotenv");
dotenv.config();
const cron = require("node-cron");
const { fetchAllLH, fetchAllWorknet } = require("./functions/globalFetchers");
const GlobalData = require("./models/GlobalData");
const UserSetting = require("./models/UserSetting");
const UserDataCache = require("./models/UserDataCache");
const { XMLParser } = require("fast-xml-parser");
const natural = require("natural");
const fetch = require("node-fetch");
const nodemailer = require("nodemailer");
const TfIdf = natural.TfIdf;

// ===================== 뉴스 관련 함수 =====================
const blacklist = [
  "연예","스타","방송","범죄","사건","사고","폭력","살인","강도","흉기",
  "스포츠","축구","야구","농구","사망","약물","불륜",
  "유흥","클럽","술","게임","오락","영화","갈등","혐오","스캔들",
  "사기","폭로","범죄","비난","폭력","논란","도박","징역","의혹","이혼",
  "마약","불법","성관계","협박","폭행","학대","가스라이팅","스토킹","살해","자살","보이스피싱",
  "시댁","시동생","시부모"
];

function stripHtml(html) { return html.replace(/<[^>]*>?/gm, ""); }

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

// ===================== 이메일 =====================
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
    from: `"알림" <${process.env.SES_VERIFIED_EMAIL}>`,
    to: user.email,
    subject: "알림 정보",
    html: body
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ 메일 전송 성공 → ${user.email}`);
  } catch (err) {
    console.error(`❌ 메일 전송 실패 → ${user.email}`, err);
  }
}

// ===================== 선택 함수 =====================
function selectLeaseFromGlobal(globalLh, region, district) {
  let list = globalLh.filter(x => x.provinceName === region);
  if (district) {
    list = list.filter(x => (x.regionName || "").includes(district));
  }
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

// ===================== 크론 작업 =====================

// [03:00] GlobalData 갱신
cron.schedule("0 3 * * *", async () => {
  console.log("⏰ [03:00] Global refresh start");
  try {
    const [lh, worknet] = await Promise.all([
      fetchAllLH(process.env.LH_SERVICE_KEY),
      fetchAllWorknet(process.env.WORKNET_KEY)
    ]);
    await GlobalData.deleteMany({});
    await GlobalData.create({ lh, worknet, updatedAt: new Date() });
    console.log(`✅ [03:00] Global refresh done: LH ${lh.length}, Worknet ${worknet.length}`);
  } catch (err) {
    console.error("❌ [03:00] Global refresh failed:", err);
  }
});

// [05:00] UserDataCache 갱신
cron.schedule("0 5 * * *", async () => {
  console.log("⏰ [05:00] UserDataCache refresh start");
  try {
    const global = await GlobalData.findOne();
    if (!global) return console.warn("⚠️ No GlobalData; skipping");

    const settings = await UserSetting.find({});
    for (const s of settings) {
      const userId = s.userId;
      if (!userId) continue;

      const leaseItems = s.home ? selectLeaseFromGlobal(global.lh, s.region) : [];
      const newsItems  = (s.news && s.newskeyword) ? await fetchNews(s.newskeyword) : [];
      const workItems  = s.work ? selectWorknetFromGlobal(global.worknet, s.workEdu, s.workCo) : [];

      await UserDataCache.deleteOne({ userId });
      await new UserDataCache({ userId, leaseItems, newsItems, workItems, updatedAt: new Date() }).save();
      console.log(`💾 Cache updated → userId: ${userId}`);
    }

    console.log("✅ UserDataCache refresh done");
  } catch (err) {
    console.error("❌ UserDataCache refresh failed:", err);
  }
});

// [06:00] 이메일 발송
cron.schedule("0 6 * * *", async () => {
  console.log("⏰ [06:00] Email send start");
  try {
    const settings = await UserSetting.find({}).populate("userId", "email username");
    for (const s of settings) {
      const userId = s.userId?._id;
      if (!userId) continue;
      const cache = await UserDataCache.findOne({ userId });
      if (!cache) continue;
      await sendEmail({ ...s.toObject(), ...s.userId.toObject() }, cache.leaseItems, cache.newsItems, cache.workItems);
      console.log(`📧 Sent → ${s.userId.email}`);
    }
    console.log("✅ Email send done");
  } catch (err) {
    console.error("❌ Email send failed:", err);
  }
});