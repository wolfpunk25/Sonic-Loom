// Shared AudioContext, master bus, mic access and sync — one instance for the whole app.
let ctx = null;
let masterGain = null;
let micStreamPromise = null;
const tracks = [];

export async function initAudioEngine() {
  if (ctx) return ctx;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  await ctx.audioWorklet.addModule("js/tape-worklet.js");
  await ctx.audioWorklet.addModule("js/granular.js");
  masterGain = ctx.createGain();
  masterGain.gain.value = 0.9;
  masterGain.connect(ctx.destination);
  return ctx;
}

export function getContext() {
  return ctx;
}

export function getMasterGain() {
  return masterGain;
}

export async function resumeAudio() {
  if (ctx && ctx.state === "suspended") {
    await ctx.resume();
  }
}

// The slider's 0-100% still maps onto this range — doubled so the top of
// the slider isn't capped at unity gain (the whole mix was too quiet).
const MASTER_GAIN_BOOST = 2;

export function setMasterVolume(v) {
  if (masterGain) masterGain.gain.setTargetAtTime(v * MASTER_GAIN_BOOST, ctx.currentTime, 0.02);
}

export async function getMicStream() {
  if (!micStreamPromise) {
    micStreamPromise = navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
  }
  return micStreamPromise;
}

export function registerTrack(track) {
  tracks.push(track);
}

export function syncAllTracks() {
  for (const t of tracks) t.seekToStart();
}

export function setMasterPlaybackRate(rate) {
  for (const t of tracks) t.setPlaybackRate(rate);
}
