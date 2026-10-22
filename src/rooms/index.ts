// 部屋の並び。部屋を足す・入れ替える時はこの配列だけを編集する。
import type { RoomDef } from "../core/types";
import { hotel } from "./r01-hotel";
import { office } from "./r02-office";
import { hospital } from "./r03-hospital";
import { washitsu } from "./r04-washitsu";
import { basement } from "./r05-basement";

export const ROOMS: RoomDef[] = [hotel, office, hospital, washitsu, basement];
export const TOTAL_PLANNED = 30;
