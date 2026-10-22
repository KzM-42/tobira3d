// 部屋の生成。5種類の部屋を部品にして、シードと部屋番号から作る。
import type { GenCtx, ItemKind, RoomDef, RoomKind } from "../core/types";
import { roomRng, SALT } from "../core/rng";
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

const KINDS = FIRST;
const kindCache = new Map<number, RoomKind[]>();

/** i 番目（0始まり）の部屋の種類。第6室からはシードで決まり、同じ種類は続かない */
export function kindAt(seed: number, i: number): RoomKind {
  if (i < FIRST.length) return FIRST[i];
  let list = kindCache.get(seed);
  if (!list) { if (kindCache.size > 64) kindCache.clear(); kindCache.set(seed, (list = FIRST.slice())); }
  while (list.length <= i) {
    const prev = list[list.length - 1];
    list.push(roomRng(seed, list.length, SALT.kind).pick(KINDS.filter(k => k !== prev)));
  }
  return list[i];
}

/** 難しさ：第7室から4室ごとに1段上がる（heat は小物の使い方で増える分） */
export const levelOf = (index: number, heat: number) => Math.max(0, Math.min(8, Math.floor(Math.max(0, index - 2) / 4) + heat));

/** 置ける小物（待合室は動けないので、照らしに行く懐中電灯は置かない） */
const ITEMS: Record<RoomKind, ItemKind[]> = {
  light: ["torch", "key", "memo"], sound: ["torch", "key", "memo"], wait: ["key", "memo"], count: ["torch", "key", "memo"], blackout: ["torch", "key", "memo"],
};

/**
 * 部屋を作る。手がかりは (seed, index) の乱数列、小物の仕掛けは別の乱数列から決める。
 * 持ち込んだ小物（carry）があれば、それを使える仕掛け（鍵の扉・暗がり）が必ずある。
 */
export function makeRoom(c: GenCtx): RoomDef {
  const kind = kindAt(c.seed, c.index), pr = roomRng(c.seed, c.index, SALT.plan);
  const item = pr.pick(ITEMS[kind]);
  const locked = item === "key" || c.carry === "key" || pr.chance(0.2);
  const dark = kind !== "wait" && (item === "torch" || c.carry === "torch" || pr.chance(0.25));
  return FACTORY[kind](roomRng(c.seed, c.index), { lv: levelOf(c.index, c.heat), index: c.index, item, locked, dark });
}
