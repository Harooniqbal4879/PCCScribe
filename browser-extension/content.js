// PCCScribe Content Script — runs on PointClickCare pages

(function () {
  if (window.__pccscribeInjected) return;
  window.__pccscribeInjected = true;

  // ─── PCC Patient Detection ───────────────────────────────────────────────────
  // Targets the actual PCC DOM as seen on cp_careclientprofile.jsp and similar pages.

  function detectPatientInfo() {
    const info = {
      name: null,       // "Patricia Abramczyk" (normalised First Last)
      rawName: null,    // Raw: "Abramczyk, Patricia (7018)"
      firstName: null,
      lastName: null,
      mrn: null,
      pccId: null,      // ESOLclientid from URL
      dob: null,        // "1949-11-15"
      age: null,        // 76
      gender: null,     // "Female"
      unit: null,       // "2 - Bristol 218-B"
      facility: null,   // "Applewood Nursing Center"
      physician: null,  // "Salman Khan"
    };

    // ── 1. PCC client ID from URL ─────────────────────────────────────────────
    const urlParams = new URLSearchParams(window.location.search);
    info.pccId = urlParams.get("ESOLclientid") || urlParams.get("clientId") || urlParams.get("id") || null;
    if (info.pccId) info.mrn = "PCC-" + info.pccId;

    // ── 2. Patient name ────────────────────────────────────────────────────────
    // PCC profile page shows "Abramczyk, Patricia (7018)" in the first h4 in the
    // main content area, or sometimes in an element with class containing "clientName".
    const nameSelectors = [
      "h4.clientName",
      "[class*='clientName']",
      "[class*='client-name']",
      ".residentName",
      "[class*='residentName']",
      ".patient-name",
      "[data-testid='patient-name']",
      "h1.patient",
      ".header-patient-name",
      // PCC uses h4 as the resident name in profile pages
      "table.profile h4",
      "div.profile h4",
      "#clientName",
      "span#clientName",
      // Generic: first h4 in main content that contains a comma (Last, First pattern)
    ];

    for (const sel of nameSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        const txt = el.textContent.trim();
        if (txt && txt.length > 2) {
          info.rawName = txt;
          parseNameIntoInfo(txt, info);
          break;
        }
      }
    }

    // Fallback: scan ALL h4 elements for "LastName, FirstName (ID)" pattern
    if (!info.name) {
      const allH4 = document.querySelectorAll("h4");
      for (const h4 of allH4) {
        const txt = h4.textContent.trim();
        if (/^[A-Za-z'\-]+,\s+[A-Za-z'\- ]+/.test(txt)) {
          info.rawName = txt;
          parseNameIntoInfo(txt, info);
          break;
        }
      }
    }

    // Fallback: page title  (PCC sets title to "LastName, FirstName - PointClickCare")
    if (!info.name && document.title) {
      const titleMatch = document.title.match(/^([A-Za-z'\-]+,\s+[A-Za-z'\- ]+?)(?:\s*[-–|]|\s+\()/);
      if (titleMatch) {
        info.rawName = titleMatch[1].trim();
        parseNameIntoInfo(titleMatch[1], info);
      }
    }

    // ── 3. Extract DOB, Age, Gender from page text ─────────────────────────────
    // PCC renders: "DOB: 11/15/1949  Age: 76" and "Gender: Female"
    const bodyText = document.body.innerText;

    if (!info.dob) {
      const dobMatch = bodyText.match(/DOB[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i);
      if (dobMatch) info.dob = parseMDY(dobMatch[1]);
    }

    if (!info.age) {
      const ageMatch = bodyText.match(/\bAge[:\s]+(\d{1,3})\b/i);
      if (ageMatch) info.age = parseInt(ageMatch[1]);
    }

    if (!info.gender) {
      const gMatch = bodyText.match(/Gender[:\s]+(Male|Female|Non-binary|Other)/i);
      if (gMatch) info.gender = gMatch[1];
    }

    // ── 4. Physician / attending ───────────────────────────────────────────────
    if (!info.physician) {
      const physMatch = bodyText.match(/Physician[:\s]+([A-Za-z\s\.,']+?)(?:\n|DOB|Gender|Status|Location|$)/im);
      if (physMatch) info.physician = physMatch[1].trim().replace(/\s+/g, " ");
    }

    // ── 5. Location / Unit ────────────────────────────────────────────────────
    // PCC: "Location: 2 - Bristol 218-B"
    if (!info.unit) {
      const locMatch = bodyText.match(/Location[:\s]+([^\n]{3,60})/i);
      if (locMatch) info.unit = locMatch[1].trim();
    }

    // ── 6. Facility from top header ──────────────────────────────────────────
    // PCC shows facility name in a header banner / org header
    const facilitySelectors = [
      "#orgName",
      ".orgName",
      "[class*='orgName']",
      "[class*='facilityName']",
      ".facility-name",
      "#facilityName",
      "header .org",
      ".pcc-org-name",
      // The top bar in PCC often shows "Applewood Nursing Center"
      "#headerOrgName",
      ".header-org",
    ];
    for (const sel of facilitySelectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim().length > 2) {
        info.facility = el.textContent.trim();
        break;
      }
    }

    // Fallback: grab facility from page header text
    if (!info.facility) {
      // Look for an element in the top 200px of the page that contains "Nursing" or "Care"
      const headerEls = document.querySelectorAll("header *, #header *, .header *");
      for (const el of headerEls) {
        const txt = el.textContent.trim();
        if (txt.length > 5 && txt.length < 80 && /(nursing|center|care|health|manor|home|facility)/i.test(txt)) {
          info.facility = txt;
          break;
        }
      }
    }

    return info;
  }

  function parseNameIntoInfo(raw, info) {
    // Formats:  "Abramczyk, Patricia (7018)"  OR  "Abramczyk, Patricia"
    const m = raw.match(/^([A-Za-z'\-]+(?:\s+[A-Za-z'\-]+)*),\s+([A-Za-z'\- ]+?)(?:\s*\((\d+)\))?$/);
    if (m) {
      info.lastName = m[1].trim();
      info.firstName = m[2].trim();
      info.name = `${info.firstName} ${info.lastName}`;
      if (m[3] && !info.pccId) {
        info.pccId = m[3];
        info.mrn = "PCC-" + m[3];
      }
    } else {
      // Best effort: treat as full name
      info.name = raw.replace(/\s*\(\d+\)$/, "").trim();
    }
  }

  function parseMDY(str) {
    const m = str.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (!m) return null;
    const year = m[3].length === 2 ? "20" + m[3] : m[3];
    return `${year}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }

  // ─── Note Type Detection ────────────────────────────────────────────────────

  function detectNoteType() {
    const path = window.location.pathname.toLowerCase();
    const search = window.location.search.toLowerCase();
    const combined = path + search;

    if (combined.includes("progressnote") || combined.includes("prog_note") || combined.includes("prognote")) return "progress_notes";
    if (combined.includes("order") || combined.includes("physician") || combined.includes("rx")) return "physician_orders";
    if (combined.includes("mds") || combined.includes("assessment")) return "mds_assessment";
    if (combined.includes("careplan") || combined.includes("care_plan") || combined.includes("care-plan")) return "care_plan";
    if (combined.includes("emar") || combined.includes("/mar") || combined.includes("medication")) return "mar";
    if (combined.includes("nursing")) return "nursing_notes";
    if (combined.includes("therapy") || combined.includes("/pt/") || combined.includes("/ot/") || combined.includes("/st/")) return "therapy_notes";
    if (combined.includes("diet") || combined.includes("nutrition")) return "dietary_notes";
    if (combined.includes("social") || combined.includes("casework")) return "social_work_notes";
    return "other";
  }

  // ─── Note Content Extraction ────────────────────────────────────────────────

  function extractNoteRows() {
    const notes = [];
    const today = new Date().toISOString().slice(0, 10);
    const noteType = detectNoteType();

    // PCC note rows in tables
    const rowSelectors = [
      "tr[data-note-id]", ".note-row", ".progress-note-row",
      ".note-entry", "[class*='noteRow']", "[class*='note-item']",
    ];

    let rows = [];
    for (const sel of rowSelectors) {
      const found = document.querySelectorAll(sel);
      if (found.length > 0) { rows = Array.from(found); break; }
    }

    if (rows.length > 0) {
      rows.forEach((row) => {
        const cells = row.querySelectorAll("td");
        let noteDate = today, author = null, content = "";
        cells.forEach((cell, i) => {
          const text = cell.textContent.trim();
          if (i === 0 && /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(text)) {
            const parsed = parseMDY(text);
            if (parsed) noteDate = parsed;
          } else if (i === 1 && text.length > 1 && text.length < 60) {
            author = text;
          } else if (text.length > 20) {
            content += text + "\n";
          }
        });
        if (content.trim().length > 10) notes.push({ noteType, noteDate, author, content: content.trim() });
      });
    }

    // Fallback: grab page body text as a single note
    if (notes.length === 0) {
      const contentSelectors = [
        ".note-content", ".note-text", ".clinical-note", "[class*='noteContent']",
        "[class*='note-body']", ".documentation-text", "article", ".content-area",
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

  // ─── UI ──────────────────────────────────────────────────────────────────────

  const FAB_ID = "pccscribe-fab";
  const PANEL_ID = "pccscribe-panel";

  function createFAB() {
    if (document.getElementById(FAB_ID)) return;
    const fab = document.createElement("button");
    fab.id = FAB_ID;
    fab.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.17 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.11 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 8.91a16 16 0 0 0 5.96 5.96l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21 16z"/></svg><span>PCCScribe</span>`;
    fab.title = "Open PCCScribe Sync Panel";
    fab.addEventListener("click", togglePanel);
    document.body.appendChild(fab);
  }

  function panelHTML() {
    return `
      <div class="pccscribe-panel-header">
        <div class="pccscribe-panel-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.17 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.11 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 8.91a16 16 0 0 0 5.96 5.96l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21 16z"/></svg>
          PCCScribe
        </div>
        <button class="pccscribe-close" id="pccscribe-close-btn">✕</button>
      </div>

      <div class="pccscribe-panel-body">

        <!-- Detected Patient -->
        <div>
          <div class="pccscribe-label">Detected Patient</div>
          <div id="pccscribe-detected-patient" class="pccscribe-patient-name">Scanning...</div>
        </div>

        <div class="pccscribe-divider"></div>

        <!-- Map / Select -->
        <div id="pccscribe-map-section">
          <div class="pccscribe-label">Map to PCCScribe Patient</div>
          <select id="pccscribe-patient-select" class="pccscribe-select">
            <option value="">Loading patients...</option>
          </select>

          <!-- Create New Patient inline form (hidden by default) -->
          <div id="pccscribe-create-form" style="display:none; margin-top:10px;">
            <div class="pccscribe-form-title">New Patient Details</div>
            <input id="pccf-name" class="pccscribe-input" placeholder="Full name *" type="text" />
            <div class="pccscribe-row">
              <input id="pccf-age" class="pccscribe-input" placeholder="Age *" type="number" min="0" max="130" style="width:70px;flex-shrink:0;" />
              <input id="pccf-gender" class="pccscribe-input" placeholder="Gender" type="text" style="flex:1;" />
            </div>
            <input id="pccf-dob" class="pccscribe-input" placeholder="Date of birth (YYYY-MM-DD)" type="text" />
            <input id="pccf-facility" class="pccscribe-input" placeholder="Facility name *" type="text" />
            <input id="pccf-unit" class="pccscribe-input" placeholder="Unit / Room *" type="text" />
            <input id="pccf-mrn" class="pccscribe-input" placeholder="MRN / PCC ID" type="text" />
            <input id="pccf-physician" class="pccscribe-input" placeholder="Attending physician" type="text" />
            <div class="pccscribe-form-btns">
              <button id="pccscribe-create-submit" class="pccscribe-btn-primary" style="flex:1;">Create Patient</button>
              <button id="pccscribe-create-cancel" class="pccscribe-btn-ghost">Cancel</button>
            </div>
          </div>

          <button id="pccscribe-new-patient-btn" class="pccscribe-btn-secondary">+ Create New Patient</button>
        </div>

        <div class="pccscribe-divider"></div>

        <!-- Note Type -->
        <div>
          <div class="pccscribe-label">Note Type</div>
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

        <!-- Notes Preview -->
        <div class="pccscribe-preview-box">
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
  }

  function createPanel() {
    if (document.getElementById(PANEL_ID)) return;
    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.innerHTML = panelHTML();
    document.body.appendChild(panel);
    bindPanelEvents();
  }

  function bindPanelEvents() {
    document.getElementById("pccscribe-close-btn").addEventListener("click", closePanel);
    document.getElementById("pccscribe-sync-btn").addEventListener("click", syncNotes);
    document.getElementById("pccscribe-patient-select").addEventListener("change", onPatientSelected);

    document.getElementById("pccscribe-new-patient-btn").addEventListener("click", () => {
      showCreateForm();
    });
    document.getElementById("pccscribe-create-cancel").addEventListener("click", () => {
      hideCreateForm();
    });
    document.getElementById("pccscribe-create-submit").addEventListener("click", submitCreatePatient);
  }

  // ─── Create Form ─────────────────────────────────────────────────────────────

  function showCreateForm() {
    const form = document.getElementById("pccscribe-create-form");
    const btn = document.getElementById("pccscribe-new-patient-btn");
    if (!form) return;

    // Pre-fill from detected patient
    const info = detectPatientInfo();

    const nameEl = document.getElementById("pccf-name");
    const ageEl = document.getElementById("pccf-age");
    const genderEl = document.getElementById("pccf-gender");
    const dobEl = document.getElementById("pccf-dob");
    const facilityEl = document.getElementById("pccf-facility");
    const unitEl = document.getElementById("pccf-unit");
    const mrnEl = document.getElementById("pccf-mrn");
    const physEl = document.getElementById("pccf-physician");

    if (nameEl && info.name) nameEl.value = info.name;
    if (ageEl && info.age) ageEl.value = String(info.age);
    if (genderEl && info.gender) genderEl.value = info.gender;
    if (dobEl && info.dob) dobEl.value = info.dob;
    if (facilityEl && info.facility) facilityEl.value = info.facility;
    if (unitEl && info.unit) unitEl.value = info.unit;
    if (mrnEl && info.mrn) mrnEl.value = info.mrn;
    if (physEl && info.physician) physEl.value = info.physician;

    form.style.display = "block";
    btn.style.display = "none";
    if (nameEl) nameEl.focus();
  }

  function hideCreateForm() {
    const form = document.getElementById("pccscribe-create-form");
    const btn = document.getElementById("pccscribe-new-patient-btn");
    if (form) form.style.display = "none";
    if (btn) btn.style.display = "block";
  }

  async function submitCreatePatient() {
    const name = (document.getElementById("pccf-name")?.value || "").trim();
    const ageStr = (document.getElementById("pccf-age")?.value || "").trim();
    const gender = (document.getElementById("pccf-gender")?.value || "").trim();
    const dob = (document.getElementById("pccf-dob")?.value || "").trim();
    const facility = (document.getElementById("pccf-facility")?.value || "").trim();
    const unit = (document.getElementById("pccf-unit")?.value || "").trim();
    const mrn = (document.getElementById("pccf-mrn")?.value || "").trim();
    const physician = (document.getElementById("pccf-physician")?.value || "").trim();
    const age = parseInt(ageStr);

    if (!name) { setStatus("Patient name is required.", "error"); return; }
    if (!age || isNaN(age)) { setStatus("Age is required.", "error"); return; }
    if (!facility) { setStatus("Facility name is required.", "error"); return; }
    if (!unit) { setStatus("Unit / room is required.", "error"); return; }

    const submitBtn = document.getElementById("pccscribe-create-submit");
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Creating..."; }
    setStatus("Creating patient in PCCScribe...", "info");

    const payload = {
      name,
      age,
      facilityName: facility,
      unit,
      ...(mrn ? { mrn } : {}),
      ...(dob ? { dateOfBirth: dob } : {}),
      ...(gender ? { gender } : {}),
      ...(physician ? { physician } : {}),
    };

    const result = await chrome.runtime.sendMessage({ type: "CREATE_PATIENT", payload });

    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Create Patient"; }

    if (result.success) {
      setStatus(`✓ Patient "${name}" created!`, "success");
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

      setTimeout(hideCreateForm, 800);
    } else {
      setStatus("Failed: " + (result.error || "Unknown error"), "error");
    }
  }

  // ─── Panel State ─────────────────────────────────────────────────────────────

  let detectedNotes = [];
  let patients = [];
  let cachedPatientInfo = null;

  function togglePanel() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) { createPanel(); openPanel(); return; }
    panel.classList.toggle("pccscribe-panel-open");
    if (panel.classList.contains("pccscribe-panel-open")) scanPage();
  }

  function openPanel() {
    const panel = document.getElementById(PANEL_ID);
    if (panel) { panel.classList.add("pccscribe-panel-open"); scanPage(); }
  }

  function closePanel() {
    const panel = document.getElementById(PANEL_ID);
    if (panel) panel.classList.remove("pccscribe-panel-open");
  }

  async function scanPage() {
    // 1. Detect patient from PCC DOM
    cachedPatientInfo = detectPatientInfo();
    const patientEl = document.getElementById("pccscribe-detected-patient");
    if (patientEl) {
      if (cachedPatientInfo.name) {
        const sub = [
          cachedPatientInfo.age ? `Age ${cachedPatientInfo.age}` : null,
          cachedPatientInfo.mrn || null,
          cachedPatientInfo.facility || null,
        ].filter(Boolean).join(" · ");
        patientEl.innerHTML = `<strong>${cachedPatientInfo.name}</strong>${sub ? `<br><span style="font-size:11px;color:#6b7280;font-weight:400;">${sub}</span>` : ""}`;
        patientEl.classList.remove("pccscribe-undetected");
      } else {
        patientEl.textContent = "Patient not detected — open a patient chart";
        patientEl.classList.add("pccscribe-undetected");
      }
    }

    // 2. Detect notes
    detectedNotes = extractNoteRows();
    const noteType = detectNoteType();
    const noteTypeSelect = document.getElementById("pccscribe-note-type");
    if (noteTypeSelect) noteTypeSelect.value = noteType;

    const countEl = document.getElementById("pccscribe-notes-count");
    const listEl = document.getElementById("pccscribe-notes-list");
    if (countEl) {
      countEl.textContent = detectedNotes.length > 0
        ? `${detectedNotes.length} note(s) found on this page`
        : "Page content will be captured as a note";
    }
    if (listEl && detectedNotes.length > 0) {
      listEl.innerHTML = detectedNotes.slice(0, 3).map(n =>
        `<div class="pccscribe-note-preview-item">
          <span class="pccscribe-note-date">${n.noteDate}</span>
          ${n.author ? `<span class="pccscribe-note-author">${n.author}</span>` : ""}
          <div class="pccscribe-note-snippet">${n.content.substring(0, 120)}…</div>
         </div>`
      ).join("") + (detectedNotes.length > 3 ? `<div class="pccscribe-more">+${detectedNotes.length - 3} more</div>` : "");
    }

    // 3. Load patients from PCCScribe
    const result = await chrome.runtime.sendMessage({ type: "FETCH_PATIENTS" });
    patients = result.success ? result.patients : [];
    const select = document.getElementById("pccscribe-patient-select");
    if (select) {
      if (patients.length === 0) {
        select.innerHTML = `<option value="">No patients yet</option>`;
      } else {
        select.innerHTML = `<option value="">— Select a patient —</option>` +
          patients.map(p =>
            `<option value="${p.id}">${p.name} (${p.age} yrs · ${p.mrn || "No MRN"})</option>`
          ).join("");

        // Auto-match by name
        if (cachedPatientInfo.name) {
          const n = cachedPatientInfo.name.toLowerCase();
          const matched = patients.find(p => {
            const pn = p.name.toLowerCase();
            return pn.includes(n) || n.includes(pn) ||
              (cachedPatientInfo.lastName && pn.includes(cachedPatientInfo.lastName.toLowerCase()));
          });
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
    if (syncBtn) syncBtn.disabled = !select?.value;
  }

  async function syncNotes() {
    const select = document.getElementById("pccscribe-patient-select");
    const noteTypeSelect = document.getElementById("pccscribe-note-type");
    const syncBtn = document.getElementById("pccscribe-sync-btn");
    if (!select?.value) return;

    const patientId = parseInt(select.value);
    const noteType = noteTypeSelect?.value || detectNoteType();
    let notesToSend = detectedNotes.map(n => ({ ...n, noteType }));
    if (notesToSend.length === 0) {
      notesToSend = [{
        noteType,
        noteDate: new Date().toISOString().slice(0, 10),
        author: null,
        content: document.body.innerText.trim().substring(0, 10000),
        sourceUrl: window.location.href,
      }];
    } else {
      notesToSend = notesToSend.map(n => ({ ...n, sourceUrl: window.location.href }));
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
      setStatus(`✓ ${result.inserted} note(s) synced!`, "success");
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

  // ─── Init ────────────────────────────────────────────────────────────────────
  function init() { createFAB(); createPanel(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
