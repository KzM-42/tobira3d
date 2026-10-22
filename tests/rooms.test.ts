// 各部屋の「正解が一意に決まる」ことと、全部屋を正解操作で通せることを、多くのシードで確かめる。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Game, HZ, PASS, ENTER } from "../src/core/game";
import { emptyRecords } from "../src/core/records";
import { playRoom } from "../src/core/replay";
import { makeRoom, NORMAL_ROOMS } from "../src/rooms/index";
import { spawnOf, type RoomDef } from "../src/core/types";
import { hash32, mulberry32, nextSeed, parseSeed, Rng } from "../src/core/rng";

const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);
const fresh = () => new Game(makeRoom, { length: NORMAL_ROOMS }, emptyRecords());
/** seed の i 番目の部屋に直接入った状態の Game（テスト専用） */
function at(seed: number, i: number) {
  const g = fresh(); g.start(seed);
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

test("部屋データの形（シード1〜200）", () => {
  for (const seed of SEEDS) for (let i = 0; i < NORMAL_ROOMS; i++) {
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

for (let i = 0; i < NORMAL_ROOMS; i++) {
  test(`第${i + 1}室 シード1〜200：正解の扉だけが通れる・誤操作は失敗する・放置は時間切れ`, () => {
    for (const seed of SEEDS) {
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
      if (seed <= 20) {
        const g = at(seed, i), res = playRoom(g, [], r.limit + 5);
        assert.ok(res && !res.ok && /時間切れ/.test(res.reason!), `${tag} 時間切れ`);
        assert.equal(g.ri, 0);
      }
    }
  });
}

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
