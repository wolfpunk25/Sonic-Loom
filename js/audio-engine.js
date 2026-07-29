// Shared AudioContext, master bus + master FX chain, mic access and sync — one instance for the whole app.
import { buildFilterStage, buildColorStage, buildCrushStage, buildSpaceStage } from "./effects.js";

let ctx = null;
let masterBus = null; // all tracks sum together here (pre-FX)
let masterFilterStage = null;
let masterColorStage = null;
let masterCrushStage = null;
let masterSpaceStage = null;
let masterGain = null; // final volume stage (post-FX)
let micStreamPromise = null;
const tracks = [];

export async function initAudioEngine() {
  if (ctx) return ctx;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  await ctx.audioWorklet.addModule("js/tape-worklet.js");
  await ctx.audioWorklet.addModule("js/granular.js");

  masterBus = ctx.createGain();
  masterBus.gain.value = 1;

  masterFilterStage = buildFilterStage(ctx);
  masterFilterStage.filter.frequency.value = 20000; // wide open until you turn the knob
  masterFilterStage.filter.Q.value = 0.7;

  masterColorStage = buildColorStage(ctx); // drive defaults to 0 (bypassed)
  masterCrushStage = buildCrushStage(ctx); // defaults to 0 (transparent)
  masterSpaceStage = buildSpaceStage(ctx); // reverb/delay wet default to 0 (bypassed)

  masterGain = ctx.createGain();
  masterGain.gain.value = 0.9;

  masterBus.connect(masterFilterStage.filter);
  masterFilterStage.filter.connect(masterColorStage.input);
  masterColorStage.output.connect(masterCrushStage.input);
  masterCrushStage.output.connect(masterSpaceStage.input);
  masterSpaceStage.output.connect(masterGain);
  masterGain.connect(ctx.destination);

  return ctx;
}

export function getContext() {
  return ctx;
}

export function getMasterBus() {
  return masterBus;
}

export function getMasterGain() {
  return masterGain;
}

export function getMasterFilterStage() {
  return masterFilterStage;
}

export function getMasterColorStage() {
  return masterColorStage;
}

export function getMasterCrushStage() {
  return masterCrushStage;
}

export function getMasterSpaceStage() {
  return masterSpaceStage;
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

export function playAllTracks() {
  for (const t of tracks) if (t.hasContent) t.play();
}

export function stopAllTracks() {
  for (const t of tracks) t.stop();
}
