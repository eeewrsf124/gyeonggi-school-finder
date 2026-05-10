import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DEFAULT_INPUT = path.resolve(process.cwd(), "data", "high_schools_source.csv");
const DEFAULT_OUTPUT = path.resolve(process.cwd(), "data", "high_schools.csv");

const TARGET_HEADERS = [
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

const FIELD_ALIASES = {
  학교명: ["학교명", "학교명칭", "명칭", "기관명", "학교"],
  설립구분: ["설립구분", "공사립구분", "설립유형", "운영형태"],
  학교급: ["학교급", "학교유형", "유형", "계열"],
  소재지도로명주소: ["소재지도로명주소", "도로명주소", "주소", "소재지", "위치"],
  시도: ["시도", "시·도", "광역시도", "지역시도"],
  시군구: ["시군구", "시·군·구", "행정구역", "지역", "시군"],
  WGS84위도: ["WGS84위도", "위도", "lat", "latitude", "Latitude", "WGS84_LAT"],
  WGS84경도: ["WGS84경도", "경도", "lon", "lng", "longitude", "Longitude", "WGS84_LNG"],
  홈페이지: ["홈페이지", "누리집", "URL", "링크", "홈페이"],
  키워드: ["키워드", "특성", "특징", "비고", "학과특성"],
};

const rawInput = process.argv[2] || DEFAULT_INPUT;
const rawOutput = process.argv[3] || DEFAULT_OUTPUT;

main().catch((error) => {
  console.error(error?.message || error);
  process.exitCode = 1;
});

async function main() {
  const inputPath = path.resolve(rawInput);
  const outputPath = path.resolve(rawOutput);

  const source = await fs.readFile(inputPath, "utf8");
  const parsed = parseCsv(source);
  if (!parsed.length) {
    throw new Error("CSV에서 읽을 수 있는 행이 없습니다.");
  }

  const normalized = parsed
    .map((row, index) => normalizeRow(row, index))
    .filter(Boolean)
    .filter((row) => row.학교명);

  if (!normalized.length) {
    throw new Error("정제된 학교 데이터가 없습니다.");
  }

  await fs.writeFile(outputPath, toCsv(normalized), "utf8");
  console.log(`완료: ${path.relative(process.cwd(), outputPath)} (${normalized.length}행)`);
}

function parseCsv(text) {
  const rows = [];
  const currentRow = [];
  let currentCell = "";
  let inQuotes = false;
  const source = String(text || "").replace(/^\uFEFF/, "");

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

function normalizeRow(row, index) {
  const normalized = {};
  for (const [target, aliases] of Object.entries(FIELD_ALIASES)) {
    normalized[target] = pick(row, aliases);
  }

  normalized.학교명 = normalized.학교명 || `학교-${index + 1}`;
  normalized.설립구분 = normalized.설립구분 || "미상";
  normalized.학교급 = normalized.학교급 || "고등학교";
  normalized.소재지도로명주소 = normalized.소재지도로명주소 || "";
  normalized.시도 = normalized.시도 || inferSido(normalized.소재지도로명주소);
  normalized.시군구 = normalized.시군구 || inferDistrict(normalized.소재지도로명주소);
  normalized.WGS84위도 = toNumber(normalized.WGS84위도);
  normalized.WGS84경도 = toNumber(normalized.WGS84경도);
  normalized.홈페이지 = normalized.홈페이지 || "";
  normalized.키워드 = normalized.키워드 || buildKeyword(normalized);

  return normalized;
}

function pick(row, aliases) {
  for (const alias of aliases) {
    const value = String(row?.[alias] ?? "").trim();
    if (value) return value;
  }

  const keys = Object.keys(row || {});
  for (const key of keys) {
    if (aliases.some((alias) => normalize(alias) === normalize(key))) {
      const value = String(row?.[key] ?? "").trim();
      if (value) return value;
    }
  }

  return "";
}

function buildKeyword(row) {
  return [row.학교명, row.설립구분, row.학교급, row.시군구]
    .filter(Boolean)
    .join(", ");
}

function inferSido(address) {
  const text = String(address || "");
  if (text.includes("경기도")) return "경기도";
  const match = text.match(/^([가-힣]+시|도)/);
  return match?.[1] || "";
}

function inferDistrict(address) {
  const text = String(address || "");
  const match = text.match(/경기도\s+([가-힣0-9]+(?:시|군|구))/);
  return match?.[1] || "";
}

function toNumber(value) {
  const trimmed = String(value || "").replace(/,/g, "").trim();
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : "";
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[()]/g, "");
}

function escapeCsv(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows) {
  const lines = [TARGET_HEADERS.join(",")];
  for (const row of rows) {
    lines.push(TARGET_HEADERS.map((header) => escapeCsv(row[header])).join(","));
  }
  return `${lines.join("\n")}\n`;
}
