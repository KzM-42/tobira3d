// 入力：PC は WASD + マウス（Pointer Lock）+ Shift + E/クリック。スマホは仮想スティック + 右側ドラッグ + タップ。
export interface InputFrame {
  mx: number; mz: number;     // 移動（右, 前）-1..1
  run: boolean;
  lookX: number; lookY: number; // このフレームの視点移動（ラジアン）
  interact: boolean;
  use: boolean;               // 持ち物を使う（F / 使うボタン）
  tap: { x: number; y: number } | null; // スマホ：タップした画面位置（-1..1）
}

export class Input {
  readonly touch = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
  locked = false;
  sensitivity = 0.0022;
  private keys = new Set<string>();
  private lookX = 0; private lookY = 0;
  private wantInteract = false;
  private wantUse = false;
  private tapAt: { x: number; y: number } | null = null;
  private stick = { id: -1, ox: 0, oy: 0, x: 0, y: 0 };
  private look = { id: -1, lx: 0, ly: 0, sx: 0, sy: 0, t0: 0, moved: 0 };
  enabled = false;
  onLockChange: (locked: boolean) => void = () => {};
  private ac = new AbortController();

  constructor(private el: HTMLElement, private stickEl: HTMLElement, private knobEl: HTMLElement) {
    const sig = { signal: this.ac.signal };
    addEventListener("keydown", e => {
      if (!this.enabled) return;
      this.keys.add(e.code);
      if (e.code === "KeyE" && !e.repeat) this.wantInteract = true;
      if (e.code === "KeyF" && !e.repeat) this.wantUse = true;
      if (["Space", "ArrowUp", "ArrowDown"].includes(e.code)) e.preventDefault();
    }, sig);
    addEventListener("keyup", e => this.keys.delete(e.code), sig);
    addEventListener("blur", () => this.keys.clear(), sig);
    document.addEventListener("pointerlockchange", () => {
      this.locked = document.pointerLockElement === this.el;
      if (!this.locked) this.keys.clear();
      this.onLockChange(this.locked);
    }, sig);
    el.addEventListener("mousemove", e => {
      if (!this.locked || !this.enabled) return;
      this.lookX -= e.movementX * this.sensitivity; this.lookY -= e.movementY * this.sensitivity;
    }, sig);
    el.addEventListener("mousedown", e => {
      if (this.touch || !this.enabled) return;
      if (!this.locked) { this.lock(); return; }
      if (e.button === 0) this.wantInteract = true;
    }, sig);
    el.addEventListener("touchstart", e => this.onTouch(e, "start"), { passive: false, signal: this.ac.signal });
    el.addEventListener("touchmove", e => this.onTouch(e, "move"), { passive: false, signal: this.ac.signal });
    el.addEventListener("touchend", e => this.onTouch(e, "end"), { passive: false, signal: this.ac.signal });
    el.addEventListener("touchcancel", e => this.onTouch(e, "end"), { passive: false, signal: this.ac.signal });
  }

  /** 画面の「使う」ボタン */
  requestUse() { if (this.enabled) this.wantUse = true; }

  dispose() { this.ac.abort(); this.unlock(); }

  lock() { if (!this.touch) (this.el.requestPointerLock as any)?.call(this.el)?.catch?.(() => {}); }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  private onTouch(e: TouchEvent, phase: "start" | "move" | "end") {
    if (!this.enabled) return;
    e.preventDefault();
    const W = innerWidth, H = innerHeight;
    for (const t of Array.from(e.changedTouches)) {
      if (phase === "start") {
        if (t.clientX < W * 0.42 && t.clientY > H * 0.35 && this.stick.id < 0) {
          this.stick = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: 0, y: 0 };
          this.stickEl.style.left = t.clientX + "px"; this.stickEl.style.top = t.clientY + "px"; this.stickEl.classList.add("on");
        } else if (this.look.id < 0) {
          this.look = { id: t.identifier, lx: t.clientX, ly: t.clientY, sx: t.clientX, sy: t.clientY, t0: performance.now(), moved: 0 };
        }
      } else if (phase === "move") {
        if (t.identifier === this.stick.id) {
          const R = 56; let dx = t.clientX - this.stick.ox, dy = t.clientY - this.stick.oy; const d = Math.hypot(dx, dy);
          if (d > R) { dx *= R / d; dy *= R / d; }
          this.stick.x = dx / R; this.stick.y = dy / R;
          this.knobEl.style.transform = `translate(${dx}px,${dy}px)`;
        } else if (t.identifier === this.look.id) {
          const dx = t.clientX - this.look.lx, dy = t.clientY - this.look.ly;
          this.lookX -= dx * 0.0052; this.lookY -= dy * 0.0052;
          this.look.lx = t.clientX; this.look.ly = t.clientY; this.look.moved += Math.abs(dx) + Math.abs(dy);
        }
      } else {
        if (t.identifier === this.stick.id) {
          this.stick = { id: -1, ox: 0, oy: 0, x: 0, y: 0 }; this.knobEl.style.transform = ""; this.stickEl.classList.remove("on");
        } else if (t.identifier === this.look.id) {
          if (this.look.moved < 12 && performance.now() - this.look.t0 < 350) this.tapAt = { x: (t.clientX / W) * 2 - 1, y: -(t.clientY / H) * 2 + 1 };
          this.look.id = -1;
        }
      }
    }
  }

  frame(): InputFrame {
    const k = (c: string) => this.keys.has(c);
    let mx = (k("KeyD") || k("ArrowRight") ? 1 : 0) - (k("KeyA") || k("ArrowLeft") ? 1 : 0);
    let mz = (k("KeyW") || k("ArrowUp") ? 1 : 0) - (k("KeyS") || k("ArrowDown") ? 1 : 0);
    let run = k("ShiftLeft") || k("ShiftRight");
    if (this.stick.id >= 0) {
      mx = this.stick.x; mz = -this.stick.y;
      const m = Math.hypot(mx, mz);
      if (m < 0.15) { mx = 0; mz = 0; }
      run = m > 0.92;
    }
    const f: InputFrame = { mx, mz, run, lookX: this.lookX, lookY: this.lookY, interact: this.wantInteract, use: this.wantUse, tap: this.tapAt };
    this.lookX = 0; this.lookY = 0; this.wantInteract = false; this.wantUse = false; this.tapAt = null;
    return f;
  }

  /** 操作を止めた時に溜まった入力を捨てる */
  flush() { this.keys.clear(); this.frame(); }
}
