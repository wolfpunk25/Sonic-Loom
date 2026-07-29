export const DEMO_SAMPLES = {
  kick: "assets/samples/kick.wav",
  hat: "assets/samples/hat.wav",
  pluck: "assets/samples/pluck.wav",
  pad: "assets/samples/pad.wav",
};

const cache = new Map();

export async function loadDemoSample(ctx, name) {
  if (cache.has(name)) return cache.get(name);
  const url = DEMO_SAMPLES[name];
  const res = await fetch(url);
  const arrayBuffer = await res.arrayBuffer();
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
  cache.set(name, audioBuffer);
  return audioBuffer;
}
