import {
  Check,
  CircleDot,
  Dice5,
  Download,
  Eraser,
  FileImage,
  FileSpreadsheet,
  Gift,
  History,
  ImagePlus,
  ListPlus,
  Maximize2,
  MonitorUp,
  PackageOpen,
  Play,
  Plus,
  QrCode,
  RotateCcw,
  Share2,
  Shuffle,
  Sparkles,
  Trash2,
  Trophy,
  Undo2,
  Upload,
  Users,
  Vibrate,
  Volume2,
  VolumeX,
  X
} from 'lucide-react';
import type { CSSProperties, ComponentType } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  compressImage,
  createId,
  cryptoRandomFloat,
  getPlayableItems,
  parseImportText,
  weightedPickN
} from './randomEngine';
import { playCheer, playTone, vibrate } from './fx';
import { generateQrSvg } from './qr';
import { defaultSettings, loadState, saveState } from './storage';
import type { AppSettings, DrawItem, DrawRecord, GameMode, PersistedState, ThemeName } from './types';

const urlParams = new URLSearchParams(window.location.search);
const isDisplayOnly = urlParams.get('display') === '1';
const isObsMode = urlParams.get('obs') === '1';
const isCheerMode = urlParams.get('cheer') === '1';

const modeOptions: Array<{ value: GameMode; label: string; Icon: ComponentType<{ size?: number }> }> = [
  { value: 'marquee', label: '跑馬燈', Icon: Sparkles },
  { value: 'wheel', label: '轉盤', Icon: CircleDot },
  { value: 'slot', label: '拉霸', Icon: Dice5 },
  { value: 'gacha', label: '抽卡盲盒', Icon: Gift }
];

const themeOptions: Array<{ value: ThemeName; label: string }> = [
  { value: 'neon', label: '霓虹電玩' },
  { value: 'temple', label: '廟口籤筒' },
  { value: 'casino', label: '賭場拉霸' },
  { value: 'future', label: '科技大螢幕' }
];

const drawCountPresets = [1, 3, 5, 10];
const countdownOptions = [
  { value: 0, label: '關閉' },
  { value: 3, label: '3 秒' },
  { value: 5, label: '5 秒' }
];

const wheelColors = [
  '#22d3ee',
  '#f97316',
  '#a3e635',
  '#ef4444',
  '#facc15',
  '#38bdf8',
  '#fb7185',
  '#34d399',
  '#c084fc',
  '#f59e0b'
];

type StatePayload = PersistedState;

type ReelCell = { id: string | null; name: string; image?: string };

type ChannelMessage =
  | { type: 'SYNC'; origin: string; state: StatePayload }
  | { type: 'REQUEST_SYNC'; origin: string }
  | { type: 'DRAW'; origin: string; commandId: string; winnerIds: string[]; mode: GameMode; state: StatePayload };

type OutboundChannelMessage =
  | { type: 'SYNC'; state: StatePayload }
  | { type: 'REQUEST_SYNC' }
  | { type: 'DRAW'; commandId: string; winnerIds: string[]; mode: GameMode; state: StatePayload };

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

function App() {
  const initialState = useMemo(() => loadInitialState(), []);
  const [items, setItems] = useState<DrawItem[]>(initialState.items);
  const [history, setHistory] = useState<DrawRecord[]>(initialState.history);
  const [settings, setSettings] = useState<AppSettings>({
    ...defaultSettings,
    ...initialState.settings,
    hostMode: isDisplayOnly ? true : initialState.settings.hostMode
  });
  const [newName, setNewName] = useState('');
  const [newWeight, setNewWeight] = useState(1);
  const [importText, setImportText] = useState('');
  const [winners, setWinners] = useState<DrawItem[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [runPool, setRunPool] = useState<DrawItem[]>([]);
  const [marqueeIndex, setMarqueeIndex] = useState(0);
  const [wheelRotation, setWheelRotation] = useState(0);
  const [wheelMs, setWheelMs] = useState(4200);
  const [slotReels, setSlotReels] = useState<ReelCell[][]>([]);
  const [gachaCards, setGachaCards] = useState<DrawItem[]>([]);
  const [gachaRevealIds, setGachaRevealIds] = useState<string[]>([]);
  const [gachaShuffleKey, setGachaShuffleKey] = useState(0);
  const [confettiKey, setConfettiKey] = useState(0);
  const [bannerKey, setBannerKey] = useState(0);
  const [bannerName, setBannerName] = useState('');
  const [countdownRemaining, setCountdownRemaining] = useState<number | null>(null);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(
    () => window.matchMedia?.('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState('');
  const [qrModalUrl, setQrModalUrl] = useState<string | null>(null);

  const stateRef = useRef<StatePayload>({ items, history, settings });
  const timeoutsRef = useRef<number[]>([]);
  const intervalsRef = useRef<number[]>([]);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const clientIdRef = useRef(createId('client'));
  const drawingRef = useRef(false);
  const marqueeIndexRef = useRef(0);
  const wheelRotationRef = useRef(0);
  const noticeTimeoutRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const itemImageInputRef = useRef<HTMLInputElement | null>(null);
  const itemImageTargetRef = useRef<string | null>(null);

  const cleanItems = useMemo(() => items.filter((item) => item.name.trim() && item.weight > 0), [items]);
  const playableItems = useMemo(() => getPlayableItems(items, settings.skipDrawn), [items, settings.skipDrawn]);
  const stageItems = runPool.length ? runPool : playableItems.length ? playableItems : cleanItems;
  const stageNamesKey = stageItems.map((item) => `${item.id}:${item.name}:${item.image ? 'i' : ''}`).join('|');
  const totalWeight = playableItems.reduce((sum, item) => sum + item.weight, 0);
  const primaryWinner = winners[0] ?? null;
  const editingDisabled = isDrawing || countdownRemaining !== null;

  useEffect(() => {
    stateRef.current = { items, history, settings };
    if (!isDisplayOnly) {
      const result = saveState(stateRef.current);
      if (!result.ok && result.error) {
        showNotice(result.error);
      }
      broadcast({ type: 'SYNC', state: stateRef.current });
    }
  }, [items, history, settings]);

  useEffect(() => {
    marqueeIndexRef.current = marqueeIndex;
  }, [marqueeIndex]);

  useEffect(() => {
    wheelRotationRef.current = wheelRotation;
  }, [wheelRotation]);

  useEffect(() => {
    drawingRef.current = isDrawing;
  }, [isDrawing]);

  useEffect(() => {
    if (settings.mode !== 'slot' || !stageItems.length || isDrawing || winners.length) return;
    setSlotReels(createReels(stageItems));
  }, [settings.mode, isDrawing, stageNamesKey, winners.length]);

  useEffect(() => {
    if (settings.mode !== 'gacha' || !stageItems.length || isDrawing || winners.length) return;
    setGachaCards(buildGachaDeck(stageItems, []));
    setGachaRevealIds([]);
  }, [settings.mode, isDrawing, stageNamesKey, winners.length]);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const onAppInstalled = () => {
      setInstallPrompt(null);
      setIsInstalled(true);
      showNotice('已安裝到裝置');
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  useEffect(() => {
    if (!isCheerMode) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      playCheer(true);
      vibrate(true, 24);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!('BroadcastChannel' in window)) return;

    const channel = new BroadcastChannel('lottery-machine-stage-v1');
    channelRef.current = channel;
    channel.onmessage = (event: MessageEvent<ChannelMessage>) => {
      const message = event.data;
      if (!message || message.origin === clientIdRef.current) return;

      if (message.type === 'REQUEST_SYNC' && !isDisplayOnly) {
        broadcast({ type: 'SYNC', state: stateRef.current });
      }

      if (message.type === 'SYNC' && isDisplayOnly && !drawingRef.current) {
        setItems(message.state.items);
        setHistory(message.state.history);
        setSettings({ ...message.state.settings, hostMode: true });
      }

      if (message.type === 'DRAW' && isDisplayOnly) {
        setItems(message.state.items);
        setHistory(message.state.history);
        setSettings({ ...message.state.settings, mode: message.mode, hostMode: true });
        window.setTimeout(() => {
          runDraw(message.mode, message.winnerIds, true, message.state.items, {
            ...message.state.settings,
            mode: message.mode,
            hostMode: true
          });
        }, 0);
      }
    };

    if (isDisplayOnly) {
      channel.postMessage({ type: 'REQUEST_SYNC', origin: clientIdRef.current } satisfies ChannelMessage);
    } else {
      channel.postMessage({ type: 'SYNC', origin: clientIdRef.current, state: stateRef.current } satisfies ChannelMessage);
    }

    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, []);

  useEffect(
    () => () => {
      clearMotionTimers();
      clearCountdown();
      if (noticeTimeoutRef.current) window.clearTimeout(noticeTimeoutRef.current);
    },
    []
  );

  function broadcast(message: OutboundChannelMessage) {
    channelRef.current?.postMessage({ ...message, origin: clientIdRef.current } as ChannelMessage);
  }

  function clearMotionTimers() {
    timeoutsRef.current.forEach((id) => window.clearTimeout(id));
    intervalsRef.current.forEach((id) => window.clearInterval(id));
    timeoutsRef.current = [];
    intervalsRef.current = [];
  }

  function clearCountdown() {
    if (countdownTimerRef.current) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setCountdownRemaining(null);
  }

  function addTimeout(callback: () => void, delay: number) {
    const id = window.setTimeout(callback, delay);
    timeoutsRef.current.push(id);
    return id;
  }

  function addInterval(callback: () => void, delay: number) {
    const id = window.setInterval(callback, delay);
    intervalsRef.current.push(id);
    return id;
  }

  function showNotice(message: string) {
    setNotice(message);
    if (noticeTimeoutRef.current) {
      window.clearTimeout(noticeTimeoutRef.current);
    }
    noticeTimeoutRef.current = window.setTimeout(() => setNotice(null), 2600);
  }

  async function installApp() {
    if (isInstalled) {
      showNotice('已經安裝在這台裝置');
      return;
    }

    if (!installPrompt) {
      showNotice('可從瀏覽器選單選「加入主畫面」');
      return;
    }

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice.catch(() => null);
    if (choice?.outcome === 'accepted') {
      setIsInstalled(true);
      showNotice('已安裝到裝置');
    } else {
      showNotice('已取消安裝');
    }
    setInstallPrompt(null);
  }

  function exportList() {
    const blob = new Blob([itemsToImportText(items)], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `lottery-list-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showNotice('名單已匯出');
  }

  function exportHistoryCsv() {
    if (!history.length) {
      showNotice('尚無紀錄可匯出');
      return;
    }
    const header = ['時間', '得獎者', '權重', '玩法', '主題', '池內人數', '批次'];
    const rows = history.map((record) => [
      new Date(record.at).toLocaleString('zh-TW'),
      record.winnerName,
      String(record.winnerWeight),
      modeLabel(record.mode),
      record.theme,
      String(record.poolSize),
      record.batchId ?? ''
    ]);
    const escape = (value: string) => {
      if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
      return value;
    };
    const csv = '﻿' + [header, ...rows].map((row) => row.map(escape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `lottery-history-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showNotice('歷史紀錄 CSV 已匯出');
  }

  async function shareList() {
    const url = createShareUrl(items, settings);
    const shareData: ShareData = {
      title: '跑馬燈抽獎名單',
      text: '開啟這份抽獎名單',
      url
    };

    setShareUrl(url);

    if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
      try {
        await navigator.share(shareData);
        showNotice('已開啟分享選單');
        return;
      } catch (error) {
        if ((error as DOMException).name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      showNotice('分享連結已複製');
    } catch {
      showNotice('分享連結已建立，請手動複製');
    }
  }

  function showQrCode() {
    const url = shareUrl || createShareUrl(items, settings);
    setShareUrl(url);
    setQrModalUrl(url);
  }

  function updateSettings(patch: Partial<AppSettings>) {
    setSettings((current) => ({ ...current, ...patch }));
  }

  function addItem() {
    const name = newName.trim();
    if (!name) return;
    setItems((current) => [
      ...current,
      {
        id: createId('item'),
        name,
        weight: Math.max(0.1, Number(newWeight) || 1),
        drawn: false,
        createdAt: Date.now()
      }
    ]);
    setRunPool([]);
    setNewName('');
    setNewWeight(1);
  }

  function applyImport(replace: boolean) {
    const imported = parseImportText(importText);
    if (!imported.length) return;
    setItems((current) => (replace ? imported : [...current, ...imported]));
    setRunPool([]);
    setImportText('');
  }

  function updateItem(id: string, patch: Partial<DrawItem>) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    setRunPool([]);
  }

  function deleteItem(id: string) {
    setItems((current) => current.filter((item) => item.id !== id));
    setRunPool([]);
  }

  function resetDrawn() {
    setItems((current) => current.map((item) => ({ ...item, drawn: false })));
    setRunPool([]);
  }

  function clearHistory() {
    setHistory([]);
  }

  function undoLastDraw() {
    setHistory((current) => {
      if (!current.length) {
        showNotice('沒有可還原的紀錄');
        return current;
      }
      const head = current[0];
      const batchId = head.batchId;
      const removed = batchId ? current.filter((record) => record.batchId === batchId) : [head];
      const removedIds = new Set(removed.map((record) => record.winnerId));
      setItems((items) => items.map((item) => (removedIds.has(item.id) ? { ...item, drawn: false } : item)));
      setWinners([]);
      setRunPool([]);
      showNotice(`已還原 ${removed.length} 筆紀錄`);
      return batchId ? current.filter((record) => record.batchId !== batchId) : current.slice(1);
    });
  }

  async function handleBulkImageImport(fileList: FileList | null) {
    if (!fileList || !fileList.length) return;
    const files = Array.from(fileList).filter((file) => file.type.startsWith('image/'));
    if (!files.length) {
      showNotice('沒有偵測到圖片檔');
      return;
    }
    const newItems: DrawItem[] = [];
    for (const file of files) {
      try {
        const dataUrl = await compressImage(file);
        const baseName = file.name.replace(/\.[^.]+$/, '').trim();
        newItems.push({
          id: createId('item'),
          name: baseName || `項目 ${newItems.length + 1}`,
          weight: 1,
          drawn: false,
          createdAt: Date.now() + newItems.length,
          image: dataUrl
        });
      } catch {
        // skip files we can't process
      }
    }
    if (!newItems.length) {
      showNotice('圖片處理失敗');
      return;
    }
    setItems((current) => [...current, ...newItems]);
    setRunPool([]);
    showNotice(`新增 ${newItems.length} 張圖片項目`);
  }

  async function handleItemImageReplace(fileList: FileList | null) {
    const targetId = itemImageTargetRef.current;
    if (!targetId || !fileList || !fileList.length) return;
    const file = fileList[0];
    if (!file || !file.type.startsWith('image/')) return;
    try {
      const dataUrl = await compressImage(file);
      updateItem(targetId, { image: dataUrl });
    } catch {
      showNotice('圖片處理失敗');
    }
    itemImageTargetRef.current = null;
  }

  function pickItemImage(itemId: string) {
    itemImageTargetRef.current = itemId;
    itemImageInputRef.current?.click();
  }

  function clearItemImage(itemId: string) {
    updateItem(itemId, { image: undefined });
  }

  function openDisplayWindow() {
    const url = `${window.location.origin}${window.location.pathname}?display=1`;
    window.open(url, 'lottery-display', 'popup,width=1280,height=800');
    addTimeout(() => broadcast({ type: 'SYNC', state: stateRef.current }), 300);
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => undefined);
      return;
    }
    document.exitFullscreen().catch(() => undefined);
  }

  function startDrawWithCountdown() {
    if (drawingRef.current || countdownRemaining !== null) return;
    if (!playableItems.length) {
      showNotice('沒有可抽選的對象');
      return;
    }
    if (!settings.countdown || settings.countdown <= 0) {
      runDraw();
      return;
    }
    setWinners([]);
    setCountdownRemaining(settings.countdown);
    playTone(settings.sound, 660, 0.12, 'triangle');
    let remaining = settings.countdown;
    const tick = () => {
      remaining -= 1;
      if (remaining <= 0) {
        if (countdownTimerRef.current) {
          window.clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
        }
        setCountdownRemaining(null);
        runDraw();
        return;
      }
      setCountdownRemaining(remaining);
      playTone(settings.sound, 660, 0.1, 'triangle');
      vibrate(settings.vibration, 12);
    };
    countdownTimerRef.current = window.setInterval(tick, 1000);
  }

  function runDraw(
    mode = settings.mode,
    forcedWinnerIds?: string[],
    remote = false,
    sourceItems = stateRef.current.items,
    sourceSettings = stateRef.current.settings
  ) {
    if (drawingRef.current) return;

    const playable = getPlayableItems(sourceItems, sourceSettings.skipDrawn);
    const drawCount = Math.max(1, Math.min(sourceSettings.drawCount || 1, playable.length || 1));
    let selected: DrawItem[];
    if (forcedWinnerIds && forcedWinnerIds.length) {
      selected = forcedWinnerIds
        .map((id) => playable.find((item) => item.id === id) ?? sourceItems.find((item) => item.id === id))
        .filter((item): item is DrawItem => Boolean(item));
    } else {
      selected = weightedPickN(playable, drawCount);
    }

    if (!selected.length || !playable.length) {
      playTone(sourceSettings.sound, 180, 0.12, 'square');
      vibrate(sourceSettings.vibration, [30, 20, 30]);
      return;
    }

    clearMotionTimers();
    drawingRef.current = true;
    setIsDrawing(true);
    setWinners([]);
    setGachaRevealIds([]);
    setRunPool(playable);
    playTone(sourceSettings.sound, 440, 0.08, 'triangle');
    vibrate(sourceSettings.vibration, 18);

    if (!remote) {
      broadcast({
        type: 'DRAW',
        commandId: createId('cmd'),
        winnerIds: selected.map((item) => item.id),
        mode,
        state: { items: sourceItems, history: stateRef.current.history, settings: { ...sourceSettings, mode } }
      });
    }

    const headWinner = selected[0];

    const onAnimationDone = () => finishDraw(selected, mode, playable.length, sourceSettings);

    if (mode === 'wheel') {
      animateWheel(playable, headWinner, sourceSettings, onAnimationDone);
      return;
    }

    if (mode === 'slot') {
      animateSlot(playable, headWinner, sourceSettings, onAnimationDone);
      return;
    }

    if (mode === 'gacha') {
      animateGacha(playable, selected, sourceSettings, onAnimationDone);
      return;
    }

    animateMarquee(playable, headWinner, sourceSettings, onAnimationDone);
  }

  function finishDraw(allWinners: DrawItem[], mode: GameMode, poolSize: number, sourceSettings: AppSettings) {
    const batchId = allWinners.length > 1 ? createId('batch') : undefined;
    const records: DrawRecord[] = allWinners.map((winner) => ({
      id: createId('draw'),
      winnerId: winner.id,
      winnerName: winner.name,
      winnerWeight: winner.weight,
      winnerImage: winner.image,
      mode,
      theme: sourceSettings.theme,
      poolSize,
      at: new Date().toISOString(),
      batchId
    }));

    setWinners(allWinners);
    setBannerName(allWinners.map((winner) => winner.name).join('、'));
    setBannerKey((current) => current + 1);
    setHistory((current) => [...records, ...current].slice(0, 200));
    if (sourceSettings.autoMarkDrawn) {
      const winnerIds = new Set(allWinners.map((winner) => winner.id));
      setItems((current) => current.map((item) => (winnerIds.has(item.id) ? { ...item, drawn: true } : item)));
    }
    setConfettiKey((current) => current + 1);
    setIsDrawing(false);
    drawingRef.current = false;
    playTone(sourceSettings.sound, 784, 0.12, 'triangle');
    addTimeout(() => playTone(sourceSettings.sound, 1046, 0.15, 'triangle'), 120);
    if (allWinners.length > 1) {
      playCheer(sourceSettings.sound);
    }
    vibrate(sourceSettings.vibration, [80, 40, 120]);
  }

  function animateMarquee(pool: DrawItem[], winningItem: DrawItem, sourceSettings: AppSettings, onDone: () => void) {
    const count = pool.length;
    const targetIndex = Math.max(0, pool.findIndex((item) => item.id === winningItem.id));
    const startIndex = marqueeIndexRef.current % count;
    const distance = (targetIndex - startIndex + count) % count;
    const loops = Math.max(4, sourceSettings.excitement + 3);
    const totalSteps = loops * count + distance;
    let step = 0;

    const tick = () => {
      step += 1;
      const nextIndex = (startIndex + step) % count;
      setMarqueeIndex(nextIndex);

      if (step % 2 === 0 || step > totalSteps - count) {
        playTone(sourceSettings.sound, 260 + (nextIndex % 6) * 35, 0.035, 'square');
        if (step % 5 === 0) vibrate(sourceSettings.vibration, 8);
      }

      if (step >= totalSteps) {
        setMarqueeIndex(targetIndex);
        onDone();
        return;
      }

      const progress = step / totalSteps;
      const launchDrag = Math.max(0, 0.2 - progress) * 220;
      const finalDrag = Math.pow(Math.max(0, progress - 0.48) / 0.52, 2.4) * (210 + sourceSettings.excitement * 18);
      const delay = 30 + launchDrag + finalDrag;
      addTimeout(tick, delay);
    };

    addTimeout(tick, 80);
  }

  function animateWheel(pool: DrawItem[], winningItem: DrawItem, sourceSettings: AppSettings, onDone: () => void) {
    const count = pool.length;
    const targetIndex = Math.max(0, pool.findIndex((item) => item.id === winningItem.id));
    const segment = 360 / count;
    const centerAngle = targetIndex * segment + segment / 2;
    const currentMod = ((wheelRotationRef.current % 360) + 360) % 360;
    const jitter = (cryptoRandomFloat() - 0.5) * Math.min(segment * 0.3, 10);
    const landingDelta = (360 - centerAngle - currentMod + jitter + 720) % 360;
    const duration = 3300 + sourceSettings.excitement * 190;
    const turns = 4 + Math.round(sourceSettings.excitement / 2);
    const nextRotation = wheelRotationRef.current + turns * 360 + landingDelta;

    setWheelMs(duration);
    setWheelRotation(nextRotation);

    for (let index = 0; index < 18; index += 1) {
      addTimeout(() => playTone(sourceSettings.sound, 300 + index * 16, 0.035, 'square'), index * 120);
    }

    addTimeout(onDone, duration + 250);
  }

  function animateSlot(pool: DrawItem[], winningItem: DrawItem, sourceSettings: AppSettings, onDone: () => void) {
    setSlotReels(createReels(pool));

    [0, 1, 2].forEach((column) => {
      const interval = addInterval(() => {
        setSlotReels((current) => {
          const next = current.length ? [...current] : createReels(pool);
          next[column] = createReelWindow(pool);
          return next;
        });
        playTone(sourceSettings.sound, 220 + column * 80, 0.025, 'square');
      }, 60 + column * 18);

      const settleAt = 1500 + sourceSettings.excitement * 150 + column * 720;
      addTimeout(() => {
        window.clearInterval(interval);
        intervalsRef.current = intervalsRef.current.filter((id) => id !== interval);
        setSlotReels((current) => {
          const next = current.length ? [...current] : createReels(pool);
          next[column] = createReelWindow(pool, winningItem);
          return next;
        });
        playTone(sourceSettings.sound, 520 + column * 90, 0.09, 'triangle');
        vibrate(sourceSettings.vibration, 25);
      }, settleAt);
    });

    addTimeout(onDone, 1500 + sourceSettings.excitement * 150 + 2 * 720 + 420);
  }

  function animateGacha(pool: DrawItem[], winnersList: DrawItem[], sourceSettings: AppSettings, onDone: () => void) {
    const deck = buildGachaDeck(pool, winnersList);
    const duration = 1500 + sourceSettings.excitement * 160;
    const ticks = Math.max(10, Math.round(duration / 130));
    const revealStep = winnersList.length > 1 ? Math.max(220, 540 - winnersList.length * 18) : 0;

    setGachaCards(deck);
    setGachaRevealIds([]);

    for (let index = 0; index < ticks; index += 1) {
      const progress = index / ticks;
      addTimeout(() => {
        setGachaShuffleKey((current) => current + 1);
        playTone(sourceSettings.sound, 320 + Math.round(progress * 360), 0.035, 'square');
        if (index % 4 === 0) vibrate(sourceSettings.vibration, 8);
      }, index * 130 + Math.pow(progress, 2) * 360);
    }

    winnersList.forEach((winner, idx) => {
      addTimeout(() => {
        setGachaRevealIds((current) => [...current, winner.id]);
        playTone(sourceSettings.sound, 880 + idx * 24, 0.12, 'triangle');
        vibrate(sourceSettings.vibration, [40, 25, 70]);
      }, duration + 220 + idx * revealStep);
    });

    const tail = duration + 220 + Math.max(0, winnersList.length - 1) * revealStep + 740;
    addTimeout(onDone, tail);
  }

  const activeMode = modeOptions.find((mode) => mode.value === settings.mode) ?? modeOptions[0];
  const headerLabel = countdownRemaining !== null
    ? `倒數 ${countdownRemaining}`
    : isDrawing
      ? '抽選中'
      : winners.length
        ? winners.length > 1 ? `本次 ${winners.length} 位得主` : '本次得主'
        : '待命';
  const headerName = countdownRemaining !== null
    ? String(countdownRemaining)
    : winners.length
      ? winners.length > 1
        ? winners.map((winner) => winner.name).join('、')
        : winners[0]!.name
      : activeMode.label;

  return (
    <div
      className={[
        'app',
        `theme-${settings.theme}`,
        settings.hostMode ? 'host-mode' : '',
        isDisplayOnly ? 'display-only' : '',
        isObsMode ? 'obs-mode' : '',
        isCheerMode ? 'cheer-mode' : ''
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Confetti burstKey={confettiKey} />
      <WinnerBanner key={bannerKey} burstKey={bannerKey} name={bannerName} />
      {countdownRemaining !== null && <CountdownOverlay value={countdownRemaining} />}
      {notice && <div className="app-notice">{notice}</div>}

      <input
        type="file"
        accept="image/*"
        multiple
        ref={fileInputRef}
        style={{ display: 'none' }}
        onChange={(event) => {
          handleBulkImageImport(event.target.files);
          event.target.value = '';
        }}
      />
      <input
        type="file"
        accept="image/*"
        ref={itemImageInputRef}
        style={{ display: 'none' }}
        onChange={(event) => {
          handleItemImageReplace(event.target.files);
          event.target.value = '';
        }}
      />

      {!isObsMode && (
        <header className="topbar">
          <div className="brand">
            <span className="brand-mark">
              <Shuffle size={22} />
            </span>
            <div>
              <h1>跑馬燈抽獎機</h1>
              <p>{activeMode.label}</p>
            </div>
          </div>

          {!isDisplayOnly && (
            <div className="top-actions">
              <button className="install-button" type="button" title="安裝到裝置" onClick={installApp}>
                <Download size={18} />
                {isInstalled ? '已安裝' : '安裝'}
              </button>
              <button className="icon-button" type="button" title="QR Code" onClick={showQrCode}>
                <QrCode size={20} />
              </button>
              <button className="icon-button" type="button" title="投影分頁" onClick={openDisplayWindow}>
                <MonitorUp size={20} />
              </button>
              <button className="icon-button" type="button" title="全螢幕" onClick={toggleFullscreen}>
                <Maximize2 size={20} />
              </button>
            </div>
          )}
        </header>
      )}

      <main className="workspace">
        {!isDisplayOnly && !isObsMode && (
          <aside className={`panel roster-panel ${editingDisabled ? 'is-locked' : ''}`}>
            <section className="panel-section">
              <div className="section-title">
                <ListPlus size={18} />
                <h2>名單</h2>
              </div>

              <div className="quick-add">
                <input
                  value={newName}
                  placeholder="名稱"
                  disabled={editingDisabled}
                  onChange={(event) => setNewName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') addItem();
                  }}
                />
                <input
                  className="weight-input"
                  min="0.1"
                  step="0.1"
                  type="number"
                  value={newWeight}
                  disabled={editingDisabled}
                  onChange={(event) => setNewWeight(Number(event.target.value))}
                />
                <button
                  className="icon-button accent"
                  type="button"
                  title="新增"
                  disabled={editingDisabled}
                  onClick={addItem}
                >
                  <Plus size={20} />
                </button>
              </div>

              <textarea
                className="import-box"
                value={importText}
                placeholder={'貼上名單，每行一筆\n王小明,2\n李小華,1'}
                disabled={editingDisabled}
                onChange={(event) => setImportText(event.target.value)}
              />
              <div className="button-row">
                <button type="button" disabled={editingDisabled} onClick={() => applyImport(false)}>
                  <Upload size={17} />
                  匯入
                </button>
                <button type="button" disabled={editingDisabled} onClick={() => applyImport(true)}>
                  <Eraser size={17} />
                  取代
                </button>
                <button type="button" onClick={exportList}>
                  <Download size={17} />
                  匯出
                </button>
                <button type="button" onClick={shareList}>
                  <Share2 size={17} />
                  分享
                </button>
              </div>
              <div className="button-row">
                <button
                  type="button"
                  disabled={editingDisabled}
                  onClick={() => fileInputRef.current?.click()}
                  title="一次匯入多張圖片，每張變成一個項目"
                >
                  <FileImage size={17} />
                  圖片匯入
                </button>
              </div>
              {shareUrl && (
                <button
                  className="share-link"
                  type="button"
                  title="點一下複製分享連結"
                  onClick={() => {
                    navigator.clipboard
                      .writeText(shareUrl)
                      .then(() => showNotice('分享連結已複製'))
                      .catch(() => showNotice('請手動複製分享連結'));
                  }}
                >
                  {shareUrl}
                </button>
              )}
            </section>

            <section className="panel-section roster-list" aria-label="抽獎名單">
              {items.map((item) => (
                <div
                  className={`roster-item ${item.drawn ? 'is-drawn' : ''} ${item.excluded ? 'is-excluded' : ''}`}
                  key={item.id}
                >
                  <button
                    className="drawn-toggle"
                    type="button"
                    title="抽中狀態"
                    onClick={() => updateItem(item.id, { drawn: !item.drawn })}
                  >
                    {item.drawn ? <Check size={15} /> : <Trophy size={15} />}
                  </button>
                  <button
                    className={`thumb-button ${item.image ? 'has-image' : ''}`}
                    type="button"
                    title={item.image ? '點擊更換圖片' : '加入圖片'}
                    onClick={() => pickItemImage(item.id)}
                  >
                    {item.image ? (
                      <img src={item.image} alt={item.name} />
                    ) : (
                      <ImagePlus size={16} />
                    )}
                  </button>
                  <input
                    value={item.name}
                    disabled={editingDisabled}
                    onChange={(event) => updateItem(item.id, { name: event.target.value })}
                  />
                  <input
                    className="weight-input"
                    min="0.1"
                    step="0.1"
                    type="number"
                    value={item.weight}
                    disabled={editingDisabled}
                    onChange={(event) =>
                      updateItem(item.id, { weight: Math.max(0, Number(event.target.value) || 0) })
                    }
                  />
                  {item.image && (
                    <button
                      className="icon-button quiet small"
                      type="button"
                      title="清除圖片"
                      onClick={() => clearItemImage(item.id)}
                    >
                      <X size={14} />
                    </button>
                  )}
                  <button
                    className="icon-button quiet"
                    type="button"
                    title="刪除"
                    disabled={editingDisabled}
                    onClick={() => deleteItem(item.id)}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              ))}
            </section>
          </aside>
        )}

        <section className="stage-shell">
          {!isObsMode && (
            <div className="mode-tabs" role="tablist" aria-label="玩法">
              {modeOptions.map(({ value, label, Icon }) => (
                <button
                  className={settings.mode === value ? 'is-active' : ''}
                  type="button"
                  role="tab"
                  aria-selected={settings.mode === value}
                  key={value}
                  disabled={editingDisabled || isDisplayOnly}
                  onClick={() => {
                    updateSettings({ mode: value });
                    setWinners([]);
                    setRunPool([]);
                    setGachaRevealIds([]);
                  }}
                >
                  <Icon size={18} />
                  {label}
                </button>
              ))}
            </div>
          )}

          <div className="stage-card">
            <div className="stage-status" aria-live="polite">
              <div>
                <span className="eyebrow">{headerLabel}</span>
                <strong>{headerName}</strong>
              </div>
              <div className="pool-stats">
                <span>{playableItems.length} 位</span>
                <span>{totalWeight.toFixed(1)} 權重</span>
                <span>抽 {Math.min(settings.drawCount, Math.max(playableItems.length, 1))} 名</span>
              </div>
            </div>

            <ModeStage
              mode={settings.mode}
              items={stageItems}
              marqueeIndex={marqueeIndex}
              wheelRotation={wheelRotation}
              wheelMs={wheelMs}
              slotReels={slotReels}
              gachaCards={gachaCards}
              gachaRevealIds={gachaRevealIds}
              gachaShuffleKey={gachaShuffleKey}
              winner={primaryWinner}
              winnerIds={winners.map((winner) => winner.id)}
              isDrawing={isDrawing}
            />

            {winners.length > 1 && !isDrawing && (
              <div className="winners-row" aria-label="本次得獎者">
                {winners.map((winner) => (
                  <div className="winners-row-item" key={winner.id}>
                    {winner.image ? (
                      <img src={winner.image} alt={winner.name} />
                    ) : (
                      <span className="winners-row-mark">
                        <Trophy size={18} />
                      </span>
                    )}
                    <strong>{winner.name}</strong>
                  </div>
                ))}
              </div>
            )}

            {!isObsMode && (
              <div className="control-deck">
                <button
                  className="start-button"
                  type="button"
                  disabled={isDrawing || countdownRemaining !== null || !playableItems.length}
                  onClick={startDrawWithCountdown}
                >
                  <Play size={22} fill="currentColor" />
                  {countdownRemaining !== null ? `倒數 ${countdownRemaining}` : isDrawing ? '抽選中' : '開始抽獎'}
                </button>
                {!isDisplayOnly && (
                  <button className="secondary-button" type="button" onClick={resetDrawn}>
                    <RotateCcw size={18} />
                    重置抽中
                  </button>
                )}
              </div>
            )}
          </div>
        </section>

        {!isDisplayOnly && !isObsMode && (
          <aside className="panel settings-panel">
            <section className="panel-section">
              <div className="section-title">
                <Sparkles size={18} />
                <h2>效果</h2>
              </div>

              <label className="field">
                <span>主題</span>
                <select value={settings.theme} onChange={(event) => updateSettings({ theme: event.target.value as ThemeName })}>
                  {themeOptions.map((theme) => (
                    <option value={theme.value} key={theme.value}>
                      {theme.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>緊張感</span>
                <input
                  min="1"
                  max="10"
                  type="range"
                  value={settings.excitement}
                  onChange={(event) => updateSettings({ excitement: Number(event.target.value) })}
                />
              </label>

              <div className="field">
                <span>
                  <Users size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />
                  一次抽幾名（上限 {Math.max(playableItems.length, 1)}）
                </span>
                <input
                  className="weight-input"
                  type="number"
                  min={1}
                  max={Math.max(playableItems.length, 1)}
                  value={settings.drawCount}
                  onChange={(event) => {
                    const limit = Math.max(playableItems.length, 1);
                    const next = Math.max(1, Math.min(limit, Number(event.target.value) || 1));
                    updateSettings({ drawCount: next });
                  }}
                />
                <div className="draw-count-presets">
                  {drawCountPresets.map((value) => {
                    const limit = Math.max(playableItems.length, 1);
                    const target = Math.min(value, limit);
                    return (
                      <button
                        key={value}
                        type="button"
                        className={settings.drawCount === target ? 'is-active' : ''}
                        onClick={() => updateSettings({ drawCount: target })}
                      >
                        {value}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    className={
                      playableItems.length > 0 && settings.drawCount === playableItems.length ? 'is-active' : ''
                    }
                    onClick={() => updateSettings({ drawCount: Math.max(playableItems.length, 1) })}
                  >
                    全部
                  </button>
                </div>
              </div>

              <label className="field">
                <span>倒數</span>
                <select
                  value={settings.countdown}
                  onChange={(event) => updateSettings({ countdown: Number(event.target.value) })}
                >
                  {countdownOptions.map((option) => (
                    <option value={option.value} key={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="toggle-grid">
                <ToggleButton active={settings.skipDrawn} onClick={() => updateSettings({ skipDrawn: !settings.skipDrawn })}>
                  排除已抽中
                </ToggleButton>
                <ToggleButton
                  active={settings.autoMarkDrawn}
                  onClick={() => updateSettings({ autoMarkDrawn: !settings.autoMarkDrawn })}
                >
                  自動標記
                </ToggleButton>
                <button className={`toggle ${settings.sound ? 'is-on' : ''}`} type="button" onClick={() => updateSettings({ sound: !settings.sound })}>
                  {settings.sound ? <Volume2 size={17} /> : <VolumeX size={17} />}
                  音效
                </button>
                <button
                  className={`toggle ${settings.vibration ? 'is-on' : ''}`}
                  type="button"
                  onClick={() => updateSettings({ vibration: !settings.vibration })}
                >
                  <Vibrate size={17} />
                  震動
                </button>
                <button
                  className={`toggle ${settings.hostMode ? 'is-on' : ''}`}
                  type="button"
                  onClick={() => updateSettings({ hostMode: !settings.hostMode })}
                >
                  <MonitorUp size={17} />
                  主持人模式
                </button>
              </div>
            </section>

            <section className="panel-section">
              <div className="section-title">
                <History size={18} />
                <h2>紀錄</h2>
              </div>
              <div className="history-list">
                {history.length ? (
                  history.map((record) => (
                    <article className="history-item" key={record.id}>
                      <strong>{record.winnerName}</strong>
                      <span>
                        {formatTime(record.at)} · {modeLabel(record.mode)} · {record.poolSize} 位
                        {record.batchId ? ' · 連抽' : ''}
                      </span>
                    </article>
                  ))
                ) : (
                  <p className="empty-state">尚無紀錄</p>
                )}
              </div>
              <div className="button-row">
                <button type="button" onClick={undoLastDraw}>
                  <Undo2 size={17} />
                  撤銷上一次
                </button>
                <button type="button" onClick={exportHistoryCsv}>
                  <FileSpreadsheet size={17} />
                  匯出 CSV
                </button>
              </div>
              <button className="secondary-button full-width" type="button" onClick={clearHistory}>
                <Trash2 size={17} />
                清空紀錄
              </button>
            </section>
          </aside>
        )}
      </main>

      {qrModalUrl && <QrModal url={qrModalUrl} onClose={() => setQrModalUrl(null)} />}
    </div>
  );
}

function ModeStage({
  mode,
  items,
  marqueeIndex,
  wheelRotation,
  wheelMs,
  slotReels,
  gachaCards,
  gachaRevealIds,
  gachaShuffleKey,
  winner,
  winnerIds,
  isDrawing
}: {
  mode: GameMode;
  items: DrawItem[];
  marqueeIndex: number;
  wheelRotation: number;
  wheelMs: number;
  slotReels: ReelCell[][];
  gachaCards: DrawItem[];
  gachaRevealIds: string[];
  gachaShuffleKey: number;
  winner: DrawItem | null;
  winnerIds: string[];
  isDrawing: boolean;
}) {
  if (!items.length) {
    return (
      <div className="empty-stage">
        <ListPlus size={42} />
        <strong>加入名單</strong>
      </div>
    );
  }

  if (mode === 'wheel') {
    return <WheelStage items={items} rotation={wheelRotation} duration={wheelMs} winner={winner} />;
  }

  if (mode === 'slot') {
    return (
      <SlotStage
        reels={slotReels.length ? slotReels : createReels(items)}
        winnerId={winner?.id ?? null}
        isDrawing={isDrawing}
      />
    );
  }

  if (mode === 'gacha') {
    return (
      <GachaStage
        cards={gachaCards.length ? gachaCards : buildGachaDeck(items, [])}
        revealIds={gachaRevealIds}
        winnerIds={winnerIds}
        isDrawing={isDrawing}
        shuffleKey={gachaShuffleKey}
      />
    );
  }

  return <MarqueeStage items={items} activeIndex={marqueeIndex} winnerIds={winnerIds} />;
}

function MarqueeStage({ items, activeIndex, winnerIds }: { items: DrawItem[]; activeIndex: number; winnerIds: string[] }) {
  const winnerSet = new Set(winnerIds);
  return (
    <div className="marquee-grid">
      {items.map((item, index) => (
        <div
          className={[
            'marquee-tile',
            index === activeIndex ? 'is-hot' : '',
            item.drawn ? 'is-drawn' : '',
            winnerSet.has(item.id) ? 'is-winner' : ''
          ]
            .filter(Boolean)
            .join(' ')}
          key={item.id}
        >
          {item.image && <img className="tile-image" src={item.image} alt={item.name} />}
          <span>{item.name}</span>
          <small>{item.weight}x</small>
        </div>
      ))}
    </div>
  );
}

function WheelStage({ items, rotation, duration, winner }: { items: DrawItem[]; rotation: number; duration: number; winner: DrawItem | null }) {
  const segment = 360 / items.length;
  const gradient = items
    .map((item, index) => {
      const start = index * segment;
      const end = (index + 1) * segment;
      return `${wheelColors[index % wheelColors.length]} ${start}deg ${end}deg`;
    })
    .join(', ');

  const labelRadius = items.length > 16 ? 36 : items.length > 10 ? 34 : 31;

  return (
    <div className="wheel-stage">
      <div className="wheel-pointer" />
      <div
        className="wheel-disc"
        style={
          {
            background: `conic-gradient(from -90deg, ${gradient})`,
            transform: `rotate(${rotation}deg)`,
            transitionDuration: `${duration}ms`
          } as CSSProperties
        }
      >
        {items.map((item, index) => (
          <span
            className="wheel-label"
            key={item.id}
            title={item.name}
            style={
              {
                ...wheelLabelStyle(index * segment + segment / 2, labelRadius),
                '--label-bg': wheelColors[index % wheelColors.length]
              } as CSSProperties
            }
          >
            {item.name}
          </span>
        ))}
      </div>
      <div className="wheel-hub">
        {winner?.image ? (
          <img className="wheel-hub-image" src={winner.image} alt={winner.name} />
        ) : (
          <Trophy size={24} />
        )}
        <strong>{winner?.name ?? 'READY'}</strong>
      </div>
    </div>
  );
}

function wheelLabelStyle(angle: number, radius: number): CSSProperties {
  const rad = ((angle - 90) * Math.PI) / 180;
  return {
    left: `${50 + Math.cos(rad) * radius}%`,
    top: `${50 + Math.sin(rad) * radius}%`
  };
}

function SlotStage({ reels, winnerId, isDrawing }: { reels: ReelCell[][]; winnerId: string | null; isDrawing: boolean }) {
  return (
    <div className={`slot-machine ${isDrawing ? 'is-spinning' : ''}`}>
      {reels.map((reel, column) => (
        <div className="slot-reel" key={`${column}-${reel.map((cell) => cell.id ?? cell.name).join('-')}`}>
          {reel.map((cell, index) => (
            <div
              className={[
                'slot-cell',
                index === 1 ? 'is-center' : '',
                winnerId && cell.id === winnerId && index === 1 ? 'is-winner' : ''
              ]
                .filter(Boolean)
                .join(' ')}
              key={`${cell.id ?? cell.name}-${index}`}
            >
              {cell.image && index === 1 ? (
                <img className="slot-cell-image" src={cell.image} alt={cell.name} />
              ) : null}
              <span>{cell.name}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function GachaStage({
  cards,
  revealIds,
  winnerIds,
  isDrawing,
  shuffleKey
}: {
  cards: DrawItem[];
  revealIds: string[];
  winnerIds: string[];
  isDrawing: boolean;
  shuffleKey: number;
}) {
  const winnerSet = new Set(winnerIds);
  const revealSet = new Set(revealIds);
  return (
    <div className={`gacha-stage ${isDrawing ? 'is-drawing' : ''}`} data-shuffle={shuffleKey}>
      {cards.map((card, index) => {
        const revealed = revealSet.has(card.id) || (!isDrawing && winnerSet.has(card.id));
        return (
          <div
            className={`gacha-card ${revealed ? 'is-revealed' : ''}`}
            key={card.id}
            style={{ '--delay': `${index * 0.045}s` } as CSSProperties}
          >
            <div className="gacha-card-inner">
              <div className="gacha-face gacha-back">
                <PackageOpen size={32} />
                <strong>?</strong>
              </div>
              <div className="gacha-face gacha-front">
                {card.image ? (
                  <img className="gacha-card-image" src={card.image} alt={card.name} />
                ) : (
                  <Trophy size={28} />
                )}
                <strong>{card.name}</strong>
                <small>{card.weight}x</small>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ToggleButton({ active, children, onClick }: { active: boolean; children: string; onClick: () => void }) {
  return (
    <button className={`toggle ${active ? 'is-on' : ''}`} type="button" onClick={onClick}>
      <Check size={17} />
      {children}
    </button>
  );
}

function Confetti({ burstKey }: { burstKey: number }) {
  const particles = useMemo(() => {
    if (!burstKey) return [];
    return Array.from({ length: 56 }, (_, index) => ({
      id: `${burstKey}-${index}`,
      left: 8 + Math.random() * 84,
      delay: Math.random() * 0.24,
      duration: 1.25 + Math.random() * 1.1,
      rotate: Math.random() * 720,
      size: 7 + Math.random() * 9,
      color: wheelColors[index % wheelColors.length]
    }));
  }, [burstKey]);

  if (!particles.length) return null;

  return (
    <div className="confetti-layer" aria-hidden="true" key={burstKey}>
      {particles.map((particle) => (
        <span
          key={particle.id}
          style={
            {
              left: `${particle.left}%`,
              animationDelay: `${particle.delay}s`,
              animationDuration: `${particle.duration}s`,
              '--spin': `${particle.rotate}deg`,
              '--size': `${particle.size}px`,
              '--color': particle.color
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

function WinnerBanner({ burstKey, name }: { burstKey: number; name: string }) {
  if (!burstKey || !name) return null;
  return (
    <div className="winner-banner" aria-hidden="true">
      <div className="winner-banner-track">
        <span>🏆 {name} 🎉 {name} 🎊 {name} ✨ {name}</span>
      </div>
    </div>
  );
}

function CountdownOverlay({ value }: { value: number }) {
  return (
    <div className="countdown-overlay" aria-live="polite" key={value}>
      <strong>{value}</strong>
    </div>
  );
}

function QrModal({ url, onClose }: { url: string; onClose: () => void }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSvg(null);
    setError(false);
    generateQrSvg(url)
      .then((value) => {
        if (!cancelled) setSvg(value);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <div className="qr-modal" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="qr-modal-card" onClick={(event) => event.stopPropagation()}>
        <button className="icon-button quiet qr-close" type="button" title="關閉" onClick={onClose}>
          <X size={18} />
        </button>
        {error ? (
          <p>名單過長，無法生成 QR Code，請使用分享連結。</p>
        ) : svg ? (
          <div className="qr-canvas" dangerouslySetInnerHTML={{ __html: svg }} />
        ) : (
          <div className="qr-canvas" aria-hidden="true" />
        )}
        <p className="qr-url">{url}</p>
      </div>
    </div>
  );
}

function loadInitialState(): PersistedState {
  const loaded = loadState();
  const params = new URLSearchParams(window.location.search);
  const encodedList = params.get('list');
  const mode = params.get('mode');
  const theme = params.get('theme');
  const settings = { ...defaultSettings, ...loaded.settings };
  let items = loaded.items;
  let history = loaded.history;

  if (isGameMode(mode)) {
    settings.mode = mode;
  }

  if (isThemeName(theme)) {
    settings.theme = theme;
  }

  if (encodedList) {
    try {
      const sharedItems = parseImportText(decodeSharePayload(encodedList));
      if (sharedItems.length) {
        items = sharedItems;
        history = [];
      }
    } catch {
      // Keep local data when a pasted share URL is incomplete or edited.
    }
  }

  return { items, history, settings };
}

function isGameMode(value: string | null): value is GameMode {
  return Boolean(value && modeOptions.some((option) => option.value === value));
}

function isThemeName(value: string | null): value is ThemeName {
  return value === 'neon' || value === 'temple' || value === 'casino' || value === 'future';
}

function createShareUrl(items: DrawItem[], settings: AppSettings) {
  const params = new URLSearchParams();
  params.set('list', encodeSharePayload(itemsToImportText(items)));
  params.set('mode', settings.mode);
  params.set('theme', settings.theme);
  return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
}

function itemsToImportText(items: DrawItem[]) {
  return items.filter((item) => item.name.trim()).map((item) => `${item.name.trim()},${item.weight || 1}`).join('\n');
}

function encodeSharePayload(text: string) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeSharePayload(value: string) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function buildGachaDeck(pool: DrawItem[], winnersList: DrawItem[]) {
  const available = pool.filter((item) => item.name.trim() && item.weight > 0);
  if (!available.length) return [];
  const winnerIds = new Set(winnersList.map((winner) => winner.id));
  const fillers = available.filter((item) => !winnerIds.has(item.id));
  const targetSize = Math.min(available.length, Math.max(12, winnersList.length || 1));
  const fillerCount = Math.max(0, targetSize - winnersList.length);
  const deck = [...winnersList, ...shuffleDrawItems(fillers).slice(0, fillerCount)];
  return shuffleDrawItems(deck);
}

function shuffleDrawItems(items: DrawItem[]) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(cryptoRandomFloat() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

function createReels(items: DrawItem[]): ReelCell[][] {
  return [createReelWindow(items), createReelWindow(items), createReelWindow(items)];
}

function createReelWindow(items: DrawItem[], center?: DrawItem): ReelCell[] {
  if (!items.length) {
    return [
      { id: null, name: '-' },
      { id: null, name: '-' },
      { id: null, name: '-' }
    ];
  }
  const centerCell: ReelCell = center
    ? { id: center.id, name: center.name, image: center.image }
    : pickCell(items);
  return [pickCell(items), centerCell, pickCell(items)];
}

function pickCell(items: DrawItem[]): ReelCell {
  const index = Math.floor(cryptoRandomFloat() * items.length);
  const item = items[index] ?? items[0];
  return { id: item?.id ?? null, name: item?.name ?? '-', image: item?.image };
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function modeLabel(mode: GameMode) {
  return modeOptions.find((option) => option.value === mode)?.label ?? mode;
}

export default App;
