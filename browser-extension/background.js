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

  if (message.type === "SAVE_FILES") {
    handleSaveFiles(message).catch((e) =>
      console.error("[PALScribe] SAVE_FILES error:", e)
    );
    return false;
  }

  if (message.type === "SCAN_FOR_FILES") {
    handleScanForFiles(sender).then(sendResponse);
    return true;
  }

  if (message.type === "SAVE_FILE_CONTENT") {
    handleSaveFileContent(message).then(sendResponse);
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
      // Clear any prior extracted text so the FAB panel shows fresh loading state
      pdfExtractedText: null,
      pdfExtractedFileName: message.fileName || null,
    });

    // Open the side panel so PDF.js extraction runs, then result flows back to FAB panel
    if (sender.tab?.windowId) {
      chrome.sidePanel.open({ windowId: sender.tab.windowId }).catch(() => {});
    }

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

async function handleSaveFiles({ files, pccClientId }) {
  const { apiUrl } = await getConfig();
  try {
    // Find the PCCScribe patient whose pccInternalId matches the PCC clientId
    const patientsRes = await fetch(`${apiUrl}/patients`);
    if (!patientsRes.ok) throw new Error(`Patients fetch failed: HTTP ${patientsRes.status}`);
    const patients = await patientsRes.json();
    const patient = patients.find((p) => p.pccInternalId === String(pccClientId));
    if (!patient) {
      console.log("[PALScribe] SAVE_FILES: no PCCScribe patient for pccClientId", pccClientId);
      return;
    }
    const saveRes = await fetch(`${apiUrl}/patients/${patient.id}/files`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files }),
    });
    if (!saveRes.ok) throw new Error(`Save files failed: HTTP ${saveRes.status}`);
    const result = await saveRes.json();
    console.log(`[PALScribe] SAVE_FILES: saved ${result.saved} files for patient ${patient.id}`);
  } catch (err) {
    console.error("[PALScribe] SAVE_FILES error:", err);
  }
}

async function handleSaveFileContent({ pccClientId, pccFileId, extractedContent }) {
  const { apiUrl } = await getConfig();
  try {
    // Resolve PCCScribe internal patient ID from the PCC clientId
    const patientsRes = await fetch(`${apiUrl}/patients`);
    if (!patientsRes.ok) throw new Error(`Patients fetch: HTTP ${patientsRes.status}`);
    const patients = await patientsRes.json();
    const patient = patients.find((p) => p.pccInternalId === String(pccClientId));
    if (!patient) return { success: false, error: "Patient not found in PCCScribe" };

    const res = await fetch(`${apiUrl}/patients/${patient.id}/files/${pccFileId}/content`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ extractedContent }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return { success: true, file: data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Injected into every frame by handleScanForFiles ─────────────────────────
// MUST be self-contained: no references to outer scope variables/functions.
function scanFrameForFiles() {
  const s1 = Array.from(document.querySelectorAll('a[href*="openFile"], a[onclick*="openFile"]'));
  const s2 = Array.from(document.querySelectorAll('a[href*="viewfile"]'));
  const s3 = Array.from(document.querySelectorAll("tr a")).filter(
    (a) => /\.pdf\b/i.test((a.textContent || "").trim())
  );

  const seen = new Set();
  const allAnchors = [];
  for (const a of [...s1, ...s2, ...s3]) {
    if (!seen.has(a)) { seen.add(a); allAnchors.push(a); }
  }

  const files = [];
  const seenIds = new Set();

  for (const a of allAnchors) {
    const hrefRaw    = a.getAttribute("href")   || "";
    const onclickRaw = a.getAttribute("onclick") || "";
    const raw        = hrefRaw + " " + onclickRaw;

    let fileId = "", clientId = "", storedName = "", fileUrl = "";

    // Pattern A: openFile('id','clientId','name.pdf')
    const mA = raw.match(/openFile\(\s*'(\d+)',\s*'(\d+)',\s*'([^']+)'\s*\)/i);
    if (mA) { [, fileId, clientId, storedName] = mA; }

    // Pattern B: viewfile.xhtml URL
    if (!fileId && hrefRaw.includes("viewfile")) {
      try {
        const pu = new URL(hrefRaw.startsWith("http") ? hrefRaw : location.origin + hrefRaw);
        fileId     = pu.searchParams.get("fileId")           || "";
        clientId   = pu.searchParams.get("clientId")         || "";
        storedName = pu.searchParams.get("fileMetadataName") || "";
        fileUrl    = pu.href;
      } catch (_) {}
    }

    // Pattern C: PDF text link → look for fileId in edit/del sibling link in the same row
    if (!fileId && /\.pdf\b/i.test((a.textContent || "").trim())) {
      const row = a.closest("tr");
      if (row) {
        const sibling = Array.from(row.querySelectorAll("a[href]")).find(
          (sl) =>
            /[?&]fileId=/i.test(sl.getAttribute("href") || "") ||
            /[?&]documentId=/i.test(sl.getAttribute("href") || "")
        );
        if (sibling) {
          try {
            const sh = sibling.getAttribute("href") || "";
            const su = new URL(sh.startsWith("http") ? sh : location.origin + sh);
            fileId   = su.searchParams.get("fileId") || su.searchParams.get("documentId") || "";
            clientId = su.searchParams.get("clientId") || su.searchParams.get("ESOLclientid") || "";
          } catch (_) {}
        }
        // Also check data attributes on row cells
        if (!fileId) {
          const el = row.querySelector("[data-file-id],[data-fileid],[data-documentid]");
          if (el) fileId = el.dataset.fileId || el.dataset.fileid || el.dataset.documentid || "";
        }
        storedName = storedName || (a.textContent || "").trim();
      }
    }

    if (!fileId || seenIds.has(fileId)) continue;
    seenIds.add(fileId);

    const displayName = (a.textContent || "").trim() || storedName;
    if (!/\.pdf\b/i.test(displayName) && !/\.pdf\b/i.test(storedName)) continue;

    const row = a.closest("tr");
    const cells      = row ? Array.from(row.querySelectorAll("td")) : [];
    const cellTexts  = cells.map((td) => td.textContent.trim());
    const dateMatch  = cellTexts.find((t) => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(t)) || "";

    const linkTdIdx = cells.findIndex((td) => td.contains(a));
    let category = "";
    for (let ci = linkTdIdx + 1; ci < cells.length; ci++) {
      const text = cells[ci].textContent.trim();
      if (text.length < 2) continue;
      if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(text)) continue;
      if (cells[ci].querySelector("a")) continue;
      category = text;
      break;
    }

    const urlClientId = clientId || new URLSearchParams(location.search).get("ESOLclientid") || "";
    if (!fileUrl) {
      fileUrl = `${location.origin}/common/web/controllers/viewfile.xhtml?fileId=${fileId}&clientId=${urlClientId}&fileMetadataName=${encodeURIComponent(storedName || displayName)}`;
    }

    files.push({ fileId, clientId: urlClientId, storedName: storedName || displayName, displayName, effectiveDate: dateMatch, category, url: fileUrl });
    if (files.length >= 20) break;
  }

  // Also return diagnostic info so the caller knows what was tried
  return { files, diag: `S1:${s1.length} S2:${s2.length} S3:${s3.length}` };
}

async function handleScanForFiles(sender) {
  const tabId = sender.tab?.id;
  if (!tabId) return { files: [], error: "no tabId" };

  try {
    const frames = await chrome.webNavigation.getAllFrames({ tabId });
    const allFiles = [];
    const seenIds  = new Set();
    const diagParts = [];

    for (const frame of frames || []) {
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId, frameIds: [frame.frameId] },
          func: scanFrameForFiles,
          world: "ISOLATED",
        });
        const { files: frameFiles = [], diag = "" } = results?.[0]?.result || {};
        if (diag) diagParts.push(`frame${frame.frameId}[${diag}]`);
        for (const f of frameFiles) {
          if (!seenIds.has(f.fileId)) { seenIds.add(f.fileId); allFiles.push(f); }
        }
      } catch (_) {}
    }

    const diagString = diagParts.join(" ") || "no frames";
    await chrome.storage.session.set({
      pdfScanDiag: `${diagString} → found:${allFiles.length}`,
      ...(allFiles.length > 0 ? { pdfFileList: allFiles } : {}),
    });

    return { files: allFiles, diag: diagString };
  } catch (err) {
    return { files: [], error: err.message };
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
