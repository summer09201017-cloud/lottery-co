export type GameMode = 'marquee' | 'wheel' | 'slot' | 'gacha';

export type ThemeName = 'neon' | 'temple' | 'casino' | 'future' | 'sakura';

export interface DrawItem {
  id: string;
  name: string;
  weight: number;
  drawn: boolean;
  createdAt: number;
  image?: string;
  excluded?: boolean;
}

export interface DrawRecord {
  id: string;
  winnerId: string;
  winnerName: string;
  winnerWeight: number;
  winnerImage?: string;
  mode: GameMode;
  theme: ThemeName;
  poolSize: number;
  at: string;
  batchId?: string;
}

export interface AppSettings {
  mode: GameMode;
  theme: ThemeName;
  skipDrawn: boolean;
  autoMarkDrawn: boolean;
  sound: boolean;
  vibration: boolean;
  excitement: number;
  hostMode: boolean;
  drawCount: number;
  countdown: number;
}

export interface PersistedState {
  items: DrawItem[];
  history: DrawRecord[];
  settings: AppSettings;
}
