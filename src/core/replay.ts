// 操作列を Game に流し込んで結果を得る（自動テストとブラウザ内の自動再生で共用）
import { Game, HZ, type Outcome } from "./game";
import type { Action } from "./types";
import { spawnOf } from "./types";

/** 今いる部屋で actions を再生し、扉を通り終えた結果を返す */
export function playRoom(g: Game, actions: Action[], maxSec = 40): Outcome | null {
  const startRoom = g.ri;
  while (g.mode === "entering") g.step(g.px, g.pz);
  let [px, pz] = spawnOf(g.room.shell);
  let ai = 0;
  g.last = null;
  for (let i = 0; i < maxSec * HZ; i++) {
    while (g.mode === "room" && g.ri === startRoom && ai < actions.length && Math.round(actions[ai].at * HZ) <= g.k) {
      const a = actions[ai++];
      if (a.moveTo) [px, pz] = a.moveTo;
      if (a.interact) g.interact(a.interact);
      if (a.use) g.useItem();
      if (a.door != null) g.chooseDoor(a.door);
    }
    g.step(px, pz);
    if (g.last) return g.last;
  }
  return null;
}
