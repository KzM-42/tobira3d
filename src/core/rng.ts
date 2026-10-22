// シード付き乱数。判定に関わる乱れはすべてここから取る（同じシードなら同じ結果）。

/** 32bit の値を混ぜて1つにする（部屋番号・用途ごとに別の乱数列を作るため） */
export function hash32(...xs: number[]): number {
  let h = 0x811c9dc5;
  for (const x of xs) {
    h = Math.imul(h ^ (x >>> 0), 0x01000193);
    h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  }
  return h >>> 0;
}

/** mulberry32：小さくて速い 32bit の乱数 */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  private f: () => number;
  constructor(seed: number) { this.f = mulberry32(seed); }
  /** 0 以上 1 未満 */
  next() { return this.f(); }
  /** lo 以上 hi 以下の整数 */
  int(lo: number, hi: number) { return lo + Math.floor(this.f() * (hi - lo + 1)); }
  chance(p: number) { return this.f() < p; }
  pick<T>(a: readonly T[]): T { return a[Math.floor(this.f() * a.length)]; }
  /** 並べ替えた新しい配列 */
  shuffle<T>(a: readonly T[]): T[] {
    const b = a.slice();
    for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(this.f() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
    return b;
  }
}

/** 用途ごとの乱数列の名前 */
export const SALT = { room: 1, kind: 2, plan: 3, reseed: 4 } as const;

/** シードと部屋番号（0始まり）から、その部屋専用の乱数列 */
export const roomRng = (seed: number, index: number, salt: number = SALT.room) => new Rng(hash32(seed, index, salt));

/** 失敗して第1室からやり直すときの新しいシード（前のシードと回数から決まる） */
export const nextSeed = (seed: number, n: number) => hash32(seed, n, SALT.reseed) % 1_000_000_000 || 1;

/** URL の ?seed=数字 を読む。数字でなければ null */
export function parseSeed(s: string | null | undefined): number | null {
  if (!s || !/^\d{1,10}$/.test(s.trim())) return null;
  const n = Number(s.trim());
  return n > 0 && n <= 0xffffffff ? n : null;
}
