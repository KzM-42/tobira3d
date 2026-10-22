// 各部屋の「正解が一意に決まる」ことと、全部屋を正解操作で通せることを確かめる。
import { test } from "node:test";
import assert from "node:assert/strict";
import { Game, HZ, PASS, ENTER } from "../src/core/game";
import { emptyRecords } from "../src/core/records";
import { playRoom } from "../src/core/replay";
import { ROOMS } from "../src/rooms/index";
import { spawnOf } from "../src/core/types";

const fresh = () => new Game(ROOMS, emptyRecords());
/** i 番目の部屋に直接入った状態の Game（テスト専用） */
function at(i: number) {
  const g = fresh(); g.start();
  for (let r = 0; r < i; r++) { const res = playRoom(g, ROOMS[r].solution); assert.ok(res?.ok, `第${r + 1}室を通れない`); }
  return g;
}

test("部屋データの形", () => {
  assert.ok(ROOMS.length >= 1);
  ROOMS.forEach((r, i) => {
    const tag = `第${i + 1}室 ${r.name}`;
    assert.ok(r.doors.length >= 2 && r.doors.length <= 4, `${tag} 扉の数`);
    assert.ok(r.limit > 0 && r.limit <= 30, `${tag} 制限時間は30秒以内`);
    assert.ok(r.answer >= 0 && r.answer < r.doors.length, `${tag} 正解の番号`);
    const last = r.solution[r.solution.length - 1];
    assert.equal(last.door, r.answer, `${tag} 正解手順は正解の扉で終わる`);
    assert.ok(last.at < r.limit, `${tag} 正解手順は制限時間内`);
    const src = [r.logic.init, r.logic.update, r.logic.check, r.logic.miss].filter(Boolean).join("");
    assert.ok(!/Math\.random/.test(src), `${tag} 判定に乱数を使わない`);
    assert.ok(new Set(r.doors.map(d => `${d.wall}:${d.at}`)).size === r.doors.length, `${tag} 扉が重ならない`);
  });
});

ROOMS.forEach((r, i) => {
  const tag = `第${i + 1}室「${r.name}」`;
  test(`${tag} 正解の扉だけが通れる（正解が一意）`, () => {
    const sol = r.solution, last = sol[sol.length - 1];
    for (let d = 0; d < r.doors.length; d++) {
      const g = at(i);
      const res = playRoom(g, sol.slice(0, -1).concat([{ at: last.at, door: d }]));
      assert.ok(res, `${tag} 扉${d + 1}: 結果が出ない`);
      if (!res) return;
      if (d === r.answer) assert.ok(res.ok, `${tag} 正解手順で通れない: ${res.reason}`);
      else { assert.equal(res.ok, false, `${tag} 扉${d + 1} が通れてしまう`); assert.ok(res.reason && res.reason.length <= 40, `${tag} 失敗理由は短い1行`); }
    }
  });
  if (r.wrongs?.length) test(`${tag} 指示を破ると失敗する`, () => {
    r.wrongs!.forEach((w, j) => {
      const res = playRoom(at(i), w);
      assert.ok(res && !res.ok, `${tag} 誤操作${j + 1} が通れてしまう`);
    });
  });
  test(`${tag} 放置すると時間切れで第1室へ`, () => {
    const g = at(i);
    const res = playRoom(g, [], r.limit + 5);
    assert.ok(res && !res.ok && /時間切れ/.test(res.reason!));
    assert.equal(g.ri, 0);
  });
});

test("全部屋を一度も失敗せず通すとクリア・最短タイムが残る", () => {
  const g = fresh(); g.start();
  for (const r of ROOMS) { const res = playRoom(g, r.solution); assert.ok(res?.ok, `${r.name}: ${res?.reason}`); }
  assert.equal(g.mode, "clear");
  assert.ok(g.clearMs > 0);
  assert.equal(g.rec.bestTime[String(ROOMS.length)], g.clearMs);
  assert.equal(g.rec.best, ROOMS.length);
});

test("失敗すると第1室に戻り、理由が残り、挑戦回数が増える", () => {
  const g = fresh(); g.start();
  const n = Math.min(2, ROOMS.length - 1);
  for (let i = 0; i < n; i++) playRoom(g, ROOMS[i].solution);
  const r = ROOMS[n], wrong = (r.answer + 1) % r.doors.length, last = r.solution[r.solution.length - 1];
  const res = playRoom(g, r.solution.slice(0, -1).concat([{ at: last.at, door: wrong }]));
  assert.ok(res && !res.ok);
  assert.equal(g.ri, 0); assert.equal(g.mode, "entering");
  assert.equal(g.failNote?.room, n);
  assert.equal(g.rec.attempts, 2);
});

test("扉を通る演出は正解・不正解で同じ長さ、再開まで数秒以内", () => {
  const total = (PASS.swap + ENTER.end) / HZ;
  assert.ok(total <= 3, `扉を通って操作できるまで ${total}秒`);
  // 正解と不正解で、通過開始から次の部屋に入るまでのステップ数が同じ
  const steps = (door: number) => {
    const g = at(0); while (g.mode === "entering") g.step(g.px, g.pz);
    g.step(...spawnOf(ROOMS[0].shell)); g.chooseDoor(door);
    let n = 0; while (g.mode === "passing") { g.step(0, 0); n++; } return n;
  };
  assert.equal(steps(ROOMS[0].answer), steps((ROOMS[0].answer + 1) % ROOMS[0].doors.length));
});

test("同じ操作なら結果は毎回同じ（固定ステップで再現）", () => {
  const run = () => { const g = fresh(); g.start(); return ROOMS.map(r => JSON.stringify(playRoom(g, r.solution))).join("|") + g.clearMs; };
  assert.equal(run(), run());
});
