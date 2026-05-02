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
  return items.filter((item) => item.name.trim() && item.weight > 0 && (!skipDrawn || !item.drawn));
}
