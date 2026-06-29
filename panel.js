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
const fitLayoutButton = document.getElementById("fitLayoutButton");
const profileDescription = document.getElementById("profileDescription");
const ruleActivationList = document.getElementById("ruleActivationList");
const statusMessage = document.getElementById("statusMessage");

const profileCache = new Map();
const profileRuleToggleState = new Map();

function isToggleableRule(rule) {
  return (
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
  fitLayoutButton.disabled = isLoading;
  profileSelect.disabled = isLoading;
  ruleActivationList
    .querySelectorAll('input[type="checkbox"]')
    .forEach((checkbox) => {
      if (checkbox.dataset.locked !== "true") {
        checkbox.disabled = isLoading;
      }
    });
  applyButton.textContent = isLoading ? "Applying…" : "Apply";
  fitLayoutButton.textContent = isLoading ? "Resizing…" : "Fit 60/40 layout";
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

function getCurrentWindow() {
  return new Promise((resolve, reject) => {
    chrome.windows.getCurrent({ populate: false }, (currentWindow) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve(currentWindow);
    });
  });
}

function updateWindowSize(windowId, width, height) {
  return new Promise((resolve, reject) => {
    chrome.windows.update(windowId, { width, height }, (updatedWindow) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve(updatedWindow);
    });
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
    "  const report = { removed: 0, styled: 0, paused: 0, clearedSrc: 0, removedAfter: 0, hiddenAfter: 0, hiddenInstead: 0, missing: [] };",
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
    "  const pauseMediaInTarget = (element) => {",
    "    if (!element || element.nodeType !== 1) {",
    "      return;",
    "    }",
    "",
    "    const mediaElements = element instanceof HTMLMediaElement",
    "      ? [element]",
    "      : Array.from(element.querySelectorAll('video, audio'));",
    "",
    "    mediaElements.forEach((media) => {",
    "      media.autoplay = false;",
    "      media.removeAttribute('autoplay');",
    "      media.preload = 'none';",
    "      media.setAttribute('preload', 'none');",
    "      media.muted = true;",
    "      media.setAttribute('muted', '');",
    "      if (typeof media.pause === 'function') {",
    "        media.pause();",
    "      }",
    "",
    "      const srcValue = media.getAttribute('src');",
    "      if (typeof srcValue === 'string' && srcValue.trim() !== '') {",
    "        media.setAttribute('src', '');",
    "        media.src = '';",
    "        if (typeof media.load === 'function') {",
    "          media.load();",
    "        }",
    "        report.clearedSrc += 1;",
    "      } else {",
    "        const sourceNodes = Array.from(media.querySelectorAll('source[src]'));",
    "        if (sourceNodes.length) {",
    "          sourceNodes.forEach((source) => source.setAttribute('src', ''));",
    "          if (typeof media.load === 'function') {",
    "            media.load();",
    "          }",
    "          report.clearedSrc += 1;",
    "        }",
    "      }",
    "      report.paused += 1;",
    "    });",
    "  };",
    "",
    "  profile.rules.forEach((rule) => {",
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
    "    if (rule.type === 'pauseMedia' || rule.type === 'stopMedia') {",
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
      const missing = Array.isArray(result?.missing) ? result.missing : [];

      const summaryParts = [
        `${profile.label} applied.`,
        `${effectiveProfile.rules.length} active rule${effectiveProfile.rules.length === 1 ? "" : "s"} executed`,
        `${removed} element${removed === 1 ? "" : "s"} removed`,
        `${hiddenInstead} video-related target${hiddenInstead === 1 ? "" : "s"} hidden instead of removed`,
        `${styled} style target${styled === 1 ? "" : "s"} updated`,
        `${paused} media element${paused === 1 ? "" : "s"} paused`,
        `${clearedSrc} media source${clearedSrc === 1 ? "" : "s"} cleared`,
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

async function fitConsoleAndPageLayout() {
  setLoading(true);
  setStatus("Resizing console and active page to a 60/40 split…");

  try {
    const [currentWindow, devtoolsWidth, pageWidth] = await Promise.all([
      getCurrentWindow(),
      Promise.resolve(window.innerWidth),
      evalInspectedWindow("window.innerWidth"),
    ]);

    if (!currentWindow || typeof currentWindow.id !== "number") {
      throw new Error("Unable to determine the current browser window.");
    }

    const chromeFrameWidth = Math.max(
      0,
      (currentWindow.width || 0) - devtoolsWidth - pageWidth
    );
    const targetWidth = Math.max(
      320,
      Math.round(chromeFrameWidth + devtoolsWidth / 0.6)
    );

    await updateWindowSize(currentWindow.id, targetWidth, currentWindow.height);

    setStatus(
      "Adjusted the host window for an approximate 60% DevTools / 40% page split."
    );
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    setLoading(false);
  }
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

fitLayoutButton.addEventListener("click", () => {
  fitConsoleAndPageLayout();
});

populateProfileList();
refreshProfileDetails().catch((error) => setStatus(error.message, true));