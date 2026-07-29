#!/usr/bin/env python3
"""One-time generator for bundled demo samples. Pure stdlib, no dependencies,
no external audio -- everything is synthesized so there's no licensing question.

Run: python3 scripts/generate-samples.py
"""
import math
import os
import struct
import wave

SAMPLE_RATE = 44100
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "assets", "samples")


def write_wav(filename, samples):
    path = os.path.join(OUT_DIR, filename)
    os.makedirs(OUT_DIR, exist_ok=True)
    with wave.open(path, "w") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(SAMPLE_RATE)
        frames = b"".join(
            struct.pack("<h", int(max(-1.0, min(1.0, s)) * 32767)) for s in samples
        )
        f.writeframes(frames)
    print(f"wrote {filename} ({len(samples) / SAMPLE_RATE:.2f}s)")


def fade_edges(samples, fade_samples):
    n = len(samples)
    for i in range(fade_samples):
        g = i / fade_samples
        samples[i] *= g
        samples[n - 1 - i] *= g
    return samples


def make_rng(seed):
    state = [seed]

    def rng():
        state[0] = (state[0] * 1664525 + 1013904223) & 0xFFFFFFFF
        return state[0] / 4294967296

    return rng


def gen_kick():
    dur = 0.4
    n = int(SAMPLE_RATE * dur)
    out = [0.0] * n
    rng = make_rng(1)
    for i in range(n):
        t = i / SAMPLE_RATE
        env = math.exp(-t * 9)
        freq = 150 * math.exp(-t * 18) + 40
        tone = math.sin(2 * math.pi * freq * t)
        click = (rng() * 2 - 1) * (1 - t / 0.004) if t < 0.004 else 0
        out[i] = tone * env * 0.9 + click * 0.5
    return fade_edges(out, 64)


def gen_hat():
    dur = 0.18
    n = int(SAMPLE_RATE * dur)
    out = [0.0] * n
    rng = make_rng(2)
    prev = 0.0
    for i in range(n):
        t = i / SAMPLE_RATE
        env = math.exp(-t * 26)
        noise = rng() * 2 - 1
        hp = noise - prev  # crude high-pass via differentiation
        prev = noise
        out[i] = hp * env * 0.8
    return fade_edges(out, 32)


def gen_pluck():
    dur = 0.9
    n = int(SAMPLE_RATE * dur)
    out = [0.0] * n
    fundamental = 220  # A3
    harmonics = [1, 2, 3, 4.01, 5.02]
    amps = [1, 0.5, 0.28, 0.14, 0.08]
    for i in range(n):
        t = i / SAMPLE_RATE
        env = math.exp(-t * 4.2)
        s = 0.0
        for h, a in zip(harmonics, amps):
            s += a * math.sin(2 * math.pi * fundamental * h * t)
        out[i] = s * env * 0.35
    return fade_edges(out, 64)


def gen_pad():
    dur = 2.4
    n = int(SAMPLE_RATE * dur)
    out = [0.0] * n
    freqs = [220, 261.63, 329.63, 440]  # A minor-ish: A3 C4 E4 A4
    amps = [0.3, 0.25, 0.22, 0.15]
    for i in range(n):
        t = i / SAMPLE_RATE
        attack = min(1.0, t / 0.5)
        release = min(1.0, (dur - t) / 0.5)
        env = min(attack, release)
        s = 0.0
        for f, a in zip(freqs, amps):
            s += a * math.sin(2 * math.pi * f * t + math.sin(t * 0.7) * 0.02)
        out[i] = s * env * 0.6
    return fade_edges(out, 128)


if __name__ == "__main__":
    write_wav("kick.wav", gen_kick())
    write_wav("hat.wav", gen_hat())
    write_wav("pluck.wav", gen_pluck())
    write_wav("pad.wav", gen_pad())
