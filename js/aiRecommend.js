import { formatDistance } from "./dataParser.js";

const DEFAULT_WEIGHTS = {
  founding: 30,
  distance: 28,
  keywords: 25,
  type: 12,
  district: 5,
};

export function recommendSchools(schools, preferences = {}) {
  const scored = schools.map((school) => scoreSchool(school, preferences));
  scored.sort((a, b) => b.score - a.score || (a.school.schoolName || "").localeCompare(b.school.schoolName || "", "ko"));
  return scored.slice(0, 3);
}

export function scoreSchool(school, preferences = {}) {
  const reasons = [];
  let score = 0;

  const founding = normalize(preferences.founding);
  const maxDistance = Number(preferences.maxDistanceKm || preferences.maxDistance || 0);
  const keywords = tokenize(preferences.keywords);
  const interestHint = normalize(preferences.schoolType);

  if (founding && founding !== "전체" && normalize(school.founding) === founding) {
    score += DEFAULT_WEIGHTS.founding;
    reasons.push(`설립 구분이 ${school.founding || "조건"}와 일치합니다.`);
  }

  if (Number.isFinite(maxDistance) && maxDistance > 0 && school.distanceKm != null) {
    if (school.distanceKm <= maxDistance) {
      const distanceRatio = 1 - Math.min(school.distanceKm / maxDistance, 1);
      const distanceScore = Math.round(DEFAULT_WEIGHTS.distance * (0.45 + distanceRatio * 0.55));
      score += distanceScore;
      reasons.push(`통학 거리 ${formatDistance(school.distanceKm)}가 설정한 ${maxDistance}km 이내입니다.`);
    } else {
      const penalty = Math.min(10, Math.round((school.distanceKm - maxDistance) * 2));
      score -= penalty;
      reasons.push(`통학 거리 ${formatDistance(school.distanceKm)}가 설정한 범위를 조금 넘습니다.`);
    }
  } else if (school.distanceKm != null) {
    score += Math.max(0, Math.round(DEFAULT_WEIGHTS.distance * (1 - Math.min(school.distanceKm / 25, 1))));
    reasons.push(`현재 위치 기준 통학 거리를 계산해 가까운 학교를 우선했습니다.`);
  }

  if (keywords.length) {
    const searchable = normalize(
      [
        school.schoolName,
        school.address,
        school.district,
        school.schoolType,
        school.keywordText,
        ...(school.keywords || []),
      ].join(" ")
    );

    const matched = keywords.filter((keyword) => searchable.includes(keyword));
    if (matched.length) {
      const keywordScore = Math.round((DEFAULT_WEIGHTS.keywords / keywords.length) * matched.length);
      score += keywordScore;
      reasons.push(`키워드 ${matched.map((value) => `'${value}'`).join(", ")}와 연결되는 공공데이터 항목이 있습니다.`);
    }
  }

  if (interestHint && interestHint !== "전체") {
    const typeText = normalize(school.schoolType || school.keywordText || "");
    const isMatch =
      typeText.includes(interestHint) ||
      normalize(school.keywords?.join(" ") || "").includes(interestHint);
    if (isMatch) {
      score += DEFAULT_WEIGHTS.type;
      reasons.push(`선호한 학교 유형(${preferences.schoolType})과 잘 맞습니다.`);
    }
  }

  if (preferences.district) {
    const dist = normalize(school.district || school.address || "");
    if (dist.includes(normalize(preferences.district))) {
      score += DEFAULT_WEIGHTS.district;
      reasons.push(`원하는 지역(${preferences.district})과 같은 권역입니다.`);
    }
  }

  if (reasons.length === 0) {
    reasons.push("공공데이터의 학교 유형, 위치, 키워드를 종합해 균형 있게 선별했습니다.");
  }

  const matchRate = clamp(Math.round(score), 0, 100);

  return {
    school,
    score: matchRate,
    reasons,
    explanation: buildExplanation(school, preferences, reasons),
  };
}

export function buildExplanation(school, preferences = {}, reasons = []) {
  const parts = [];

  if (preferences.founding && preferences.founding !== "전체") {
    parts.push(`설립 구분 ${preferences.founding}`);
  }

  if (preferences.maxDistanceKm || preferences.maxDistance) {
    parts.push(`최대 통학거리 ${preferences.maxDistanceKm || preferences.maxDistance}km`);
  }

  const keywordList = tokenize(preferences.keywords);
  if (keywordList.length) {
    parts.push(`키워드 ${keywordList.join(", ")}`);
  }

  const reasonText = reasons.length ? reasons[0] : "공공데이터 속 학교 특성을 종합적으로 반영";
  return `${parts.join(" · ")} 조건을 검토한 뒤, ${reasonText}`;
}

export function summarizeMatches(scoredSchools) {
  return scoredSchools.map((item, index) => ({
    rank: index + 1,
    school: item.school,
    score: item.score,
    distanceLabel: formatDistance(item.school.distanceKm),
    explanation: item.explanation,
    reasons: item.reasons,
  }));
}

function tokenize(value) {
  return String(value || "")
    .split(/[,\s/|·]+/)
    .map((item) => normalize(item))
    .filter(Boolean);
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[()]/g, "");
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
