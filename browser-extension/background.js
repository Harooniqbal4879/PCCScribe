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

  // Open a PCC file URL in a new foreground tab — used by the Files tab "Open" button
  // and the "Open PDF in new tab" button in the file detail view.
  if (message.type === "OPEN_FILE_TAB") {
    if (message.url) chrome.tabs.create({ url: message.url, active: true });
    return false;
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

  if (message.type === "SCRAPE_CLINICAL_TABS") {
    handleScrapeClinicalTabs(message).then(sendResponse);
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
    if (files.length >= 50) break;
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
    const totalFound = allFiles.length;

    const toTime = (dateStr) => {
      const m = (dateStr || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (!m) return 0;
      const mm = parseInt(m[1], 10) - 1;
      const dd = parseInt(m[2], 10);
      const yy = parseInt(m[3], 10);
      return new Date(yy, mm, dd).getTime() || 0;
    };

    const latest = allFiles
      .slice()
      .sort((a, b) => toTime(b.effectiveDate) - toTime(a.effectiveDate))
      .slice(0, 10);

    await chrome.storage.session.set({
      pdfScanDiag: `${diagString} -> found:${totalFound}${totalFound > latest.length ? ` showing:${latest.length}` : ""}`,
      ...(latest.length > 0 ? { pdfFileList: latest } : {}),
    });

    return { files: latest, diag: diagString };
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

// ═══════════════════════════════════════════════════════════════════════════════
// CLINICAL TAB SCRAPER
// ═══════════════════════════════════════════════════════════════════════════════
// Each extractor is a SELF-CONTAINED function injected via executeScript — no
// closures, no external references. Returns a { data, error } object.
// ─────────────────────────────────────────────────────────────────────────────

// ── Med Diag extractor ────────────────────────────────────────────────────────
function extractMedDiagData() {
  try {
    const rows = Array.from(document.querySelectorAll("table tr")).filter(tr => {
      const cells = tr.querySelectorAll("td");
      return cells.length >= 2 && !tr.querySelector("th");
    });
    const diagnoses = [];
    for (const row of rows) {
      const cells = Array.from(row.querySelectorAll("td")).map(td => td.textContent.trim());
      if (cells.length < 2) continue;
      // Skip rows that look like headers or empty rows
      if (!cells.some(c => c.length > 1)) continue;
      // Detect ICD code — looks like "E11.9", "Z23", "I10", etc.
      const icdCell = cells.find(c => /^[A-Z]\d{2}[\.\d\w]*$/i.test(c));
      if (!icdCell) continue;
      const icdIdx = cells.indexOf(icdCell);
      const description = cells[icdIdx + 1] || cells.find((c, i) => i !== icdIdx && c.length > 4) || "";
      // Look for date pattern MM/DD/YYYY
      const dateVal = cells.find(c => /\d{1,2}\/\d{1,2}\/\d{4}/.test(c)) || "";
      // Rank / type: often first column contains "1", "2", or "Primary", "Secondary"
      const rankCell = cells[0];
      diagnoses.push({ rank: rankCell, icd: icdCell, description, onsetDate: dateVal });
    }
    return { data: diagnoses, error: null };
  } catch (e) {
    return { data: [], error: e.message };
  }
}

// ── Allergy extractor ─────────────────────────────────────────────────────────
function extractAllergyData() {
  try {
    const rows = Array.from(document.querySelectorAll("table tr")).filter(tr => {
      return tr.querySelectorAll("td").length >= 2 && !tr.querySelector("th");
    });
    const allergies = [];
    for (const row of rows) {
      const cells = Array.from(row.querySelectorAll("td")).map(td => td.textContent.trim());
      if (cells.length < 2 || !cells.some(c => c.length > 1)) continue;
      // Skip navigation/button rows
      if (cells.every(c => /^(edit|del|save|cancel|\d{1,2})$/i.test(c))) continue;
      const allergen   = cells[0] || "";
      const type       = cells[1] || "";
      const reaction   = cells[2] || "";
      const severity   = cells[3] || "";
      const onsetDate  = cells.find(c => /\d{1,2}\/\d{1,2}\/\d{4}/.test(c)) || "";
      if (!allergen || allergen.length < 2) continue;
      allergies.push({ allergen, type, reaction, severity, onsetDate });
    }
    return { data: allergies, error: null };
  } catch (e) {
    return { data: [], error: e.message };
  }
}

// ── Vitals extractor ──────────────────────────────────────────────────────────
function extractVitalsData() {
  try {
    // PCC vitals pages have a header row followed by data rows — capture headers first
    const tables = Array.from(document.querySelectorAll("table"));
    let best = null, bestScore = 0;
    for (const tbl of tables) {
      const headers = Array.from(tbl.querySelectorAll("th")).map(th => th.textContent.trim().toLowerCase());
      const score = headers.filter(h => /bp|temp|pulse|weight|o2|pain|resp/.test(h)).length;
      if (score > bestScore) { best = tbl; bestScore = score; }
    }
    if (!best) return { data: [], error: "No vitals table found" };

    const headerEls = Array.from(best.querySelectorAll("th")).map(th => th.textContent.trim());
    const dataRows = Array.from(best.querySelectorAll("tr")).filter(tr => !tr.querySelector("th") && tr.querySelectorAll("td").length > 1);

    const readings = dataRows.slice(0, 30).map(row => {
      const cells = Array.from(row.querySelectorAll("td")).map(td => td.textContent.trim());
      const obj = {};
      headerEls.forEach((h, i) => { if (h && cells[i] !== undefined) obj[h] = cells[i]; });
      return obj;
    }).filter(r => Object.values(r).some(v => v && v.length > 0));

    return { data: readings, error: null };
  } catch (e) {
    return { data: [], error: e.message };
  }
}

// ── Orders extractor ──────────────────────────────────────────────────────────
function extractOrdersData() {
  try {
    const tables = Array.from(document.querySelectorAll("table"));
    // Find the table most likely to be the orders table
    let best = null, bestScore = 0;
    for (const tbl of tables) {
      const text = tbl.textContent.toLowerCase();
      const score = (text.includes("order") ? 2 : 0) +
                    (text.includes("freq") ? 1 : 0) +
                    (text.includes("start") ? 1 : 0) +
                    (text.includes("physician") || text.includes("prescriber") ? 1 : 0);
      if (score > bestScore) { best = tbl; bestScore = score; }
    }
    if (!best || bestScore < 2) return { data: [], error: "No orders table found" };

    const headerEls = Array.from(best.querySelectorAll("th")).map(th => th.textContent.trim());
    const dataRows  = Array.from(best.querySelectorAll("tr")).filter(tr => !tr.querySelector("th") && tr.querySelectorAll("td").length >= 2);

    const orders = dataRows.slice(0, 50).map(row => {
      const cells = Array.from(row.querySelectorAll("td")).map(td => td.textContent.trim());
      if (headerEls.length > 0) {
        const obj = {};
        headerEls.forEach((h, i) => { if (h && cells[i] !== undefined) obj[h] = cells[i]; });
        return obj;
      }
      // Fallback: no headers — just return indexed cells
      return { order: cells[0], frequency: cells[1], startDate: cells[2], physician: cells[3] };
    }).filter(r => r && Object.values(r).some(v => v && v.length > 2));

    return { data: orders, error: null };
  } catch (e) {
    return { data: [], error: e.message };
  }
}

// ── Immunization extractor ────────────────────────────────────────────────────
function extractImmunizationData() {
  try {
    const rows = Array.from(document.querySelectorAll("table tr")).filter(tr =>
      tr.querySelectorAll("td").length >= 2 && !tr.querySelector("th")
    );
    const immunizations = [];
    for (const row of rows) {
      const cells = Array.from(row.querySelectorAll("td")).map(td => td.textContent.trim());
      if (cells.length < 2 || !cells.some(c => c.length > 2)) continue;
      if (cells.every(c => /^(edit|del|\d{1,2})$/i.test(c))) continue;
      const vaccine   = cells[0] || "";
      const dateGiven = cells.find(c => /\d{1,2}\/\d{1,2}\/\d{4}/.test(c)) || "";
      const lotNo     = cells[2] || "";
      const site      = cells[3] || "";
      if (!vaccine || vaccine.length < 3) continue;
      immunizations.push({ vaccine, dateGiven, lotNo, site });
    }
    return { data: immunizations, error: null };
  } catch (e) {
    return { data: [], error: e.message };
  }
}

// ── Generic helper: open a hidden tab, wait for load, run extractor, close ───
async function openHiddenTabAndScrape(url, extractorFn) {
  return new Promise((resolve) => {
    chrome.tabs.create({ url, active: false }, (tab) => {
      const tabId = tab.id;
      const TIMEOUT_MS = 25000;
      let done = false;

      const timer = setTimeout(() => {
        if (!done) { done = true; chrome.tabs.remove(tabId, () => {}); resolve({ data: null, error: "Timeout loading " + url }); }
      }, TIMEOUT_MS);

      function onUpdated(updatedTabId, changeInfo) {
        if (updatedTabId !== tabId || changeInfo.status !== "complete" || done) return;
        chrome.tabs.onUpdated.removeListener(onUpdated);
        // Small delay for JS-rendered content
        setTimeout(() => {
          if (done) return;
          chrome.scripting.executeScript(
            { target: { tabId }, func: extractorFn, world: "ISOLATED" },
            (results) => {
              done = true;
              clearTimeout(timer);
              chrome.tabs.remove(tabId, () => {});
              const result = results?.[0]?.result;
              if (chrome.runtime.lastError || !result) {
                resolve({ data: null, error: chrome.runtime.lastError?.message || "No result" });
              } else {
                resolve(result);
              }
            }
          );
        }, 1500);
      }

      chrome.tabs.onUpdated.addListener(onUpdated);
    });
  });
}

// ── Tab definitions: name, URL slug pattern, extractor function ───────────────
const CLINICAL_TABS = [
  {
    key:      "diagnoses",
    label:    "Med Diag",
    urlHints: ["cp_diagnosis", "cp_diagnos"],
    extractor: extractMedDiagData,
  },
  {
    key:      "allergies",
    label:    "Allergy",
    urlHints: ["cp_allerg"],
    extractor: extractAllergyData,
  },
  {
    key:      "vitals",
    label:    "Wts/Vitals",
    urlHints: ["weightsandvital", "cp_weight", "cp_vital"],
    extractor: extractVitalsData,
  },
  {
    key:      "orders",
    label:    "Orders",
    urlHints: ["cp_order", "physician_order", "cp_physician"],
    extractor: extractOrdersData,
  },
  {
    key:      "immunizations",
    label:    "Immun",
    urlHints: ["cp_immun", "immunization"],
    extractor: extractImmunizationData,
  },
];

// ── Main orchestrator ─────────────────────────────────────────────────────────
// message: { patientId, tabUrls: { diagnoses: '...', allergies: '...', ... }, origin }
async function handleScrapeClinicalTabs({ patientId, tabUrls, origin, pccId }) {
  const { apiUrl } = await getConfig();
  const results = {};
  const errors  = {};

  for (const tab of CLINICAL_TABS) {
    // Prefer explicitly supplied URL, fall back to constructing from known patterns
    let url = tabUrls?.[tab.key] || "";

    // Build fallback URL from pattern if not supplied
    if (!url && origin && pccId) {
      if (tab.key === "diagnoses")     url = `${origin}/clinical/admin/client/cp_diagnosis.jsp?ESOLclientid=${pccId}`;
      if (tab.key === "allergies")     url = `${origin}/admin/client/cp_allergies.jsp?ESOLclientid=${pccId}`;
      if (tab.key === "vitals")        url = `${origin}/admin/client/cp_weightsandvitals.jsp?ESOLclientid=${pccId}`;
      if (tab.key === "orders")        url = `${origin}/clinical/admin/client/cp_physician_orders.jsp?ESOLclientid=${pccId}`;
      if (tab.key === "immunizations") url = `${origin}/admin/client/cp_immunizations.jsp?ESOLclientid=${pccId}`;
    }

    if (!url) { errors[tab.key] = "No URL"; continue; }

    console.log(`[PCCScribe] Scraping ${tab.label}: ${url}`);
    const { data, error } = await openHiddenTabAndScrape(url, tab.extractor);

    if (error) { errors[tab.key] = error; continue; }
    results[tab.key] = data;

    // Persist to PCCScribe DB
    if (patientId && data) {
      try {
        await fetch(`${apiUrl}/patients/${patientId}/clinical-data`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataType: tab.key, data }),
        });
      } catch (e) {
        console.warn(`[PCCScribe] Failed to save ${tab.key}:`, e.message);
      }
    }
  }

  return { success: true, scraped: Object.keys(results), errors };
}
