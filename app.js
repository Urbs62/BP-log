const STORAGE_KEY = "bp_log_entries_v1";

const form = document.getElementById("bpForm");
const systolicInput = document.getElementById("systolic");
const diastolicInput = document.getElementById("diastolic");
const pulseInput = document.getElementById("pulse");
const measuredAtInput = document.getElementById("measuredAt");
const noteInput = document.getElementById("note");
const liveResult = document.getElementById("liveResult");
const historyList = document.getElementById("historyList");
const summary = document.getElementById("summary");
const chart = document.getElementById("chart");
const clearAllBtn = document.getElementById("clearAllBtn");

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.warn("Service worker registration failed:", error);
    });
  });
}

function nowForDateTimeInput() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

function loadEntries() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveEntries(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function classifyBloodPressure(sys, dia) {
  if (sys >= 180 || dia >= 120) {
    return {
      key: "very-high",
      label: "Mycket högt",
      text: "Mycket högt värde. Vid oro eller symtom bör vården kontaktas."
    };
  }

  if (sys < 100 || dia < 60) {
    return {
      key: "low",
      label: "Lågt",
      text: "Lågt blodtryck. Kan vara normalt, men notera om du har symtom."
    };
  }

  if (sys >= 140 || dia >= 90) {
    return {
      key: "high",
      label: "Högt",
      text: "Högt blodtryck enligt enkel klassning."
    };
  }

  if (sys >= 130 || dia >= 85) {
    return {
      key: "elevated",
      label: "Förhöjt",
      text: "Förhöjt värde, bra att följa över tid."
    };
  }

  return {
    key: "normal",
    label: "Normalt",
    text: "Värdet ligger inom normal nivå enligt enkel klassning."
  };
}

function getInputValues() {
  return {
    systolic: Number(systolicInput.value),
    diastolic: Number(diastolicInput.value),
    pulse: Number(pulseInput.value),
    measuredAt: measuredAtInput.value,
    note: noteInput.value.trim()
  };
}

function updateLiveResult() {
  const { systolic, diastolic } = getInputValues();

  if (!systolic || !diastolic) {
    liveResult.className = "result muted";
    liveResult.textContent = "Fyll i värden för bedömning.";
    return;
  }

  const result = classifyBloodPressure(systolic, diastolic);
  liveResult.className = `result ${result.key}`;
  liveResult.textContent = `${result.label}: ${result.text}`;
}

function formatDateTime(value) {
  const date = new Date(value);
  return date.toLocaleString("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function renderSummary(entries) {
  if (entries.length === 0) {
    summary.innerHTML = `<p class="muted">Inga mätningar sparade ännu.</p>`;
    return;
  }

  const avg = (field) =>
    Math.round(entries.reduce((sum, item) => sum + item[field], 0) / entries.length);

  summary.innerHTML = `
    <div class="summaryGrid">
      <div><strong>${entries.length}</strong><span>mätningar</span></div>
      <div><strong>${avg("systolic")}</strong><span>snitt övertryck</span></div>
      <div><strong>${avg("diastolic")}</strong><span>snitt undertryck</span></div>
      <div><strong>${avg("pulse")}</strong><span>snitt puls</span></div>
    </div>
  `;
}

function renderHistory(entries) {
  if (entries.length === 0) {
    historyList.innerHTML = "";
    return;
  }

  historyList.innerHTML = entries
    .map((entry) => `
      <article class="historyItem">
        <div>
          <strong>${entry.systolic}/${entry.diastolic}</strong>
          <span>Puls ${entry.pulse}</span>
          <small>${formatDateTime(entry.measuredAt)}</small>
          ${entry.note ? `<small>${entry.note}</small>` : ""}
        </div>
        <div class="badge ${entry.classification.key}">
          ${entry.classification.label}
        </div>
        <button class="deleteBtn" type="button" data-id="${entry.id}">Ta bort</button>
      </article>
    `)
    .join("");
}

function scale(value, min, max, height) {
  if (max === min) return height / 2;
  return height - ((value - min) / (max - min)) * height;
}

function pointsFor(entries, field, min, max, width, height) {
  if (entries.length === 1) {
    return `${width / 2},${scale(entries[0][field], min, max, height)}`;
  }

  return entries
    .map((entry, index) => {
      const x = (index / (entries.length - 1)) * width;
      const y = scale(entry[field], min, max, height);
      return `${x},${y}`;
    })
    .join(" ");
}

function renderChart(entries) {
  if (entries.length === 0) {
    chart.innerHTML = `<p class="muted">Diagram visas när du har sparat mätningar.</p>`;
    return;
  }

  const sorted = [...entries].sort((a, b) => new Date(a.measuredAt) - new Date(b.measuredAt));
  const values = sorted.flatMap((e) => [e.systolic, e.diastolic, e.pulse]);
  const min = Math.min(...values) - 10;
  const max = Math.max(...values) + 10;

  const width = 320;
  const height = 180;

  chart.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Blodtryck och puls över tid">
      <polyline class="line sys" points="${pointsFor(sorted, "systolic", min, max, width, height)}" />
      <polyline class="line dia" points="${pointsFor(sorted, "diastolic", min, max, width, height)}" />
      <polyline class="line pulse" points="${pointsFor(sorted, "pulse", min, max, width, height)}" />
    </svg>
    <div class="legend">
      <span><i class="sys"></i>Övertryck</span>
      <span><i class="dia"></i>Undertryck</span>
      <span><i class="pulse"></i>Puls</span>
    </div>
  `;
}

function render() {
  const entries = loadEntries().sort((a, b) => new Date(b.measuredAt) - new Date(a.measuredAt));
  renderSummary(entries);
  renderHistory(entries);
  renderChart(entries);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const values = getInputValues();

  const entry = {
    id: crypto.randomUUID(),
    ...values,
    classification: classifyBloodPressure(values.systolic, values.diastolic)
  };

  const entries = loadEntries();
  entries.push(entry);
  saveEntries(entries);

  form.reset();
  measuredAtInput.value = nowForDateTimeInput();
  updateLiveResult();
  render();
});

historyList.addEventListener("click", (event) => {
  const button = event.target.closest(".deleteBtn");
  if (!button) return;

  const entries = loadEntries().filter((entry) => entry.id !== button.dataset.id);
  saveEntries(entries);
  render();
});

clearAllBtn.addEventListener("click", () => {
  if (!confirm("Vill du rensa alla sparade mätningar?")) return;
  saveEntries([]);
  render();
});

[systolicInput, diastolicInput].forEach((input) => {
  input.addEventListener("input", updateLiveResult);
});

measuredAtInput.value = nowForDateTimeInput();
render();
