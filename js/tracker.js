const FIREBASE_URL_KEY = "lfpy_firebase_url";
const SESSION_ID_KEY = "lfpy_session_id";
const TRACKER_STATE_KEY = "lfpy_tracker_state";
const HEARTBEAT_MS = 10000;

export function getStoredFirebaseUrl() {
  return localStorage.getItem(FIREBASE_URL_KEY) || "";
}

export function setStoredFirebaseUrl(url) {
  const cleaned = String(url || "").trim().replace(/\/$/, "");
  if (cleaned) {
    localStorage.setItem(FIREBASE_URL_KEY, cleaned);
  } else {
    localStorage.removeItem(FIREBASE_URL_KEY);
  }
  return cleaned;
}

export function createTracker(appName = "lfpy") {
  const sessionId = ensureSessionId();
  const state = loadTrackerState();
  let heartbeatTimer = null;

  const baseSession = {
    id: sessionId,
    app: appName,
    startTs: state.startTs || Date.now(),
    lastActive: Date.now(),
    currentPage: "home",
    device: detectDevice(),
    os: detectOS(),
    browser: detectBrowser(),
    source: document.referrer || "direct",
    path: location.pathname,
    duration: 0,
    viewedSchools: state.viewedSchools || [],
    savedSchools: state.savedSchools || [],
    preferences: state.preferences || {},
    completedQuiz: false,
  };

  persistTrackerState(baseSession);
  queueHeartbeat();

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flushSession({ lastActive: Date.now() });
    } else {
      flushSession({ lastActive: Date.now() });
    }
  });

  window.addEventListener("beforeunload", () => {
    flushSession({ lastActive: Date.now() }, true);
  });

  function queueHeartbeat() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
      flushSession({ lastActive: Date.now() });
    }, HEARTBEAT_MS);
  }

  function flushSession(extra = {}, fireAndForget = false) {
    const payload = {
      ...baseSession,
      ...state,
      ...extra,
      lastActive: extra.lastActive || Date.now(),
      duration: Math.max(0, Math.round((Date.now() - baseSession.startTs) / 1000)),
      updatedAt: new Date().toISOString(),
    };
    persistTrackerState(payload);
    postSession(payload, fireAndForget);
  }

  function postSession(payload, fireAndForget = false) {
    const url = getStoredFirebaseUrl();
    if (!url) return;

    const target = `${url}/sessions/${sessionId}.json`;
    const body = JSON.stringify(payload);

    if (fireAndForget && navigator.sendBeacon) {
      navigator.sendBeacon(target, new Blob([body], { type: "application/json" }));
      return;
    }

    fetch(target, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: fireAndForget,
    }).catch(() => {});
  }

  function pushEvent(type, data = {}) {
    const url = getStoredFirebaseUrl();
    if (!url) return;

    fetch(`${url}/events.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type,
        data,
        sessionId,
        app: appName,
        ts: Date.now(),
        isoTime: new Date().toISOString(),
        page: state.currentPage || "home",
      }),
    }).catch(() => {});
  }

  return {
    sessionId,
    setPage(page) {
      state.currentPage = page;
      flushSession({ currentPage: page });
      pushEvent("page_view", { page });
    },
    trackSearch(query) {
      pushEvent("search", { query });
    },
    trackPreferences(preferences) {
      state.preferences = { ...preferences };
      flushSession({ preferences: state.preferences });
      pushEvent("preferences", state.preferences);
    },
    trackRecommendation(results, preferences) {
      const recommended = results.map((item) => item.school?.schoolName).filter(Boolean);
      flushSession({
        preferences: { ...state.preferences, ...preferences },
        recommendedSchools: recommended,
      });
      pushEvent("recommendation", {
        preferences,
        recommendedSchools: recommended,
        topScore: results[0]?.score || 0,
      });
    },
    trackSchoolView(school) {
      const item = simplifySchool(school);
      state.viewedSchools = mergeUnique(state.viewedSchools, [item.schoolName]);
      flushSession({ viewedSchools: state.viewedSchools });
      pushEvent("school_view", item);
    },
    trackSchoolSave(school) {
      const item = simplifySchool(school);
      state.savedSchools = mergeUnique(state.savedSchools, [item.schoolName]);
      flushSession({ savedSchools: state.savedSchools });
      pushEvent("school_save", item);
    },
    completeQuiz() {
      flushSession({ completedQuiz: true });
      pushEvent("quiz_complete", {});
    },
    updateLocation(location) {
      flushSession({ location });
      pushEvent("location_update", location);
    },
    updateConfig() {
      flushSession({});
    },
    destroy() {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
    },
  };
}

function ensureSessionId() {
  let sessionId = localStorage.getItem(SESSION_ID_KEY);
  if (!sessionId) {
    sessionId = `lfpy-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
    localStorage.setItem(SESSION_ID_KEY, sessionId);
  }
  return sessionId;
}

function loadTrackerState() {
  try {
    return JSON.parse(localStorage.getItem(TRACKER_STATE_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function persistTrackerState(state) {
  try {
    localStorage.setItem(TRACKER_STATE_KEY, JSON.stringify(state));
  } catch {
    // Local storage is only a convenience cache; tracking still continues with fresh payloads.
  }
}

function mergeUnique(existing, values) {
  return [...new Set([...(existing || []), ...(values || [])])];
}

function simplifySchool(school = {}) {
  return {
    schoolName: school.schoolName || "",
    founding: school.founding || "",
    schoolType: school.schoolType || "",
    district: school.district || "",
    address: school.address || "",
    distanceKm: school.distanceKm ?? null,
  };
}

function detectDevice() {
  const ua = navigator.userAgent || "";
  if (/Mobi|Android|iPhone/i.test(ua)) return "mobile";
  if (/iPad|Tablet/i.test(ua)) return "tablet";
  return "desktop";
}

function detectOS() {
  const ua = navigator.userAgent || "";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Mac/i.test(ua)) return "macOS";
  if (/Android/i.test(ua)) return "Android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
  if (/Linux/i.test(ua)) return "Linux";
  return "Unknown";
}

function detectBrowser() {
  const ua = navigator.userAgent || "";
  if (/Edg/i.test(ua)) return "Edge";
  if (/Chrome/i.test(ua)) return "Chrome";
  if (/Firefox/i.test(ua)) return "Firefox";
  if (/Safari/i.test(ua)) return "Safari";
  return "Unknown";
}

export function summarizeSessionDuration(session) {
  const duration = Number(session?.duration || 0);
  const minutes = Math.floor(duration / 60);
  const seconds = duration % 60;
  return `${minutes}분 ${seconds}초`;
}

export function isSessionActive(session, thresholdMs = 15000) {
  return Date.now() - Number(session?.lastActive || 0) < thresholdMs;
}
