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
  // Squared mapping: a linear amount*100 map crammed the entire usable range
  // into the first few percent of the knob (2% already sounded overdriven,
  // and 10%-100% barely differed).
  const k = amount * amount * 25;
  const shape = (x) => ((1 + k) * x) / (1 + k * Math.abs(x));

  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = shape(x);
  }

  // This curve has ~(1+k) small-signal gain baked in, so turning drive up used
  // to dump a big level jump into the bus on top of the distortion — which read
  // as "overloaded" rather than "driven". Measure the level change on a
  // reference tone and normalise it out, so the knob changes character only.
  const REF_AMP = 0.5;
  const STEPS = 512;
  let inSq = 0;
  let outSq = 0;
  for (let i = 0; i < STEPS; i++) {
    const x = REF_AMP * Math.sin((2 * Math.PI * i) / STEPS);
    inSq += x * x;
    outSq += shape(x) ** 2;
  }
  const makeup = outSq > 0 ? Math.sqrt(inSq / outSq) : 1;
  for (let i = 0; i < n; i++) curve[i] *= makeup;

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

// Bit-depth reduction as a staircase transfer curve. amount 0 => effectively
// transparent (16-bit), 1 => 2-bit and very gnarly.
function makeCrushCurve(amount) {
  const n = 2048;
  const curve = new Float32Array(n);
  const bits = 16 - amount * 14;
  const levels = Math.pow(2, bits);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.round(x * levels) / levels;
  }
  return curve;
}

export function buildCrushStage(ctx) {
  const shaper = ctx.createWaveShaper();
  shaper.curve = makeCrushCurve(0);
  // Deliberately no oversampling — it would smooth out the hard steps that are
  // the whole point of the effect.
  shaper.oversample = "none";

  return {
    input: shaper,
    output: shaper,
    setAmount(amount) {
      shaper.curve = makeCrushCurve(amount);
    },
  };
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
