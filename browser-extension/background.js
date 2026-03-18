// PCCScribe Background Service Worker

const DEFAULT_API_URL = "https://pcc.etherhealth.ai/api";

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

  if (message.type === "FETCH_PDF") {
    handleFetchPdf(message, sender);
    return false; // fire-and-forget; replies come as separate messages
  }

  if (message.type === "OPEN_SIDE_PANEL") {
    if (sender.tab?.windowId) {
      chrome.sidePanel.open({ windowId: sender.tab.windowId }).catch(() => {});
    }
    return false;
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

      let extracted = false; // guard against multiple complete events

      function onUpdated(updatedTabId, changeInfo) {
        if (updatedTabId !== tabId || changeInfo.status !== "complete") return;
        if (extracted) return;
        extracted = true;
        // Remove listener immediately so duplicate complete events don't re-trigger
        chrome.tabs.onUpdated.removeListener(onUpdated);

        // Small delay — some PCC print pages finish navigation then render via JS
        setTimeout(() => {
          chrome.scripting.executeScript(
            {
              target: { tabId },
              func: () => {
                try {
                  // Detect if we've been redirected to a login/session page
                  const url = window.location.href;
                  const isLoginPage =
                    url.includes("login") ||
                    url.includes("logon") ||
                    url.includes("signin") ||
                    document.title.toLowerCase().includes("login") ||
                    !!document.querySelector("input[type='password']");
                  if (isLoginPage) return { text: "", url, redirectedToLogin: true };

                  const clone = document.body.cloneNode(true);
                  clone.querySelectorAll(
                    "script, style, noscript, nav, header, footer, " +
                    ".navbar, #navbar, .navBar, .menu, [class*='menuBar'], " +
                    "[class*='topNav'], [id*='topNav'], [class*='breadcrumb']"
                  ).forEach((el) => el.remove());

                  // Prefer a focused note content container if one exists
                  const contentArea =
                    clone.querySelector(".note-content") ||
                    clone.querySelector(".noteContent") ||
                    clone.querySelector(".print-content") ||
                    clone.querySelector(".printContent") ||
                    clone.querySelector("[class*='noteBody']") ||
                    clone.querySelector("[class*='noteText']") ||
                    clone.querySelector(".documentContent") ||
                    clone.querySelector("form") ||
                    clone.querySelector("table") ||
                    clone;

                  const text = (contentArea.innerText || contentArea.textContent || "").trim();
                  return { text, url };
                } catch (e) {
                  return { text: document.body.innerText.trim(), url: window.location.href };
                }
              },
            },
            (results) => {
              if (chrome.runtime.lastError || !results?.[0]?.result) {
                cleanup({
                  success: false,
                  error: chrome.runtime.lastError?.message || "Script execution failed",
                });
              } else {
                const { text, url, redirectedToLogin } = results[0].result;
                if (redirectedToLogin) {
                  cleanup({ success: false, error: "PCC session expired — please log in again" });
                } else if (!text || text.length < 20) {
                  cleanup({ success: false, error: "Print page returned empty content" });
                } else {
                  cleanup({ success: true, content: text, finalUrl: url });
                }
              }
            }
          );
        }, 800); // 800ms let JS-rendered print pages settle
      }

      chrome.tabs.onUpdated.addListener(onUpdated);

      // Race-condition fix: if tab is already complete before listener registered
      chrome.tabs.get(tabId, (t) => {
        if (!chrome.runtime.lastError && t && t.status === "complete") {
          onUpdated(tabId, { status: "complete" });
        }
      });
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

// ─── PDF Fetcher ──────────────────────────────────────────────────────────────

function arrayBufferToBase64(buffer) {
  const uint8 = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < uint8.length; i += chunkSize) {
    binary += String.fromCharCode(...uint8.slice(i, i + chunkSize));
  }
  return btoa(binary);
}

async function handleFetchPdf(message, sender) {
  const tabId = sender.tab?.id;
  const { url, patientId } = message;

  await chrome.storage.session.set({ pdfStatus: "loading", pdfTimestamp: Date.now() });

  function sendToast(msg) {
    if (tabId) chrome.tabs.sendMessage(tabId, { type: "SHOW_TOAST", message: msg }).catch(() => {});
  }

  try {
    const response = await fetch(url, {
      credentials: "include",
      headers: { Accept: "application/pdf, */*" },
    });

    if (response.url !== url) {
      console.log("[PCCScribe] PDF redirected:", url, "→", response.url);
    }

    if (!response.ok) {
      sendToast("Could not load note — session may have expired");
      await chrome.storage.session.set({ pdfStatus: "error", pdfError: `HTTP ${response.status}` });
      return;
    }

    const contentType = response.headers.get("content-type") || "";
    const isPdf = contentType.includes("pdf");
    const arrayBuffer = await response.arrayBuffer();

    let dataUri;
    if (isPdf) {
      const base64 = arrayBufferToBase64(arrayBuffer);
      dataUri = `data:application/pdf;base64,${base64}`;
    } else {
      // HTML or other content — wrap in data URI for iframe display
      const text = new TextDecoder().decode(arrayBuffer);
      dataUri = `data:text/html;charset=utf-8,${encodeURIComponent(text)}`;
    }

    // Store so the side panel can pick it up and run PDF.js extraction
    await chrome.storage.session.set({
      pdfDataUri: dataUri,
      pdfIsPdf: isPdf,
      pdfPatientId: patientId || null,
      pdfStatus: "ready",
      pdfTimestamp: Date.now(),
    });

    // Tell the content script to show the inline PDF viewer
    if (tabId) {
      chrome.tabs.sendMessage(tabId, { type: "RENDER_PDF", dataUri }).catch(() => {});
    }
  } catch (err) {
    console.error("[PCCScribe] PDF fetch error:", err);
    sendToast("Could not load note — session may have expired");
    await chrome.storage.session.set({ pdfStatus: "error", pdfError: err.message });
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
