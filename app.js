const STORAGE_KEY = "bp_log_entries_v1";
const REMINDER_LAST_PLAYED_KEY = "bp_log_reminder_last_played_v1";
const REMINDER_TIME = { hour: 16, minute: 0 };
const REMINDER_TIME_ZONE = "Europe/Stockholm";

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
let bpChart;

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

function resetChart() {
  if (bpChart) {
    bpChart.destroy();
    bpChart = null;
  }
}

function renderChart(entries) {
  resetChart();

  if (typeof Chart === "undefined") {
    chart.innerHTML = `<p class="muted">Diagrammet kunde inte laddas just nu.</p>`;
    return;
  }

  if (entries.length === 0) {
    chart.innerHTML = `
      <canvas id="bpChart" aria-label="Blodtryck och puls över tid" role="img"></canvas>
      <p class="muted chartEmpty">Diagram visas när du har sparat mätningar.</p>
    `;
    return;
  }

  chart.innerHTML = `<canvas id="bpChart" aria-label="Blodtryck och puls över tid" role="img"></canvas>`;
  const canvas = document.getElementById("bpChart");
  const sorted = [...entries].sort((a, b) => new Date(a.measuredAt) - new Date(b.measuredAt));
  const labels = sorted.map((entry) => formatDateTime(entry.measuredAt));
  const hasFewMeasurements = sorted.length <= 5;
  const allValues = sorted.flatMap((entry) => [entry.systolic, entry.diastolic, entry.pulse]);
  const minValue = Math.min(...allValues);
  const maxValue = Math.max(...allValues);
  const valueSpan = Math.max(10, maxValue - minValue);

  bpChart = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Övertryck",
          data: sorted.map((entry) => entry.systolic),
          borderColor: "#dc2626",
          backgroundColor: "#dc2626",
          tension: 0.3
        },
        {
          label: "Undertryck",
          data: sorted.map((entry) => entry.diastolic),
          borderColor: "#2563eb",
          backgroundColor: "#2563eb",
          tension: 0.3
        },
        {
          label: "Puls",
          data: sorted.map((entry) => entry.pulse),
          borderColor: "#16a34a",
          backgroundColor: "#16a34a",
          tension: 0.3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        intersect: false,
        mode: "index"
      },
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            boxWidth: 12,
            boxHeight: 12,
            color: "#667085",
            usePointStyle: true
          }
        },
        tooltip: {
          enabled: true,
          callbacks: {
            title: (items) => items[0]?.label || ""
          }
        }
      },
      layout: {
        padding: {
          top: 8,
          right: 12,
          bottom: 8,
          left: 8
        }
      },
      scales: {
        x: {
          display: true,
          offset: hasFewMeasurements,
          ticks: {
            autoSkip: !hasFewMeasurements,
            maxTicksLimit: hasFewMeasurements ? 5 : 8,
            maxRotation: 0,
            minRotation: 0,
            color: "#667085"
          },
          grid: {
            display: true,
            color: "#e6ebf3"
          }
        },
        y: {
          display: true,
          beginAtZero: false,
          suggestedMin: minValue - valueSpan * 0.15,
          suggestedMax: maxValue + valueSpan * 0.15,
          ticks: {
            precision: 0,
            color: "#667085"
          },
          grid: {
            color: "#e6ebf3"
          }
        }
      },
      elements: {
        line: {
          borderWidth: 3
        },
        point: {
          hitRadius: 14,
          hoverRadius: 6,
          radius: hasFewMeasurements ? 5 : 4
        }
      }
    }
  });
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
startDailyReminder();

function getSwedishDateTimeParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: REMINDER_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });

  const parts = formatter.formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});

  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute)
  };
}

function playReminderSound() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;

  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = "sine";
  oscillator.frequency.value = 880;
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.25, context.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.6);

  oscillator.connect(gain);
  gain.connect(context.destination);

  oscillator.start();
  oscillator.stop(context.currentTime + 0.65);
  oscillator.onended = () => context.close();
}

function checkDailyReminder() {
  const { dateKey, hour, minute } = getSwedishDateTimeParts();
  const alreadyPlayed = localStorage.getItem(REMINDER_LAST_PLAYED_KEY) === dateKey;

  if (alreadyPlayed) return;

  if (hour > REMINDER_TIME.hour || (hour === REMINDER_TIME.hour && minute >= REMINDER_TIME.minute)) {
    playReminderSound();
    localStorage.setItem(REMINDER_LAST_PLAYED_KEY, dateKey);
  }
}

function startDailyReminder() {
  checkDailyReminder();
  setInterval(checkDailyReminder, 30000);
}
