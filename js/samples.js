// id -> { label, file }. `file` is the filename inside assets/samples/.
// The demo-select dropdown in the UI is generated from this list (see app.js).
export const DEMO_SAMPLES = {
  kick: { label: "Kick", file: "kick.wav" },
  hat: { label: "Hat", file: "hat.wav" },
  pluck: { label: "Pluck", file: "pluck.wav" },
  pad: { label: "Pad loop", file: "pad.wav" },
  drums01: { label: "Drums 01", file: "92_Drums_01_639.wav" },
  clock: { label: "Clock", file: "CLOCK.wav" },
  droneProbeA: { label: "Drone Probe A", file: "DRONE PROBE A.wav" },
  galaxyMelody: { label: "Galaxy Melody", file: "GALAXY MELODY.mp3" },
  icyCrystals: { label: "Icy Crystals Synth", file: "Icy Crystals Synth.mp3" },
  kingfmForest: { label: "KingFM Forest", file: "KingFM FOREST.wav" },
  kingfmTime: { label: "KingFM Time", file: "KingFM TIME.wav" },
  kingfmValkerie2: { label: "KingFM Valkerie 2", file: "KingFM VALKERIE 2.wav" },
  sagaBuzz: { label: "Saga Buzz", file: "SAGA BUZZ.wav" },
  sagaVista: { label: "Saga Vista", file: "SAGA VISTA.wav" },
  sagaWow: { label: "Saga Wow", file: "SAGA WOW.wav" },
  substantialD: { label: "Substantial D", file: "SUBSTANTIAL D.mp3" },
  transporterLead: { label: "Transporter Synth Lead", file: "Transporter Synth Lead.mp3" },
  unstableG: { label: "Unstable G", file: "UNSTABLE G.mp3" },
  whirE: { label: "Whir E", file: "WHIR E.mp3" },
};

const cache = new Map();

export async function loadDemoSample(ctx, id) {
  if (cache.has(id)) return cache.get(id);
  const entry = DEMO_SAMPLES[id];
  const url = "assets/samples/" + encodeURIComponent(entry.file);
  const res = await fetch(url);
  const arrayBuffer = await res.arrayBuffer();
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
  cache.set(id, audioBuffer);
  return audioBuffer;
}
