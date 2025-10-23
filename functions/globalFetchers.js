// services/globalFetchers.js
const axios = require("axios");
const fetch = require("node-fetch");
const { XMLParser } = require("fast-xml-parser");
const { regionMap, parseProvince } = require("./region");

const LH_BASE = "http://apis.data.go.kr/B552555/lhLeaseInfo1/lhLeaseInfo1";
const typeOrder = ["07", "08", "09", "10", "11", "13", "17"]; // as-is

// LH 아파트 전체 데이터 가져오기
async function fetchAllLH(serviceKey) {
  const all = [];
  const provinceEntries = Object.entries(regionMap);

  for (const [provinceName, provinceCode] of provinceEntries) {
    for (const type of typeOrder) {
      const params = new URLSearchParams({
        serviceKey,
        PG_SZ: "100",
        PAGE: "1",
        _type: "json",
        CNP_CD: provinceCode,
        SPL_TP_CD: type,
      });

      const url = `${LH_BASE}?${params.toString()}`;
      try {
        const { data } = await axios.get(url, { timeout: 12000 });

        const dsList =
          data?.LHLeaseInfo1?.dsList || data?.dsList || data?.[1]?.dsList || [];

        for (const raw of dsList) {
          const { provinceName: pName, provinceCode: pCode } = parseProvince(raw?.ARA_NM);

          const item = {
            regionName: raw?.ARA_NM || "",
            provinceName: pName,
            provinceCode: pCode || provinceCode,
            supplyTypeName: raw?.AIS_TP_CD_NM || "",
            complexName: raw?.SBD_LGO_NM || "",
            totalHouseholds: Number(raw?.SUM_HSH_CNT || 0),
            exclusiveArea: Number(raw?.DDO_AR || 0),
            deposit: Number(raw?.LS_GMY || 0),
            monthlyRent: Number(raw?.RFE || 0),
            firstMoveInYM: raw?.MVIN_XPC_YM || "",
          };

          // 입주예정일 체크
          if (/^\d{6}$/.test(item.firstMoveInYM)) {
            const y = parseInt(item.firstMoveInYM.slice(0, 4), 10);
            const m = parseInt(item.firstMoveInYM.slice(4, 6), 10);
            const now = new Date();
            const currentYM = now.getFullYear() * 100 + (now.getMonth() + 1);

            if (!(y > 2050 || m < 1 || m > 12) && y * 100 + m >= currentYM) {
              all.push(item);
            }
          }
        }
      } catch (err) {
        console.error(`[LH ALL FAIL ${provinceName}/${type}]`, err.message);
      }
    }
  }

  return all;
}

// Worknet 전체 공고 가져오기 (목록 + 중복 제거)
async function fetchAllWorknet(worknetKey) {
  const baseList = "https://www.work24.go.kr/cm/openApi/call/wk/callOpenApiSvcInfo210L21.do";
  const parser = new XMLParser({ ignoreAttributes: false });
  const all = [];
  const display = 30;

  // 학력 옵션
  const eduList = ["10", "20", "30", "40", "50", "99"]; // 고졸~박사 + 무관
  // 기업 구분 옵션
  const coList = ["10", "20", "30", "40"]; // 사기업, 공기업, 공공기관, 중견기업 등

  for (const edu of eduList) {
    for (const co of coList) {
      let page = 1;
      while (true) {
        try {
          const url =
            `${baseList}?authKey=${worknetKey}&callTp=L&returnType=XML&startPage=${page}&display=${display}` +
            `&empWantedEduCd=${encodeURIComponent(edu)}` +
            `&coClcd=${encodeURIComponent(co)}`;

          const res = await fetch(url);
          const xml = await res.text();
          const json = parser.parse(xml);

          let items = json?.dhsOpenEmpInfoList?.dhsOpenEmpInfo || [];
          if (!Array.isArray(items)) items = items ? [items] : [];
          if (!items.length) break;

          // edu, co 정보를 심어서 누적
          all.push(
            ...items.map(i => ({
              ...i,
              _edu: edu,
              _co: co,
            }))
          );

          if (items.length < display) break; // 마지막 페이지
          page++;
        } catch (err) {
          console.error(`[Worknet Fetch FAIL edu=${edu} co=${co} page=${page}]`, err);
          break;
        }
      }
    }
  }

  // 중복 제거 (empSeqno 기준)
  const seen = new Set();
  const deduped = all.filter(j => {
    const key = j.empSeqno;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // 글로벌용 구조
  return deduped.map(j => ({
    empSeqno: j.empSeqno || "",
    title: j.empWantedTitle || "",
    company: j.empBusiNm || "",
    type: j.coClcdNm || "",
    period: `${j.empWantedStdt || ""} ~ ${j.empWantedEndt || ""}`,
    link: j.empWantedHomepgDetail || "",
    empWantedEduCd: j._edu || "",
    coClcd: j._co || "",
  }));
}
module.exports = { fetchAllLH, fetchAllWorknet };
