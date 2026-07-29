# Sonic Loom

A 4-track tape looper and sound sculptor, inspired by the [Torso Electronics S4](https://torsoelectronics.com/s4). Built as an installable PWA with plain HTML/CSS/JS and the Web Audio API — no build step, no dependencies.

Each track is a live loop with its own effects chain: **Granular** (a simplified texture/grain effect) → **Filter** (LP/HP/BP with an optional LFO) → **Color** (drive/tone) → **Space** (delay + reverb, with freeze). A per-track **Macro** knob sweeps several of those at once, and 4 **Scenes** capture/recall the full control state across all tracks.

## Using it

- **Record**: pick Microphone as the source and hit Record. The first take sets the loop length; hit Record again to stop. Overdub layers more on top of the existing loop.
- **Import file / Demo sample**: load your own audio, or one of the bundled synthesized samples (kick/hat/pluck/pad), as the starting loop content instead of recording.
- **Sync**: resets all 4 tracks' playheads to the same point, for a rough phase-align across free-running loops.
- **Mix / Scenes** tabs: balance all 4 tracks at once, or snapshot/recall the whole control state.

## Running locally

Needs to be served over HTTP (ES modules + AudioWorklet won't load from `file://`):

```bash
python3 -m http.server 8765
```

Then open `http://localhost:8765`. Microphone recording and the installed PWA (service worker) both require a secure context — `localhost` counts, as does the HTTPS GitHub Pages gives you once deployed.

## Regenerating the demo samples

The bundled WAVs in `assets/samples/` are synthesized (no external audio, so no licensing question). Regenerate them with:

```bash
python3 scripts/generate-samples.py
```

## Installing on iPad

Once deployed to GitHub Pages, open the URL in Safari, tap Share, then **Add to Home Screen**.
