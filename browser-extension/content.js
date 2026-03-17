// PCCScribe Content Script — runs on PointClickCare pages

(function () {
  if (window.__pccscribeInjected) return;
  window.__pccscribeInjected = true;

  // ─── Patient Detection ──────────────────────────────────────────────────────

  function detectPatientInfo() {
    const info = { name: null, mrn: null, dob: null, unit: null, facility: null };

    // PCC stores patient name in various places
    const nameSelectors = [
      ".patient-name",
      "[data-testid='patient-name']",
      ".patientName",
      "#patientName",
      ".header-patient-name",
      ".pcc-patient-name",
      "h1.patient",
      ".patient-header .name",
      "[class*='patientName']",
      "[class*='patient-name']",
    ];

    for (const sel of nameSelectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim()) {
        info.name = el.textContent.trim();
        break;
      }
    }

    // Try page title (PCC often includes patient name in <title>)
    if (!info.name) {
      const title = document.title;
      // PCC title format: "PatientName - PointClickCare" or "PatientFirstName PatientLastName"
      const titleMatch = title.match(/^([^-|]+?)(?:\s*[-|]\s*(?:PointClickCare|PCC))/i);
      if (titleMatch) info.name = titleMatch[1].trim();
    }

    // MRN
    const mrnSelectors = [
      "[data-testid='mrn']",
      ".mrn",
      "#mrn",
      "[class*='mrn']",
      ".medical-record-number",
    ];
    for (const sel of mrnSelectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim()) {
        info.mrn = el.textContent.replace(/[^0-9A-Za-z-]/g, "").trim();
        break;
      }
    }

    // Try reading MRN from the URL oid parameter
    const urlParams = new URLSearchParams(window.location.search);
    if (!info.mrn && urlParams.get("id")) {
      info.mrn = "PCC-" + urlParams.get("id");
    }

    // Facility name from header
    const facilitySelectors = [
      ".facility-name",
      "#facilityName",
      "[class*='facility']",
      ".org-name",
    ];
    for (const sel of facilitySelectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim()) {
        info.facility = el.textContent.trim();
        break;
      }
    }

    return info;
  }

  // ─── Note Type Detection ────────────────────────────────────────────────────

  function detectNoteType() {
    const url = window.location.href.toLowerCase();
    const path = window.location.pathname.toLowerCase();

    if (path.includes("progressnote") || path.includes("progress-note")) return "progress_notes";
    if (path.includes("order") || path.includes("physician")) return "physician_orders";
    if (path.includes("mds") || path.includes("assessment")) return "mds_assessment";
    if (path.includes("careplan") || path.includes("care-plan") || path.includes("care_plan")) return "care_plan";
    if (path.includes("mar") || path.includes("medication-administration") || path.includes("emar")) return "mar";
    if (path.includes("nursing")) return "nursing_notes";
    if (path.includes("therapy") || path.includes("/pt/") || path.includes("/ot/") || path.includes("/st/")) return "therapy_notes";
    if (path.includes("diet") || path.includes("nutrition")) return "dietary_notes";
    if (path.includes("social") || path.includes("casework")) return "social_work_notes";
    return "other";
  }

  // ─── Note Content Extraction ────────────────────────────────────────────────

  function extractNoteRows() {
    const notes = [];
    const today = new Date().toISOString().slice(0, 10);
    const noteType = detectNoteType();

    // PCC note containers vary — try multiple approaches
    const rowSelectors = [
      "tr[data-note-id]",
      ".note-row",
      ".progress-note-row",
      ".note-entry",
      "[class*='noteRow']",
      "[class*='note-item']",
      "tbody tr",
    ];

    let rows = [];
    for (const sel of rowSelectors) {
      const found = document.querySelectorAll(sel);
      if (found.length > 0) {
        rows = Array.from(found);
        break;
      }
    }

    if (rows.length > 0) {
      rows.forEach((row) => {
        // Try to extract date from row
        const dateCells = row.querySelectorAll("td");
        let noteDate = today;
        let author = null;
        let content = "";

        dateCells.forEach((cell, i) => {
          const text = cell.textContent.trim();
          if (i === 0 && /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(text)) {
            const parsed = parseDate(text);
            if (parsed) noteDate = parsed;
          } else if (i === 1 && text.length > 2 && text.length < 60) {
            author = text;
          } else if (text.length > 20) {
            content += text + "\n";
          }
        });

        if (content.trim().length > 10) {
          notes.push({ noteType, noteDate, author, content: content.trim() });
        }
      });
    }

    // Fallback: try to get content from visible text blocks
    if (notes.length === 0) {
      const contentSelectors = [
        ".note-content",
        ".note-text",
        ".clinical-note",
        "[class*='noteContent']",
        "[class*='note-body']",
        ".documentation-text",
        "article",
        ".content-area",
        "main",
      ];

      for (const sel of contentSelectors) {
        const el = document.querySelector(sel);
        if (el) {
          const text = el.innerText.trim();
          if (text.length > 50) {
            notes.push({ noteType, noteDate: today, author: null, content: text });
            break;
          }
        }
      }
    }

    return notes;
  }

  function parseDate(str) {
    const m = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (!m) return null;
    const year = m[3].length === 2 ? "20" + m[3] : m[3];
    return `${year}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }

  // ─── UI: Floating Button + Panel ────────────────────────────────────────────

  const FAB_ID = "pccscribe-fab";
  const PANEL_ID = "pccscribe-panel";

  function createFAB() {
    if (document.getElementById(FAB_ID)) return;

    const fab = document.createElement("button");
    fab.id = FAB_ID;
    fab.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.17 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.11 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 8.91a16 16 0 0 0 5.96 5.96l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21 16z"/></svg><span>PCCScribe</span>`;
    fab.title = "Open PCCScribe Sync Panel";

    fab.addEventListener("click", togglePanel);
    document.body.appendChild(fab);
  }

  function createPanel() {
    if (document.getElementById(PANEL_ID)) return;

    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div class="pccscribe-panel-header">
        <div class="pccscribe-panel-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.17 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.11 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 8.91a16 16 0 0 0 5.96 5.96l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21 16z"/></svg>
          PCCScribe
        </div>
        <button class="pccscribe-close" id="pccscribe-close-btn">✕</button>
      </div>

      <div class="pccscribe-panel-body">
        <div id="pccscribe-patient-section">
          <div class="pccscribe-label">Detected Patient</div>
          <div id="pccscribe-detected-patient" class="pccscribe-patient-name">Scanning...</div>
        </div>

        <div class="pccscribe-divider"></div>

        <div class="pccscribe-label">Map to PCCScribe Patient</div>
        <select id="pccscribe-patient-select" class="pccscribe-select">
          <option value="">Loading patients...</option>
        </select>
        <button id="pccscribe-new-patient-btn" class="pccscribe-btn-secondary">+ Create New Patient</button>

        <div class="pccscribe-divider"></div>

        <div id="pccscribe-notes-section">
          <div class="pccscribe-label">Note Type Detected</div>
          <select id="pccscribe-note-type" class="pccscribe-select">
            <option value="progress_notes">Progress Notes</option>
            <option value="physician_orders">Physician Orders</option>
            <option value="mds_assessment">MDS Assessment</option>
            <option value="care_plan">Care Plan</option>
            <option value="mar">MAR</option>
            <option value="nursing_notes">Nursing Notes</option>
            <option value="therapy_notes">Therapy Notes</option>
            <option value="dietary_notes">Dietary Notes</option>
            <option value="social_work_notes">Social Work Notes</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div class="pccscribe-divider"></div>

        <div id="pccscribe-notes-preview" class="pccscribe-preview-box">
          <div class="pccscribe-label">Notes Preview</div>
          <div id="pccscribe-notes-count" class="pccscribe-notes-count">Scanning page...</div>
          <div id="pccscribe-notes-list" class="pccscribe-notes-list"></div>
        </div>

        <button id="pccscribe-sync-btn" class="pccscribe-btn-primary" disabled>
          Fetch &amp; Sync Notes
        </button>

        <div id="pccscribe-status" class="pccscribe-status"></div>
      </div>
    `;

    document.body.appendChild(panel);

    // Events
    document.getElementById("pccscribe-close-btn").addEventListener("click", closePanel);
    document.getElementById("pccscribe-sync-btn").addEventListener("click", syncNotes);
    document.getElementById("pccscribe-patient-select").addEventListener("change", onPatientSelected);
    document.getElementById("pccscribe-new-patient-btn").addEventListener("click", createNewPatient);
  }

  // ─── Panel State ────────────────────────────────────────────────────────────

  let detectedNotes = [];
  let patients = [];

  function togglePanel() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) {
      createPanel();
      openPanel();
    } else {
      panel.classList.toggle("pccscribe-panel-open");
      if (panel.classList.contains("pccscribe-panel-open")) scanPage();
    }
  }

  function openPanel() {
    const panel = document.getElementById(PANEL_ID);
    if (panel) {
      panel.classList.add("pccscribe-panel-open");
      scanPage();
    }
  }

  function closePanel() {
    const panel = document.getElementById(PANEL_ID);
    if (panel) panel.classList.remove("pccscribe-panel-open");
  }

  async function scanPage() {
    // Detect patient
    const patientInfo = detectPatientInfo();
    const patientEl = document.getElementById("pccscribe-detected-patient");
    if (patientEl) {
      patientEl.textContent = patientInfo.name || "Patient name not detected";
      patientEl.classList.toggle("pccscribe-undetected", !patientInfo.name);
    }

    // Detect notes
    detectedNotes = extractNoteRows();
    const noteType = detectNoteType();

    const noteTypeSelect = document.getElementById("pccscribe-note-type");
    if (noteTypeSelect) noteTypeSelect.value = noteType;

    const countEl = document.getElementById("pccscribe-notes-count");
    const listEl = document.getElementById("pccscribe-notes-list");
    if (countEl) {
      countEl.textContent = detectedNotes.length > 0
        ? `${detectedNotes.length} note(s) found on this page`
        : "No notes auto-detected — page content will be captured as a note";
    }

    if (listEl) {
      if (detectedNotes.length > 0) {
        listEl.innerHTML = detectedNotes.slice(0, 3).map(n =>
          `<div class="pccscribe-note-preview-item">
            <span class="pccscribe-note-date">${n.noteDate}</span>
            ${n.author ? `<span class="pccscribe-note-author">${n.author}</span>` : ""}
            <div class="pccscribe-note-snippet">${n.content.substring(0, 120)}...</div>
           </div>`
        ).join("") + (detectedNotes.length > 3 ? `<div class="pccscribe-more">+${detectedNotes.length - 3} more</div>` : "");
      }
    }

    // Load patients
    const result = await chrome.runtime.sendMessage({ type: "FETCH_PATIENTS" });
    patients = result.success ? result.patients : [];

    const select = document.getElementById("pccscribe-patient-select");
    if (select) {
      if (patients.length === 0) {
        select.innerHTML = `<option value="">No patients in PCCScribe yet</option>`;
      } else {
        select.innerHTML = `<option value="">— Select a patient —</option>` +
          patients.map(p =>
            `<option value="${p.id}" data-name="${p.name}">${p.name} (${p.age} yrs · ${p.mrn || "No MRN"})</option>`
          ).join("");

        // Auto-select if name matches
        if (patientInfo.name) {
          const matched = patients.find(p =>
            p.name.toLowerCase().includes(patientInfo.name.toLowerCase()) ||
            patientInfo.name.toLowerCase().includes(p.name.toLowerCase())
          );
          if (matched) {
            select.value = String(matched.id);
            onPatientSelected();
          }
        }
      }
    }
  }

  function onPatientSelected() {
    const select = document.getElementById("pccscribe-patient-select");
    const syncBtn = document.getElementById("pccscribe-sync-btn");
    if (syncBtn) syncBtn.disabled = !select || !select.value;
  }

  async function createNewPatient() {
    const patientInfo = detectPatientInfo();
    const name = prompt("Patient full name:", patientInfo.name || "");
    if (!name) return;

    const ageStr = prompt("Patient age:", "");
    const age = parseInt(ageStr);
    if (!age || isNaN(age)) return;

    const facility = prompt("Facility name:", patientInfo.facility || "");
    if (!facility) return;

    const unit = prompt("Unit/Floor:", "");
    if (!unit) return;

    setStatus("Creating patient...", "info");

    const result = await chrome.runtime.sendMessage({
      type: "CREATE_PATIENT",
      payload: { name, age, facilityName: facility, unit, mrn: patientInfo.mrn || null },
    });

    if (result.success) {
      setStatus(`Patient "${name}" created!`, "success");
      patients.push(result.patient);
      const select = document.getElementById("pccscribe-patient-select");
      if (select) {
        const opt = document.createElement("option");
        opt.value = String(result.patient.id);
        opt.textContent = `${result.patient.name} (${result.patient.age} yrs · ${result.patient.mrn || "No MRN"})`;
        select.appendChild(opt);
        select.value = String(result.patient.id);
        onPatientSelected();
      }
    } else {
      setStatus("Failed to create patient: " + result.error, "error");
    }
  }

  async function syncNotes() {
    const select = document.getElementById("pccscribe-patient-select");
    const noteTypeSelect = document.getElementById("pccscribe-note-type");
    const syncBtn = document.getElementById("pccscribe-sync-btn");

    if (!select || !select.value) return;

    const patientId = parseInt(select.value);
    const noteType = noteTypeSelect ? noteTypeSelect.value : detectNoteType();

    // If no notes detected, capture page content
    let notesToSend = detectedNotes.map(n => ({ ...n, noteType }));
    if (notesToSend.length === 0) {
      const content = document.body.innerText.trim().substring(0, 10000);
      notesToSend = [{
        noteType,
        noteDate: new Date().toISOString().slice(0, 10),
        author: null,
        content,
        sourceUrl: window.location.href,
      }];
    } else {
      notesToSend = notesToSend.map(n => ({
        ...n,
        sourceUrl: window.location.href,
      }));
    }

    syncBtn.disabled = true;
    syncBtn.textContent = "Syncing...";
    setStatus("Sending notes to PCCScribe...", "info");

    const result = await chrome.runtime.sendMessage({
      type: "SEND_NOTES",
      payload: { patientId, notes: notesToSend },
    });

    syncBtn.disabled = false;
    syncBtn.textContent = "Fetch & Sync Notes";

    if (result.success) {
      setStatus(`✓ ${result.inserted} note(s) synced to PCCScribe!`, "success");
    } else {
      setStatus("Error: " + (result.error || "Unknown error"), "error");
    }
  }

  function setStatus(message, type) {
    const el = document.getElementById("pccscribe-status");
    if (!el) return;
    el.textContent = message;
    el.className = `pccscribe-status pccscribe-status-${type}`;
  }

  // ─── Initialize ─────────────────────────────────────────────────────────────

  function init() {
    createFAB();
    createPanel();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
