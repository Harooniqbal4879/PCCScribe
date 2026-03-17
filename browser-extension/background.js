// PCCScribe Background Service Worker

const DEFAULT_API_URL = "https://your-pccscribe-app.replit.app/api";

async function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["apiUrl"], (result) => {
      resolve({
        apiUrl: result.apiUrl || DEFAULT_API_URL,
      });
    });
  });
}

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SEND_NOTES") {
    handleSendNotes(message.payload).then(sendResponse).catch((err) => {
      sendResponse({ success: false, error: err.message });
    });
    return true; // keep channel open for async response
  }

  if (message.type === "FETCH_PATIENTS") {
    handleFetchPatients().then(sendResponse).catch((err) => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (message.type === "CHECK_CONNECTION") {
    handleCheckConnection().then(sendResponse).catch((err) => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (message.type === "CREATE_PATIENT") {
    handleCreatePatient(message.payload).then(sendResponse).catch((err) => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (message.type === "SYNC_PATIENT") {
    handleSyncPatient(message.payload).then(sendResponse).catch((err) => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (message.type === "FETCH_NOTE_CONTENT") {
    handleFetchNoteContent(message.payload.printUrl).then(sendResponse).catch((err) => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }
});

async function handleCheckConnection() {
  const { apiUrl } = await getConfig();
  try {
    const response = await fetch(`${apiUrl}/healthz`, {
      signal: AbortSignal.timeout(5000),
    });
    const data = await response.json();
    return { success: response.ok, status: data.status, apiUrl };
  } catch (err) {
    return { success: false, error: err.message, apiUrl };
  }
}

async function handleFetchPatients() {
  const { apiUrl } = await getConfig();
  try {
    const response = await fetch(`${apiUrl}/patients`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const patients = await response.json();
    return { success: true, patients };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function handleCreatePatient(patientData) {
  const { apiUrl } = await getConfig();
  try {
    const response = await fetch(`${apiUrl}/patients`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patientData),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || `HTTP ${response.status}`);
    }
    const patient = await response.json();
    return { success: true, patient };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Open PCC print URL in a hidden tab, extract full text, close tab ─────────
// The print page is same-origin (app.pointclickcare.com) so scripting is allowed.
async function handleFetchNoteContent(printUrl) {
  return new Promise((resolve) => {
    chrome.tabs.create({ url: printUrl, active: false }, (tab) => {
      const tabId = tab.id;
      const TIMEOUT_MS = 20000;

      function cleanup(result) {
        chrome.tabs.onUpdated.removeListener(onUpdated);
        clearTimeout(timer);
        chrome.tabs.remove(tabId, () => {});
        resolve(result);
      }

      const timer = setTimeout(() => {
        cleanup({ success: false, error: "Timed out loading print view" });
      }, TIMEOUT_MS);

      function onUpdated(updatedTabId, changeInfo) {
        if (updatedTabId !== tabId || changeInfo.status !== "complete") return;
        chrome.scripting.executeScript(
          {
            target: { tabId },
            func: () => {
              // Remove script/style/nav/header elements then grab all visible text
              try {
                const clone = document.body.cloneNode(true);
                clone.querySelectorAll(
                  "script, style, noscript, nav, header, footer, .navbar, #navbar, .menu, [class*='nav']"
                ).forEach((el) => el.remove());

                // Try to find a dedicated note content area first
                const contentArea =
                  clone.querySelector(".note-content") ||
                  clone.querySelector(".noteContent") ||
                  clone.querySelector(".print-content") ||
                  clone.querySelector("form") ||
                  clone.querySelector("table") ||
                  clone;

                const text = (contentArea.innerText || contentArea.textContent || "").trim();
                return { text, url: window.location.href };
              } catch (e) {
                return { text: document.body.innerText.trim(), url: window.location.href };
              }
            },
          },
          (results) => {
            if (chrome.runtime.lastError || !results?.[0]?.result) {
              cleanup({ success: false, error: chrome.runtime.lastError?.message || "Script execution failed" });
            } else {
              const { text, url } = results[0].result;
              cleanup({ success: true, content: text, finalUrl: url });
            }
          }
        );
      }

      chrome.tabs.onUpdated.addListener(onUpdated);
    });
  });
}

async function handleSyncPatient(patientData) {
  const { apiUrl } = await getConfig();
  try {
    const response = await fetch(`${apiUrl}/patients/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patientData),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || `HTTP ${response.status}`);
    }
    const result = await response.json();
    return { success: true, patient: result.patient, created: result.created };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function handleSendNotes({ patientId, notes }) {
  const { apiUrl } = await getConfig();
  try {
    const response = await fetch(`${apiUrl}/patients/${patientId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes, source: "extension" }),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || `HTTP ${response.status}`);
    }
    const result = await response.json();
    return { success: true, inserted: result.inserted, noteIds: result.noteIds };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
