export interface Records {
  best: number;                       // 到達した最高の部屋番号
  attempts: number;                   // 挑戦回数
  bestTime: Record<string, number>;   // 部屋数ごとの最短踏破タイム(ms)
}

const KEY = "tobira3d:records";

export function emptyRecords(): Records { return { best: 0, attempts: 0, bestTime: {} }; }

export function loadRecords(): Records {
  try { return Object.assign(emptyRecords(), JSON.parse(localStorage.getItem(KEY) || "{}")); }
  catch { return emptyRecords(); }
}

export function saveRecords(r: Records) {
  try { localStorage.setItem(KEY, JSON.stringify(r)); } catch { /* 保存できない環境では無視 */ }
}

export function fmtMs(ms: number) {
  const m = Math.floor(ms / 60000), s = (ms % 60000) / 1000;
  return `${m}:${s.toFixed(2).padStart(5, "0")}`;
}
