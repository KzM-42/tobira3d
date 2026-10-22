// 部屋の生成で共通に使うもの
import type { Rng } from "../core/rng";
import { nearDoor, type Action, type Alt, type DoorSpec, type ItemKind, type RoomDef } from "../core/types";

/**
 * 生成の計画：難しさ（lv）・部屋番号と、この部屋に置く小物の仕掛け。
 * item は落ちている小物、locked は鍵の扉があるか、dark は懐中電灯で照らす暗がりがあるか。
 */
export interface Plan { lv: number; index: number; item: ItemKind; locked: boolean; dark: boolean }

export type { Rng };

const KANJI = ["〇", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
export const kanji = (n: number) => KANJI[n] ?? String(n);

/** 壁の向きを、入口から見た言葉に */
export const sideName = (wall: "n" | "e" | "w") => (wall === "n" ? "正面" : wall === "e" ? "右" : "左");

/** a から重複なしに n 個 */
export const sample = <T>(r: Rng, a: readonly T[], n: number) => r.shuffle(a).slice(0, n);

type P2 = [number, number];
/** 小物を置ける場所（reach はそれを拾える立ち位置） */
export interface ItemPlace { pos: [number, number, number]; reach: P2 }
/** 暗がりを置ける場所（reach は照らせる立ち位置） */
export interface DarkPlace { pos: [number, number, number]; rotY: number; reach: P2 }

/** 手がかりの部分だけを作った部屋（小物まわりは finish で足す） */
export type BaseRoom<S> = Omit<RoomDef<S>, "items" | "dark" | "locked" | "hint" | "alts">;

export interface Extras {
  /** 小物の種類ごとの置き場所の候補 */
  items: (kind: ItemKind) => ItemPlace[];
  darks: DarkPlace[];
  /** 鍵の扉の場所と札 */
  lock: DoorSpec;
  /** この時刻より前に扉をくぐると言いつけを破る（正攻法の最短） */
  earliest: number;
  /** 呼ばれるまで動いてはいけない部屋：メモは入口から手の届く所にあり、拾っても動かない */
  stay?: boolean;
  hint: string;
}

/**
 * 部屋に小物の仕掛けを足す。別解はどれも「手がかりを読まずに済む代わりに小物を使い切る」。
 * - 鍵：鍵の扉を開けると言いつけに関係なく次へ（待つ・暗転の言いつけも飛ばせる）
 * - 懐中電灯：暗がりを照らすと正解の扉の札が書いてある
 * - メモ：ヒントが1つ見える（使うと、後の部屋の手がかりが紛らわしくなる）
 */
export function finish<S>(base: BaseRoom<S>, r: Rng, p: Plan, x: Extras): RoomDef<S> {
  const doors = base.doors.slice();
  const locked = p.locked ? doors.push(x.lock) - 1 : undefined;
  const place = r.pick(x.items(p.item));
  const dp = p.dark && x.darks.length ? r.pick(x.darks) : undefined;
  const dark = dp && { pos: dp.pos, rotY: dp.rotY, text: doors[base.answer].label ?? "" };
  const goal = nearDoor(base.shell, doors[base.answer]);
  const fetch: Action[] = x.stay && p.item === "memo" ? [{ at: 0.4, interact: "item:0" }] : [{ at: 0.4, moveTo: place.reach }, { at: 0.8, interact: "item:0" }];
  const toDoor = (after: number): Action[] => {
    const t = Math.max(after + 0.4, x.earliest + 0.4);
    return [{ at: t, moveTo: goal }, { at: t + 0.6, door: base.answer }];
  };
  const alts: Alt[] = [];
  if (p.item === "key" && locked != null)
    alts.push({ item: "key", actions: [...fetch, { at: 1.6, moveTo: nearDoor(base.shell, doors[locked]) }, { at: 2.2, door: locked }] });
  if (p.item === "torch" && dp)
    alts.push({ item: "torch", actions: [...fetch, { at: 1.6, moveTo: dp.reach }, { at: 2.0, use: true }, ...toDoor(2.0)] });
  if (p.item === "memo")
    alts.push({ item: "memo", actions: [...fetch, { at: 1.0, use: true }, ...toDoor(1.0)] });
  const wrongs = (base.wrongs ?? []).slice();
  // 鍵がないまま鍵の扉を選んでも開かない（そのまま時間切れ）
  if (locked != null) wrongs.push([{ at: 1.0, moveTo: nearDoor(base.shell, doors[locked]) }, { at: 1.5, door: locked }]);
  return {
    ...base, doors, locked, dark, hint: x.hint, alts, wrongs,
    items: [{ kind: p.item, pos: place.pos }],
    spec: { ...base.spec, item: p.item, itemAt: place.pos, locked: locked ?? null, dark: dark?.pos ?? null },
  };
}
