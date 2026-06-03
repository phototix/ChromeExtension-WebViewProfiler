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
const statusMessage = document.getElementById("statusMessage");

const profileCache = new Map();

function setStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.classList.toggle("is-error", isError);
}

function setLoading(isLoading) {
  applyButton.disabled = isLoading;
  profileSelect.disabled = isLoading;
  applyButton.textContent = isLoading ? "Applying…" : "Apply";
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

function renderProfileDescription(profile) {
  const lines = [profile.description || "No description provided."];

  if (Array.isArray(profile.rules)) {
    lines.push(`${profile.rules.length} cleanup rule${profile.rules.length === 1 ? "" : "s"}.`);
  }

  profileDescription.textContent = lines.join(" ");
}

function buildInspectionScript(profile) {
  return [
    "(() => {",
    `  const profile = ${JSON.stringify(profile)};`,
    "  const report = { removed: 0, styled: 0, removedAfter: 0, missing: [] };",
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
    "  const removeFollowingSiblings = (element) => {",
    "    let sibling = element.nextElementSibling;",
    "    while (sibling) {",
    "      const nextSibling = sibling.nextElementSibling;",
    "      sibling.remove();",
    "      report.removedAfter += 1;",
    "      sibling = nextSibling;",
    "    }",
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
    "    if (rule.type === 'removeAfter') {",
    "      targets.forEach((element) => removeFollowingSiblings(element));",
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
  renderProfileDescription(profile);
}

async function applyProfile() {
  const profileId = profileSelect.value;
  const profile = await loadProfile(profileId);
  const script = buildInspectionScript(profile);

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
      const removedAfter = result?.removedAfter ?? 0;
      const missing = Array.isArray(result?.missing) ? result.missing : [];

      const summaryParts = [
        `${profile.label} applied.`,
        `${removed} element${removed === 1 ? "" : "s"} removed`,
        `${styled} style target${styled === 1 ? "" : "s"} updated`,
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

populateProfileList();
refreshProfileDetails().catch((error) => setStatus(error.message, true));