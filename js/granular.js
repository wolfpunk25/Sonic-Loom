// AudioWorkletProcessor for a simplified granular texture effect ("Mosaic"-inspired).
// Continuously records its input into a rolling ring buffer, then spawns short
// overlapping grains sampled from recent history (size/spray/density controllable).
const VOICES = 8;
const RING_SECONDS = 2.0;

class GranularProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.capacity = Math.floor(sampleRate * RING_SECONDS);
    this.ringL = new Float32Array(this.capacity);
    this.ringR = new Float32Array(this.capacity);
    this.writePos = 0;

    this.grainSize = Math.floor(sampleRate * 0.08);
    this.spray = Math.floor(sampleRate * 0.15);
    this.density = 0.3;
    this.mix = 0.0;

    this.spawnCounter = 0;
    this.voices = Array.from({ length: VOICES }, () => ({
      active: false,
      readPos: 0,
      age: 0,
      length: 1,
    }));
    this.nextVoice = 0;

    this.port.onmessage = (e) => {
      const p = e.data;
      if (p.grainSize !== undefined) this.grainSize = Math.max(256, Math.floor(sampleRate * p.grainSize));
      if (p.spray !== undefined) this.spray = Math.max(0, Math.floor(sampleRate * p.spray));
      if (p.density !== undefined) this.density = Math.min(1, Math.max(0, p.density));
      if (p.mix !== undefined) this.mix = Math.min(1, Math.max(0, p.mix));
    };
  }

  spawnGrain() {
    const voice = this.voices[this.nextVoice];
    this.nextVoice = (this.nextVoice + 1) % VOICES;
    const offset = this.grainSize + Math.floor(Math.random() * (this.spray + 1));
    voice.readPos = (this.writePos - offset + this.capacity * 4) % this.capacity;
    voice.length = this.grainSize;
    voice.age = 0;
    voice.active = true;
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    const outL = output[0];
    const outR = output[1];
    const inL = input && input[0];
    const inR = (input && input[1]) || inL;
    const n = outL.length;

    // spawn interval shrinks as density rises (more overlap)
    const spawnInterval = Math.max(32, Math.floor(this.grainSize * (1.05 - this.density * 0.9)));

    for (let i = 0; i < n; i++) {
      const dryL = inL ? inL[i] : 0;
      const dryR = inR ? inR[i] : dryL;

      this.ringL[this.writePos] = dryL;
      this.ringR[this.writePos] = dryR;

      this.spawnCounter++;
      if (this.spawnCounter >= spawnInterval && this.mix > 0.001) {
        this.spawnCounter = 0;
        this.spawnGrain();
      }

      let grainL = 0;
      let grainR = 0;
      let activeCount = 0;
      for (const voice of this.voices) {
        if (!voice.active) continue;
        const win = 0.5 * (1 - Math.cos((2 * Math.PI * voice.age) / voice.length));
        grainL += this.ringL[voice.readPos] * win;
        grainR += this.ringR[voice.readPos] * win;
        voice.readPos = (voice.readPos + 1) % this.capacity;
        voice.age++;
        activeCount++;
        if (voice.age >= voice.length) voice.active = false;
      }
      const norm = activeCount > 0 ? 1 / Math.sqrt(activeCount) : 0;
      grainL *= norm;
      grainR *= norm;

      outL[i] = dryL * (1 - this.mix) + grainL * this.mix;
      if (outR) outR[i] = dryR * (1 - this.mix) + grainR * this.mix;

      this.writePos = (this.writePos + 1) % this.capacity;
    }

    return true;
  }
}

registerProcessor("granular-processor", GranularProcessor);
