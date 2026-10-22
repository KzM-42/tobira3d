// 各部屋の「正解が一意に決まる」ことと、全部屋を正解操作で通せることを、多くのシードで確かめる。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Game, HZ, PASS, ENTER } from "../src/core/game";
import { emptyRecords } from "../src/core/records";
import { playRoom } from "../src/core/replay";
import { kindAt, levelOf, makeRoom, NORMAL_ROOMS } from "../src/rooms/index";
import { spawnOf, type RoomDef } from "../src/core/types";
import { hash32, mulberry32, nextSeed, parseSeed, Rng } from "../src/core/rng";

const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);
const fresh = () => new Game(makeRoom, { length: NORMAL_ROOMS }, emptyRecords());
/** seed の i 番目の部屋に直接入った状態の Game（テスト専用） */
function at(seed: number, i: number, run: "normal" | "endless" = "normal") {
  const g = fresh(); g.start(seed, run);
  if (i > 0) g.debugJump(i);
  return g;
}
/** 判定に関わる中身（関数以外）を文字列に */
const digest = (r: RoomDef) => JSON.stringify({ id: r.id, kind: r.kind, spec: r.spec, doors: r.doors, answer: r.answer, limit: r.limit, solution: r.solution, wrongs: r.wrongs });
const withDoor = (r: RoomDef, d: number) => { const sol = r.solution, last = sol[sol.length - 1]; return sol.slice(0, -1).concat([{ at: last.at, door: d }]); };

test("乱数：同じシードなら同じ列、違うシードなら違う列", () => {
  const a = mulberry32(42), b = mulberry32(42), c = mulberry32(43);
  const xs = Array.from({ length: 50 }, () => a());
  assert.deepEqual(xs, Array.from({ length: 50 }, () => b()));
  assert.notDeepEqual(xs, Array.from({ length: 50 }, () => c()));
  assert.ok(xs.every(x => x >= 0 && x < 1));
  const r = new Rng(7), ints = Array.from({ length: 500 }, () => r.int(2, 5));
  assert.ok(ints.every(n => n >= 2 && n <= 5) && new Set(ints).size === 4);
  assert.notEqual(hash32(1, 0), hash32(1, 1));
  assert.equal(parseSeed("123"), 123); assert.equal(parseSeed("abc"), null); assert.equal(parseSeed("0"), null); assert.equal(parseSeed(null), null);
});

/** 確かめる部屋：第1〜5室と、無限モードで生成される第6〜20室 */
const CHECK_ROOMS = 20;

test("部屋データの形（シード1〜200・第1〜20室）", () => {
  for (const seed of SEEDS) for (let i = 0; i < CHECK_ROOMS; i++) {
    const r = makeRoom({ seed, index: i, heat: 0 });
    const tag = `seed${seed} 第${i + 1}室 ${r.name}`;
    assert.ok(r.doors.length >= 2 && r.doors.length <= 5, `${tag} 扉の数`);
    assert.ok(r.limit > 0 && r.limit <= 30, `${tag} 制限時間は30秒以内`);
    assert.ok(r.answer >= 0 && r.answer < r.doors.length, `${tag} 正解の番号`);
    const last = r.solution[r.solution.length - 1];
    assert.equal(last.door, r.answer, `${tag} 正解手順は正解の扉で終わる`);
    assert.ok(last.at < r.limit, `${tag} 正解手順は制限時間内`);
    assert.ok(new Set(r.doors.map(d => `${d.wall}:${d.at}`)).size === r.doors.length, `${tag} 扉が重ならない`);
    assert.ok(new Set(r.doors.map(d => d.label)).size === r.doors.length, `${tag} 扉の札が重ならない`);
  }
});

test("同じシードで2回作ると完全に一致し、シードが違えば手がかりが変わる", () => {
  for (const seed of SEEDS) for (let i = 0; i < NORMAL_ROOMS; i++)
    assert.equal(digest(makeRoom({ seed, index: i, heat: 0 })), digest(makeRoom({ seed, index: i, heat: 0 })), `seed${seed} 第${i + 1}室`);
  for (let i = 0; i < NORMAL_ROOMS; i++) {
    const specs = new Set(SEEDS.map(seed => JSON.stringify(makeRoom({ seed, index: i, heat: 0 }).spec)));
    const answers = new Set(SEEDS.map(seed => makeRoom({ seed, index: i, heat: 0 }).answer));
    assert.ok(specs.size > 3, `第${i + 1}室 の手がかりがシードで変わる`);
    assert.ok(answers.size >= 3, `第${i + 1}室 の正解の扉がシードで変わる`);
  }
});

/** 1部屋ぶんの検査：正解の扉だけが通れる・誤操作は失敗する */
function checkRoom(seed: number, i: number, timeout: boolean) {
      const r = makeRoom({ seed, index: i, heat: 0 }), tag = `seed${seed} 第${i + 1}室「${r.name}」`;
      let ok = 0;
      for (let d = 0; d < r.doors.length; d++) {
        const res = playRoom(at(seed, i), withDoor(r, d));
        assert.ok(res, `${tag} 扉${d + 1}: 結果が出ない`);
        if (res!.ok) ok++;
        if (d === r.answer) assert.ok(res!.ok, `${tag} 正解手順で通れない: ${res!.reason}`);
        else assert.ok(res!.reason && res!.reason.length <= 40, `${tag} 扉${d + 1} が通れてしまう / 失敗理由は短い1行`);
      }
      assert.equal(ok, 1, `${tag} 通れる扉はちょうど1つ`);
      (r.wrongs ?? []).forEach((w, j) => {
        const res = playRoom(at(seed, i), w);
        assert.ok(res && !res.ok, `${tag} 誤操作${j + 1} が通れてしまう`);
      });
      if (timeout) {
        const g = at(seed, i), res = playRoom(g, [], r.limit + 5);
        assert.ok(res && !res.ok && /時間切れ/.test(res.reason!), `${tag} 時間切れ`);
        assert.equal(g.ri, 0);
      }
}

for (let i = 0; i < NORMAL_ROOMS; i++) {
  test(`第${i + 1}室 シード1〜200：正解の扉だけが通れる・誤操作は失敗する・放置は時間切れ`, () => {
    for (const seed of SEEDS) checkRoom(seed, i, seed <= 20);
  });
}

test(`無限モードの第6〜${CHECK_ROOMS}室 シード1〜200：正解の扉だけが通れる・誤操作は失敗する`, () => {
  for (const seed of SEEDS) for (let i = NORMAL_ROOMS; i < CHECK_ROOMS; i++) checkRoom(seed, i, seed <= 5);
});

test("無限モード：種類の並びはシードで変わり、同じ種類は続かず、全種類が出る", () => {
  const orders = new Set<string>();
  for (const seed of SEEDS) {
    const ks = Array.from({ length: 60 }, (_, i) => kindAt(seed, i));
    for (let i = 1; i < ks.length; i++) assert.notEqual(ks[i], ks[i - 1], `seed${seed} 第${i + 1}室が前と同じ種類`);
    assert.equal(new Set(ks.slice(NORMAL_ROOMS)).size, 5, `seed${seed} 全種類が出る`);
    assert.deepEqual(ks.slice(0, NORMAL_ROOMS), ["light", "sound", "wait", "count", "blackout"]);
    orders.add(ks.slice(NORMAL_ROOMS, 20).join());
    assert.equal(makeRoom({ seed, index: 40, heat: 0 }).kind, kindAt(seed, 40));
  }
  assert.ok(orders.size > 150, "並びがシードごとに変わる");
});

test("無限モード：室数に応じて少しずつ難しくなる", () => {
  for (let i = 1; i < 60; i++) assert.ok(levelOf(i, 0) >= levelOf(i - 1, 0));
  assert.equal(levelOf(0, 0), 0); assert.equal(levelOf(NORMAL_ROOMS - 1, 0), 0);
  assert.ok(levelOf(29, 0) >= 5);
  // 第1室（3枚・ともる扉）と、深い部屋のホテル（4枚・消えた扉も出る）
  const deep = SEEDS.flatMap(seed => Array.from({ length: 30 }, (_, i) => makeRoom({ seed, index: i + 20, heat: 0 }))).filter(r => r.kind === "light");
  assert.ok(deep.length > 0 && deep.every(r => r.doors.length === 4));
  assert.ok(deep.some(r => r.spec.unlit) && deep.some(r => !r.spec.unlit));
  assert.ok(SEEDS.every(seed => makeRoom({ seed, index: 0, heat: 0 }).doors.length === 3));
});

test("無限モード：シード40個で第30室まで自動で踏破できる", () => {
  for (const seed of SEEDS.slice(0, 40)) {
    const g = fresh(); g.start(seed, "endless");
    for (let i = 0; i < 30; i++) {
      assert.equal(g.ri, i);
      const res = playRoom(g, g.room.solution);
      assert.ok(res?.ok, `seed${seed} 第${i + 1}室 ${g.room.name}: ${res?.reason}`);
    }
    assert.equal(g.ri, 30); assert.equal(g.mode === "entering" || g.mode === "room", true, "第31室へ続く");
    assert.equal(g.rec.endless.best, 31); assert.equal(g.rec.endless.seed, seed);
  }
});

test("無限モード：失敗したら終わり（第1室には戻らず、記録とシードが残る）", () => {
  const g = fresh(); g.start(123, "endless");
  for (let i = 0; i < 7; i++) playRoom(g, g.room.solution);
  const r = g.room, res = playRoom(g, withDoor(r, (r.answer + 1) % r.doors.length));
  assert.ok(res && !res.ok);
  assert.equal(g.mode, "over"); assert.equal(g.ri, 7); assert.equal(g.seed, 123);
  assert.equal(g.failNote?.room, 7);
  assert.deepEqual(g.rec.endless, { best: 8, seed: 123 });
  assert.equal(g.rec.best, 0, "通常モードの記録とは別");
  g.step(0, 0); assert.equal(g.mode, "over");
});

test("全部屋を一度も失敗せず通すとクリア・最短タイムが残る（シード1〜200）", () => {
  for (const seed of SEEDS) {
    const g = fresh(); g.start(seed);
    for (let i = 0; i < NORMAL_ROOMS; i++) { const res = playRoom(g, g.room.solution); assert.ok(res?.ok, `seed${seed} ${g.room.name}: ${res?.reason}`); }
    assert.equal(g.mode, "clear");
    assert.ok(g.clearMs > 0);
    assert.equal(g.rec.bestTime[String(NORMAL_ROOMS)], g.clearMs);
    assert.equal(g.rec.best, NORMAL_ROOMS);
    assert.equal(g.seed, seed, "クリアまでシードは変わらない");
  }
});

test("失敗すると第1室に戻り、新しいシードになり、理由が残り、挑戦回数が増える", () => {
  const g = fresh(); g.start(77);
  for (let i = 0; i < 2; i++) playRoom(g, g.room.solution);
  const r = g.room, res = playRoom(g, withDoor(r, (r.answer + 1) % r.doors.length));
  assert.ok(res && !res.ok);
  assert.equal(g.ri, 0); assert.equal(g.mode, "entering");
  assert.equal(g.failNote?.room, 2);
  assert.equal(g.rec.attempts, 2);
  assert.notEqual(g.seed, 77);
  assert.equal(g.seed, nextSeed(77, 2), "新しいシードも決定的");
  assert.equal(digest(g.room), digest(makeRoom({ seed: g.seed, index: 0, heat: 0 })));
});

test("扉を通る演出は正解・不正解で同じ長さ、再開まで数秒以内", () => {
  const total = (PASS.swap + ENTER.end) / HZ;
  assert.ok(total <= 3, `扉を通って操作できるまで ${total}秒`);
  const steps = (door: number) => {
    const g = at(5, 0); while (g.mode === "entering") g.step(g.px, g.pz);
    g.step(...spawnOf(g.room.shell)); g.chooseDoor(door);
    let n = 0; while (g.mode === "passing") { g.step(0, 0); n++; } return n;
  };
  const r = makeRoom({ seed: 5, index: 0, heat: 0 });
  assert.equal(steps(r.answer), steps((r.answer + 1) % r.doors.length));
});

test("同じシード・同じ操作なら結果は毎回同じ（固定ステップで再現）", () => {
  const run = (seed: number) => { const g = fresh(); g.start(seed); const out: string[] = []; for (let i = 0; i < NORMAL_ROOMS; i++) out.push(JSON.stringify(playRoom(g, g.room.solution)) + digest(g.room)); return out.join("|") + g.clearMs; };
  assert.equal(run(9), run(9));
  assert.notEqual(run(9), run(10));
});

test("core と rooms に Math.random が残っていない", () => {
  for (const dir of ["src/core", "src/rooms"]) for (const f of readdirSync(dir)) {
    const src = readFileSync(join(dir, f), "utf8");
    assert.ok(!/Math\.random/.test(src), `${dir}/${f} に Math.random がある`);
  }
});
