const PROFILES = [
  {
    id: "bigo-tv",
    label: "Bigo.tv",
    file: "profiles/bigo-tv.json",
  },
  {
    id: "facebook",
    label: "Facebook",
    file: "profiles/facebook.json",
  },
  {
    id: "google",
    label: "Google",
    file: "profiles/google.json",
  },
];

const profileSelect = document.getElementById("profileSelect");
const applyButton = document.getElementById("applyButton");
const profileDescription = document.getElementById("profileDescription");
const ruleActivationList = document.getElementById("ruleActivationList");
const statusMessage = document.getElementById("statusMessage");
const trafficTotalValue = document.getElementById("trafficTotalValue");
const trafficRateValue = document.getElementById("trafficRateValue");
const trafficRequestCountValue = document.getElementById("trafficRequestCountValue");
const trafficScopeValue = document.getElementById("trafficScopeValue");
const trafficLogList = document.getElementById("trafficLogList");
const clearTrafficButton = document.getElementById("clearTrafficButton");

const profileCache = new Map();
const profileRuleToggleState = new Map();
const TRAFFIC_LOG_LIMIT = 30;

const trafficState = {
  totalBytes: 0,
  requestCount: 0,
  currentSecondBytes: 0,
  lastSecondBytes: 0,
  entries: [],
  tickIntervalId: null,
};

function asPositiveNumber(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return value;
}

function estimateHeaderBytes(headers) {
  if (!Array.isArray(headers)) {
    return 0;
  }

  return headers.reduce((total, header) => {
    const name = String(header?.name || "");
    const value = String(header?.value || "");
    return total + name.length + value.length + 4;
  }, 2);
}

function readHeaderNumber(headers, headerName) {
  if (!Array.isArray(headers)) {
    return 0;
  }

  const target = headerName.toLowerCase();
  const header = headers.find(
    (entry) => String(entry?.name || "").toLowerCase() === target
  );

  if (!header) {
    return 0;
  }

  return asPositiveNumber(Number.parseInt(String(header.value), 10));
}

function formatBytes(byteCount) {
  const bytes = asPositiveNumber(byteCount);
  if (bytes === 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024))
  );
  const value = bytes / 1024 ** exponent;
  const decimals = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(decimals)} ${units[exponent]}`;
}

function formatRate(bytesPerSecond) {
  return `${formatBytes(bytesPerSecond)}/s`;
}

function getEntryTransferBytes(entry) {
  const request = entry?.request || {};
  const response = entry?.response || {};

  const requestHeaders =
    asPositiveNumber(request.headersSize) || estimateHeaderBytes(request.headers);
  const requestBody = asPositiveNumber(request.bodySize);

  const responseHeaders =
    asPositiveNumber(response.headersSize) ||
    estimateHeaderBytes(response.headers);

  const responseBody =
    asPositiveNumber(response.bodySize) ||
    asPositiveNumber(response.content?.size) ||
    readHeaderNumber(response.headers, "content-length");

  return requestHeaders + requestBody + responseHeaders + responseBody;
}

function renderTrafficLog() {
  if (!trafficLogList) {
    return;
  }

  trafficLogList.textContent = "";

  if (!trafficState.entries.length) {
    const empty = document.createElement("li");
    empty.className = "traffic-log-item";
    empty.textContent = "No network entries yet for this navigation.";
    trafficLogList.appendChild(empty);
    return;
  }

  trafficState.entries.forEach((entry) => {
    const item = document.createElement("li");
    item.className = "traffic-log-item";

    const main = document.createElement("div");
    main.className = "traffic-log-main";

    const url = document.createElement("p");
    url.className = "traffic-url";
    url.textContent = `${entry.method} ${entry.url}`;

    const size = document.createElement("p");
    size.className = "traffic-meta";
    size.textContent = formatBytes(entry.bytes);

    main.append(url, size);

    const meta = document.createElement("p");
    meta.className = "traffic-meta";
    meta.textContent = `${entry.time} • status ${entry.status}`;

    item.append(main, meta);
    trafficLogList.appendChild(item);
  });
}

function updateTrafficMetrics() {
  if (trafficTotalValue) {
    trafficTotalValue.textContent = formatBytes(trafficState.totalBytes);
  }

  if (trafficRateValue) {
    trafficRateValue.textContent = formatRate(trafficState.lastSecondBytes);
  }

  if (trafficRequestCountValue) {
    trafficRequestCountValue.textContent = String(trafficState.requestCount);
  }
}

function setTrafficScope(url) {
  if (!trafficScopeValue) {
    return;
  }

  if (!url) {
    trafficScopeValue.textContent = "Waiting for tab activity…";
    return;
  }

  try {
    const parsed = new URL(url);
    trafficScopeValue.textContent = `Scope: ${parsed.origin}`;
  } catch {
    trafficScopeValue.textContent = `Scope: ${url}`;
  }
}

function resetTrafficState(url) {
  trafficState.totalBytes = 0;
  trafficState.requestCount = 0;
  trafficState.currentSecondBytes = 0;
  trafficState.lastSecondBytes = 0;
  trafficState.entries = [];

  setTrafficScope(url);
  updateTrafficMetrics();
  renderTrafficLog();
}

function recordTrafficEntry(entry) {
  const bytes = getEntryTransferBytes(entry);

  trafficState.totalBytes += bytes;
  trafficState.currentSecondBytes += bytes;
  trafficState.requestCount += 1;

  const requestUrl = String(entry?.request?.url || "(unknown url)");
  const timeStamp = entry?.startedDateTime
    ? new Date(entry.startedDateTime).toLocaleTimeString()
    : new Date().toLocaleTimeString();

  trafficState.entries.unshift({
    time: timeStamp,
    method: String(entry?.request?.method || "GET"),
    status: String(entry?.response?.status ?? "?"),
    url: requestUrl,
    bytes,
  });

  if (trafficState.entries.length > TRAFFIC_LOG_LIMIT) {
    trafficState.entries.length = TRAFFIC_LOG_LIMIT;
  }

  setTrafficScope(requestUrl);
  updateTrafficMetrics();
  renderTrafficLog();
}

function startTrafficTicker() {
  if (trafficState.tickIntervalId) {
    return;
  }

  trafficState.tickIntervalId = window.setInterval(() => {
    trafficState.lastSecondBytes = trafficState.currentSecondBytes;
    trafficState.currentSecondBytes = 0;
    updateTrafficMetrics();
  }, 1000);
}

const onRequestFinished = (entry) => {
  recordTrafficEntry(entry);
};

const onNavigated = (url) => {
  resetTrafficState(url);
};

function initializeTrafficMonitor() {
  if (!trafficLogList) {
    return;
  }

  chrome.devtools.network.onRequestFinished.addListener(onRequestFinished);
  chrome.devtools.network.onNavigated.addListener(onNavigated);

  if (clearTrafficButton) {
    clearTrafficButton.addEventListener("click", async () => {
      try {
        const currentUrl = await evalInspectedWindow("location.href");
        resetTrafficState(currentUrl);
      } catch {
        resetTrafficState();
      }
    });
  }

  window.addEventListener("beforeunload", () => {
    chrome.devtools.network.onRequestFinished.removeListener(onRequestFinished);
    chrome.devtools.network.onNavigated.removeListener(onNavigated);

    if (trafficState.tickIntervalId) {
      window.clearInterval(trafficState.tickIntervalId);
      trafficState.tickIntervalId = null;
    }
  });

  evalInspectedWindow("location.href")
    .then((currentUrl) => resetTrafficState(currentUrl))
    .catch(() => resetTrafficState());
  startTrafficTicker();
}

function isToggleableRule(rule) {
  return (
    rule?.type === "remove" ||
    rule?.type === "disableFavicon" ||
    rule?.type === "setAddressBar" ||
    rule?.type === "setTitle" ||
    rule?.type === "style" ||
    rule?.type === "pauseMedia" ||
    rule?.type === "stopMedia"
  );
}

function ensureRuleToggleState(profileId, profile) {
  if (!profileRuleToggleState.has(profileId)) {
    profileRuleToggleState.set(profileId, new Map());
  }

  const toggles = profileRuleToggleState.get(profileId);
  const rules = Array.isArray(profile?.rules) ? profile.rules : [];

  rules.forEach((rule, index) => {
    if (isToggleableRule(rule) && !toggles.has(index)) {
      toggles.set(index, true);
    }
  });

  return toggles;
}

function getActiveRuleCount(profileId, profile) {
  const rules = Array.isArray(profile?.rules) ? profile.rules : [];
  const toggles = ensureRuleToggleState(profileId, profile);

  return rules.reduce((count, rule, index) => {
    if (!isToggleableRule(rule)) {
      return count + 1;
    }

    return toggles.get(index) === false ? count : count + 1;
  }, 0);
}

function renderRuleActivationList(profileId, profile) {
  const rules = Array.isArray(profile?.rules) ? profile.rules : [];
  const toggles = ensureRuleToggleState(profileId, profile);

  ruleActivationList.textContent = "";

  if (!rules.length) {
    const emptyItem = document.createElement("li");
    emptyItem.className = "rule-item";
    emptyItem.textContent = "No rules configured for this profile.";
    ruleActivationList.appendChild(emptyItem);
    return;
  }

  rules.forEach((rule, index) => {
    const toggleable = isToggleableRule(rule);
    const isActive = toggleable ? toggles.get(index) !== false : true;

    const item = document.createElement("li");
    item.className = "rule-item";

    const label = document.createElement("label");
    label.className = "rule-toggle";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = isActive;
    checkbox.disabled = !toggleable;
    checkbox.dataset.locked = toggleable ? "false" : "true";
    checkbox.addEventListener("change", () => {
      toggles.set(index, checkbox.checked);
      renderProfileDescription(profileId, profile);
      renderRuleActivationList(profileId, profile);
    });

    const main = document.createElement("div");
    main.className = "rule-main";

    const type = document.createElement("p");
    type.className = "rule-type";
    type.textContent = rule.type || "unknown";

    const selector = document.createElement("p");
    selector.className = "rule-selector";
    selector.textContent = rule.selector || "(no selector)";

    main.append(type, selector);

    const state = document.createElement("span");
    state.className = `rule-state ${toggleable ? (isActive ? "on" : "off") : "locked"}`;
    state.textContent = toggleable ? (isActive ? "ON" : "OFF") : "ALWAYS ON";

    label.append(checkbox, main, state);
    item.appendChild(label);
    ruleActivationList.appendChild(item);
  });
}

function getEffectiveProfile(profileId, profile) {
  const rules = Array.isArray(profile?.rules) ? profile.rules : [];
  const toggles = ensureRuleToggleState(profileId, profile);

  return {
    ...profile,
    rules: rules.filter((rule, index) => {
      if (!isToggleableRule(rule)) {
        return true;
      }

      return toggles.get(index) !== false;
    }),
  };
}

function setStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.classList.toggle("is-error", isError);
}

function setLoading(isLoading) {
  applyButton.disabled = isLoading;
  profileSelect.disabled = isLoading;
  ruleActivationList
    .querySelectorAll('input[type="checkbox"]')
    .forEach((checkbox) => {
      if (checkbox.dataset.locked !== "true") {
        checkbox.disabled = isLoading;
      }
    });
  applyButton.textContent = isLoading ? "Applying…" : "Apply";
}

function evalInspectedWindow(expression) {
  return new Promise((resolve, reject) => {
    chrome.devtools.inspectedWindow.eval(
      expression,
      { useContentScriptContext: false },
      (result, exceptionInfo) => {
        if (exceptionInfo && exceptionInfo.isException) {
          reject(new Error(exceptionInfo.value || "Unknown exception"));
          return;
        }

        resolve(result);
      }
    );
  });
}

async function loadProfile(profileId) {
  if (profileCache.has(profileId)) {
    return profileCache.get(profileId);
  }

  const profileMeta = PROFILES.find((profile) => profile.id === profileId);
  if (!profileMeta) {
    throw new Error(`Unknown profile: ${profileId}`);
  }

  const response = await fetch(chrome.runtime.getURL(profileMeta.file));
  if (!response.ok) {
    throw new Error(`Failed to load ${profileMeta.label}`);
  }

  const profile = await response.json();
  profileCache.set(profileId, profile);
  return profile;
}

function renderProfileDescription(profileId, profile) {
  const lines = [profile.description || "No description provided."];

  if (Array.isArray(profile.rules)) {
    const total = profile.rules.length;
    const active = getActiveRuleCount(profileId, profile);
    lines.push(`${active} active of ${total} cleanup rule${total === 1 ? "" : "s"}.`);
  }

  profileDescription.textContent = lines.join(" ");
}

function buildInspectionScript(profile) {
  return [
    "(() => {",
    `  const profile = ${JSON.stringify(profile)};`,
    "  const report = { removed: 0, styled: 0, paused: 0, clearedSrc: 0, removedAfter: 0, hiddenAfter: 0, hiddenInstead: 0, missing: [], guardSelectors: 0, faviconsDisabled: 0, faviconGuardActive: false, titlesSanitized: 0, titleGuardActive: false, urlsSanitized: 0, urlGuardActive: false };",
    "",
    "  const applyStyleDeclarations = (element, declarations) => {",
    "    Object.entries(declarations).forEach(([property, value]) => {",
    "      if (value && typeof value === 'object') {",
    "        const cssValue = value.value ?? '';",
    "        element.style.setProperty(property, cssValue, value.important ? 'important' : '');",
    "        return;",
    "      }",
    "",
    "      element.style.setProperty(property, String(value), 'important');",
    "    });",
    "  };",
    "",
    "  const hideElement = (element) => {",
    "    if (!element || element.nodeType !== 1) {",
    "      return;",
    "    }",
    "",
    "    element.style.setProperty('display', 'none', 'important');",
    "  };",
    "",
    "  const cleanupFollowingSiblings = (element, mode = 'hide') => {",
    "    let sibling = element.nextElementSibling;",
    "    while (sibling) {",
    "      const nextSibling = sibling.nextElementSibling;",
    "      if (mode === 'remove') {",
    "        sibling.remove();",
    "        report.removedAfter += 1;",
    "      } else {",
    "        hideElement(sibling);",
    "        report.hiddenAfter += 1;",
    "      }",
    "      sibling = nextSibling;",
    "    }",
    "  };",
    "",
    "  const isVideoSensitiveElement = (element) => {",
    "    if (!element || element.nodeType !== 1) {",
    "      return false;",
    "    }",
    "",
    "    const selector = 'video, .video-js, [class*=\"videojs\"], [class*=\"video\"]';",
    "    return element.matches(selector) || !!element.querySelector(selector);",
    "  };",
    "",
    "  const getTitleGuardState = () => {",
    "    if (!window.__webViewProfilerTitleGuardState) {",
    "      window.__webViewProfilerTitleGuardState = {",
    "        desiredTitle: null,",
    "        observer: null,",
    "        intervalId: null,",
    "      };",
    "    }",
    "",
    "    return window.__webViewProfilerTitleGuardState;",
    "  };",
    "",
    "  const enforceTitle = (desiredTitle, options = {}) => {",
    "    const { countInReport = true } = options;",
    "    const safeTitle = String(desiredTitle || '').trim();",
    "    if (!safeTitle) {",
    "      return;",
    "    }",
    "",
    "    let changed = false;",
    "    if (document.title !== safeTitle) {",
    "      document.title = safeTitle;",
    "      changed = true;",
    "    }",
    "",
    "    const titleNode = document.querySelector('head > title');",
    "    if (titleNode && titleNode.textContent !== safeTitle) {",
    "      titleNode.textContent = safeTitle;",
    "      changed = true;",
    "    }",
    "",
    "    if (!titleNode && document.head) {",
    "      const newTitle = document.createElement('title');",
    "      newTitle.textContent = safeTitle;",
    "      document.head.appendChild(newTitle);",
    "      changed = true;",
    "    }",
    "",
    "    if (changed && countInReport) {",
    "      report.titlesSanitized += 1;",
    "    }",
    "  };",
    "",
    "  const installTitleGuard = (desiredTitle) => {",
    "    const safeTitle = String(desiredTitle || '').trim();",
    "    if (!safeTitle) {",
    "      return;",
    "    }",
    "",
    "    const state = getTitleGuardState();",
    "    state.desiredTitle = safeTitle;",
    "",
    "    enforceTitle(safeTitle);",
    "",
    "    if (!state.observer) {",
    "      const rootNode = document.head || document.documentElement;",
    "      if (rootNode) {",
    "        state.observer = new MutationObserver(() => {",
    "          const latestState = getTitleGuardState();",
    "          if (latestState.desiredTitle) {",
    "            enforceTitle(latestState.desiredTitle, { countInReport: false });",
    "          }",
    "        });",
    "",
    "        state.observer.observe(rootNode, {",
    "          childList: true,",
    "          subtree: true,",
    "          characterData: true,",
    "          attributes: true,",
    "          attributeFilter: ['title'],",
    "        });",
    "      }",
    "    }",
    "",
    "    if (!state.intervalId) {",
    "      state.intervalId = window.setInterval(() => {",
    "        const latestState = getTitleGuardState();",
    "        if (latestState.desiredTitle) {",
    "          enforceTitle(latestState.desiredTitle, { countInReport: false });",
    "        }",
    "      }, 2000);",
    "    }",
    "",
    "    report.titleGuardActive = !!state.observer || !!state.intervalId;",
    "  };",
    "",
    "  const getAddressBarGuardState = () => {",
    "    if (!window.__webViewProfilerAddressBarGuardState) {",
    "      window.__webViewProfilerAddressBarGuardState = {",
    "        desiredPath: null,",
    "        methodsPatched: false,",
    "        popHandlersBound: false,",
    "        originalPushState: null,",
    "        originalReplaceState: null,",
    "      };",
    "    }",
    "",
    "    return window.__webViewProfilerAddressBarGuardState;",
    "  };",
    "",
    "  const normalizeDesiredAddress = (value) => {",
    "    const raw = String(value || '').trim();",
    "    if (!raw) {",
    "      return null;",
    "    }",
    "",
    "    try {",
    "      const parsed = new URL(raw, window.location.origin);",
    "      if (parsed.origin !== window.location.origin) {",
    "        return '/';",
    "      }",
    "      return `${parsed.pathname}${parsed.search}${parsed.hash}`;",
    "    } catch (_) {",
    "      return '/';",
    "    }",
    "  };",
    "",
    "  const enforceAddressBar = (desiredPath, options = {}) => {",
    "    const { countInReport = true } = options;",
    "    const safePath = normalizeDesiredAddress(desiredPath);",
    "    if (!safePath) {",
    "      return;",
    "    }",
    "",
    "    const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;",
    "    if (currentPath !== safePath) {",
    "      const state = getAddressBarGuardState();",
    "      const replaceFn = state.originalReplaceState || window.history.replaceState.bind(window.history);",
    "      replaceFn(window.history.state, document.title, safePath);",
    "      if (countInReport) {",
    "        report.urlsSanitized += 1;",
    "      }",
    "    }",
    "  };",
    "",
    "  const installAddressBarGuard = (desiredPath) => {",
    "    const safePath = normalizeDesiredAddress(desiredPath);",
    "    if (!safePath) {",
    "      return;",
    "    }",
    "",
    "    const state = getAddressBarGuardState();",
    "    state.desiredPath = safePath;",
    "",
    "    if (!state.methodsPatched) {",
    "      state.methodsPatched = true;",
    "      state.originalPushState = window.history.pushState.bind(window.history);",
    "      state.originalReplaceState = window.history.replaceState.bind(window.history);",
    "",
    "      window.history.pushState = function(data, title, url) {",
    "        const activeState = getAddressBarGuardState();",
    "        if (activeState.desiredPath) {",
    "          return activeState.originalReplaceState(data, title, activeState.desiredPath);",
    "        }",
    "        return activeState.originalPushState(data, title, url);",
    "      };",
    "",
    "      window.history.replaceState = function(data, title, url) {",
    "        const activeState = getAddressBarGuardState();",
    "        if (activeState.desiredPath) {",
    "          return activeState.originalReplaceState(data, title, activeState.desiredPath);",
    "        }",
    "        return activeState.originalReplaceState(data, title, url);",
    "      };",
    "    }",
    "",
    "    if (!state.popHandlersBound) {",
    "      const reapply = () => {",
    "        const activeState = getAddressBarGuardState();",
    "        if (activeState.desiredPath) {",
    "          enforceAddressBar(activeState.desiredPath, { countInReport: false });",
    "        }",
    "      };",
    "",
    "      window.addEventListener('popstate', reapply, true);",
    "      window.addEventListener('hashchange', reapply, true);",
    "      state.popHandlersBound = true;",
    "    }",
    "",
    "    enforceAddressBar(safePath);",
    "    report.urlGuardActive = true;",
    "  };",
    "",
    "  const getFaviconGuardState = () => {",
    "    if (!window.__webViewProfilerFaviconGuardState) {",
    "      window.__webViewProfilerFaviconGuardState = {",
    "        observer: null,",
    "        blankHref: 'data:image/svg+xml,<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>',",
    "      };",
    "    }",
    "",
    "    return window.__webViewProfilerFaviconGuardState;",
    "  };",
    "",
    "  const isFaviconLinkElement = (element) => {",
    "    if (!(element instanceof HTMLLinkElement)) {",
    "      return false;",
    "    }",
    "",
    "    const rel = String(element.getAttribute('rel') || '').toLowerCase();",
    "    return rel.split(/\s+/).includes('icon') || rel.includes('apple-touch-icon');",
    "  };",
    "",
    "  const suppressFavicons = (options = {}) => {",
    "    const { countInReport = true } = options;",
    "    const state = getFaviconGuardState();",
    "",
    "    const setBlankIcon = (link) => {",
    "      if (!(link instanceof HTMLLinkElement)) {",
    "        return;",
    "      }",
    "",
    "      if (!isFaviconLinkElement(link)) {",
    "        return;",
    "      }",
    "",
    "      const currentHref = String(link.getAttribute('href') || '');",
    "      if (currentHref !== state.blankHref) {",
    "        link.setAttribute('href', state.blankHref);",
    "        link.href = state.blankHref;",
    "        if (countInReport) {",
    "          report.faviconsDisabled += 1;",
    "        }",
    "      }",
    "    };",
    "",
    "    const head = document.head || document.documentElement;",
    "    if (!head) {",
    "      return;",
    "    }",
    "",
    "    const links = Array.from(head.querySelectorAll('link[rel]')).filter(isFaviconLinkElement);",
    "",
    "    if (!links.length) {",
    "      const fallbackIcon = document.createElement('link');",
    "      fallbackIcon.setAttribute('rel', 'icon');",
    "      fallbackIcon.setAttribute('href', state.blankHref);",
    "      head.appendChild(fallbackIcon);",
    "      if (countInReport) {",
    "        report.faviconsDisabled += 1;",
    "      }",
    "    } else {",
    "      links.forEach((link) => setBlankIcon(link));",
    "    }",
    "",
    "    if (!state.observer && head) {",
    "      state.observer = new MutationObserver((mutations) => {",
    "        mutations.forEach((mutation) => {",
    "          if (mutation.type === 'attributes' && mutation.target instanceof HTMLLinkElement) {",
    "            setBlankIcon(mutation.target);",
    "            return;",
    "          }",
    "",
    "          mutation.addedNodes.forEach((node) => {",
    "            if (node instanceof HTMLLinkElement) {",
    "              setBlankIcon(node);",
    "              return;",
    "            }",
    "",
    "            if (node instanceof Element) {",
    "              node.querySelectorAll('link[rel]').forEach((link) => setBlankIcon(link));",
    "            }",
    "          });",
    "        });",
    "      });",
    "",
    "      state.observer.observe(head, {",
    "        childList: true,",
    "        subtree: true,",
    "        attributes: true,",
    "        attributeFilter: ['rel', 'href'],",
    "      });",
    "    }",
    "",
    "    report.faviconGuardActive = !!state.observer;",
    "  };",
    "",
    "  const getMediaGuardState = () => {",
    "    if (!window.__webViewProfilerMediaGuardState) {",
    "      window.__webViewProfilerMediaGuardState = {",
    "        selectors: new Set(),",
    "        observer: null,",
    "        intervalId: null,",
    "        playPatched: false,",
    "        originalPlay: null,",
    "      };",
    "    }",
    "",
    "    return window.__webViewProfilerMediaGuardState;",
    "  };",
    "",
    "  const isGuardedMediaElement = (media, guardState) => {",
    "    if (!(media instanceof HTMLMediaElement) || !guardState.selectors.size) {",
    "      return false;",
    "    }",
    "",
    "    for (const selector of guardState.selectors) {",
    "      if (!selector || typeof selector !== 'string') {",
    "        continue;",
    "      }",
    "",
    "      try {",
    "        if (media.matches(selector) || !!media.closest(selector)) {",
    "          return true;",
    "        }",
    "      } catch (_) {",
    "        // ignore invalid selectors",
    "      }",
    "    }",
    "",
    "    return false;",
    "  };",
    "",
    "  const stopMediaElement = (media, options = {}) => {",
    "    const { countInReport = true } = options;",
    "",
    "    if (!(media instanceof HTMLMediaElement)) {",
    "      return;",
    "    }",
    "",
    "    media.autoplay = false;",
    "    media.removeAttribute('autoplay');",
    "    media.preload = 'none';",
    "    media.setAttribute('preload', 'none');",
    "    media.muted = true;",
    "    media.setAttribute('muted', '');",
    "",
    "    if (typeof media.pause === 'function') {",
    "      media.pause();",
    "    }",
    "",
    "    if ('srcObject' in media && media.srcObject) {",
    "      media.srcObject = null;",
    "      if (countInReport) {",
    "        report.clearedSrc += 1;",
    "      }",
    "    }",
    "",
    "    const srcValue = media.getAttribute('src');",
    "    if (typeof srcValue === 'string' && srcValue.trim() !== '') {",
    "      media.setAttribute('src', '');",
    "      media.src = '';",
    "      if (typeof media.load === 'function') {",
    "        media.load();",
    "      }",
    "      if (countInReport) {",
    "        report.clearedSrc += 1;",
    "      }",
    "    } else {",
    "      const sourceNodes = Array.from(media.querySelectorAll('source[src]'));",
    "      if (sourceNodes.length) {",
    "        sourceNodes.forEach((source) => source.setAttribute('src', ''));",
    "        if (typeof media.load === 'function') {",
    "          media.load();",
    "        }",
    "        if (countInReport) {",
    "          report.clearedSrc += 1;",
    "        }",
    "      }",
    "    }",
    "",
    "    if (countInReport) {",
    "      report.paused += 1;",
    "    }",
    "  };",
    "",
    "  const enforceGuardedMediaStop = (guardState) => {",
    "    const allMedia = Array.from(document.querySelectorAll('video, audio'));",
    "    allMedia.forEach((media) => {",
    "      if (isGuardedMediaElement(media, guardState)) {",
    "        stopMediaElement(media, { countInReport: false });",
    "      }",
    "    });",
    "  };",
    "",
    "  const installMediaGuard = (selector) => {",
    "    if (!selector || typeof selector !== 'string') {",
    "      return;",
    "    }",
    "",
    "    const guardState = getMediaGuardState();",
    "    guardState.selectors.add(selector);",
    "    report.guardSelectors = guardState.selectors.size;",
    "",
    "    if (!guardState.playPatched && HTMLMediaElement && HTMLMediaElement.prototype) {",
    "      guardState.playPatched = true;",
    "      guardState.originalPlay = HTMLMediaElement.prototype.play;",
    "",
    "      HTMLMediaElement.prototype.play = function(...args) {",
    "        const activeGuard = getMediaGuardState();",
    "        if (isGuardedMediaElement(this, activeGuard)) {",
    "          stopMediaElement(this, { countInReport: false });",
    "          return Promise.resolve();",
    "        }",
    "",
    "        if (typeof activeGuard.originalPlay === 'function') {",
    "          return activeGuard.originalPlay.apply(this, args);",
    "        }",
    "",
    "        return Promise.resolve();",
    "      };",
    "    }",
    "",
    "    if (!guardState.observer) {",
    "      guardState.observer = new MutationObserver((mutations) => {",
    "        const activeGuard = getMediaGuardState();",
    "",
    "        mutations.forEach((mutation) => {",
    "          if (mutation.type === 'attributes' && mutation.target instanceof HTMLMediaElement) {",
    "            if (isGuardedMediaElement(mutation.target, activeGuard)) {",
    "              stopMediaElement(mutation.target, { countInReport: false });",
    "            }",
    "            return;",
    "          }",
    "",
    "          mutation.addedNodes.forEach((node) => {",
    "            if (!(node instanceof Element)) {",
    "              return;",
    "            }",
    "",
    "            if (node instanceof HTMLMediaElement && isGuardedMediaElement(node, activeGuard)) {",
    "              stopMediaElement(node, { countInReport: false });",
    "            }",
    "",
    "            node.querySelectorAll('video, audio').forEach((media) => {",
    "              if (isGuardedMediaElement(media, activeGuard)) {",
    "                stopMediaElement(media, { countInReport: false });",
    "              }",
    "            });",
    "          });",
    "        });",
    "      });",
    "",
    "      const rootNode = document.documentElement || document.body;",
    "      if (rootNode) {",
    "        guardState.observer.observe(rootNode, {",
    "          childList: true,",
    "          subtree: true,",
    "          attributes: true,",
    "          attributeFilter: ['src', 'autoplay', 'class', 'style'],",
    "        });",
    "      }",
    "    }",
    "",
    "    if (!guardState.intervalId) {",
    "      guardState.intervalId = window.setInterval(() => {",
    "        const activeGuard = getMediaGuardState();",
    "        enforceGuardedMediaStop(activeGuard);",
    "      }, 2500);",
    "    }",
    "",
    "    enforceGuardedMediaStop(guardState);",
    "  };",
    "",
    "  const pauseMediaInTarget = (element) => {",
    "    if (!element || element.nodeType !== 1) {",
    "      return;",
    "    }",
    "",
    "    const mediaElements = element instanceof HTMLMediaElement",
    "      ? [element]",
    "      : Array.from(element.querySelectorAll('video, audio'));",
    "",
    "    mediaElements.forEach((media) => stopMediaElement(media));",
    "  };",
    "",
    "  profile.rules.forEach((rule) => {",
    "    if (rule.type === 'setAddressBar') {",
    "      installAddressBarGuard(rule.value || rule.url || '/');",
    "      return;",
    "    }",
    "",
    "    if (rule.type === 'setTitle') {",
    "      installTitleGuard(rule.value || rule.title || 'General Web Page');",
    "      return;",
    "    }",
    "",
    "    const targets = document.querySelectorAll(rule.selector);",
    "",
    "    if (!targets.length) {",
    "      report.missing.push(rule.selector);",
    "      return;",
    "    }",
    "",
    "    if (rule.type === 'remove') {",
    "      targets.forEach((element) => {",
    "        if (isVideoSensitiveElement(element)) {",
    "          hideElement(element);",
    "          report.hiddenInstead += 1;",
    "          return;",
    "        }",
    "",
    "        element.remove();",
    "        report.removed += 1;",
    "      });",
    "      return;",
    "    }",
    "",
    "    if (rule.type === 'style') {",
    "      targets.forEach((element) => {",
    "        applyStyleDeclarations(element, rule.declarations || {});",
    "        report.styled += 1;",
    "      });",
    "      return;",
    "    }",
    "",
    "    if (rule.type === 'disableFavicon') {",
    "      suppressFavicons();",
    "      return;",
    "    }",
    "",
    "    if (rule.type === 'pauseMedia' || rule.type === 'stopMedia') {",
    "      installMediaGuard(rule.selector);",
    "      targets.forEach((element) => pauseMediaInTarget(element));",
    "      return;",
    "    }",
    "",
    "    if (rule.type === 'removeAfter' || rule.type === 'hideAfter') {",
    "      const mode = rule.type === 'removeAfter' && rule.forceRemove === true ? 'remove' : 'hide';",
    "      targets.forEach((element) => cleanupFollowingSiblings(element, mode));",
    "    }",
    "  });",
    "",
    "  return report;",
    "})();",
  ].join('\n');
}

async function refreshProfileDetails() {
  const profileId = profileSelect.value;
  const profile = await loadProfile(profileId);
  renderProfileDescription(profileId, profile);
  renderRuleActivationList(profileId, profile);
}

async function applyProfile() {
  const profileId = profileSelect.value;
  const profile = await loadProfile(profileId);
  const effectiveProfile = getEffectiveProfile(profileId, profile);
  const script = buildInspectionScript(effectiveProfile);

  setLoading(true);
  setStatus(`Applying ${profile.label}…`);

  chrome.devtools.inspectedWindow.eval(
    script,
    { useContentScriptContext: false },
    (result, exceptionInfo) => {
      setLoading(false);

      if (exceptionInfo && exceptionInfo.isException) {
        const details = exceptionInfo.value || "Unknown exception";
        setStatus(`Failed: ${details}`, true);
        return;
      }

      const removed = result?.removed ?? 0;
      const styled = result?.styled ?? 0;
      const paused = result?.paused ?? 0;
      const clearedSrc = result?.clearedSrc ?? 0;
      const removedAfter = result?.removedAfter ?? 0;
      const hiddenAfter = result?.hiddenAfter ?? 0;
      const hiddenInstead = result?.hiddenInstead ?? 0;
      const guardSelectors = result?.guardSelectors ?? 0;
      const faviconsDisabled = result?.faviconsDisabled ?? 0;
      const faviconGuardActive = result?.faviconGuardActive === true;
      const titlesSanitized = result?.titlesSanitized ?? 0;
      const titleGuardActive = result?.titleGuardActive === true;
      const urlsSanitized = result?.urlsSanitized ?? 0;
      const urlGuardActive = result?.urlGuardActive === true;
      const missing = Array.isArray(result?.missing) ? result.missing : [];

      const summaryParts = [
        `${profile.label} applied.`,
        `${effectiveProfile.rules.length} active rule${effectiveProfile.rules.length === 1 ? "" : "s"} executed`,
        `${removed} element${removed === 1 ? "" : "s"} removed`,
        `${hiddenInstead} video-related target${hiddenInstead === 1 ? "" : "s"} hidden instead of removed`,
        `${styled} style target${styled === 1 ? "" : "s"} updated`,
        `${paused} media element${paused === 1 ? "" : "s"} paused`,
        `${clearedSrc} media source${clearedSrc === 1 ? "" : "s"} cleared`,
        `${guardSelectors} media guard selector${guardSelectors === 1 ? "" : "s"} active`,
        `${faviconsDisabled} favicon link${faviconsDisabled === 1 ? "" : "s"} neutralized`,
        `favicon guard ${faviconGuardActive ? "active" : "inactive"}`,
        `${titlesSanitized} title update${titlesSanitized === 1 ? "" : "s"} applied`,
        `title guard ${titleGuardActive ? "active" : "inactive"}`,
        `${urlsSanitized} address update${urlsSanitized === 1 ? "" : "s"} applied`,
        `address guard ${urlGuardActive ? "active" : "inactive"}`,
        `${hiddenAfter} sibling${hiddenAfter === 1 ? "" : "s"} hidden after target`,
        `${removedAfter} sibling${removedAfter === 1 ? "" : "s"} removed after target`,
      ];

      if (missing.length) {
        summaryParts.push(`Missing selectors: ${missing.join(", ")}`);
      }

      setStatus(summaryParts.join(" • "));
    }
  );
}

function populateProfileList() {
  PROFILES.forEach((profile) => {
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = profile.label;
    profileSelect.appendChild(option);
  });

  profileSelect.value = PROFILES[0].id;
}

profileSelect.addEventListener("change", () => {
  refreshProfileDetails().catch((error) => setStatus(error.message, true));
});

applyButton.addEventListener("click", () => {
  applyProfile().catch((error) => {
    setLoading(false);
    setStatus(error.message, true);
  });
});

initializeTrafficMonitor();

populateProfileList();
refreshProfileDetails().catch((error) => setStatus(error.message, true));