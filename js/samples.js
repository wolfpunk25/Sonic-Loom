// id -> { label, file }. `file` is the filename inside assets/samples/.
// The demo-select dropdown in the UI is generated from this list (see app.js).
export const DEMO_SAMPLES = {
  bassArp1: { label: "Bass Arp 1", file: "Bass arp 1.wav" },
  bassArp3: { label: "Bass Arp 3", file: "Bass arp 3.wav" },
  bell1: { label: "Bell 1", file: "Bell 1.wav" },
  bell2: { label: "Bell 2", file: "Bell 2.wav" },
  bell3: { label: "Bell 3", file: "Bell 3.wav" },
  bottle: { label: "Bottle", file: "Bottle.wav" },
  buzz: { label: "Buzz", file: "Buzz.wav" },
  capybara: { label: "Capybara", file: "Capybara.wav" },
  clockArp: { label: "Clock Arp", file: "Clock arp.wav" },
  deepSpace: { label: "Deep Space", file: "Deep space.wav" },
  drone1: { label: "Drone 1", file: "Drone 1.wav" },
  drone2: { label: "Drone 2", file: "Drone 2.wav" },
  drone3: { label: "Drone 3", file: "Drone 3.wav" },
  drumBubble: { label: "Drum Bubble", file: "Drum bubble.wav" },
  drumLoop1: { label: "Drum Loop 1", file: "Drum loop 1.wav" },
  drumLoop2: { label: "Drum Loop 2", file: "Drum loop 2.wav" },
  drumLoop3: { label: "Drum Loop 3", file: "Drum loop 3.wav" },
  fairlight: { label: "Fairlight", file: "Fairlight.wav" },
  flute: { label: "Flute", file: "Flute.wav" },
  forest: { label: "Forest", file: "Forest.wav" },
  galaxy: { label: "Galaxy", file: "Galaxy.mp3" },
  hat: { label: "Hat", file: "hat.wav" },
  icyCrystals: { label: "Icy Crystals", file: "Icy Crystals.mp3" },
  kick: { label: "Kick", file: "kick.wav" },
  metalRain: { label: "Metal Rain", file: "Metal rain.wav" },
  neuromorph: { label: "Neuromorph", file: "Neuromorph.wav" },
  night: { label: "Night", file: "Night.wav" },
  pad1: { label: "Pad 1", file: "pad 1.wav" },
  pad2: { label: "Pad 2", file: "Pad 2.wav" },
  pad3: { label: "Pad 3", file: "Pad 3.wav" },
  pluck: { label: "Pluck", file: "pluck.wav" },
  substantial: { label: "Substantial", file: "Substantial.mp3" },
  synth1: { label: "Synth 1", file: "Synth 1.wav" },
  synth2: { label: "Synth 2", file: "Synth 2.wav" },
  time: { label: "Time", file: "Time.wav" },
  transporter: { label: "Transporter", file: "Transporter.mp3" },
  unstable: { label: "Unstable", file: "Unstable.mp3" },
  valkerie: { label: "Valkerie", file: "Valkerie.wav" },
  vista: { label: "Vista", file: "Vista.wav" },
  whir: { label: "Whir", file: "Whir.mp3" },
  windChimes1: { label: "Wind Chimes 1", file: "Wind chimes 1.wav" },
  windChimes2: { label: "Wind Chimes 2", file: "Wind chimes 2.wav" },
  wobble: { label: "Wobble", file: "Wobble.wav" },
  wow: { label: "Wow", file: "Wow.wav" },
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
