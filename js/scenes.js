const STORAGE_KEY = "sonicloom.scenes";
const SCENE_COUNT = 4;

function loadStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export class SceneManager {
  constructor(tracks) {
    this.tracks = tracks;
    this.slots = loadStored();
  }

  saveScene(index) {
    this.slots[index] = this.tracks.map((t) => t.snapshotState());
    this._persist();
  }

  recallScene(index) {
    const slot = this.slots[index];
    if (!slot) return false;
    slot.forEach((snap, i) => this.tracks[i] && this.tracks[i].applySnapshot(snap));
    return true;
  }

  hasScene(index) {
    return !!this.slots[index];
  }

  _persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.slots));
    } catch {
      /* storage unavailable, ignore */
    }
  }
}

export { SCENE_COUNT };
