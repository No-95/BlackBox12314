(() => {
  const defaults = {
    apiBase: "",
    apiToken: ""
  };

  const incoming =
    typeof window !== "undefined" && window.BLACKBOX_CONFIG && typeof window.BLACKBOX_CONFIG === "object"
      ? window.BLACKBOX_CONFIG
      : {};

  const apiBase = String(incoming.apiBase || defaults.apiBase || "")
    .trim()
    .replace(/\/+$/, "");
  const apiToken = String(incoming.apiToken || defaults.apiToken || "").trim();

  window.BLACKBOX_CONFIG = { apiBase, apiToken };

  function apiUrl(path) {
    const normalized = String(path || "");
    if (/^https?:\/\//i.test(normalized)) {
      return normalized;
    }
    const withSlash = normalized.startsWith("/") ? normalized : `/${normalized}`;
    return apiBase ? `${apiBase}${withSlash}` : withSlash;
  }

  async function apiFetch(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (apiToken && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${apiToken}`);
    }
    if (options.body && !headers.has("Content-Type") && !(options.body instanceof FormData)) {
      headers.set("Content-Type", "application/json");
    }

    return fetch(apiUrl(path), {
      ...options,
      headers
    });
  }

  function visionistAppUrl() {
    return apiBase ? `${apiBase}/visionist-app/` : "./visionist-app/";
  }

  window.BlackBox = {
    config: window.BLACKBOX_CONFIG,
    apiUrl,
    apiFetch,
    visionistAppUrl
  };
})();
