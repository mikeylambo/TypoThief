export type DailyTier = "mon-tue" | "wed-thu" | "fri-sat" | "sun";

export interface PropDef {
  id: string;
  label: string;
  frame: string;
  start: string;
  goal: string;
  rivets?: number[];
}

export interface LevelDef {
  id: number;
  chapter: 1 | 2 | 3;
  title: string;
  par: number;
  pocketCap: 1 | 2;
  props: PropDef[];
  tier?: DailyTier;
}

export interface PropState {
  id: string;
  label: string;
  frame: string;
  word: string;
  goal: string;
  rivets: boolean[];
}

export type Move =
  | { kind: "steal"; propIdx: number; charIdx: number }
  | { kind: "drop"; propIdx: number; pos: number; slotIdx: number };

export interface Snapshot {
  props: PropState[];
  pocket: string[];
  dropMode: boolean;
  activeSlot: number;
  moves: number;
}

export interface GameState {
  props: PropState[];
  pocket: string[];
  pocketCap: 1 | 2;
  dropMode: boolean;
  activeSlot: number;
  moves: number;
  usedHint: boolean;
  history: Snapshot[];
}

export interface MoveCheck {
  ok: boolean;
  reason?: string;
  nextWord: string;
}
