// input.js — keyboard and mouse state for the player controller. Held keys live in
// `down`; one-shot presses land in `pressed` and are cleared by the main loop after
// each simulation step, so a press is seen exactly once. Mouse deltas accumulate
// between steps and are consumed the same way.

export const down = new Set();
export const pressed = new Set();
export const mouse = { dx: 0, dy: 0, down: false, pressedDown: false };
export let locked = false;

export function initInput(canvas) {
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Tab') e.preventDefault();
    if (!e.repeat) pressed.add(e.code);
    down.add(e.code);
  });
  window.addEventListener('keyup', (e) => down.delete(e.code));
  window.addEventListener('blur', () => { down.clear(); mouse.down = false; });

  canvas.addEventListener('mousedown', (e) => {
    if (!locked) return;
    if (e.button === 0) { mouse.down = true; mouse.pressedDown = true; }
    if (e.button === 2) pressed.add('MouseRight');
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouse.down = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('mousemove', (e) => {
    if (!locked) return;
    mouse.dx += e.movementX || 0;
    mouse.dy += e.movementY || 0;
  });
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
    if (!locked) { down.clear(); mouse.down = false; }
  });
}

export function lockPointer(canvas) {
  canvas.requestPointerLock();
}

// Called once per simulation step after the controllers have read the state.
export function consumeStep() {
  pressed.clear();
  mouse.dx = 0;
  mouse.dy = 0;
  mouse.pressedDown = false;
}
