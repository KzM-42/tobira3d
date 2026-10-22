// ゲーム進行の本体（three.js 非依存）。固定タイムステップ 60Hz で step() を呼ぶ。
import { spawnOf, type Ctx, type RoomDef } from "./types";
import type { Records } from "./records";

export const HZ = 60;
/** 扉を通る演出のタイムライン（ステップ数）。正解・不正解で完全に同一 */
export const PASS = { approachEnd: 20, openStart: 8, openEnd: 30, walkEnd: 58, closeStart: 48, closeEnd: 66, swap: 72 };
export const ENTER = { openStart: 4, openEnd: 26, walkStart: 10, walkEnd: 48, closeStart: 50, closeEnd: 62, end: 52 };
export const BLACKOUT = 60;

export type Mode = "idle" | "entering" | "room" | "passing" | "blackout" | "clear";

export type GameEvent =
  | { type: "enter"; room: number; fail: boolean }
  | { type: "door"; door: number }
  | { type: "blackout" }
  | { type: "interact"; id: string }
  | { type: "control" }
  | { type: "clear"; ms: number };

export interface FailNote { room: number; name: string; reason: string }
export interface Outcome { room: number; ok: boolean; reason: string | null; door: number }

export class Game {
  mode: Mode = "idle";
  ri = 0;
  k = 0;
  s: any = null;
  runK = 0;
  enterK = 0;
  pass: { door: number; reason: string | null; k: number } | null = null;
  failNote: FailNote | null = null;
  last: Outcome | null = null;
  clearMs = 0;
  events: GameEvent[] = [];
  px = 0;
  pz = 0;

  constructor(readonly rooms: RoomDef[], readonly rec: Records, private save: (r: Records) => void = () => {}) {}

  get room() { return this.rooms[this.ri]; }
  get t() { return this.k / HZ; }
  ctx(): Ctx {
    const [sx, sz] = spawnOf(this.room.shell);
    return { t: this.t, k: this.k, px: this.px, pz: this.pz, sx, sz };
  }

  start() {
    this.rec.attempts++; this.save(this.rec);
    this.failNote = null; this.last = null; this.runK = 0;
    this.enter(0, false);
  }

  private enter(i: number, fail: boolean) {
    this.ri = i;
    this.s = this.room.logic.init();
    this.k = 0; this.enterK = 0; this.pass = null;
    [this.px, this.pz] = spawnOf(this.room.shell);
    this.mode = "entering";
    if (i + 1 > this.rec.best) { this.rec.best = i + 1; this.save(this.rec); }
    this.events.push({ type: "enter", room: i, fail });
  }

  /** 開発用（見た目の確認・スクリーンショット）。ゲーム中の画面からは呼べない */
  debugJump(i: number) { this.enter(i, false); }

  /** プレイヤー位置を渡して1ステップ進める */
  step(px: number, pz: number) {
    if (this.mode === "room") { this.px = px; this.pz = pz; }
    switch (this.mode) {
      case "entering":
        this.enterK++; this.runK++;
        if (this.enterK >= ENTER.end) { this.mode = "room"; this.events.push({ type: "control" }); }
        break;
      case "room": {
        this.k++; this.runK++;
        const c = this.ctx();
        this.room.logic.update?.(this.s, c);
        if (c.t >= this.room.limit) {
          this.pass = { door: -1, reason: "時間切れ — 部屋の明かりが落ちた", k: 0 };
          this.mode = "blackout"; this.events.push({ type: "blackout" });
        }
        break;
      }
      case "passing":
        this.pass!.k++; this.runK++;
        if (this.pass!.k >= PASS.swap) this.resolve();
        break;
      case "blackout":
        this.pass!.k++;
        if (this.pass!.k >= BLACKOUT) this.resolve();
        break;
    }
  }

  interact(id: string) {
    if (this.mode !== "room") return;
    this.room.logic.interact?.(this.s, id, this.ctx());
    this.events.push({ type: "interact", id });
  }

  judge(door: number): string | null {
    const r = this.room, c = this.ctx();
    return r.logic.check?.(this.s, c) ?? (door !== r.answer ? r.logic.miss(door) : null);
  }

  chooseDoor(door: number) {
    if (this.mode !== "room" || door < 0 || door >= this.room.doors.length) return false;
    this.pass = { door, reason: this.judge(door), k: 0 };
    this.mode = "passing";
    this.events.push({ type: "door", door });
    return true;
  }

  private resolve() {
    const p = this.pass!, from = this.ri;
    this.last = { room: from, ok: !p.reason, reason: p.reason, door: p.door };
    if (p.reason) {
      this.failNote = { room: from, name: this.rooms[from].name, reason: p.reason };
      this.rec.attempts++; this.save(this.rec);
      this.runK = 0;
      this.enter(0, true);
    } else if (from + 1 >= this.rooms.length) {
      this.mode = "clear";
      this.clearMs = Math.round((this.runK / HZ) * 1000);
      const key = String(this.rooms.length), prev = this.rec.bestTime[key];
      if (!prev || this.clearMs < prev) this.rec.bestTime[key] = this.clearMs;
      this.save(this.rec);
      this.events.push({ type: "clear", ms: this.clearMs });
    } else {
      this.enter(from + 1, false);
    }
  }
}
