import type { AppSettings, DrawItem, PersistedState } from './types';

const STORAGE_KEY = 'marquee-lottery-machine:v1';

export const defaultSettings: AppSettings = {
  mode: 'marquee',
  theme: 'neon',
  skipDrawn: true,
  autoMarkDrawn: true,
  sound: true,
  vibration: true,
  excitement: 7,
  hostMode: false,
  drawCount: 1,
  countdown: 0,
  bgMusic: false,
  voiceAnnounce: false,
  wheelPalette: 'rainbow',
  quickMode: false
};

export const defaultItems: DrawItem[] = [
  { id: 'demo_1', name: '頭獎', weight: 1, drawn: false, createdAt: 1 },
  { id: 'demo_2', name: '二獎', weight: 2, drawn: false, createdAt: 2 },
  { id: 'demo_3', name: '三獎', weight: 3, drawn: false, createdAt: 3 },
  { id: 'demo_4', name: '加碼獎', weight: 1, drawn: false, createdAt: 4 },
  { id: 'demo_5', name: '神秘獎', weight: 1, drawn: false, createdAt: 5 },
  { id: 'demo_6', name: '安慰獎', weight: 4, drawn: false, createdAt: 6 }
];

export function loadState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { items: defaultItems, history: [], settings: defaultSettings };
    }

    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    return {
      items: Array.isArray(parsed.items) && parsed.items.length ? parsed.items : defaultItems,
      history: Array.isArray(parsed.history) ? parsed.history : [],
      settings: { ...defaultSettings, ...(parsed.settings ?? {}) }
    };
  } catch {
    return { items: defaultItems, history: [], settings: defaultSettings };
  }
}

export function saveState(state: PersistedState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
