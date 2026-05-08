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
  clickToFlip: true
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

export function saveState(state: PersistedState): { ok: boolean; error?: string } {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return { ok: true };
  } catch (error) {
    try {
      const slim: PersistedState = {
        ...state,
        items: state.items.map((item) => ({ ...item, image: undefined }))
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
      return { ok: false, error: '儲存空間已滿，已暫不保存圖片' };
    } catch {
      return { ok: false, error: (error as Error)?.message ?? '儲存失敗' };
    }
  }
}
