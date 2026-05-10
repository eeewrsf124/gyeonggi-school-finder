const CSV_HEADERS = [
  "학교명",
  "설립구분",
  "학교급",
  "소재지도로명주소",
  "시도",
  "시군구",
  "WGS84위도",
  "WGS84경도",
  "홈페이지",
  "키워드",
];

export async function loadSchoolsFromCsv(csvUrl) {
  const response = await fetch(csvUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`공공데이터 CSV를 불러오지 못했습니다. (${response.status})`);
  }

  const text = await response.text();
  return normalizeRows(parseCsv(text));
}

export function parseCsv(text) {
  const rows = [];
  const currentRow = [];
  let currentCell = "";
  let inQuotes = false;

  const pushCell = () => {
    currentRow.push(currentCell);
    currentCell = "";
  };

  const pushRow = () => {
    if (currentRow.length > 0 || currentCell !== "") {
      pushCell();
      rows.push(currentRow.splice(0, currentRow.length));
    }
  };

  const source = String(text || "").replace(/^\uFEFF/, "");

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        currentCell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      pushCell();
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        i += 1;
      }
      pushRow();
      continue;
    }

    currentCell += char;
  }

  if (currentCell !== "" || currentRow.length) {
    pushRow();
  }

  if (!rows.length) return [];
  const headers = rows.shift().map((header) => String(header || "").trim());

  return rows
    .filter((row) => row.some((cell) => String(cell || "").trim() !== ""))
    .map((row) => {
      const record = {};
      headers.forEach((header, index) => {
        record[header] = String(row[index] ?? "").trim();
      });
      return record;
    });
}

export function normalizeRows(rows) {
  return rows
    .map((row, index) => normalizeSchoolRow(row, index))
    .filter(Boolean);
}

export function normalizeSchoolRow(row, index = 0) {
  const name = pick(row, ["학교명", "학교명칭", "명칭", "기관명", "학교"]) || "";
  const founding = pick(row, ["설립구분", "공사립구분", "설립유형", "운영형태"]) || "";
  const schoolType = pick(row, ["학교급", "학교유형", "유형", "계열"]) || "";
  const address =
    pick(row, ["소재지도로명주소", "도로명주소", "주소", "소재지", "위치"]) || "";
  const district = pick(row, ["시군구", "시·군·구", "행정구역", "지역"]) || inferDistrict(address);
  const latitude = toNumber(
    pick(row, ["WGS84위도", "위도", "lat", "latitude", "Latitude", "WGS84_LAT"])
  );
  const longitude = toNumber(
    pick(row, ["WGS84경도", "경도", "lon", "lng", "longitude", "Longitude", "WGS84_LNG"])
  );
  const homepage = pick(row, ["홈페이지", "누리집", "URL", "링크"]) || "";
  const keywordText = pick(row, ["키워드", "특성", "특징", "비고"]) || "";

  if (!name) return null;

  const keywords = uniqueTokens([
    name,
    founding,
    schoolType,
    district,
    address,
    keywordText,
  ]);

  return {
    id: makeId(name, district, index),
    schoolName: name,
    founding: normalizeLabel(founding),
    schoolType: normalizeLabel(schoolType),
    address,
    district,
    latitude,
    longitude,
    homepage,
    keywords,
    keywordText,
    raw: row,
  };
}

export function uniqueTokens(values) {
  return [...new Set(
    values
      .flatMap((value) =>
        String(value || "")
          .split(/[,\s/·|]+/)
          .map((token) => token.trim())
          .filter(Boolean)
      )
      .filter((token) => token.length > 1)
  )];
}

export function normalizeSchoolDataset(rows) {
  return normalizeRows(rows).sort((a, b) => {
    const districtCompare = (a.district || "").localeCompare(b.district || "", "ko");
    if (districtCompare !== 0) return districtCompare;
    return (a.schoolName || "").localeCompare(b.schoolName || "", "ko");
  });
}

export function enrichDistances(schools, userLocation) {
  if (!userLocation || !Number.isFinite(userLocation.latitude) || !Number.isFinite(userLocation.longitude)) {
    return schools.map((school) => ({ ...school, distanceKm: null }));
  }

  return schools.map((school) => {
    const distanceKm =
      Number.isFinite(school.latitude) && Number.isFinite(school.longitude)
        ? haversineKm(userLocation.latitude, userLocation.longitude, school.latitude, school.longitude)
        : null;
    return { ...school, distanceKm };
  });
}

export function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (value) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(earthRadiusKm * 2 * Math.asin(Math.sqrt(a)) * 10) / 10;
}

export function getDistrictFromAddress(address) {
  return inferDistrict(address);
}

export function formatDistance(distanceKm) {
  if (distanceKm == null) return "거리 계산 전";
  if (distanceKm < 1) return `${Math.round(distanceKm * 1000)}m`;
  return `${distanceKm.toFixed(1)}km`;
}

function pick(row, candidates) {
  for (const key of candidates) {
    const value = String(row?.[key] ?? "").trim();
    if (value) return value;
  }

  const lowerKeys = Object.keys(row || {});
  for (const key of lowerKeys) {
    if (candidates.some((candidate) => normalizeLabel(candidate) === normalizeLabel(key))) {
      const value = String(row?.[key] ?? "").trim();
      if (value) return value;
    }
  }

  return "";
}

function normalizeLabel(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[()]/g, "");
}

function inferDistrict(address) {
  const match = String(address || "").match(/경기도\s+([가-힣0-9]+(?:시|군|구))/);
  return match?.[1] || "";
}

function toNumber(value) {
  const num = Number(String(value || "").replace(/,/g, "").trim());
  return Number.isFinite(num) ? num : null;
}

function makeId(name, district, index) {
  return `${normalizeLabel(name)}-${normalizeLabel(district || "gyeonggi")}-${index}`;
}

export { CSV_HEADERS };
