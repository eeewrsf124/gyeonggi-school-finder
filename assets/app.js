const STORAGE_KEY = "gyeonggi-school-dataset-v1";
const DEFAULT_DATA_URL = "data/schools.json";

const state = {
  schools: [],
  filtered: [],
  selectedId: "",
  sourceLabel: "공개 데이터",
};

const els = {};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  cacheElements();
  bindEvents();

  const cached = readStoredSchools();
  if (cached.length) {
    useSchools(cached, "브라우저 저장 데이터");
  }

  await loadDefaultDataset();
  if (!state.schools.length) {
    renderIndex();
    renderDetailEmpty(
      "데이터가 없습니다",
      "위의 파일 업로드 버튼으로 공개 데이터를 불러오면 경기도 고등학교 목록을 바로 확인할 수 있습니다."
    );
    return;
  }

  applyFilters();
  if (isDetailPage()) {
    renderDetailPage();
  }
}

function cacheElements() {
  els.body = document.body;
  els.page = document.body.dataset.page || "index";
  els.searchInput = document.getElementById("searchInput");
  els.regionFilter = document.getElementById("regionFilter");
  els.foundingFilter = document.getElementById("foundingFilter");
  els.fileInput = document.getElementById("fileInput");
  els.resetData = document.getElementById("resetData");
  els.resultCount = document.getElementById("resultCount");
  els.dataSource = document.getElementById("dataSource");
  els.schoolList = document.getElementById("schoolList");
  els.emptyState = document.getElementById("emptyState");
  els.detailPanel = document.getElementById("detailPanel");
}

function bindEvents() {
  [els.searchInput, els.regionFilter, els.foundingFilter].forEach((el) => {
    if (el) el.addEventListener("input", applyFilters);
  });

  if (els.fileInput) {
    els.fileInput.addEventListener("change", handleUpload);
  }

  if (els.resetData) {
    els.resetData.addEventListener("click", resetStoredData);
  }

  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) {
      const fresh = readStoredSchools();
      if (fresh.length) {
        useSchools(fresh, "브라우저 저장 데이터");
      }
      applyFilters();
    }
  });
}

async function loadDefaultDataset() {
  try {
    const response = await fetch(DEFAULT_DATA_URL, { cache: "no-store" });
    if (!response.ok) return;

    const data = await response.json();
    if (Array.isArray(data) && !state.schools.length) {
      useSchools(normalizeRecords(data), "data/schools.json");
    }
  } catch {
    // The site still works with uploaded data only.
  }
}

function isDetailPage() {
  return els.page === "detail";
}

function useSchools(schools, sourceLabel) {
  state.schools = dedupeSchools(schools);
  state.sourceLabel = sourceLabel;
  updateFilterOptions();
  applyFilters();
}

function applyFilters() {
  const query = normalizeText(els.searchInput?.value || "");
  const region = els.regionFilter?.value || "";
  const founding = els.foundingFilter?.value || "";

  const filtered = state.schools.filter((school) => {
    const searchable = normalizeText(
      [school.schoolName, school.address, school.district, school.founding, school.schoolType]
        .filter(Boolean)
        .join(" ")
    );

    const matchesQuery = !query || searchable.includes(query);
    const matchesRegion = !region || school.district === region;
    const matchesFounding = !founding || school.founding === founding;

    return matchesQuery && matchesRegion && matchesFounding;
  });

  state.filtered = filtered;
  if (!state.selectedId || !filtered.some((school) => school.id === state.selectedId)) {
    state.selectedId = filtered[0]?.id || "";
  }

  renderIndex();
  renderDetailForSelected();
}

function renderIndex() {
  if (els.resultCount) {
    els.resultCount.textContent = String(state.filtered.length);
  }

  if (els.dataSource) {
    els.dataSource.textContent = state.sourceLabel || "공개 데이터";
  }

  if (els.emptyState) {
    els.emptyState.hidden = state.schools.length > 0;
  }

  if (!els.schoolList) return;

  els.schoolList.innerHTML = "";

  if (!state.filtered.length) {
    els.schoolList.innerHTML = `
      <div class="empty-state">
        <h3>조건에 맞는 학교가 없습니다.</h3>
        <p>검색어를 바꾸거나 필터를 해제해 보세요.</p>
      </div>
    `;
    return;
  }

  const fragment = document.createDocumentFragment();
  state.filtered.forEach((school) => {
    fragment.appendChild(buildSchoolCard(school));
  });
  els.schoolList.appendChild(fragment);
}

function buildSchoolCard(school) {
  const card = document.createElement("article");
  card.className = `school-card${school.id === state.selectedId ? " is-selected" : ""}`;
  card.tabIndex = 0;
  card.role = "button";
  card.dataset.id = school.id;

  card.innerHTML = `
    <div class="school-card-head">
      <div>
        <h3>${escapeHtml(school.schoolName || "이름 없음")}</h3>
        <p class="muted">${escapeHtml(school.address || school.district || "주소 정보 없음")}</p>
      </div>
      <span class="chip">${escapeHtml(school.founding || "설립 정보 없음")}</span>
    </div>
    <div class="meta-row">
      ${school.district ? `<span class="chip muted">${escapeHtml(school.district)}</span>` : ""}
      ${school.schoolType ? `<span class="chip muted">${escapeHtml(school.schoolType)}</span>` : ""}
      ${school.phone ? `<span class="chip muted">${escapeHtml(school.phone)}</span>` : ""}
    </div>
    <div class="card-actions">
      <a class="card-link" href="school.html?id=${encodeURIComponent(school.id)}">상세 페이지</a>
    </div>
  `;

  card.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof HTMLAnchorElement) return;
    state.selectedId = school.id;
    renderIndex();
    renderDetailForSelected();
  });

  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      state.selectedId = school.id;
      renderIndex();
      renderDetailForSelected();
    }
  });

  return card;
}

function renderDetailForSelected() {
  if (!els.detailPanel) return;

  const school = state.filtered.find((item) => item.id === state.selectedId);
  if (!school) {
    if (!state.schools.length) {
      renderDetailEmpty(
        "데이터를 불러오지 못했습니다",
        "고등학교현황 파일을 업로드하거나 data/schools.json을 추가하면 상세 정보가 표시됩니다."
      );
    } else {
      renderDetailEmpty("선택된 학교가 없습니다", "목록에서 학교를 선택해 주세요.");
    }
    return;
  }

  els.detailPanel.innerHTML = buildDetailMarkup(school);
}

function renderDetailPage() {
  const id = new URLSearchParams(window.location.search).get("id");
  const school = state.schools.find((item) => item.id === id) || state.schools[0];

  if (!school) {
    renderDetailEmpty(
      "상세 정보를 찾을 수 없습니다",
      "기본 데이터가 없거나 선택한 학교가 존재하지 않습니다. index.html에서 학교를 다시 선택해 주세요."
    );
    return;
  }

  if (els.detailPanel) {
    els.detailPanel.innerHTML = buildDetailMarkup(school, true);
  }
}

function buildDetailMarkup(school, showBackLink = false) {
  return `
    <div class="detail-grid">
      ${showBackLink ? '<a class="back-link" href="index.html">← 목록으로 돌아가기</a>' : ""}
      <div class="detail-item">
        <span>학교명</span>
        <strong>${escapeHtml(school.schoolName || "이름 없음")}</strong>
      </div>
      <div class="detail-item">
        <span>주소</span>
        <strong>${escapeHtml(school.address || "정보 없음")}</strong>
      </div>
      <div class="detail-item">
        <span>지역</span>
        <strong>${escapeHtml(school.district || "정보 없음")}</strong>
      </div>
      <div class="detail-item">
        <span>학교 유형</span>
        <strong>${escapeHtml(school.schoolType || "정보 없음")}</strong>
      </div>
      <div class="detail-item">
        <span>설립 구분</span>
        <strong>${escapeHtml(school.founding || "정보 없음")}</strong>
      </div>
      <div class="detail-item">
        <span>전화번호</span>
        <strong>${escapeHtml(school.phone || "정보 없음")}</strong>
      </div>
      <div class="detail-item">
        <span>홈페이지</span>
        ${
          school.homepage
            ? `<a href="${escapeAttribute(school.homepage)}" target="_blank" rel="noreferrer">${escapeHtml(
                school.homepage
              )}</a>`
            : "<strong>정보 없음</strong>"
        }
      </div>
      <div class="detail-item">
        <span>추가 메모</span>
        <strong>${escapeHtml(school.note || "공개 가능한 정보만 표시합니다.")}</strong>
      </div>
    </div>
  `;
}

function renderDetailEmpty(title, description) {
  if (!els.detailPanel) return;
  els.detailPanel.innerHTML = `
    <div class="detail-empty">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(description)}</p>
    </div>
  `;
}

async function handleUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  if (typeof window.XLSX === "undefined") {
    renderDetailEmpty(
      "엑셀 파서 로드 실패",
      "브라우저가 XLSX 라이브러리를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."
    );
    return;
  }

  try {
    const buffer = await file.arrayBuffer();
    const workbook = window.XLSX.read(buffer, { type: "array" });
    const firstSheet = workbook.SheetNames[0];
    if (!firstSheet) {
      throw new Error("워크북에 시트가 없습니다.");
    }

    const rows = window.XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { defval: "" });
    const normalized = normalizeRecords(rows);

    if (!normalized.length) {
      throw new Error("경기도 고등학교로 해석할 수 있는 행을 찾지 못했습니다.");
    }

    saveStoredSchools(normalized);
    useSchools(normalized, file.name);
    state.selectedId = state.filtered[0]?.id || "";
    renderIndex();
    renderDetailForSelected();
  } catch (error) {
    renderDetailEmpty(
      "파일을 읽을 수 없습니다",
      error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다."
    );
  } finally {
    event.target.value = "";
  }
}

function resetStoredData() {
  localStorage.removeItem(STORAGE_KEY);
  window.location.reload();
}

function updateFilterOptions() {
  if (!els.regionFilter) return;

  const currentRegion = els.regionFilter.value;
  const regions = uniqueSorted(
    state.schools
      .map((school) => school.district)
      .filter(Boolean)
  );

  els.regionFilter.innerHTML = `<option value="">전체</option>${regions
    .map((region) => `<option value="${escapeAttribute(region)}">${escapeHtml(region)}</option>`)
    .join("")}`;

  if (regions.includes(currentRegion)) {
    els.regionFilter.value = currentRegion;
  }
}

function saveStoredSchools(schools) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(schools));
}

function readStoredSchools() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? normalizeRecords(parsed) : [];
  } catch {
    return [];
  }
}

function normalizeRecords(rows) {
  if (!Array.isArray(rows)) return [];

  return rows
    .map((row, index) => normalizeRow(row, index))
    .filter((row) => row && row.schoolName)
    .sort((a, b) => {
      const districtCompare = (a.district || "").localeCompare(b.district || "", "ko");
      if (districtCompare !== 0) return districtCompare;
      return (a.schoolName || "").localeCompare(b.schoolName || "", "ko");
    });
}

function normalizeRow(row, index) {
  const objectRow = row && typeof row === "object" ? row : {};
  const values = Object.values(objectRow)
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  const rawText = values.join(" ");

  const schoolName = pickValue(objectRow, [/학교명/, /학교\s*명/, /명칭/, /기관명/, /학교$/]) || inferSchoolName(rawText);
  const address =
    pickValue(objectRow, [/주소/, /소재지/, /도로명/, /지번/, /위치/]) || inferAddress(rawText);
  const district =
    pickValue(objectRow, [/시군구/, /시·군·구/, /행정구역/, /지역/, /구군/, /구분/]) ||
    inferDistrict(address);
  const schoolType =
    pickValue(objectRow, [/학교급/, /학교유형/, /유형/, /급/, /계열/]) || inferSchoolType(rawText);
  const founding =
    pickValue(objectRow, [/설립구분/, /공사립/, /설립별/, /설립/, /운영형태/]) || inferFounding(rawText);
  const phone = pickValue(objectRow, [/전화/, /연락처/, /전화번호/]);
  const homepage = pickValue(objectRow, [/홈페이지/, /누리집/, /URL/, /링크/]);
  const note = pickValue(objectRow, [/비고/, /메모/, /특이사항/]);

  const normalized = {
    id: makeSchoolId(schoolName, district, address, index),
    schoolName,
    address,
    district,
    schoolType,
    founding,
    phone,
    homepage,
    note,
  };

  if (!isLikelyHighSchool(normalized, rawText)) {
    return null;
  }

  return normalized;
}

function isLikelyHighSchool(record, rawText) {
  const source = normalizeText([record.schoolName, record.schoolType, rawText].filter(Boolean).join(" "));
  return /고등/.test(source) || /고교/.test(source);
}

function inferSchoolName(text) {
  const match = text.match(/([가-힣A-Za-z0-9·\-\s]+고등학교)/);
  return match?.[1]?.trim() || "";
}

function inferAddress(text) {
  const match = text.match(/경기도\s+[가-힣A-Za-z0-9·\-\s,()]+/);
  return match?.[0]?.trim() || "";
}

function inferDistrict(address) {
  if (!address) return "";
  const match = address.match(/경기도\s+([가-힣]+(?:시|군|구))/);
  return match?.[1] || "";
}

function inferSchoolType(text) {
  if (/특성화/.test(text)) return "특성화고";
  if (/자율/.test(text)) return "자율고";
  if (/일반고/.test(text)) return "일반고";
  return "";
}

function inferFounding(text) {
  if (/사립/.test(text)) return "사립";
  if (/국립/.test(text)) return "국립";
  if (/공립/.test(text)) return "공립";
  return "";
}

function pickValue(row, patterns) {
  for (const [key, value] of Object.entries(row)) {
    if (!patterns.some((pattern) => pattern.test(String(key)))) continue;
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
}

function makeSchoolId(name, district, address, index) {
  const raw = normalizeText([name, district, address, index].filter(Boolean).join("-"));
  return raw
    .replace(/[^a-z0-9가-힣]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

function dedupeSchools(schools) {
  const seen = new Set();
  return schools.filter((school) => {
    if (!school || !school.schoolName) return false;
    const key = normalizeText(
      [school.schoolName, school.address, school.district].filter(Boolean).join("|")
    );
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, "ko"));
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}
