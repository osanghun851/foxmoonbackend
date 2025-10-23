const regionMap = {
    "서울특별시": "11",
    "경기도": "41",
    "부산광역시": "26",
    "대구광역시": "27",
    "인천광역시": "28",
    "광주광역시": "29",
    "대전광역시": "30",
    "울산광역시": "31",
    "세종특별자치시": "36",
    "강원특별자치도": "42",
    "충청북도": "43",
    "충청남도": "44",
    "전북특별자치도": "45",
    "전라남도": "46",
    "경상북도": "47",
    "경상남도": "48",
    "제주특별자치도": "50"
    };
    
    
    function parseProvince(araNm) {
    // ARA_NM like "서울특별시 종로구" → provinceName = first token that matches regionMap key
    if (!araNm) return { provinceName: "", provinceCode: "" };
    const first = (araNm.split(" ")[0] || "").trim();
    if (regionMap[first]) return { provinceName: first, provinceCode: regionMap[first] };
    return { provinceName: first, provinceCode: "" };
    }
    
    
    module.exports = { regionMap, parseProvince };