// Builders for the Filter / Color / Space stages, plus a procedurally
// generated reverb impulse response (no IR audio file needed).

export function makeImpulseResponse(ctx, durationSec = 2.2, decay = 3.2) {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * durationSec);
  const impulse = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      const t = i / length;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
    }
  }
  return impulse;
}

function makeDriveCurve(amount) {
  const n = 1024;
  const curve = new Float32Array(n);
  const k = amount * 100;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return curve;
}

export function buildFilterStage(ctx) {
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 8000;
  filter.Q.value = 0.7;

  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 1.5;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = 0; // off until enabled
  lfo.connect(lfoDepth);
  lfoDepth.connect(filter.frequency);
  lfo.start();

  return { filter, lfo, lfoDepth };
}

export function buildColorStage(ctx) {
  const shaper = ctx.createWaveShaper();
  shaper.curve = makeDriveCurve(0);
  shaper.oversample = "2x";

  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 12000;

  shaper.connect(tone);

  return {
    input: shaper,
    output: tone,
    setDrive(amount) {
      shaper.curve = makeDriveCurve(amount);
    },
    tone,
  };
}

export function buildSpaceStage(ctx) {
  const input = ctx.createGain();

  const delay = ctx.createDelay(2.0);
  delay.delayTime.value = 0.25;
  const delayFeedback = ctx.createGain();
  delayFeedback.gain.value = 0.3;
  const delayWet = ctx.createGain();
  delayWet.gain.value = 0.0;

  input.connect(delay);
  delay.connect(delayFeedback);
  delayFeedback.connect(delay);
  delay.connect(delayWet);

  const convolver = ctx.createConvolver();
  convolver.buffer = makeImpulseResponse(ctx);
  const reverbWet = ctx.createGain();
  reverbWet.gain.value = 0.0;

  input.connect(convolver);
  convolver.connect(reverbWet);

  const dry = ctx.createGain();
  dry.gain.value = 1.0;
  input.connect(dry);

  const output = ctx.createGain();
  dry.connect(output);
  delayWet.connect(output);
  reverbWet.connect(output);

  return {
    input,
    output,
    delay,
    delayFeedback,
    delayWet,
    reverbWet,
    setFreeze(on) {
      delayFeedback.gain.setTargetAtTime(on ? 0.98 : 0.3, ctx.currentTime, 0.05);
    },
  };
}
