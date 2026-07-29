// AudioWorkletProcessor implementing a single tape-style loop track:
// first pass records a loop of arbitrary length, subsequent passes overdub
// on top of it while it keeps playing, like a hardware looper/tape machine.
class TapeProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.maxSamples = Math.floor(sampleRate * 30); // 30s cap per track
    this.bufL = new Float32Array(this.maxSamples);
    this.bufR = new Float32Array(this.maxSamples);
    this.length = 0;
    this.lengthSet = false;
    this.pos = 0;
    this.recording = false;
    this.firstPass = false;
    this.playing = false;
    this._statusCounter = 0;

    this.port.onmessage = (e) => this.handleMessage(e.data);
  }

  handleMessage(msg) {
    switch (msg.type) {
      case "start-record":
        this.firstPass = !this.lengthSet;
        if (this.firstPass) this.pos = 0;
        this.recording = true;
        this.playing = true;
        break;
      case "stop-record":
        this.recording = false;
        if (this.firstPass) {
          this.length = Math.max(1, this.pos);
          this.lengthSet = true;
          this.firstPass = false;
          this.pos = 0;
        }
        break;
      case "play":
        if (this.lengthSet) this.playing = true;
        break;
      case "stop":
        this.playing = false;
        this.recording = false;
        break;
      case "clear":
        this.bufL.fill(0);
        this.bufR.fill(0);
        this.length = 0;
        this.lengthSet = false;
        this.pos = 0;
        this.playing = false;
        this.recording = false;
        this.firstPass = false;
        break;
      case "seek":
        this.pos = 0;
        break;
      case "load-buffer": {
        const len = Math.min(msg.length, this.maxSamples);
        this.bufL.fill(0);
        this.bufR.fill(0);
        this.bufL.set(msg.channelData[0].subarray(0, len));
        this.bufR.set(msg.channelData[1].subarray(0, len));
        this.length = len;
        this.lengthSet = true;
        this.pos = 0;
        this.playing = true;
        this.recording = false;
        this.firstPass = false;
        break;
      }
    }
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    const outL = output[0];
    const outR = output[1];
    const inL = input && input[0];
    const inR = (input && input[1]) || inL;
    const n = outL.length;

    for (let i = 0; i < n; i++) {
      const sIn = inL ? inL[i] : 0;
      const sInR = inR ? inR[i] : sIn;

      let existingL = 0;
      let existingR = 0;
      if (this.lengthSet && (this.playing || this.recording)) {
        existingL = this.bufL[this.pos];
        existingR = this.bufR[this.pos];
      }

      let oL = existingL;
      let oR = existingR;

      if (this.recording) {
        if (this.firstPass) {
          if (this.pos < this.maxSamples) {
            this.bufL[this.pos] = sIn;
            this.bufR[this.pos] = sInR;
          }
          oL = sIn;
          oR = sInR;
        } else if (this.lengthSet) {
          const decay = 0.97; // gentle decay keeps repeated overdubs from piling up forever
          const newL = existingL * decay + sIn;
          const newR = existingR * decay + sInR;
          this.bufL[this.pos] = newL;
          this.bufR[this.pos] = newR;
          oL = newL;
          oR = newR;
        }
      }

      outL[i] = oL;
      if (outR) outR[i] = oR;

      if (this.recording || this.playing) {
        this.pos++;
        if (this.lengthSet) {
          if (this.pos >= this.length) this.pos = 0;
        } else if (this.pos >= this.maxSamples) {
          this.pos = this.maxSamples - 1;
        }
      }
    }

    this._statusCounter++;
    if (this._statusCounter >= 10) {
      this._statusCounter = 0;
      this.port.postMessage({
        pos: this.pos,
        length: this.length,
        lengthSet: this.lengthSet,
        recording: this.recording,
        playing: this.playing,
      });
    }

    return true;
  }
}

registerProcessor("tape-processor", TapeProcessor);
