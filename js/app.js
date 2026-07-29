import {
  initAudioEngine,
  getContext,
  resumeAudio,
  setMasterVolume,
  syncAllTracks,
  setMasterPlaybackRate,
} from "./audio-engine.js";
import { Track, PARAM_RANGES } from "./track.js";
import { Knob } from "./ui-knob.js";
import { loadDemoSample, DEMO_SAMPLES } from "./samples.js";
import { SceneManager, SCENE_COUNT } from "./scenes.js";

const TRACK_COLORS = ["var(--track-1)", "var(--track-2)", "var(--track-3)", "var(--track-4)"];
const TRACK_NAMES = ["Track 1", "Track 2", "Track 3", "Track 4"];

let tracks = [];
let trackFlags = [];
let sceneManager = null;
let focusedTrackIndex = 0;

const mixKnobs = {}; // mixKnobs[trackIndex][paramId] -> Knob (permanent)
let detailKnobs = {}; // rebuilt each time the detail panel re-renders
let currentWaveformCanvas = null;
let currentFileForTrack = {}; // trackIndex -> File

// Slider is 0..1, centered at 0.5 = 1x. Exponential so each side spans one
// octave: 0 -> 0.5x (half speed), 1 -> 2x (double speed).
function speedNormToRate(norm) {
  return Math.pow(2, (norm - 0.5) * 2);
}
let currentDemoForTrack = {};

function paramToReal(id, norm) {
  const [lo, hi] = PARAM_RANGES[id];
  const log = id === "filterFreq" || id === "tone";
  if (log) return Math.exp(Math.log(lo) + (Math.log(hi) - Math.log(lo)) * norm);
  return lo + (hi - lo) * norm;
}

function formatValue(id, norm) {
  const real = paramToReal(id, norm);
  switch (id) {
    case "filterFreq":
    case "tone":
      return real >= 1000 ? (real / 1000).toFixed(1) + "k" : Math.round(real);
    case "filterQ":
      return real.toFixed(1);
    case "grainSize":
    case "grainSpray":
    case "delayTime":
      return Math.round(real * 1000) + "ms";
    case "lfoRate":
      return real.toFixed(1) + "Hz";
    case "pan":
      return real.toFixed(2);
    default:
      return Math.round(norm * 100) + "%";
  }
}

function setTrackParam(trackIndex, paramId, norm) {
  tracks[trackIndex].setParam(paramId, norm);
  syncAllKnobVisuals();
}

function syncAllKnobVisuals() {
  tracks.forEach((t, i) => {
    Object.keys(PARAM_RANGES).forEach((id) => {
      const norm = t.params[id];
      if (mixKnobs[i] && mixKnobs[i][id]) mixKnobs[i][id].setValue(norm, false);
      if (focusedTrackIndex === i && detailKnobs[id]) detailKnobs[id].setValue(norm, false);
    });
  });
}

function updateSoloMuteStates() {
  const anySolo = trackFlags.some((f) => f.solo);
  tracks.forEach((t, i) => {
    const effectiveMute = trackFlags[i].userMuted || (anySolo && !trackFlags[i].solo);
    t.setMuted(effectiveMute);
  });
  updateAllMuteButtonVisuals();
}

function updateAllMuteButtonVisuals() {
  document.querySelectorAll(".track-mini").forEach((el) => {
    const i = Number(el.dataset.track);
    el.querySelector(".mute").classList.toggle("active-state", trackFlags[i].userMuted);
  });
  document.querySelectorAll(".mix-strip").forEach((el) => {
    const i = Number(el.dataset.track);
    el.querySelector(".mute").classList.toggle("active-state", trackFlags[i].userMuted);
    el.querySelector(".solo").classList.toggle("active-state", trackFlags[i].solo);
  });
}

function makeKnob(slotEl, trackIndex, paramId, registryHolder) {
  const norm = tracks[trackIndex].params[paramId];
  const knob = new Knob(slotEl, {
    label: slotEl.dataset.label || paramId,
    value: norm,
    format: (v) => formatValue(paramId, v),
    onChange: (v) => setTrackParam(trackIndex, paramId, v),
  });
  registryHolder[paramId] = knob;
  return knob;
}

// ---------------- Track overview strip ----------------

function renderTrackStrip() {
  const strip = document.getElementById("track-strip");
  strip.innerHTML = "";
  const tmpl = document.getElementById("tmpl-track-mini");
  tracks.forEach((t, i) => {
    const node = tmpl.content.firstElementChild.cloneNode(true);
    node.dataset.track = i;
    node.querySelector(".track-mini-color").style.background = t.color;
    node.querySelector(".track-mini-name").textContent = t.name;
    node.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      focusedTrackIndex = i;
      renderTrackDetail(i);
      updateFocusHighlight();
    });
    node.querySelector(".rec").addEventListener("click", async (e) => {
      e.stopPropagation();
      await toggleRecord(i);
    });
    node.querySelector(".play").addEventListener("click", (e) => {
      e.stopPropagation();
      togglePlay(i);
    });
    node.querySelector(".mute").addEventListener("click", (e) => {
      e.stopPropagation();
      trackFlags[i].userMuted = !trackFlags[i].userMuted;
      updateSoloMuteStates();
    });
    strip.appendChild(node);
  });
  updateFocusHighlight();
}

function updateFocusHighlight() {
  document.querySelectorAll(".track-mini").forEach((el) => {
    el.classList.toggle("focused", Number(el.dataset.track) === focusedTrackIndex);
  });
}

async function toggleRecord(i) {
  const t = tracks[i];
  if (t.isRecording) {
    t.stopRecord();
  } else if (!t.hasContent) {
    await t.startRecord();
  } else {
    await t.startOverdub();
  }
  if (t.micError) {
    alert(
      `Couldn't access the microphone on ${t.name}: ${t.micError.name || t.micError}.\n\n` +
        "Check Settings > Privacy & Security > Microphone (or Safari's site settings) and make sure this app is allowed."
    );
  }
}

function togglePlay(i) {
  const t = tracks[i];
  if (t.isRecording) {
    // finishing a take via Play is a natural gesture too — it behaves the
    // same as pressing Record/Overdub again: finalize the loop and play it.
    t.stopRecord();
    return;
  }
  if (t.isPlaying) t.stop();
  else t.play();
}

// ---------------- Track detail panel ----------------

function renderTrackDetail(i) {
  const t = tracks[i];
  const host = document.getElementById("track-detail");
  host.innerHTML = "";
  const tmpl = document.getElementById("tmpl-track-detail");
  const node = tmpl.content.firstElementChild.cloneNode(true);
  node.dataset.track = i;
  node.querySelector(".track-title").textContent = t.name;
  host.appendChild(node);

  detailKnobs = {};
  currentWaveformCanvas = node.querySelector(".waveform");

  const sourceSelect = node.querySelector(".source-select");
  const demoSelect = node.querySelector(".demo-select");
  const fileInput = node.querySelector(".file-input");
  const loadBtn = node.querySelector(".load-btn");
  const recBtn = node.querySelector(".rec-btn");
  const overdubBtn = node.querySelector(".overdub-btn");
  const playBtn = node.querySelector(".play-btn");
  const clearBtn = node.querySelector(".clear-btn");
  const transportRow = node.querySelector(".transport-row");

  demoSelect.innerHTML = "";
  for (const [id, entry] of Object.entries(DEMO_SAMPLES)) {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = entry.label;
    demoSelect.appendChild(opt);
  }

  sourceSelect.value = t.sourceType;
  updateSourceUI();

  function updateSourceUI() {
    const src = sourceSelect.value;
    demoSelect.classList.toggle("hidden", src !== "demo");
    fileInput.classList.toggle("hidden", src !== "file");
    loadBtn.classList.toggle("hidden", src === "mic");
    transportRow.style.display = src === "mic" ? "" : "none";
  }

  sourceSelect.addEventListener("change", () => {
    t.sourceType = sourceSelect.value;
    updateSourceUI();
  });

  fileInput.addEventListener("change", () => {
    currentFileForTrack[i] = fileInput.files[0] || null;
  });

  loadBtn.addEventListener("click", async () => {
    if (sourceSelect.value === "file") {
      const file = currentFileForTrack[i];
      if (file) await t.loadFile(file);
    } else if (sourceSelect.value === "demo") {
      const name = demoSelect.value;
      const buf = await loadDemoSample(getContext(), name);
      await t.loadAudioBuffer(buf);
    }
  });

  recBtn.addEventListener("click", async () => {
    await toggleRecord(i);
  });
  overdubBtn.addEventListener("click", async () => {
    if (!t.hasContent) return;
    if (t.isRecording) t.stopRecord();
    else await t.startOverdub();
  });
  playBtn.addEventListener("click", () => togglePlay(i));
  clearBtn.addEventListener("click", () => t.clear());

  const filterTypeSelect = node.querySelector(".filter-type");
  filterTypeSelect.value = t.filterType;
  filterTypeSelect.addEventListener("change", () => t.setFilterType(filterTypeSelect.value));

  const lfoToggle = node.querySelector(".lfo-toggle");
  lfoToggle.checked = t.lfoEnabled;
  lfoToggle.addEventListener("change", () => t.setLfoEnabled(lfoToggle.checked));

  const freezeToggle = node.querySelector(".freeze-toggle");
  freezeToggle.checked = t.freezeEnabled;
  freezeToggle.addEventListener("change", () => t.setFreeze(freezeToggle.checked));

  node.querySelectorAll(".knob-slot[data-param]").forEach((slot) => {
    makeKnob(slot, i, slot.dataset.param, detailKnobs);
  });
}

// ---------------- Mix view ----------------

function renderMixView() {
  const grid = document.getElementById("mix-grid");
  grid.innerHTML = "";
  const tmpl = document.getElementById("tmpl-mix-strip");
  tracks.forEach((t, i) => {
    const node = tmpl.content.firstElementChild.cloneNode(true);
    node.dataset.track = i;
    node.querySelector(".mix-strip-name").textContent = t.name;
    mixKnobs[i] = {};
    node.querySelectorAll(".knob-slot[data-param]").forEach((slot) => {
      makeKnob(slot, i, slot.dataset.param, mixKnobs[i]);
    });
    node.querySelector(".mute").addEventListener("click", () => {
      trackFlags[i].userMuted = !trackFlags[i].userMuted;
      updateSoloMuteStates();
    });
    node.querySelector(".solo").addEventListener("click", () => {
      trackFlags[i].solo = !trackFlags[i].solo;
      updateSoloMuteStates();
    });
    grid.appendChild(node);
  });
}

// ---------------- Scenes ----------------

function renderScenes() {
  const grid = document.getElementById("scenes-grid");
  grid.innerHTML = "";
  const tmpl = document.getElementById("tmpl-scene-slot");
  for (let i = 0; i < SCENE_COUNT; i++) {
    const node = tmpl.content.firstElementChild.cloneNode(true);
    node.dataset.scene = i;
    node.querySelector(".scene-slot-name").textContent = `Scene ${i + 1}`;
    node.querySelector(".scene-save").addEventListener("click", () => {
      sceneManager.saveScene(i);
    });
    node.querySelector(".scene-recall").addEventListener("click", () => {
      if (sceneManager.recallScene(i)) {
        tracks.forEach((t, idx) => {
          trackFlags[idx].userMuted = t.isMuted;
        });
        updateSoloMuteStates();
        syncAllKnobVisuals();
        renderTrackDetail(focusedTrackIndex);
      }
    });
    grid.appendChild(node);
  }
}

// ---------------- View tabs ----------------

function bindViewTabs() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((tb) => tb.classList.remove("active"));
      tab.classList.add("active");
      document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
      document.getElementById(`view-${tab.dataset.view}`).classList.add("active");
    });
  });
}

// ---------------- Animation loop: meters, waveform, transport visuals ----------------

function formatTime(samples, rate) {
  const s = samples / rate;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function tick() {
  const rate = getContext() ? getContext().sampleRate : 44100;
  const buf = new Uint8Array(256);

  tracks.forEach((t, i) => {
    t.analyser.getByteTimeDomainData(buf);
    let peak = 0;
    for (let j = 0; j < buf.length; j++) peak = Math.max(peak, Math.abs(buf[j] - 128) / 128);
    const meterEl = document.querySelector(`.track-mini[data-track="${i}"] .mini-meter-fill`);
    if (meterEl) meterEl.style.height = `${Math.min(100, peak * 130)}%`;

    const miniEl = document.querySelector(`.track-mini[data-track="${i}"]`);
    if (miniEl) {
      const miniRec = miniEl.querySelector(".rec");
      miniRec.classList.toggle("armed", t.isRecording);
      miniRec.textContent = t.isRecording ? "■" : "●";
      miniEl.querySelector(".play").classList.toggle("active-state", t.isPlaying);
    }

    if (i === focusedTrackIndex) {
      const panel = document.querySelector(`.track-panel[data-track="${i}"]`);
      if (panel) {
        const recBtn = panel.querySelector(".rec-btn");
        recBtn.classList.toggle("armed", t.isRecording);
        recBtn.textContent = t.isRecording ? "Stop" : "Record";
        const overdubBtn = panel.querySelector(".overdub-btn");
        overdubBtn.classList.toggle("armed", t.isRecording);
        overdubBtn.textContent = t.isRecording ? "Stop" : "Overdub";
        panel.querySelector(".play-btn").classList.toggle("active-state", t.isPlaying);
        const status = t.lastStatus;
        const statusEl = panel.querySelector(".loop-status");
        if (status && status.lengthSet) {
          statusEl.textContent = `${formatTime(status.pos, rate)} / ${formatTime(status.length, rate)}`;
        } else if (t.isRecording) {
          statusEl.textContent = "recording…";
        } else {
          statusEl.textContent = "empty";
        }
      }
      drawWaveform(t);
    }
  });

  requestAnimationFrame(tick);
}

function drawWaveform(track) {
  if (!currentWaveformCanvas) return;
  const ctx2d = currentWaveformCanvas.getContext("2d");
  const w = currentWaveformCanvas.width;
  const h = currentWaveformCanvas.height;
  const data = new Uint8Array(track.analyser.fftSize);
  track.analyser.getByteTimeDomainData(data);

  ctx2d.clearRect(0, 0, w, h);
  ctx2d.strokeStyle = track.color.startsWith("var") ? getComputedColor(track.color) : track.color;
  ctx2d.lineWidth = 2;
  ctx2d.beginPath();
  const step = data.length / w;
  for (let x = 0; x < w; x++) {
    const v = data[Math.floor(x * step)] / 255;
    const y = v * h;
    if (x === 0) ctx2d.moveTo(x, y);
    else ctx2d.lineTo(x, y);
  }
  ctx2d.stroke();
}

let colorCache = {};
function getComputedColor(varExpr) {
  if (colorCache[varExpr]) return colorCache[varExpr];
  const name = varExpr.match(/--[a-z0-9-]+/)[0];
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  colorCache[varExpr] = value || "#6ea8ff";
  return colorCache[varExpr];
}

// ---------------- Boot ----------------

async function boot() {
  const ctx = await initAudioEngine();
  await resumeAudio();

  tracks = TRACK_NAMES.map((name, i) => {
    const t = new Track(ctx, i, TRACK_COLORS[i], name);
    t.onMacroApplied = (ids) => {
      ids.forEach((id) => {
        const norm = t.params[id];
        if (mixKnobs[i] && mixKnobs[i][id]) mixKnobs[i][id].setValue(norm, false);
        if (focusedTrackIndex === i && detailKnobs[id]) detailKnobs[id].setValue(norm, false);
      });
    };
    return t;
  });
  trackFlags = tracks.map(() => ({ userMuted: false, solo: false }));
  sceneManager = new SceneManager(tracks);

  renderTrackStrip();
  renderTrackDetail(0);
  renderMixView();
  renderScenes();
  bindViewTabs();

  const volumeSlider = document.getElementById("master-volume");
  const volumeValueEl = document.getElementById("master-volume-value");
  const applyVolume = () => {
    const v = Number(volumeSlider.value);
    setMasterVolume(v);
    volumeValueEl.textContent = Math.round(v * 100) + "%";
  };
  volumeSlider.addEventListener("input", applyVolume);
  applyVolume();

  document.getElementById("sync-btn").addEventListener("click", () => syncAllTracks());

  const speedSlider = document.getElementById("master-speed");
  const speedValueEl = document.getElementById("master-speed-value");
  const applySpeed = () => {
    const norm = Number(speedSlider.value);
    const rate = speedNormToRate(norm);
    setMasterPlaybackRate(rate);
    speedValueEl.textContent = rate.toFixed(2) + "x";
  };
  speedSlider.addEventListener("input", applySpeed);
  speedSlider.addEventListener("dblclick", () => {
    speedSlider.value = 0.5;
    applySpeed();
  });
  applySpeed();

  requestAnimationFrame(tick);
}

document.getElementById("start-btn").addEventListener("click", async () => {
  document.getElementById("start-overlay").classList.add("hidden");
  await boot();
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {
      /* offline support is best-effort */
    });
  });
}
