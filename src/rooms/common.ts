// 部屋の生成で共通に使うもの
import type { Rng } from "../core/rng";

/** 生成の計画：難しさ（lv）と、部屋番号 */
export interface Plan { lv: number; index: number }

export type { Rng };

const KANJI = ["〇", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
export const kanji = (n: number) => KANJI[n] ?? String(n);

/** 壁の向きを、入口から見た言葉に */
export const sideName = (wall: "n" | "e" | "w") => (wall === "n" ? "正面" : wall === "e" ? "右" : "左");

/** a から重複なしに n 個 */
export const sample = <T>(r: Rng, a: readonly T[], n: number) => r.shuffle(a).slice(0, n);
