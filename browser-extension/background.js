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
