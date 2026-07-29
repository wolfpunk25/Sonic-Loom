import { getMicStream, getMasterGain, registerTrack } from "./audio-engine.js";
import { buildFilterStage, buildColorStage, buildSpaceStage } from "./effects.js";

const PARAM_RANGES = {
  grainSize: [0.01, 0.4],
  grainSpray: [0, 0.5],
  grainDensity: [0, 1],
  grainMix: [0, 1],
  filterFreq: [40, 12000],
  filterQ: [0.1, 15],
  lfoRate: [0.05, 8],
  lfoDepth: [0, 1],
  drive: [0, 1],
  tone: [200, 15000],
  delayTime: [0.02, 1.0],
  delayFeedback: [0, 0.92],
  reverbAmount: [0, 1],
  macro: [0, 1],
  volume: [0, 1],
  pan: [-1, 1],
};

const DEFAULT_PARAMS = {
  grainSize: 0.35,
  grainSpray: 0.4,
  grainDensity: 0.3,
  grainMix: 0,
  filterFreq: 1.0,
  filterQ: 0.1,
  lfoRate: 0.3,
  lfoDepth: 0,
  drive: 0,
  tone: 1.0,
  delayTime: 0.3,
  delayFeedback: 0.35,
  reverbAmount: 0,
  macro: 0,
  volume: 0.8,
  pan: 0.5, // 0.5 => center after mapping to [-1,1]
};

function lerp(norm, [lo, hi], log = false) {
  if (log) {
    const a = Math.log(lo);
    const b = Math.log(hi);
    return Math.exp(a + (b - a) * norm);
  }
  return lo + (hi - lo) * norm;
}

const LOG_PARAMS = new Set(["filterFreq", "tone"]);

export class Track {
  constructor(ctx, index, color, name) {
    this.ctx = ctx;
    this.index = index;
    this.color = color;
    this.name = name;

    this.hasContent = false;
    this.isRecording = false;
    this.isOverdub = false;
    this.isPlaying = false;
    this.isMuted = false;
    this.isSolo = false;
    this.sourceType = "mic";
    this.filterType = "lowpass";
    this.lfoEnabled = false;
    this.freezeEnabled = false;
    this.prevVolumeNorm = DEFAULT_PARAMS.volume;

    this.params = { ...DEFAULT_PARAMS };

    this.micSource = null;

    this.tapeNode = new AudioWorkletNode(ctx, "tape-processor", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 2,
      outputChannelCount: [2],
    });
    this.tapeNode.port.onmessage = (e) => this._onTapeStatus(e.data);

    this.granularNode = new AudioWorkletNode(ctx, "granular-processor", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 2,
      outputChannelCount: [2],
    });

    this.filterStage = buildFilterStage(ctx);
    this.colorStage = buildColorStage(ctx);
    this.spaceStage = buildSpaceStage(ctx);

    this.panNode = ctx.createStereoPanner();
    this.volumeGain = ctx.createGain();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;

    // signal chain: tape -> granular -> filter -> color -> space -> pan -> volume -> analyser -> master
    this.tapeNode.connect(this.granularNode);
    this.granularNode.connect(this.filterStage.filter);
    this.filterStage.filter.connect(this.colorStage.input);
    this.colorStage.output.connect(this.spaceStage.input);
    this.spaceStage.output.connect(this.panNode);
    this.panNode.connect(this.volumeGain);
    this.volumeGain.connect(this.analyser);
    this.analyser.connect(getMasterGain());

    // apply defaults
    for (const id of Object.keys(this.params)) this.setParam(id, this.params[id], true);

    registerTrack(this);
  }

  _onTapeStatus(status) {
    this.lastStatus = status;
    this.hasContent = status.lengthSet;
    this.isPlaying = status.playing;
    this.isRecording = status.recording;
  }

  // ---- params ----
  setParam(id, norm, initial = false) {
    norm = Math.max(0, Math.min(1, norm));
    this.params[id] = norm;
    const range = PARAM_RANGES[id];
    const real = id === "pan" ? lerp(norm, [-1, 1]) : lerp(norm, range, LOG_PARAMS.has(id));
    const now = this.ctx.currentTime;
    const smooth = initial ? 0 : 0.03;

    switch (id) {
      case "grainSize":
        this.granularNode.port.postMessage({ grainSize: real });
        break;
      case "grainSpray":
        this.granularNode.port.postMessage({ spray: real });
        break;
      case "grainDensity":
        this.granularNode.port.postMessage({ density: real });
        break;
      case "grainMix":
        this.granularNode.port.postMessage({ mix: real });
        break;
      case "filterFreq":
        this.filterStage.filter.frequency.setTargetAtTime(real, now, smooth);
        break;
      case "filterQ":
        this.filterStage.filter.Q.setTargetAtTime(real, now, smooth);
        break;
      case "lfoRate":
        this.filterStage.lfo.frequency.setTargetAtTime(real, now, smooth);
        break;
      case "lfoDepth":
        this._lfoDepthNorm = real;
        this._applyLfoDepth();
        break;
      case "drive":
        this.colorStage.setDrive(real);
        break;
      case "tone":
        this.colorStage.tone.frequency.setTargetAtTime(real, now, smooth);
        break;
      case "delayTime":
        this.spaceStage.delay.delayTime.setTargetAtTime(real, now, smooth);
        break;
      case "delayFeedback":
        if (!this.freezeEnabled) this.spaceStage.delayFeedback.gain.setTargetAtTime(real, now, smooth);
        this._baseDelayFeedback = real;
        this.spaceStage.delayWet.gain.setTargetAtTime(0.5, now, smooth);
        break;
      case "reverbAmount":
        this.spaceStage.reverbWet.gain.setTargetAtTime(real, now, smooth);
        break;
      case "volume":
        if (!this.isMuted) this.volumeGain.gain.setTargetAtTime(real, now, smooth);
        this.prevVolumeNorm = norm;
        break;
      case "pan":
        this.panNode.pan.setTargetAtTime(real, now, smooth);
        break;
      case "macro":
        this._applyMacro(norm);
        break;
    }
  }

  _applyLfoDepth() {
    const depthHz = this.lfoEnabled ? this._lfoDepthNorm * 4000 : 0;
    this.filterStage.lfoDepth.gain.setTargetAtTime(depthHz, this.ctx.currentTime, 0.05);
  }

  setLfoEnabled(on) {
    this.lfoEnabled = on;
    this._applyLfoDepth();
  }

  setFilterType(type) {
    this.filterType = type;
    this.filterStage.filter.type = type;
  }

  setFreeze(on) {
    this.freezeEnabled = on;
    this.spaceStage.setFreeze(on);
    if (!on) {
      this.spaceStage.delayFeedback.gain.setTargetAtTime(
        this._baseDelayFeedback ?? 0.35,
        this.ctx.currentTime,
        0.05
      );
    }
  }

  // Macro sweeps grain mix, filter cutoff and reverb send together, and
  // reports back which knob UIs should refresh to reflect the change.
  _applyMacro(norm) {
    const grainMix = norm * 0.6;
    const filterFreq = 0.15 + norm * 0.85;
    const reverbAmount = norm * 0.5;
    this.params.grainMix = grainMix;
    this.params.filterFreq = filterFreq;
    this.params.reverbAmount = reverbAmount;
    this.setParam("grainMix", grainMix);
    this.setParam("filterFreq", filterFreq);
    this.setParam("reverbAmount", reverbAmount);
    if (this.onMacroApplied) {
      this.onMacroApplied(["grainMix", "filterFreq", "reverbAmount"]);
    }
  }

  setMuted(muted) {
    this.isMuted = muted;
    const target = muted ? 0 : lerp(this.prevVolumeNorm, PARAM_RANGES.volume);
    this.volumeGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.03);
  }

  // ---- transport ----
  async _ensureMic() {
    if (this.micSource) return;
    const stream = await getMicStream();
    this.micSource = this.ctx.createMediaStreamSource(stream);
    this.micSource.connect(this.tapeNode);
  }

  async startRecord() {
    if (this.sourceType !== "mic") return;
    try {
      await this._ensureMic();
    } catch {
      return; // mic permission denied/unavailable — leave track untouched
    }
    this.tapeNode.port.postMessage({ type: "clear" });
    this.tapeNode.port.postMessage({ type: "start-record" });
    this.isRecording = true;
  }

  async startOverdub() {
    if (this.sourceType !== "mic" || !this.hasContent) return;
    try {
      await this._ensureMic();
    } catch {
      return;
    }
    this.tapeNode.port.postMessage({ type: "start-record" });
    this.isRecording = true;
  }

  stopRecord() {
    this.tapeNode.port.postMessage({ type: "stop-record" });
    this.isRecording = false;
  }

  play() {
    this.tapeNode.port.postMessage({ type: "play" });
  }

  stop() {
    this.tapeNode.port.postMessage({ type: "stop" });
  }

  clear() {
    this.tapeNode.port.postMessage({ type: "clear" });
    this.hasContent = false;
  }

  seekToStart() {
    this.tapeNode.port.postMessage({ type: "seek" });
  }

  async loadAudioBuffer(audioBuffer) {
    const len = audioBuffer.length;
    const chL = audioBuffer.getChannelData(0).slice();
    const chR = (audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : audioBuffer.getChannelData(0)).slice();
    this.tapeNode.port.postMessage(
      { type: "load-buffer", length: len, channelData: [chL, chR] },
      [chL.buffer, chR.buffer]
    );
    this.hasContent = true;
    this.isPlaying = true;
  }

  async loadFile(file) {
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
    await this.loadAudioBuffer(audioBuffer);
  }

  // ---- scenes ----
  snapshotState() {
    return {
      params: { ...this.params },
      filterType: this.filterType,
      lfoEnabled: this.lfoEnabled,
      freezeEnabled: this.freezeEnabled,
      isMuted: this.isMuted,
    };
  }

  applySnapshot(snap) {
    if (!snap) return;
    this.setFilterType(snap.filterType || "lowpass");
    this.setLfoEnabled(!!snap.lfoEnabled);
    this.setFreeze(!!snap.freezeEnabled);
    this.setMuted(!!snap.isMuted);
    for (const [id, norm] of Object.entries(snap.params || {})) {
      this.params[id] = norm;
      // "macro" is a meta-control that derives/overwrites grainMix, filterFreq and
      // reverbAmount when set live — replaying it here would clobber those params'
      // own saved values, so just restore its display value without re-deriving.
      if (id === "macro") continue;
      this.setParam(id, norm);
    }
  }
}

export { PARAM_RANGES, DEFAULT_PARAMS };
