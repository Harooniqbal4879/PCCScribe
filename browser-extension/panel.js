// PALScribe Side Panel — panel.js
// Reads PDF data from chrome.storage.session, extracts text via PDF.js,
// and can send it to the PCCScribe AI chat endpoint.

const DEFAULT_API_URL = "https://pcc.etherhealth.ai/api";

// ── DOM references ─────────────────────────────────────────────────────────────

const statusDot   = document.getElementById("status-dot");
const statusText  = document.getElementById("status-text");
const idleMsg     = document.getElementById("idle-msg");
const noteSection = document.getElementById("note-section");
const actionsEl   = document.getElementById("actions");
const noteTextEl  = document.getElementById("note-text");
const copyBtn     = document.getElementById("copy-btn");
const aiBtn       = document.getElementById("ai-btn");
const aiSection   = document.getElementById("ai-section");
const aiResponse  = document.getElementById("ai-response");
const clearAiBtn  = document.getElementById("clear-ai-btn");
const filesSection = document.getElementById("files-section");
const filesList   = document.getElementById("files-list");

// ── PDF.js setup ───────────────────────────────────────────────────────────────

pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("pdf.worker.min.js");

// ── State ──────────────────────────────────────────────────────────────────────

let extractedText = "";
let currentPatientId = null;

// ── Helpers ────────────────────────────────────────────────────────────────────

function setStatus(text, state = "idle") {
  statusText.textContent = text;
  statusDot.className = "status-dot" + (state !== "idle" ? ` ${state}` : "");
}

function showNoteUI(show) {
  idleMsg.classList.toggle("hidden", show);
  noteSection.classList.toggle("hidden", !show);
  actionsEl.classList.toggle("hidden", !show);
}

// ── PDF text extraction ────────────────────────────────────────────────────────

async function extractPdfText(dataUri) {
  // Decode the base64 data URI → Uint8Array
  const base64 = dataUri.split(",")[1];
  const binary = atob(base64);
  const uint8 = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) uint8[i] = binary.charCodeAt(i);

  const pdf = await pdfjsLib.getDocument({ data: uint8 }).promise;
  const parts = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const pageText = content.items.map((item) => item.str).join(" ");
    parts.push(pageText.trim());
  }

  return parts.filter(Boolean).join("\n\n");
}

function extractHtmlText(dataUri) {
  // data:text/html;charset=utf-8,...
  const encoded = dataUri.split(",").slice(1).join(",");
  const html = decodeURIComponent(encoded);
  const doc = new DOMParser().parseFromString(html, "text/html");
  // Remove scripts and styles
  doc.querySelectorAll("script, style, noscript").forEach((el) => el.remove());
  return (doc.body?.innerText || doc.body?.textContent || "").trim();
}

// ── Process incoming PDF data ──────────────────────────────────────────────────

async function processPdfData(data) {
  const { pdfDataUri, pdfIsPdf, pdfPatientId, pdfStatus } = data;

  currentPatientId = pdfPatientId || null;

  if (pdfStatus === "loading") {
    setStatus("Fetching note from PCC…", "loading");
    return;
  }

  if (pdfStatus === "error") {
    setStatus("Could not load note — session may have expired", "error");
    return;
  }

  if (pdfStatus === "ready" && pdfDataUri) {
    setStatus("Extracting text…", "loading");
    showNoteUI(true);
    noteTextEl.value = "";
    aiBtn.disabled = true;

    try {
      let text;
      if (pdfIsPdf) {
        text = await extractPdfText(pdfDataUri);
      } else {
        text = extractHtmlText(pdfDataUri);
      }

      extractedText = text || "";
      noteTextEl.value = extractedText || "(No readable text found in this note)";
      aiBtn.disabled = extractedText.length < 10;
      const charCount = extractedText.length.toLocaleString();
      setStatus(
        extractedText.length > 0
          ? `✓ Text extracted — ${charCount} chars`
          : "⚠ No text layer found (scanned document)",
        extractedText.length > 0 ? "ready" : "error"
      );
      // Save to session storage so the FAB panel file detail view can read it
      chrome.storage.session.set({
        pdfExtractedText: extractedText,
        pdfExtractedCharCount: extractedText.length,
      });
    } catch (err) {
      console.error("[PALScribe] text extraction failed:", err);
      setStatus("Text extraction failed: " + err.message, "error");
      noteTextEl.value = "";
      chrome.storage.session.set({ pdfExtractedText: "", pdfExtractedCharCount: 0 });
    }
  }
}

// ── Recent Files list ──────────────────────────────────────────────────────────

let currentFileList = null;

function showFileList(files) {
  if (!files || files.length === 0) {
    filesSection.classList.add("hidden");
    return;
  }
  currentFileList = files;
  filesSection.classList.remove("hidden");
  idleMsg.classList.add("hidden");

  filesList.innerHTML = files.map((f, i) => `
    <div class="file-item" data-idx="${i}">
      <div class="file-icon">📄</div>
      <div class="file-meta">
        <div class="file-name" title="${f.displayName}">${f.displayName}</div>
        <div class="file-date">Effective ${f.effectiveDate}${f.category ? " · " + f.category : ""}</div>
      </div>
      <button class="file-open-btn" data-idx="${i}">Open</button>
    </div>
  `).join("");

  filesList.querySelectorAll(".file-open-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx);
      const file = files[idx];
      if (!file?.url) return;
      chrome.tabs.create({ url: file.url, active: true });
    });
  });

  filesList.querySelectorAll(".file-item").forEach((item) => {
    item.addEventListener("click", () => {
      const idx = parseInt(item.dataset.idx);
      openFileEntry(files[idx]);
    });
  });

  setStatus(`${files.length} recent file${files.length !== 1 ? "s" : ""} found`, "ready");
}

function openFileEntry(file) {
  // Send fetch request to background; panel will switch to note view on response
  chrome.runtime.sendMessage({
    type: "FETCH_PDF",
    url: file.url,
    patientId: file.patientId || null,
  });
  filesSection.classList.add("hidden");
  showNoteUI(true);
  noteTextEl.value = "";
  aiBtn.disabled = true;
  setStatus("⏳ Fetching " + file.displayName + "…", "loading");
}

// ── Load existing session data on panel open ───────────────────────────────────

chrome.storage.session.get(
  ["pdfDataUri", "pdfIsPdf", "pdfPatientId", "pdfStatus", "pdfFileList"],
  (data) => {
    if (data.pdfFileList) showFileList(data.pdfFileList);
    if (data.pdfStatus) processPdfData(data);
  }
);

// ── React to new PDF fetches while panel is open ───────────────────────────────

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "session") return;

  // New file list detected (user navigated to filesdisplay.xhtml)
  if (changes.pdfFileList) {
    showFileList(changes.pdfFileList.newValue);
  }

  // New PDF fetch triggered
  if (changes.pdfTimestamp) {
    chrome.storage.session.get(
      ["pdfDataUri", "pdfIsPdf", "pdfPatientId", "pdfStatus"],
      (data) => {
        aiSection.classList.add("hidden");
        aiResponse.textContent = "";
        processPdfData(data);
      }
    );
  }
});

// ── Copy button ────────────────────────────────────────────────────────────────

copyBtn.addEventListener("click", async () => {
  if (!extractedText) return;
  try {
    await navigator.clipboard.writeText(extractedText);
    const orig = copyBtn.textContent;
    copyBtn.textContent = "✓ Copied!";
    setTimeout(() => { copyBtn.textContent = orig; }, 1800);
  } catch {
    copyBtn.textContent = "Copy failed";
    setTimeout(() => { copyBtn.textContent = "Copy Text"; }, 2000);
  }
});

// ── Send to AI ────────────────────────────────────────────────────────────────

aiBtn.addEventListener("click", async () => {
  if (!extractedText || extractedText.length < 10) return;

  // Get API URL
  const { apiUrl: storedUrl } = await chrome.storage.sync.get(["apiUrl"]);
  const apiUrl = (storedUrl || DEFAULT_API_URL).replace(/\/+$/, "");

  if (!currentPatientId) {
    aiSection.classList.remove("hidden");
    aiResponse.textContent =
      "⚠ No patient selected in the PCCScribe panel. Open it and select the patient first, then click a note.";
    return;
  }

  aiSection.classList.remove("hidden");
  aiResponse.textContent = "";
  aiResponse.classList.add("thinking");
  aiBtn.disabled = true;
  setStatus("Streaming AI summary…", "loading");

  const message = `Summarize the following clinical note concisely for a clinician:\n\n${extractedText.substring(0, 6000)}`;

  try {
    const response = await fetch(`${apiUrl}/patients/${currentPatientId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, history: [] }),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (!raw || raw === "[DONE]") continue;
        try {
          const event = JSON.parse(raw);
          if (event.type === "delta" && event.content) {
            fullText += event.content;
            aiResponse.textContent = fullText;
            aiResponse.scrollTop = aiResponse.scrollHeight;
          }
        } catch {
          // ignore malformed SSE lines
        }
      }
    }

    aiResponse.classList.remove("thinking");
    setStatus("✓ AI summary complete", "ready");
  } catch (err) {
    aiResponse.classList.remove("thinking");
    aiResponse.textContent = "Error: " + err.message;
    setStatus("AI request failed", "error");
  } finally {
    aiBtn.disabled = false;
  }
});

// ── Clear AI response ──────────────────────────────────────────────────────────

clearAiBtn.addEventListener("click", () => {
  aiSection.classList.add("hidden");
  aiResponse.textContent = "";
  aiResponse.classList.remove("thinking");
});
