// PCCScribe Popup Script

const PCC_URLS = [
  "pointclickcare.com",
  "pointclickcare.ca",
];

function isPCCPage(url) {
  return PCC_URLS.some(domain => url.includes(domain));
}

async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function getApiUrl() {
  return new Promise(resolve => {
    chrome.storage.sync.get(["apiUrl"], result => {
      resolve(result.apiUrl || "");
    });
  });
}

async function init() {
  const tab = await getCurrentTab();
  const onPCC = tab && isPCCPage(tab.url || "");

  // Update page section
  const pageInfo = document.getElementById("pageInfo");
  const pageIcon = document.getElementById("pageIcon");
  const pageName = document.getElementById("pageName");
  const openPCCBtn = document.getElementById("openPCCBtn");
  const pccActiveSection = document.getElementById("pccActiveSection");
  const pccSection = document.getElementById("pccSection");

  if (onPCC) {
    pageIcon.textContent = "✓";
    pageIcon.style.color = "#16a34a";
    pageName.textContent = "On PointClickCare";
    pageName.style.color = "#15803d";
    openPCCBtn.style.display = "none";
    pccActiveSection.style.display = "block";

    // Try to get patient name from tab title
    if (tab.title) {
      const match = tab.title.match(/^([^-|]+?)(?:\s*[-|])/);
      const patientEl = document.getElementById("detectedPatient");
      if (match && match[1].trim() !== "PointClickCare") {
        patientEl.textContent = match[1].trim();
        patientEl.style.color = "#111827";
      } else {
        patientEl.textContent = "Open a patient chart to detect patient";
        patientEl.style.color = "#9ca3af";
        patientEl.style.fontStyle = "italic";
        patientEl.style.fontWeight = "400";
      }
    }
  } else {
    pageIcon.textContent = "→";
    openPCCBtn.style.display = "block";
    pccActiveSection.style.display = "none";
  }

  // Check connection
  const result = await chrome.runtime.sendMessage({ type: "CHECK_CONNECTION" });
  const statusDot = document.getElementById("statusDot");
  const statusText = document.getElementById("statusText");

  if (result.success) {
    statusDot.className = "status-dot status-connected";
    statusText.textContent = "Connected to PCCScribe";
  } else {
    statusDot.className = "status-dot status-disconnected";
    statusText.textContent = result.apiUrl && result.apiUrl !== "https://your-pccscribe-app.replit.app/api"
      ? "Cannot reach PCCScribe"
      : "Not configured — open Settings";
  }

  // Set app URL
  const apiUrl = await getApiUrl();
  if (apiUrl) {
    const appUrl = apiUrl.replace(/\/api$/, "");
    document.getElementById("openAppBtn").href = appUrl;
    document.getElementById("helpBtn").href = appUrl + "/extension";
  }
}

// Event Listeners

document.getElementById("openPCCBtn").addEventListener("click", () => {
  chrome.tabs.create({ url: "https://app.pointclickcare.com" });
  window.close();
});

document.getElementById("openPanelBtn").addEventListener("click", async () => {
  const tab = await getCurrentTab();
  if (!tab) return;
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const fab = document.getElementById("pccscribe-fab");
      if (fab) fab.click();
    }
  });
  window.close();
});

document.getElementById("openAppBtn").addEventListener("click", async (e) => {
  e.preventDefault();
  const apiUrl = await getApiUrl();
  const appUrl = (apiUrl || "").replace(/\/api$/, "") || "#";
  if (appUrl !== "#") {
    chrome.tabs.create({ url: appUrl });
    window.close();
  }
});

document.getElementById("helpBtn").addEventListener("click", async (e) => {
  e.preventDefault();
  const apiUrl = await getApiUrl();
  const appUrl = (apiUrl || "").replace(/\/api$/, "") || "#";
  if (appUrl !== "#") {
    chrome.tabs.create({ url: appUrl + "/extension" });
    window.close();
  }
});

document.getElementById("settingsBtn").addEventListener("click", async () => {
  document.getElementById("mainContent").style.display = "none";
  document.getElementById("settingsContent").style.display = "block";

  const apiUrl = await getApiUrl();
  document.getElementById("apiUrlInput").value = apiUrl;
});

document.getElementById("backBtn").addEventListener("click", () => {
  document.getElementById("settingsContent").style.display = "none";
  document.getElementById("mainContent").style.display = "block";
});

document.getElementById("saveSettingsBtn").addEventListener("click", () => {
  const url = document.getElementById("apiUrlInput").value.trim().replace(/\/$/, "");
  const status = document.getElementById("saveStatus");

  if (!url) {
    status.textContent = "Please enter a URL";
    status.className = "save-status save-status-error";
    return;
  }

  chrome.storage.sync.set({ apiUrl: url }, () => {
    status.textContent = "✓ Saved!";
    status.className = "save-status save-status-success";
    setTimeout(() => {
      document.getElementById("settingsContent").style.display = "none";
      document.getElementById("mainContent").style.display = "block";
      init();
    }, 1000);
  });
});

init();
