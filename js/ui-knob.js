// Reusable draggable rotary knob (vertical drag = value change), 0..1 range internally.
const MIN_DEG = -135;
const MAX_DEG = 135;

export class Knob {
  constructor(slotEl, { label = "", value = 0, format, onChange } = {}) {
    this.slotEl = slotEl;
    this.value = value;
    this.onChange = onChange;
    this.format = format || ((v) => Math.round(v * 100));

    slotEl.innerHTML = `
      <div class="knob">
        <div class="knob-indicator"></div>
      </div>
      <div class="knob-label">${label}</div>
      <div class="knob-value"></div>
    `;
    this.knobEl = slotEl.querySelector(".knob");
    this.indicatorEl = slotEl.querySelector(".knob-indicator");
    this.valueEl = slotEl.querySelector(".knob-value");

    this._render();
    this._bindPointer();
  }

  _render() {
    const deg = MIN_DEG + (MAX_DEG - MIN_DEG) * this.value;
    this.indicatorEl.style.transform = `rotate(${deg}deg)`;
    this.valueEl.textContent = this.format(this.value);
  }

  setValue(v, fire = false) {
    this.value = Math.max(0, Math.min(1, v));
    this._render();
    if (fire && this.onChange) this.onChange(this.value);
  }

  _bindPointer() {
    let startY = 0;
    let startValue = 0;
    let dragging = false;

    const onMove = (e) => {
      if (!dragging) return;
      const y = e.touches ? e.touches[0].clientY : e.clientY;
      const delta = (startY - y) / 140;
      this.setValue(startValue + delta, true);
      e.preventDefault();
    };
    const onUp = () => {
      dragging = false;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    this.knobEl.addEventListener("pointerdown", (e) => {
      dragging = true;
      startY = e.clientY;
      startValue = this.value;
      try {
        this.knobEl.setPointerCapture && this.knobEl.setPointerCapture(e.pointerId);
      } catch {
        // pointer capture is a nice-to-have (keeps the drag going if the
        // pointer leaves the element); the window-level listeners below
        // are enough on their own, so a capture failure shouldn't be fatal.
      }
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      e.preventDefault();
    });

    this.knobEl.addEventListener(
      "dblclick",
      () => this.setValue(this._defaultValue ?? this.value, true)
    );
  }
}
