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
  /** 持っている小物を使う（F キー） */
  use?: boolean;
}

/** 部屋の種類（5種類を部品にして使い回す） */
export type RoomKind = "light" | "sound" | "wait" | "count" | "blackout";

/** 小物：懐中電灯・鍵・メモ（同時に1つだけ持てる） */
export type ItemKind = "torch" | "key" | "memo";
export const ITEM_NAME: Record<ItemKind, string> = { torch: "懐中電灯", key: "鍵", memo: "メモ" };
/** 部屋に落ちている小物 */
export interface ItemSpot { kind: ItemKind; pos: [number, number, number] }
/** 懐中電灯で照らすと手がかり（正解の扉の札）が見える暗がり。pos は壁の上の中心 */
export interface DarkSpot { pos: [number, number, number]; rotY: number; text: string }
/** 小物を使った別解（テストと自動再生用） */
export interface Alt { item: ItemKind; actions: Action[] }

/** 部屋を作るときの条件（シード・何番目か・紛らわしさ・持ち込んだ小物） */
export interface GenCtx { seed: number; index: number; heat: number; carry?: ItemKind | null }
/** 部屋の作り方：同じ GenCtx なら必ず同じ部屋 */
export type RoomGen = (c: GenCtx) => RoomDef;

export interface RoomDef<S = any> {
  id: string;
  kind: RoomKind;
  name: string;
  /** 生成に使った値（手がかり・正解など）。同じシードなら完全に一致する */
  spec: Record<string, unknown>;
  limit: number;
  shell: ShellSpec;
  doors: DoorSpec[];
  answer: number;
  logic: RoomLogic<S>;
  /** 見た目（家具・小物・照明・音）を作る。state() で今のロジック状態を読める */
  build(kit: Kit, state: () => S): void;
  solution: Action[];
  wrongs?: Action[][];
  /** 落ちている小物（各部屋に1つ） */
  items: ItemSpot[];
  dark?: DarkSpot;
  /** 鍵のかかった扉（doors の添字）。鍵で開けると、言いつけに関係なく次の部屋へ通じる */
  locked?: number;
  /** メモを使うと見えるヒント（1つ） */
  hint: string;
  /** 小物を使った別解 */
  alts: Alt[];
}

/** 扉の開口部の床上の位置 */
export const doorPos = (shell: ShellSpec, d: { wall: Wall; at: number }): [number, number] =>
  d.wall === "n" ? [d.at, -shell.d / 2] : d.wall === "e" ? [shell.w / 2, d.at] : [-shell.w / 2, d.at];
/** 扉の手前（部屋の内側へ inward だけ入った所） */
export function nearDoor(shell: ShellSpec, d: { wall: Wall; at: number }, inward = 0.7): [number, number] {
  const [x, z] = doorPos(shell, d);
  return d.wall === "n" ? [x, z + inward] : d.wall === "e" ? [x - inward, z] : [x + inward, z];
}

export const spawnOf = (shell: ShellSpec): [number, number] => [shell.entryX ?? 0, shell.d / 2 - 1.0];
