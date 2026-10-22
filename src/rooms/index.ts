// 部屋の生成。5種類の部屋を部品にして、シードと部屋番号から作る。
import type { GenCtx, RoomDef, RoomKind } from "../core/types";
import { roomRng } from "../core/rng";
import type { Plan, Rng } from "./common";
import { hotelRoom } from "./r01-hotel";
import { officeRoom } from "./r02-office";
import { hospitalRoom } from "./r03-hospital";
import { washitsuRoom } from "./r04-washitsu";
import { basementRoom } from "./r05-basement";

/** 第1〜5室の並び（通常モード） */
export const FIRST: RoomKind[] = ["light", "sound", "wait", "count", "blackout"];
export const NORMAL_ROOMS = FIRST.length;

const FACTORY: Record<RoomKind, (r: Rng, p: Plan) => RoomDef> = {
  light: hotelRoom, sound: officeRoom, wait: hospitalRoom, count: washitsuRoom, blackout: basementRoom,
};

/** i 番目（0始まり）の部屋の種類 */
export function kindAt(_seed: number, i: number): RoomKind {
  return FIRST[i];
}

/** 難しさ */
export const levelOf = (_index: number, heat: number) => Math.max(0, Math.min(8, heat));

export function makeRoom(c: GenCtx): RoomDef {
  const kind = kindAt(c.seed, c.index);
  return FACTORY[kind](roomRng(c.seed, c.index), { lv: levelOf(c.index, c.heat), index: c.index });
}
