export type GameMode = 'marquee' | 'wheel' | 'slot' | 'gacha' | 'card';

export type ThemeName = 'neon' | 'temple' | 'casino' | 'future';

export type WheelPalette = 'rainbow' | 'warm' | 'cool' | 'mono';

export interface DrawItem {
  id: string;
  name: string;
  weight: number;
  drawn: boolean;
  createdAt: number;
}

export interface DrawRecord {
  id: string;
  winnerId: string;
  winnerName: string;
  winnerWeight: number;
  mode: GameMode;
  theme: ThemeName;
  poolSize: number;
  at: string;
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
  bgMusic: boolean;
  voiceAnnounce: boolean;
  wheelPalette: WheelPalette;
  quickMode: boolean;
}

export interface PersistedState {
  items: DrawItem[];
  history: DrawRecord[];
  settings: AppSettings;
}
