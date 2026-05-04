import type { DrawItem } from './types';

export function createId(prefix = 'id') {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return `${prefix}_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

export function cryptoRandomFloat() {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return value[0] / 2 ** 32;
}

export function weightedPick(items: DrawItem[]) {
  const candidates = items.filter((item) => item.name.trim() && item.weight > 0);
  const totalWeight = candidates.reduce((sum, item) => sum + item.weight, 0);

  if (!candidates.length || totalWeight <= 0) {
    return null;
  }

  let threshold = cryptoRandomFloat() * totalWeight;
  for (const item of candidates) {
    threshold -= item.weight;
    if (threshold <= 0) {
      return item;
    }
  }

  return candidates[candidates.length - 1];
}

export function weightedPickN(items: DrawItem[], n: number): DrawItem[] {
  const pool = items.filter((item) => item.name.trim() && item.weight > 0);
  const winners: DrawItem[] = [];
  while (winners.length < n && pool.length) {
    const winner = weightedPick(pool);
    if (!winner) break;
    winners.push(winner);
    const idx = pool.findIndex((item) => item.id === winner.id);
    if (idx >= 0) pool.splice(idx, 1);
  }
  return winners;
}

export function parseImportText(text: string): DrawItem[] {
  const now = Date.now();
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const normalized = line.replace(/\t/g, ',');
      const [rawName, rawWeight] = normalized.split(/[,，;；|]/).map((part) => part.trim());
      const weight = Number(rawWeight);

      return {
        id: createId('item'),
        name: rawName || `項目 ${index + 1}`,
        weight: Number.isFinite(weight) && weight > 0 ? weight : 1,
        drawn: false,
        createdAt: now + index
      };
    });
}

export function getPlayableItems(items: DrawItem[], skipDrawn: boolean) {
  return items.filter(
    (item) => item.name.trim() && item.weight > 0 && !item.excluded && (!skipDrawn || !item.drawn)
  );
}

export async function compressImage(file: File, maxSize = 256, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('讀取失敗'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('解析圖片失敗'));
      img.onload = () => {
        const ratio = Math.min(maxSize / img.width, maxSize / img.height, 1);
        const w = Math.max(1, Math.round(img.width * ratio));
        const h = Math.max(1, Math.round(img.height * ratio));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('canvas 不可用'));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        try {
          resolve(canvas.toDataURL('image/jpeg', quality));
        } catch (error) {
          reject(error);
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
