// ゲーム進行の本体（three.js 非依存）。固定タイムステップ 60Hz で step() を呼ぶ。
import { doorPos, ITEM_NAME, spawnOf, type Ctx, type ItemKind, type ItemSpot, type RoomDef, type RoomGen } from "./types";
import type { Records } from "./records";
import { nextSeed } from "./rng";

export const HZ = 60;
/** 扉を通る演出のタイムライン（ステップ数）。正解・不正解で完全に同一 */
export const PASS = { approachEnd: 20, openStart: 8, openEnd: 30, walkEnd: 58, closeStart: 48, closeEnd: 66, swap: 72 };
export const ENTER = { openStart: 4, openEnd: 26, walkStart: 10, walkEnd: 48, closeStart: 50, closeEnd: 62, end: 52 };
export const BLACKOUT = 60;
/** 小物を使える距離（暗がり・鍵の扉から） */
export const REACH = 2.0;
/** 小物を使うと増える紛らわしさ。小物を使わずに部屋を抜けると1減る */
export const HEAT: Record<ItemKind, number> = { memo: 2, torch: 1, key: 1 };
export const HEAT_MAX = 6;

export type Mode = "idle" | "entering" | "room" | "passing" | "blackout" | "clear" | "over";
/** normal：第1〜5室を抜ければクリア、失敗したら新しいシードで第1室から。endless：どこまでも続き、失敗したら終わり */
export type RunMode = "normal" | "endless";

export type GameEvent =
  | { type: "enter"; room: number; fail: boolean }
  | { type: "door"; door: number }
  | { type: "blackout" }
  | { type: "interact"; id: string }
  | { type: "control" }
  | { type: "clear"; ms: number }
  | { type: "over"; room: number }
  | { type: "items" }                  // 部屋に落ちている小物が変わった
  | { type: "held" }                   // 持ち物が変わった
  | { type: "msg"; text: string }      // 短い知らせ
  | { type: "hint"; text: string }     // メモのヒント
  | { type: "reveal" }                 // 懐中電灯で暗がりを照らした
  | { type: "unlock"; door: number };  // 鍵の扉を開けた

export interface FailNote { room: number; name: string; reason: string }
export interface Outcome { room: number; ok: boolean; reason: string | null; door: number }

export interface GameOpts {
  /** 通常モードの部屋の数（ここを越えるとクリア） */
  length: number;
}

export class Game {
  mode: Mode = "idle";
  /** この挑戦のシード（失敗して第1室に戻るたびに変わる） */
  seed = 1;
  run: RunMode = "normal";
  room!: RoomDef;
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
  /** 持ち物（同時に1つだけ）。部屋をまたいで持ち越せる */
  held: ItemKind | null = null;
  /** 紛らわしさ：小物を使うほど増え、後の部屋の手がかりが紛らわしくなる */
  heat = 0;
  /** 今の部屋に落ちている小物（拾うと null、持ち替えると置いた物になる） */
  items: (ItemSpot | null)[] = [];
  /** 今の部屋で小物を使った結果 */
  fx = { revealed: false, unlocked: false, hint: null as string | null, used: false };
  /** この挑戦で使った小物の数 */
  usedCount: Record<ItemKind, number> = { memo: 0, torch: 0, key: 0 };

  constructor(readonly gen: RoomGen, readonly opts: GameOpts, readonly rec: Records, private save: (r: Records) => void = () => {}) {}

  get t() { return this.k / HZ; }
  ctx(): Ctx {
    const [sx, sz] = spawnOf(this.room.shell);
    return { t: this.t, k: this.k, px: this.px, pz: this.pz, sx, sz };
  }

  /** この挑戦の部屋数（無限モードは上限なし） */
  get length() { return this.run === "endless" ? Infinity : this.opts.length; }

  start(seed: number, run: RunMode = "normal") {
    this.rec.attempts++; this.save(this.rec);
    this.seed = seed >>> 0 || 1;
    this.run = run;
    this.failNote = null; this.last = null; this.runK = 0;
    this.resetRun();
    this.enter(0, false);
  }

  private resetRun() {
    this.held = null; this.heat = 0;
    this.usedCount = { memo: 0, torch: 0, key: 0 };
  }

  /** i 番目の部屋を作る（シード・今の紛らわしさ・持ち物で決まる） */
  roomAt(i: number) { return this.gen({ seed: this.seed, index: i, heat: this.heat, carry: this.held }); }

  private enter(i: number, fail: boolean) {
    this.ri = i;
    this.room = this.roomAt(i);
    this.items = this.room.items.map(it => ({ ...it }));
    this.fx = { revealed: false, unlocked: false, hint: null, used: false };
    this.s = this.room.logic.init();
    this.k = 0; this.enterK = 0; this.pass = null;
    [this.px, this.pz] = spawnOf(this.room.shell);
    this.mode = "entering";
    if (this.run === "endless") {
      if (i + 1 > this.rec.endless.best) { this.rec.endless = { best: i + 1, seed: this.seed }; this.save(this.rec); }
    } else if (i + 1 > this.rec.best) { this.rec.best = i + 1; this.save(this.rec); }
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
    if (id.startsWith("item:")) this.pickup(Number(id.slice(5)));
    else if (id === "dark") { if (this.held === "torch") this.useItem(); else this.msg("暗くて よく見えない"); }
    else this.room.logic.interact?.(this.s, id, this.ctx());
    this.events.push({ type: "interact", id });
  }

  private msg(text: string) { this.events.push({ type: "msg", text }); }

  /** 小物を拾う。手がふさがっていれば、持っていた物をそこに置いて持ち替える */
  private pickup(k: number) {
    const it = this.items[k];
    if (!it) return;
    const prev = this.held;
    this.held = it.kind;
    this.items[k] = prev ? { kind: prev, pos: it.pos } : null;
    this.events.push({ type: "items" }, { type: "held" });
    this.msg(`${ITEM_NAME[it.kind]}を拾った${prev ? `（${ITEM_NAME[prev]}を置いた）` : ""}`);
  }

  private consume(kind: ItemKind) {
    this.held = null; this.fx.used = true; this.usedCount[kind]++;
    this.heat = Math.min(HEAT_MAX, this.heat + HEAT[kind]);
    this.events.push({ type: "held" });
  }

  private near(x: number, z: number) { return Math.hypot(this.px - x, this.pz - z) <= REACH; }

  /** 持っている小物を使う（F キー・使うボタン）。使えたら true */
  useItem() {
    if (this.mode !== "room" || !this.held) return false;
    const r = this.room;
    switch (this.held) {
      case "memo":
        this.fx.hint = r.hint;
        this.consume("memo");
        this.events.push({ type: "hint", text: r.hint });
        return true;
      case "torch":
        if (!r.dark || !this.near(r.dark.pos[0], r.dark.pos[2])) { this.msg("照らしても 何も見えない"); return false; }
        this.fx.revealed = true;
        this.consume("torch");
        this.events.push({ type: "reveal" });
        this.msg("暗がりに 何か書いてある — 電池が切れた");
        return true;
      case "key": {
        const d = r.locked != null ? r.doors[r.locked] : null;
        if (!d || !this.near(...doorPos(r.shell, d))) { this.msg("この鍵で開く扉は 近くにない"); return false; }
        return this.chooseDoor(r.locked!);
      }
    }
  }

  judge(door: number): string | null {
    const r = this.room, c = this.ctx();
    if (door === r.locked) return null; // 鍵の扉は言いつけに関係なく次へ通じる
    return r.logic.check?.(this.s, c) ?? (door !== r.answer ? r.logic.miss(door) : null);
  }

  chooseDoor(door: number) {
    if (this.mode !== "room" || door < 0 || door >= this.room.doors.length) return false;
    if (door === this.room.locked && !this.fx.unlocked) {
      if (this.held !== "key") { this.msg("鍵がかかっている"); return false; }
      this.fx.unlocked = true;
      this.consume("key");
      this.events.push({ type: "unlock", door });
    }
    this.pass = { door, reason: this.judge(door), k: 0 };
    this.mode = "passing";
    this.events.push({ type: "door", door });
    return true;
  }

  private resolve() {
    const p = this.pass!, from = this.ri;
    this.last = { room: from, ok: !p.reason, reason: p.reason, door: p.door };
    if (p.reason && this.run === "endless") {
      this.failNote = { room: from, name: this.room.name, reason: p.reason };
      this.mode = "over";
      this.events.push({ type: "over", room: from });
    } else if (p.reason) {
      this.failNote = { room: from, name: this.room.name, reason: p.reason };
      this.rec.attempts++; this.save(this.rec);
      this.runK = 0;
      this.seed = nextSeed(this.seed, this.rec.attempts);
      this.resetRun();
      this.enter(0, true);
    } else if (from + 1 >= this.length) {
      this.mode = "clear";
      this.clearMs = Math.round((this.runK / HZ) * 1000);
      const key = String(this.opts.length), prev = this.rec.bestTime[key];
      if (!prev || this.clearMs < prev) this.rec.bestTime[key] = this.clearMs;
      this.save(this.rec);
      this.events.push({ type: "clear", ms: this.clearMs });
    } else {
      if (!this.fx.used) this.heat = Math.max(0, this.heat - 1);
      this.enter(from + 1, false);
    }
  }
}
