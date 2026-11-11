const MAX_BACKOFF_MS = 6 * 60 * 60 * 1000;

function createInmetAlertMonitor({
  collect,
  cities,
  intervalMs = 10 * 60 * 1000,
  timeoutMs = 20 * 1000,
  now = () => new Date(),
  random = Math.random,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
} = {}) {
  let running = false;
  let started = false;
  let stopped = false;
  let timer = null;
  let currentRun = null;
  let failures = 0;
  let previousAlerts = {};
  const state = {
    status: "aguardando",
    startedAt: null,
    lastAttemptAt: null,
    lastSuccessAt: null,
    nextAttemptAt: null,
    monitoredInstallations: 0,
    affectedInstallations: 0,
    badCoordinateRegistrations: 0,
    alerts: {},
    recentError: null,
  };

  function getStatus() {
    const ageMs = state.lastSuccessAt ? Math.max(0, now().getTime() - Date.parse(state.lastSuccessAt)) : null;
    const stale = ageMs !== null && ageMs > intervalMs * 2;
    const expired = ageMs !== null && ageMs > intervalMs * 6;
    const success = state.status === "com_alertas" || state.status === "sem_alertas";
    return {
      ...state,
      alerts: state.alerts,
      ageMs,
      stale,
      expired,
      integracaoStatus: success ? "operacional"
        : state.lastSuccessAt && !expired ? "degradada" : "indisponivel",
      cachedPreviousSuccess: state.lastSuccessAt !== null && !success,
    };
  }

  function delayNext() {
    const base = Math.min(intervalMs * (2 ** failures), MAX_BACKOFF_MS);
    const delay = Math.round(base * (0.8 + random() * 0.4));
    state.nextAttemptAt = new Date(now().getTime() + delay).toISOString();
    if (!stopped) timer = setTimeoutFn(() => { void run(); }, delay);
  }

  async function run() {
    if (running) return currentRun;
    running = true;
    state.lastAttemptAt = now().toISOString();
    state.status = "coletando";
    state.recentError = null;
    const citiesNow = typeof cities === "function" ? cities() : cities || {};
    const cityEntries = Object.entries(citiesNow);
    state.monitoredInstallations = cityEntries.length;
    state.badCoordinateRegistrations = cityEntries.filter(([, city]) =>
      !Number.isFinite(city?.latitude) || !Number.isFinite(city?.longitude)
      || city.latitude < -34 || city.latitude > 6 || city.longitude < -74 || city.longitude > -28).length;
    const attempt = Promise.resolve().then(() => collect(cityEntries.map(([, city]) => city)));
    let timeout;
    currentRun = Promise.race([
      attempt,
      new Promise((_, reject) => {
        timeout = setTimeoutFn(() => {
          const error = new Error("Timeout");
          error.code = "INMET_ALERT_MONITOR_TIMEOUT";
          reject(error);
        }, timeoutMs);
      }),
    ]).then((result) => {
      clearTimeoutFn(timeout);
      const byBase = result?.porBase || {};
      previousAlerts = byBase;
      state.alerts = byBase;
      state.affectedInstallations = Object.values(byBase).filter((items) => Array.isArray(items) && items.length).length;
      state.lastSuccessAt = now().toISOString();
      state.status = state.affectedInstallations ? "com_alertas" : "sem_alertas";
      failures = 0;
      return result;
    }).catch((error) => {
      clearTimeoutFn(timeout);
      failures += 1;
      state.alerts = previousAlerts;
      state.status = "indisponivel";
      state.recentError = {
        code: String(error?.code || error?.name || "INMET_ALERT_MONITOR_ERROR").slice(0, 80),
        message: "Não foi possível atualizar os avisos oficiais do INMET.",
      };
      return null;
    }).finally(() => {
      running = false;
      currentRun = null;
      delayNext();
    });
    return currentRun;
  }

  function start() {
    if (started) return getStatus();
    started = true;
    stopped = false;
    state.startedAt = now().toISOString();
    void run();
    return getStatus();
  }

  function stop() {
    stopped = true;
    if (timer) clearTimeoutFn(timer);
    timer = null;
  }

  return { start, run, stop, getStatus };
}

module.exports = { createInmetAlertMonitor };
