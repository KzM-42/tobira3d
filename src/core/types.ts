// 部屋定義の型。ロジック部分（判定）は three.js に依存しないので node でテストできる。
import type { Kit } from "../engine/kit";

/** ロジックに渡す今の状況 */
export interface Ctx {
  t: number;      // 部屋に入って操作できるようになってからの秒数
  k: number;      // 同じくステップ数（60Hz）
  px: number;     // プレイヤー位置
  pz: number;
  sx: number;     // その部屋のスタート地点
  sz: number;
}

export interface RoomLogic<S> {
  init(): S;
  /** 60Hz で呼ばれる */
  update?(s: S, c: Ctx): void;
  /** 「調べる」をした時（id は build で登録した名前） */
  interact?(s: S, id: string, c: Ctx): void;
  /** 指示を守れたか。守れていなければ失敗理由（1行）を返す */
  check?(s: S, c: Ctx): string | null;
  /** 扉を間違えた時の失敗理由（1行） */
  miss(door: number): string;
}

export type Wall = "n" | "e" | "w";
export type DoorStyle = "hotel" | "office" | "hospital" | "fusuma" | "metal";
export type Floor = "carpet" | "tile" | "linoleum" | "tatami" | "concrete" | "wood";

export interface DoorSpec {
  wall: Wall;
  /** 壁に沿った位置（n: x座標, e/w: z座標） */
  at: number;
  label?: string;
  style?: DoorStyle;
}

export interface ShellSpec {
  w: number; d: number; h: number;
  floor: string;          // テクスチャID または "tatami"
  wall: string;
  ceiling: string;
  wainscot?: { mat: string; h: number };
  floorTile?: number; wallTile?: number; ceilingTile?: number;
  floorColor?: number;    // 床テクスチャの色味（掛け合わせ）
  entryX?: number;
  entryStyle?: DoorStyle;
  footstep: Floor;
  fog: { color: number; density: number };
  env?: number;           // 環境反射の強さ
  exposure?: number;
  tone: string;           // 環境音のプリセット
  reverb?: number;        // 残響の長さ（秒）
}

/** 自動テスト・自動再生用の操作 */
export interface Action {
  at: number;
  moveTo?: [number, number];
  interact?: string;
  door?: number;
}

export interface RoomDef<S = any> {
  id: string;
  name: string;
  limit: number;
  shell: ShellSpec;
  doors: DoorSpec[];
  answer: number;
  logic: RoomLogic<S>;
  /** 見た目（家具・小物・照明・音）を作る。state() で今のロジック状態を読める */
  build(kit: Kit, state: () => S): void;
  solution: Action[];
  wrongs?: Action[][];
}

export const spawnOf = (shell: ShellSpec): [number, number] => [shell.entryX ?? 0, shell.d / 2 - 1.0];
