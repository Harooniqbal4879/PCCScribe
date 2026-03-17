// PCCScribe Content Script — runs on PointClickCare pages

(function () {
  if (window.__pccscribeInjected) return;
  window.__pccscribeInjected = true;

  // ─── PCC Patient Detection ───────────────────────────────────────────────────
  // Targets the actual PCC DOM as seen on cp_careclientprofile.jsp and similar pages.

  // ─── Helper: extract text of a residentDetailsSummary cell by its label ──────
  function extractDetailByLabel(label) {
    const cells = document.querySelectorAll("td.residentDetailsLabel");
    for (const cell of cells) {
      if (cell.innerText.includes(label)) {
        const sibling = cell.nextElementSibling;
        return sibling ? sibling.innerText.replace(/\s+/g, " ").trim() : null;
      }
    }
    return null;
  }

  // ─── Helper: extract current vitals from td.vital cells ──────────────────────
  function extractVitals() {
    const vitals = {};
    const vitalCells = document.querySelectorAll("td.vital");
    for (const cell of vitalCells) {
      const detailsDiv = cell.querySelector(".vitalDetails");
      if (!detailsDiv) continue;
      const boldEl = detailsDiv.querySelector("b");
      if (!boldEl) continue;

      // Label may be "BP:" (value outside) or "Temp:97.6" (value inside bold)
      const boldText = boldEl.innerText.replace(/\s+/g, "").trim();
      // Get all text from vitalDetails, strip out the date divs to get value+unit
      const dateDivs = Array.from(detailsDiv.querySelectorAll("div div, div"));
      // Find timestamp: a div whose text looks like a date
      let timestamp = null;
      for (const d of dateDivs) {
        if (/\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}/.test(d.innerText)) {
          timestamp = d.innerText.trim();
          break;
        }
      }

      // Full text of the details div (minus timestamp)
      const fullText = detailsDiv.innerText.replace(timestamp || "", "").replace(/\s+/g, " ").trim();

      // Extract label and value
      // Pattern A: "BP: 119/76 mmHg" — label ends with colon, value follows
      // Pattern B: "Temp:97.6 °F"    — value embedded in label
      let label, value;
      const colonSplit = boldText.match(/^([A-Za-z]+):(.+)$/);
      if (colonSplit && colonSplit[2].length > 0) {
        // Pattern B: label and value are in the bold text
        label = colonSplit[1];
        value = colonSplit[2] + " " + fullText.replace(boldText, "").trim();
      } else {
        // Pattern A: label is bold text (ends with colon), value is outside
        label = boldText.replace(":", "");
        value = fullText.replace(boldText, "").trim();
      }

      const unit = value.match(/[a-zA-Z°%\/]+/)?.[0] || "";
      const numStr = value.split(/[^0-9./]/)[0];
      const keyMap = {
        BP: "bp", Temp: "temp", Pulse: "pulse", Weight: "weight",
        Resp: "resp", BS: "bs", O2: "o2", Pain: "pain",
      };
      const key = keyMap[label] || label.toLowerCase();
      vitals[key] = { value: numStr, unit: unit.trim(), timestamp };
    }
    return Object.keys(vitals).length > 0 ? vitals : null;
  }

  // ─── Helper: extract first emergency contact ──────────────────────────────────
  function extractEmergencyContact() {
    const rows = document.querySelectorAll("tr");
    for (const row of rows) {
      const cells = row.querySelectorAll("td");
      if (cells.length < 5) continue;
      const contactTypeCell = cells[cells.length - 1];
      if (!contactTypeCell.innerText.includes("Emergency Contact # 1")) continue;
      const nameCell = cells[1];
      const phoneCell = cells[2];
      const relationCell = cells[cells.length - 2];
      const name = nameCell.innerText.replace(/\(\d+\)/, "").trim();
      const phone = phoneCell.innerText.replace(/\s+/g, " ").trim();
      const relation = relationCell.innerText.trim();
      return `${name} (${relation}): ${phone}`;
    }
    return null;
  }

  function detectPatientInfo() {
    const info = {
      name: null,       // "Patricia Abramczyk" (First Last)
      firstName: null,
      lastName: null,
      nickname: null,   // "Val" — commonly known as
      mrn: null,        // "PCC-9906"
      pccId: null,      // chart/record number (e.g. 9906)
      pccDbId: null,    // internal DB ID from displayCareProfile (e.g. 9490049)
      dob: null,        // "1949-11-15"
      age: null,        // 76
      gender: null,     // "Female"
      unit: null,       // "2 - Bristol 218-B"
      facility: null,   // "Applewood Nursing Center"
      physician: null,  // "Salman Khan"
      status: null,     // "Current"
      // Clinical summary fields
      allergies: null,          // "Amoxicillin, levoFLOXacin, ..."
      codeStatus: null,         // "FULL CODE"
      specialInstructions: null,// alert notes text
      diet: null,               // dietary notes
      initialAdmissionDate: null,// MDS initial admission date
      enterpriseId: null,       // PCC enterprise/org ID
      currentVitals: null,      // { bp, temp, pulse, weight, resp, bs, o2, pain } with timestamps
      emergencyContact: null,   // "Matt Beavers (Son): Mobile: (734) 621-2028"
    };

    // ── 1. PCC client ID from URL ─────────────────────────────────────────────
    const urlParams = new URLSearchParams(window.location.search);
    info.pccId = urlParams.get("ESOLclientid") || urlParams.get("clientId") || urlParams.get("id") || null;
    if (info.pccId) info.mrn = "PCC-" + info.pccId;

    // ── 2. PRIMARY: displayCareProfile onclick attribute ──────────────────────
    // PCC renders:  onclick="displayCareProfile(9490049,'Beavers, Valerie (9906)')"
    // #careProfileResidentBtn is the Care Profile button on the patient header.
    // This is the most reliable source: name + chart ID + internal DB ID, all in one attribute.
    const careProfileBtn = document.querySelector(
      '#careProfileResidentBtn, input[onclick*="displayCareProfile"], button[onclick*="displayCareProfile"]'
    );
    if (careProfileBtn) {
      const onclick = careProfileBtn.getAttribute("onclick") || "";
      // Match: displayCareProfile(dbId,'Last, First (chartId)')
      const cpMatch = onclick.match(/displayCareProfile\(\s*(\d+)\s*,\s*['"]([^'"]+)['"]\s*\)/);
      if (cpMatch) {
        info.pccDbId = cpMatch[1];          // internal DB record ID (e.g. 9490049)
        const nameStr = cpMatch[2];         // e.g. "Beavers, Valerie (9906)"

        // Parse "Last, First (chartId)"
        const nm = nameStr.match(/^([^,]+),\s+([^("]+?)\s*(?:\((\d+)\))?$/);
        if (nm) {
          info.lastName  = nm[1].trim();
          info.firstName = nm[2].trim();
          info.name      = `${info.firstName} ${info.lastName}`;
          if (nm[3]) {
            info.pccId = nm[3];             // chart number (e.g. 9906)
            info.mrn   = "PCC-" + nm[3];
          }
        }
      }
    }

    // ── 3. Rendered page text — avoids <script> tag content bleed-in ──────────
    const bodyText = document.body.innerText;

    // ── 4. Fallback name detection from rendered text ─────────────────────────
    if (!info.name) {
      const namePattern = /\b([A-Z][A-Za-z'\-]+(?:\s+[A-Z][A-Za-z'\-]+)*),\s+([A-Z][A-Za-z'\-]+(?:\s+[A-Z][A-Za-z'\-]+)?)\s*\((\d{4,9})\)/;
      const nameMatch = bodyText.match(namePattern);
      if (nameMatch) {
        info.lastName  = nameMatch[1].trim();
        info.firstName = nameMatch[2].trim();
        info.name      = `${info.firstName} ${info.lastName}`;
        if (!info.pccId) { info.pccId = nameMatch[3]; info.mrn = "PCC-" + nameMatch[3]; }
      } else {
        // Last fallback: page title "Last, First - PointClickCare"
        const titleMatch = document.title.match(/^([A-Z][A-Za-z'\-]+),\s+([A-Z][A-Za-z'\-]+(?:\s+[A-Z][A-Za-z'\-]+)?)/);
        if (titleMatch) {
          info.lastName  = titleMatch[1].trim();
          info.firstName = titleMatch[2].trim();
          info.name      = `${info.firstName} ${info.lastName}`;
        }
      }
    }

    // ── 5. Nickname / "commonly known as" ────────────────────────────────────
    // PCC sometimes shows: Beavers, Valerie (9906) "Val"
    // Look for a quoted word near the patient name area.
    const nicknamePattern = /\b(?:[A-Z][A-Za-z'\-]+),\s+[A-Z][A-Za-z'\-]+[^""\n]*["""]([A-Za-z'\-]+)["""]/;
    const nnMatch = bodyText.match(nicknamePattern);
    if (nnMatch) info.nickname = nnMatch[1].trim();

    // Also check onclick attribute directly for a nickname suffix
    if (!info.nickname && careProfileBtn) {
      const onclick = careProfileBtn.getAttribute("onclick") || "";
      const nnOnclick = onclick.match(/\)\s*[""]([A-Za-z'\-]+)[""]/);
      if (nnOnclick) info.nickname = nnOnclick[1].trim();
    }

    // ── 4. Unit / Room / Bed — direct ID ──────────────────────────────────────
    // <span id="res_unitRoomBed">2 - Bristol 230-A</span>
    const unitEl = document.getElementById("res_unitRoomBed");
    if (unitEl) info.unit = unitEl.innerText.trim();

    // ── 5. Status — direct ID ─────────────────────────────────────────────────
    // <span id="res_status">Current</span>
    const statusEl = document.getElementById("res_status");
    if (statusEl) info.status = statusEl.innerText.trim();

    // ── 6. Gender, DOB, Age, Physician from .residentProfileDetails ───────────
    // PCC wraps all of these in <td class="residentProfileDetails">
    // Each field is in its own <p> tag inside that cell.
    const profileCell = document.querySelector(".residentProfileDetails");
    if (profileCell) {
      const paragraphs = Array.from(profileCell.querySelectorAll("p"));
      for (const p of paragraphs) {
        const txt = p.innerText.replace(/\s+/g, " ").trim();

        // Gender / DOB / Age paragraph: "Gender: Female   DOB: 9/20/1950   Age: 75"
        if (/Gender/i.test(txt)) {
          const gm = txt.match(/Gender[:\s]*(Male|Female|Non-binary|Other)/i);
          if (gm && !info.gender) info.gender = gm[1];

          const dm = txt.match(/DOB[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i);
          if (dm && !info.dob) info.dob = parseMDY(dm[1]);

          const am = txt.match(/Age[:\s]*(\d{1,3})/i);
          if (am && !info.age) info.age = parseInt(am[1]);
        }

        // Physician paragraph: "Physician: Ramy Alosachie"
        if (/^Physician[:\s]/i.test(txt) && !info.physician) {
          info.physician = txt.replace(/^Physician[:\s]*/i, "").trim();
        }
      }
    }

    // Fallback for DOB/Age/Gender/Physician if profileCell wasn't found
    if (!info.dob) {
      const m = bodyText.match(/DOB[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i);
      if (m) info.dob = parseMDY(m[1]);
    }
    if (!info.age) {
      const m = bodyText.match(/\bAge[:\s]+(\d{1,3})\b/i);
      if (m) info.age = parseInt(m[1]);
    }
    if (!info.gender) {
      const m = bodyText.match(/\bGender[:\s]+(Male|Female|Non-binary|Other)\b/i);
      if (m) info.gender = m[1];
    }
    if (!info.physician) {
      const m = bodyText.match(/\bPhysician[:\s]+([A-Z][A-Za-z\s\.\-']+?)(?:\r?\n|DOB|Gender|Status|Location|Edit)/m);
      if (m) info.physician = m[1].trim().replace(/\s{2,}/g, " ");
    }
    if (!info.unit) {
      const m = bodyText.match(/\bLocation[:\s]+([^\r\n]{3,60})/i);
      if (m) {
        const loc = m[1].trim();
        if (!/(select|choose|facility)/i.test(loc)) info.unit = loc;
      }
    }

    // ── 7. Facility name — read from PCC's facilityProperties script tag ────────
    // PCC embeds: var facilityProperties = {"properties":{"facility_name":"Applewood Nursing Center",...},...}
    // Content scripts can read <script> tag textContent from the DOM even though they
    // cannot access the page's JS execution context (window.facilityProperties).
    for (const script of document.querySelectorAll("script")) {
      const src = script.textContent || "";
      if (src.includes("facilityProperties") && src.includes("facility_name")) {
        const m = src.match(/["']facility_name["']\s*:\s*["']([^"']+)["']/);
        if (m && m[1].trim().length > 2) {
          info.facility = m[1].trim();
          break;
        }
      }
    }

    // Fallback: PCC footer first meaningful line
    if (!info.facility) {
      for (const sel of ["#footer", ".footer", "[class*='footer']", "footer"]) {
        const el = document.querySelector(sel);
        if (!el) continue;
        const lines = el.innerText.trim().split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 3);
        for (const line of lines) {
          if (
            /(nursing|center|care|health|manor|home|medical|rehab|residence)/i.test(line) &&
            !/facility selection|select a facility/i.test(line) &&
            line.length < 80
          ) {
            info.facility = line;
            break;
          }
        }
        if (info.facility) break;
      }
    }

    // ── 8. Clinical summary fields ────────────────────────────────────────────
    // Allergies — td.allergyRed / allergyYellow / allergyNone, or by label
    const allergyEl = document.querySelector("td.allergyRed, td.allergyYellow, td.allergyNone, td.allergyGreen");
    if (allergyEl) {
      const t = allergyEl.innerText.replace(/\s+/g, " ").trim();
      if (t && !/^no known/i.test(t)) info.allergies = t;
    }
    if (!info.allergies) {
      const a = extractDetailByLabel("Allergies:");
      if (a && !/^no known/i.test(a)) info.allergies = a;
    }

    // Code status — find residentDetailsSummary containing code status keywords
    const summaryEls = document.querySelectorAll("td.residentDetailsSummary");
    for (const el of summaryEls) {
      const t = el.innerText.replace(/\s+/g, " ").trim();
      if (/\b(FULL CODE|DNR|DNI|COMFORT|HOSPICE|DO NOT RESUSCITATE|Code Status)/i.test(t)) {
        // Strip the "Advance Directives" link text and extra whitespace
        info.codeStatus = t.replace(/\(Advance Directives\)/gi, "").replace(/\s{2,}/g, " ").trim();
        break;
      }
    }

    // Special instructions — residentDetailsSummary following the "Special Instructions:" label
    // When it has content, the residentInfoEmpty class is NOT present on the sibling
    const si = extractDetailByLabel("Special Instructions:");
    if (si && si.length > 1) info.specialInstructions = si;

    // Diet
    const dietEl = document.querySelector("td.dietDescriptions");
    if (dietEl) {
      const t = dietEl.innerText.replace(/\s+/g, " ").trim();
      if (t) info.diet = t;
    }
    if (!info.diet) {
      const d = extractDetailByLabel("Diet:");
      if (d) info.diet = d;
    }

    // Admission date (re-entry)
    const admDate = extractDetailByLabel("Admission (Re-entry):");
    if (admDate) info.admissionDate = admDate;

    // Initial admission date (MDS)
    const initDate = extractDetailByLabel("Initial Admission Date (MDS):");
    if (initDate) info.initialAdmissionDate = initDate;

    // Enterprise ID
    const eid = extractDetailByLabel("Enterprise ID:");
    if (eid) info.enterpriseId = eid.replace(/\s/g, "");

    // Current vitals
    info.currentVitals = extractVitals();

    // Emergency contact (first Emergency Contact #1)
    info.emergencyContact = extractEmergencyContact();

    return info;
  }

  function parseNameIntoInfo(raw, info) {
    // Non-anchored match: works even if raw contains extra text
    const m = raw.match(/([A-Z][A-Za-z'\-]+(?:\s+[A-Z][A-Za-z'\-]+)*),\s+([A-Z][A-Za-z'\-]+(?:\s+[A-Z][A-Za-z'\-]+)?)\s*(?:\((\d+)\))?/);
    if (m) {
      info.lastName  = m[1].trim();
      info.firstName = m[2].trim();
      info.name      = `${info.firstName} ${info.lastName}`;
      if (m[3] && !info.pccId) { info.pccId = m[3]; info.mrn = "PCC-" + m[3]; }
    } else {
      info.name = raw.replace(/\s*\(\d+\)/, "").split("\n")[0].trim();
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

  // ── Map PCC note type labels to our normalized enum values ──────────────────
  function mapPccNoteType(label) {
    if (!label) return null;
    const t = label.toLowerCase();
    if (t.includes("emar") || t.includes("medication administration")) return "mar";
    if (t.includes("progress") || t.includes("narrative") || t.includes("health status") ||
        t.includes("respiratory") || t.includes("nurse practitioner") || t.includes("physician assistant")) return "progress_notes";
    if (t.includes("physician order") || t.includes("physician's order")) return "physician_orders";
    if (t.includes("therapy") || t.includes("rehab") || t.includes("pt ") || t.includes("ot ") || t.includes("st ")) return "therapy_notes";
    if (t.includes("dietary") || t.includes("nutrition")) return "dietary_notes";
    if (t.includes("social work") || t.includes("social service")) return "social_work_notes";
    if (t.includes("nursing")) return "nursing_notes";
    if (t.includes("mds") || t.includes("minimum data set")) return "mds_assessment";
    if (t.includes("care plan")) return "care_plan";
    return null;
  }

  // ── Extract the print URL from an anchor element ─────────────────────────────
  function getPrintUrl(anchor) {
    if (!anchor) return null;
    const href = anchor.getAttribute("href") || "";
    // Direct URL (not javascript: and not bare #)
    if (href && !href.startsWith("javascript") && href !== "#" &&
        !href.endsWith("#") && href !== window.location.href) {
      return href.startsWith("http") ? href : window.location.origin + href;
    }
    // onclick: window.open('/path', ...) or openWindow('/path', ...)
    const onclick = anchor.getAttribute("onclick") || anchor.getAttribute("href") || "";
    const winOpen = onclick.match(/(?:window\.open|openWindow)\s*\(\s*['"]([^'"]+)['"]/i);
    if (winOpen) {
      const u = winOpen[1];
      return u.startsWith("http") ? u : window.location.origin + u;
    }
    // onclick: printNote('/path')
    const fn = onclick.match(/(?:printNote|printView|viewPrint)\s*\(\s*['"]([^'"]+)['"]/i);
    if (fn) {
      const u = fn[1];
      return u.startsWith("http") ? u : window.location.origin + u;
    }
    return null;
  }

  // ── Parse the PCC Progress Notes / Practitioner Notes table ─────────────────
  // Columns (observed from PCC DOM):
  //   [0] view | print links
  //   [1] Effective Date (MM/DD/YYYY HH:MM)
  //   [2] Type (note type label)
  //   [3] Note (truncated content)
  //   [4] Care Plan Item or Task
  //   [5] Dept.
  //   [6] Shift Report (Y/N)
  //   [7] 24 Hour Report (Y/N)
  function extractNoteRows() {
    const notes = [];
    const today = new Date().toISOString().slice(0, 10);
    const pageNoteType = detectNoteType();

    const allTrs = Array.from(document.querySelectorAll("tr"));
    const MAX_NOTES = 25; // safety cap

    for (const tr of allTrs) {
      if (notes.length >= MAX_NOTES) break;

      const anchors = Array.from(tr.querySelectorAll("a"));
      const printAnchor = anchors.find(
        (a) => a.textContent.trim().toLowerCase() === "print"
      );
      if (!printAnchor) continue;

      const printUrl = getPrintUrl(printAnchor);
      const cells = Array.from(tr.querySelectorAll("td"));
      if (cells.length < 3) continue;

      // Cell 0: the view/print links column — skip it for text
      // Cell 1: date/time
      // Cell 2: note type label
      // Cell 3: truncated content
      // Cell 5 (approx): dept / author
      let noteDate = today;
      let noteTypePcc = "";
      let truncatedContent = "";
      let author = "";

      cells.forEach((cell, i) => {
        const text = cell.textContent.trim();
        if (i === 0) return; // view/print links

        // Date pattern: MM/DD/YYYY HH:MM
        if (/^\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}/.test(text)) {
          const datePart = text.split(/\s+/)[0];
          const parsed = parseMDY(datePart);
          if (parsed) noteDate = parsed;
          return;
        }

        // Note type: medium-length, no numerics at start, not the truncated note
        if (!noteTypePcc && text.length > 5 && text.length < 90 &&
            !/^\d/.test(text) && !text.includes("SERVICE DATE") &&
            !["Y", "N", "view", "print"].includes(text)) {
          noteTypePcc = text;
          return;
        }

        // Content (longer text) — skip if it looks like a dept code
        if (!truncatedContent && text.length > 20 &&
            text !== noteTypePcc && !/^[A-Z]{1,10}$/.test(text)) {
          truncatedContent = text;
          return;
        }

        // Dept: short string towards the end of the row, not Y/N
        if (!author && i >= 4 && text.length > 1 && text.length < 20 &&
            !["Y", "N"].includes(text) && !/^\d/.test(text)) {
          author = text;
        }
      });

      const mappedType = mapPccNoteType(noteTypePcc) || pageNoteType;

      notes.push({
        noteType: mappedType,
        noteTypePcc: noteTypePcc || null,
        noteDate,
        author: author || null,
        content: truncatedContent || noteTypePcc || "Note content pending full extraction",
        printUrl: printUrl || null,
        sourceUrl: window.location.href,
      });
    }

    // Fallback: no print links found — grab any note-like content areas
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
            notes.push({
              noteType: pageNoteType,
              noteTypePcc: null,
              noteDate: today,
              author: null,
              content: text,
              printUrl: null,
              sourceUrl: window.location.href,
            });
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
          <div id="pccscribe-sync-status" style="font-size:11px;margin-top:4px;color:#6b7280;min-height:14px;"></div>
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
            <input id="pccf-nickname" class="pccscribe-input" placeholder='Known as (e.g. "Val")' type="text" />
            <div class="pccscribe-row">
              <input id="pccf-age" class="pccscribe-input" placeholder="Age *" type="number" min="0" max="130" style="width:70px;flex-shrink:0;" />
              <input id="pccf-gender" class="pccscribe-input" placeholder="Gender" type="text" style="flex:1;" />
            </div>
            <input id="pccf-dob" class="pccscribe-input" placeholder="Date of birth (YYYY-MM-DD)" type="text" />
            <input id="pccf-facility" class="pccscribe-input" placeholder="Facility name *" type="text" />
            <input id="pccf-unit" class="pccscribe-input" placeholder="Unit / Room *" type="text" />
            <input id="pccf-mrn" class="pccscribe-input" placeholder="MRN / PCC Chart ID" type="text" />
            <input id="pccf-pccdbid" class="pccscribe-input" placeholder="PCC Internal ID (auto)" type="text" style="color:#9ca3af;" />
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
    const nicknameEl = document.getElementById("pccf-nickname");
    if (nicknameEl && info.nickname) nicknameEl.value = info.nickname;
    if (ageEl && info.age) ageEl.value = String(info.age);
    if (genderEl && info.gender) genderEl.value = info.gender;
    if (dobEl && info.dob) dobEl.value = info.dob;
    if (facilityEl && info.facility) facilityEl.value = info.facility;
    if (unitEl && info.unit) unitEl.value = info.unit;
    if (mrnEl && info.mrn) mrnEl.value = info.mrn;
    const pccDbIdEl = document.getElementById("pccf-pccdbid");
    if (pccDbIdEl && info.pccDbId) pccDbIdEl.value = info.pccDbId;
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
    const nickname = (document.getElementById("pccf-nickname")?.value || "").trim();
    const ageStr = (document.getElementById("pccf-age")?.value || "").trim();
    const gender = (document.getElementById("pccf-gender")?.value || "").trim();
    const dob = (document.getElementById("pccf-dob")?.value || "").trim();
    const facility = (document.getElementById("pccf-facility")?.value || "").trim();
    const unit = (document.getElementById("pccf-unit")?.value || "").trim();
    const mrn = (document.getElementById("pccf-mrn")?.value || "").trim();
    const pccInternalId = (document.getElementById("pccf-pccdbid")?.value || "").trim();
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
      ...(nickname ? { nickname } : {}),
      ...(pccInternalId ? { pccInternalId } : {}),
      ...(cachedPatientInfo.status ? { admissionStatus: cachedPatientInfo.status } : {}),
      // Clinical summary fields — auto-collected, no form input needed
      ...(cachedPatientInfo.allergies ? { allergies: cachedPatientInfo.allergies } : {}),
      ...(cachedPatientInfo.codeStatus ? { codeStatus: cachedPatientInfo.codeStatus } : {}),
      ...(cachedPatientInfo.specialInstructions ? { specialInstructions: cachedPatientInfo.specialInstructions } : {}),
      ...(cachedPatientInfo.diet ? { diet: cachedPatientInfo.diet } : {}),
      ...(cachedPatientInfo.initialAdmissionDate ? { initialAdmissionDate: cachedPatientInfo.initialAdmissionDate } : {}),
      ...(cachedPatientInfo.enterpriseId ? { enterpriseId: cachedPatientInfo.enterpriseId } : {}),
      ...(cachedPatientInfo.currentVitals ? { currentVitals: JSON.stringify(cachedPatientInfo.currentVitals) } : {}),
      ...(cachedPatientInfo.emergencyContact ? { emergencyContact: cachedPatientInfo.emergencyContact } : {}),
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

  // ─── Auto-sync patient data to PCCScribe API ──────────────────────────────────
  // Called automatically after each page scan. Silently upserts by pccDbId.
  async function syncPatientToApi() {
    if (!cachedPatientInfo.pccDbId) return; // can only sync if we have a PCC internal ID

    const syncEl = document.getElementById("pccscribe-sync-status");
    if (syncEl) {
      syncEl.style.color = "#6b7280";
      syncEl.textContent = "⏳ Syncing with PCCScribe...";
    }

    const payload = {
      name: cachedPatientInfo.name || "Unknown",
      age: cachedPatientInfo.age || 0,
      facilityName: cachedPatientInfo.facility || "",
      unit: cachedPatientInfo.unit || "",
      pccInternalId: cachedPatientInfo.pccDbId,
      ...(cachedPatientInfo.mrn ? { mrn: cachedPatientInfo.mrn } : {}),
      ...(cachedPatientInfo.nickname ? { nickname: cachedPatientInfo.nickname } : {}),
      ...(cachedPatientInfo.dob ? { dateOfBirth: cachedPatientInfo.dob } : {}),
      ...(cachedPatientInfo.gender ? { gender: cachedPatientInfo.gender } : {}),
      ...(cachedPatientInfo.status ? { admissionStatus: cachedPatientInfo.status } : {}),
      ...(cachedPatientInfo.physician ? { physician: cachedPatientInfo.physician } : {}),
      ...(cachedPatientInfo.allergies ? { allergies: cachedPatientInfo.allergies } : {}),
      ...(cachedPatientInfo.codeStatus ? { codeStatus: cachedPatientInfo.codeStatus } : {}),
      ...(cachedPatientInfo.specialInstructions ? { specialInstructions: cachedPatientInfo.specialInstructions } : {}),
      ...(cachedPatientInfo.diet ? { diet: cachedPatientInfo.diet } : {}),
      ...(cachedPatientInfo.admissionDate ? { admissionDate: cachedPatientInfo.admissionDate } : {}),
      ...(cachedPatientInfo.initialAdmissionDate ? { initialAdmissionDate: cachedPatientInfo.initialAdmissionDate } : {}),
      ...(cachedPatientInfo.enterpriseId ? { enterpriseId: cachedPatientInfo.enterpriseId } : {}),
      ...(cachedPatientInfo.currentVitals ? { currentVitals: JSON.stringify(cachedPatientInfo.currentVitals) } : {}),
      ...(cachedPatientInfo.emergencyContact ? { emergencyContact: cachedPatientInfo.emergencyContact } : {}),
    };

    // Don't sync if we don't have the minimum required fields
    if (!payload.name || payload.name === "Unknown" || !payload.facilityName || !payload.unit) return;

    const result = await chrome.runtime.sendMessage({ type: "SYNC_PATIENT", payload });

    if (syncEl) {
      if (result.success) {
        const label = result.created ? "✓ Added to PCCScribe" : "✓ Patient data synced";
        const ts = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        syncEl.style.color = result.created ? "#059669" : "#6b7280";
        syncEl.textContent = `${label} · ${ts}`;

        // If the patient was just created, refresh the patient list so they appear in the dropdown
        if (result.created && result.patient) {
          patients.push(result.patient);
          const select = document.getElementById("pccscribe-patient-select");
          if (select && select.querySelector(`option[value="${result.patient.id}"]`) === null) {
            const opt = document.createElement("option");
            opt.value = String(result.patient.id);
            opt.textContent = `${result.patient.name} (${result.patient.age} yrs · ${result.patient.mrn || "No MRN"})`;
            select.appendChild(opt);
          }
        }
      } else {
        syncEl.style.color = "#dc2626";
        syncEl.textContent = `⚠ Sync failed: ${result.error || "unknown error"}`;
      }
    }
  }

  async function scanPage() {
    // 1. Detect patient from PCC DOM
    cachedPatientInfo = detectPatientInfo();
    const patientEl = document.getElementById("pccscribe-detected-patient");
    if (patientEl) {
      if (cachedPatientInfo.name) {
        const displayName = cachedPatientInfo.nickname
          ? `${cachedPatientInfo.name} <span style="color:#6b7280;font-weight:400;font-size:12px;">"${cachedPatientInfo.nickname}"</span>`
          : cachedPatientInfo.name;
        const sub = [
          cachedPatientInfo.age ? `Age ${cachedPatientInfo.age}` : null,
          cachedPatientInfo.gender || null,
          cachedPatientInfo.pccId ? `#${cachedPatientInfo.pccId}` : null,
          cachedPatientInfo.unit || null,
          cachedPatientInfo.facility || null,
        ].filter(Boolean).join(" · ");
        const subLine2 = [
          cachedPatientInfo.status ? `Status: ${cachedPatientInfo.status}` : null,
          cachedPatientInfo.physician ? `Dr. ${cachedPatientInfo.physician}` : null,
        ].filter(Boolean).join(" · ");
        patientEl.innerHTML = `<strong>${displayName}</strong>${sub ? `<br><span style="font-size:11px;color:#6b7280;font-weight:400;">${sub}</span>` : ""}${subLine2 ? `<br><span style="font-size:11px;color:#9ca3af;font-weight:400;">${subLine2}</span>` : ""}`;
        patientEl.classList.remove("pccscribe-undetected");

        // Auto-sync to API in the background (non-blocking)
        syncPatientToApi();
      } else {
        patientEl.textContent = "Patient not detected — open a patient chart";
        patientEl.classList.add("pccscribe-undetected");
        const syncEl = document.getElementById("pccscribe-sync-status");
        if (syncEl) syncEl.textContent = "";
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
      listEl.innerHTML = detectedNotes.slice(0, 4).map(n =>
        `<div class="pccscribe-note-preview-item">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:3px;">
            <span class="pccscribe-note-date">${n.noteDate}</span>
            ${n.author ? `<span class="pccscribe-note-author">${n.author}</span>` : ""}
            ${n.printUrl ? `<span style="font-size:10px;color:#059669;font-weight:600;">● Full</span>` : `<span style="font-size:10px;color:#f59e0b;font-weight:600;">● Truncated</span>`}
          </div>
          ${n.noteTypePcc ? `<div style="font-size:10px;color:#6366f1;margin-bottom:2px;font-weight:500;">${n.noteTypePcc}</div>` : ""}
          <div class="pccscribe-note-snippet">${n.content.substring(0, 100)}…</div>
         </div>`
      ).join("") + (detectedNotes.length > 4 ? `<div class="pccscribe-more">+${detectedNotes.length - 4} more</div>` : "");
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
    const chosenNoteType = noteTypeSelect?.value || detectNoteType();

    let notesToSend = detectedNotes.length > 0
      ? detectedNotes.map(n => ({ ...n, noteType: chosenNoteType }))
      : [{
          noteType: chosenNoteType,
          noteTypePcc: null,
          noteDate: new Date().toISOString().slice(0, 10),
          author: null,
          content: document.body.innerText.trim().substring(0, 10000),
          printUrl: null,
          sourceUrl: window.location.href,
        }];

    syncBtn.disabled = true;
    syncBtn.textContent = "Fetching...";

    // ── Step 1: Fetch full content from each print URL ────────────────────────
    const notesWithPrintUrls = notesToSend.filter(n => n.printUrl);
    const notesWithoutPrintUrls = notesToSend.filter(n => !n.printUrl);

    const enrichedNotes = [...notesWithoutPrintUrls];

    for (let i = 0; i < notesWithPrintUrls.length; i++) {
      const note = notesWithPrintUrls[i];
      setStatus(`Fetching note ${i + 1} of ${notesWithPrintUrls.length}...`, "info");
      syncBtn.textContent = `Fetching ${i + 1}/${notesWithPrintUrls.length}...`;

      const result = await chrome.runtime.sendMessage({
        type: "FETCH_NOTE_CONTENT",
        payload: { printUrl: note.printUrl },
      });

      if (result.success && result.content && result.content.length > 20) {
        enrichedNotes.push({ ...note, content: result.content });
      } else {
        // Fall back to truncated content if print fetch fails
        enrichedNotes.push(note);
      }
    }

    // ── Step 2: Send all enriched notes to the API ───────────────────────────
    setStatus(`Saving ${enrichedNotes.length} note(s)...`, "info");
    syncBtn.textContent = "Saving...";

    const result = await chrome.runtime.sendMessage({
      type: "SEND_NOTES",
      payload: { patientId, notes: enrichedNotes },
    });

    syncBtn.disabled = false;
    syncBtn.textContent = "Fetch & Sync Notes";

    if (result.success) {
      setStatus(`✓ ${result.inserted} note(s) synced with full content!`, "success");
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
