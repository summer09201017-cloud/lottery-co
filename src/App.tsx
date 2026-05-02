import {
  BarChart3,
  Check,
  CircleDot,
  Dice5,
  Download,
  Eraser,
  FileSpreadsheet,
  Gift,
  History,
  ListPlus,
  Maximize2,
  Megaphone,
  MonitorUp,
  Music,
  Music2,
  PackageOpen,
  Palette,
  Play,
  Plus,
  QrCode,
  RotateCcw,
  Share2,
  Shuffle,
  Sparkles,
  Ticket,
  Timer,
  Trash2,
  Trophy,
  Upload,
  Vibrate,
  Volume2,
  VolumeX,
  X,
  Zap
} from 'lucide-react';
import type { CSSProperties, ComponentType } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createId, cryptoRandomFloat, getPlayableItems, parseImportText, weightedPick } from './randomEngine';
import { playTone, speak, startBgMusic, stopBgMusic, vibrate } from './fx';
import { defaultSettings, loadState, saveState } from './storage';
import type { AppSettings, DrawItem, DrawRecord, GameMode, PersistedState, ThemeName, WheelPalette } from './types';

const isDisplayOnly = new URLSearchParams(window.location.search).get('display') === '1';

const modeOptions: Array<{ value: GameMode; label: string; Icon: ComponentType<{ size?: number }> }> = [
  { value: 'marquee', label: '跑馬燈', Icon: Sparkles },
  { value: 'wheel', label: '轉盤', Icon: CircleDot },
  { value: 'slot', label: '拉霸', Icon: Dice5 },
  { value: 'gacha', label: '抽卡盲盒', Icon: Gift },
  { value: 'card', label: '單抽卡牌', Icon: Ticket }
];

const themeOptions: Array<{ value: ThemeName; label: string }> = [
  { value: 'neon', label: '霓虹電玩' },
  { value: 'temple', label: '廟口籤筒' },
  { value: 'casino', label: '賭場拉霸' },
  { value: 'future', label: '科技大螢幕' }
];

const wheelPalettes: Record<WheelPalette, { label: string; colors: string[] }> = {
  rainbow: {
    label: '彩虹',
    colors: ['#22d3ee', '#f97316', '#a3e635', '#ef4444', '#facc15', '#38bdf8', '#fb7185', '#34d399', '#c084fc', '#f59e0b']
  },
  warm: {
    label: '暖色',
    colors: ['#f97316', '#fb7185', '#facc15', '#ef4444', '#f59e0b', '#fb923c', '#fda4af', '#fde047']
  },
  cool: {
    label: '冷色',
    colors: ['#22d3ee', '#38bdf8', '#34d399', '#a3e635', '#c084fc', '#60a5fa', '#67e8f9', '#86efac']
  },
  mono: {
    label: '單色',
    colors: ['#1e293b', '#334155', '#475569', '#64748b', '#94a3b8', '#cbd5e1']
  }
};

const wheelColors = wheelPalettes.rainbow.colors;

const excitementLabels = ['', '冷靜', '輕快', '輕快', '正常', '正常', '熱烈', '熱烈', '狂熱', '狂熱', '極致'];

const countdownOptions: Array<{ value: number; label: string }> = [
  { value: 0, label: '關閉' },
  { value: 3, label: '3 秒' },
  { value: 5, label: '5 秒' },
  { value: 10, label: '10 秒' }
];

type StatePayload = PersistedState;

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
  const [winner, setWinner] = useState<DrawItem | null>(null);
  const [winners, setWinners] = useState<DrawItem[]>([]);
  const [showWinnerOverlay, setShowWinnerOverlay] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [runPool, setRunPool] = useState<DrawItem[]>([]);
  const [marqueeIndex, setMarqueeIndex] = useState(0);
  const [wheelRotation, setWheelRotation] = useState(0);
  const [wheelMs, setWheelMs] = useState(4200);
  const [slotReels, setSlotReels] = useState<string[][]>([]);
  const [gachaCards, setGachaCards] = useState<DrawItem[]>([]);
  const [gachaRevealId, setGachaRevealId] = useState<string | null>(null);
  const [gachaShuffleKey, setGachaShuffleKey] = useState(0);
  const [cardPhase, setCardPhase] = useState<'idle' | 'shaking' | 'flipping' | 'revealed'>('idle');
  const [cardWinner, setCardWinner] = useState<DrawItem | null>(null);
  const [confettiKey, setConfettiKey] = useState(0);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(
    () => window.matchMedia?.('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState('');
  const [countdownNumber, setCountdownNumber] = useState<number | null>(null);
  const [showQrModal, setShowQrModal] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [liveAnnounce, setLiveAnnounce] = useState('');

  const stateRef = useRef<StatePayload>({ items, history, settings });
  const timeoutsRef = useRef<number[]>([]);
  const intervalsRef = useRef<number[]>([]);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const clientIdRef = useRef(createId('client'));
  const drawingRef = useRef(false);
  const marqueeIndexRef = useRef(0);
  const wheelRotationRef = useRef(0);
  const noticeTimeoutRef = useRef<number | null>(null);

  const cleanItems = useMemo(() => items.filter((item) => item.name.trim() && item.weight > 0), [items]);
  const playableItems = useMemo(() => getPlayableItems(items, settings.skipDrawn), [items, settings.skipDrawn]);
  const stageItems = runPool.length ? runPool : playableItems.length ? playableItems : cleanItems;
  const stageNamesKey = stageItems.map((item) => `${item.id}:${item.name}`).join('|');
  const totalWeight = playableItems.reduce((sum, item) => sum + item.weight, 0);
  const activePalette = wheelPalettes[settings.wheelPalette ?? 'rainbow']?.colors ?? wheelColors;

  useEffect(() => {
    stateRef.current = { items, history, settings };
    if (!isDisplayOnly) {
      saveState(stateRef.current);
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
    if (settings.mode !== 'slot' || !stageItems.length || isDrawing || winner) return;
    setSlotReels(createReels(stageItems.map((item) => item.name)));
  }, [settings.mode, isDrawing, stageNamesKey, winner]);

  useEffect(() => {
    if (settings.mode !== 'gacha' || !stageItems.length || isDrawing || winner) return;
    setGachaCards(buildGachaDeck(stageItems, null));
    setGachaRevealId(null);
  }, [settings.mode, isDrawing, stageNamesKey, winner]);

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
      stopBgMusic();
      if (noticeTimeoutRef.current) window.clearTimeout(noticeTimeoutRef.current);
    },
    []
  );

  useEffect(() => {
    if (!settings.bgMusic) stopBgMusic();
  }, [settings.bgMusic]);

  function broadcast(message: OutboundChannelMessage) {
    channelRef.current?.postMessage({ ...message, origin: clientIdRef.current } as ChannelMessage);
  }

  function clearMotionTimers() {
    timeoutsRef.current.forEach((id) => window.clearTimeout(id));
    intervalsRef.current.forEach((id) => window.clearInterval(id));
    timeoutsRef.current = [];
    intervalsRef.current = [];
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
    const header = '時間,得主,權重,玩法,主題,當時人數';
    const rows = history.map((record) => {
      const time = new Date(record.at).toLocaleString('zh-TW');
      const safe = (value: string) => `"${String(value).replace(/"/g, '""')}"`;
      return [
        safe(time),
        safe(record.winnerName),
        record.winnerWeight,
        safe(modeLabel(record.mode)),
        safe(record.theme),
        record.poolSize
      ].join(',');
    });
    const csv = '﻿' + [header, ...rows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `lottery-history-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showNotice('紀錄已匯出 CSV');
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

  function runDraw(
    mode = settings.mode,
    forcedWinnerIds?: string[],
    remote = false,
    sourceItems = stateRef.current.items,
    sourceSettings = stateRef.current.settings
  ) {
    if (drawingRef.current) return;

    const playable = getPlayableItems(sourceItems, sourceSettings.skipDrawn);
    const count = Math.max(1, sourceSettings.drawCount ?? 1);

    const selectedWinners: DrawItem[] = forcedWinnerIds
      ? forcedWinnerIds
          .map((id) => playable.find((item) => item.id === id) ?? sourceItems.find((item) => item.id === id))
          .filter((item): item is DrawItem => item != null)
      : pickMultipleWeighted(playable, count);

    const animationTarget = selectedWinners[0] ?? null;

    if (!animationTarget || !playable.length) {
      playTone(sourceSettings.sound, 180, 0.12, 'square');
      vibrate(sourceSettings.vibration, [30, 20, 30]);
      return;
    }

    clearMotionTimers();
    drawingRef.current = true;
    setIsDrawing(true);
    setWinner(null);
    setWinners([]);
    setShowWinnerOverlay(false);
    setGachaRevealId(null);
    setCardPhase('idle');
    setCardWinner(null);
    setRunPool(playable);
    setLiveAnnounce('開始抽獎');
    playTone(sourceSettings.sound, 440, 0.08, 'triangle');
    vibrate(sourceSettings.vibration, 18);

    if (!remote) {
      broadcast({
        type: 'DRAW',
        commandId: createId('cmd'),
        winnerIds: selectedWinners.map((w) => w.id),
        mode,
        state: { items: sourceItems, history: stateRef.current.history, settings: { ...sourceSettings, mode } }
      });
    }

    const onDone = () => finishDraw(selectedWinners, mode, playable.length, sourceSettings);
    const startAnimation = () => {
      if (sourceSettings.bgMusic) startBgMusic();
      if (sourceSettings.quickMode) {
        // 快速模式：跳過動畫直接揭曉
        addTimeout(onDone, 250);
        return;
      }
      if (mode === 'wheel') {
        animateWheel(playable, animationTarget, sourceSettings, onDone);
        return;
      }
      if (mode === 'slot') {
        animateSlot(playable, animationTarget, sourceSettings, onDone);
        return;
      }
      if (mode === 'gacha') {
        animateGacha(playable, animationTarget, sourceSettings, onDone);
        return;
      }
      if (mode === 'card') {
        animateCard(animationTarget, sourceSettings, onDone);
        return;
      }
      animateMarquee(playable, animationTarget, sourceSettings, onDone);
    };

    const countdownSeconds = sourceSettings.countdown ?? 0;
    if (countdownSeconds > 0 && !sourceSettings.quickMode) {
      runCountdown(countdownSeconds, sourceSettings, startAnimation);
    } else {
      startAnimation();
    }
  }

  function runCountdown(seconds: number, sourceSettings: AppSettings, onComplete: () => void) {
    let remaining = seconds;
    setCountdownNumber(remaining);
    setLiveAnnounce(`倒數 ${remaining} 秒`);
    playTone(sourceSettings.sound, 660, 0.1, 'sine');
    vibrate(sourceSettings.vibration, 30);

    const tick = () => {
      remaining -= 1;
      if (remaining > 0) {
        setCountdownNumber(remaining);
        playTone(sourceSettings.sound, 660, 0.1, 'sine');
        vibrate(sourceSettings.vibration, 30);
        addTimeout(tick, 1000);
      } else {
        setCountdownNumber(0);
        playTone(sourceSettings.sound, 1320, 0.18, 'triangle');
        vibrate(sourceSettings.vibration, [60, 30, 90]);
        addTimeout(() => {
          setCountdownNumber(null);
          onComplete();
        }, 600);
      }
    };
    addTimeout(tick, 1000);
  }

  function finishDraw(winningItems: DrawItem[], mode: GameMode, poolSize: number, sourceSettings: AppSettings) {
    const now = new Date().toISOString();
    const newRecords: DrawRecord[] = winningItems.map((item) => ({
      id: createId('draw'),
      winnerId: item.id,
      winnerName: item.name,
      winnerWeight: item.weight,
      mode,
      theme: sourceSettings.theme,
      poolSize,
      at: now
    }));

    setWinner(winningItems[0] ?? null);
    setWinners(winningItems);
    setHistory((current) => [...newRecords, ...current].slice(0, 200));
    if (sourceSettings.autoMarkDrawn) {
      const winnerIdSet = new Set(winningItems.map((w) => w.id));
      setItems((current) => current.map((item) => (winnerIdSet.has(item.id) ? { ...item, drawn: true } : item)));
    }
    setConfettiKey((current) => current + 1);
    setShowWinnerOverlay(true);
    setIsDrawing(false);
    drawingRef.current = false;
    if (sourceSettings.bgMusic) stopBgMusic();
    const winnerNames = winningItems.map((w) => w.name).join('、');
    setLiveAnnounce(`恭喜得主 ${winnerNames}`);
    speak(sourceSettings.voiceAnnounce, `恭喜${winnerNames}中獎`);
    playTone(sourceSettings.sound, 784, 0.12, 'triangle');
    addTimeout(() => playTone(sourceSettings.sound, 1046, 0.15, 'triangle'), 120);
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
    const names = pool.map((item) => item.name);
    setSlotReels(createReels(names));

    [0, 1, 2].forEach((column) => {
      const interval = addInterval(() => {
        setSlotReels((current) => {
          const next = current.length ? [...current] : createReels(names);
          next[column] = createReelWindow(names);
          return next;
        });
        playTone(sourceSettings.sound, 220 + column * 80, 0.025, 'square');
      }, 60 + column * 18);

      const settleAt = 1500 + sourceSettings.excitement * 150 + column * 720;
      addTimeout(() => {
        window.clearInterval(interval);
        intervalsRef.current = intervalsRef.current.filter((id) => id !== interval);
        setSlotReels((current) => {
          const next = current.length ? [...current] : createReels(names);
          next[column] = createReelWindow(names, winningItem.name);
          return next;
        });
        playTone(sourceSettings.sound, 520 + column * 90, 0.09, 'triangle');
        vibrate(sourceSettings.vibration, 25);
      }, settleAt);
    });

    addTimeout(onDone, 1500 + sourceSettings.excitement * 150 + 2 * 720 + 420);
  }

  function animateGacha(pool: DrawItem[], winningItem: DrawItem, sourceSettings: AppSettings, onDone: () => void) {
    const deck = buildGachaDeck(pool, winningItem);
    const duration = 1500 + sourceSettings.excitement * 160;
    const ticks = Math.max(10, Math.round(duration / 130));

    setGachaCards(deck);
    setGachaRevealId(null);

    for (let index = 0; index < ticks; index += 1) {
      const progress = index / ticks;
      addTimeout(() => {
        setGachaShuffleKey((current) => current + 1);
        playTone(sourceSettings.sound, 320 + Math.round(progress * 360), 0.035, 'square');
        if (index % 4 === 0) vibrate(sourceSettings.vibration, 8);
      }, index * 130 + Math.pow(progress, 2) * 360);
    }

    addTimeout(() => {
      setGachaRevealId(winningItem.id);
      playTone(sourceSettings.sound, 880, 0.12, 'triangle');
      vibrate(sourceSettings.vibration, [40, 25, 70]);
    }, duration + 220);

    addTimeout(onDone, duration + 960);
  }

  function animateCard(winningItem: DrawItem, sourceSettings: AppSettings, onDone: () => void) {
    setCardWinner(null);
    setCardPhase('shaking');

    const shakeDuration = 1200 + sourceSettings.excitement * 100;
    const ticks = Math.max(8, Math.round(shakeDuration / 140));

    for (let index = 0; index < ticks; index += 1) {
      addTimeout(() => {
        playTone(sourceSettings.sound, 280 + (index % 5) * 30, 0.04, 'square');
        if (index % 3 === 0) vibrate(sourceSettings.vibration, 10);
      }, index * 140);
    }

    addTimeout(() => {
      setCardPhase('flipping');
      setCardWinner(winningItem);
      playTone(sourceSettings.sound, 660, 0.18, 'triangle');
      addTimeout(() => playTone(sourceSettings.sound, 988, 0.18, 'triangle'), 180);
      vibrate(sourceSettings.vibration, [50, 30, 90]);
    }, shakeDuration);

    addTimeout(() => {
      setCardPhase('revealed');
    }, shakeDuration + 700);

    addTimeout(onDone, shakeDuration + 1100);
  }

  const activeMode = modeOptions.find((mode) => mode.value === settings.mode) ?? modeOptions[0];

  return (
    <div
      className={`app theme-${settings.theme} ${settings.hostMode ? 'host-mode' : ''} ${isDisplayOnly ? 'display-only' : ''}`}
    >
      <div className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
        {liveAnnounce}
      </div>
      {countdownNumber !== null && <CountdownOverlay value={countdownNumber} />}
      {showWinnerOverlay && winners.length > 0 && (
        <WinnerOverlay winners={winners} onDismiss={() => setShowWinnerOverlay(false)} />
      )}
      {showQrModal && shareUrl && <QrModal url={shareUrl} onClose={() => setShowQrModal(false)} />}
      {showStats && (
        <StatsModal history={history} items={items} onClose={() => setShowStats(false)} colors={activePalette} />
      )}
      <Confetti burstKey={confettiKey} colors={activePalette} />
      {notice && <div className="app-notice">{notice}</div>}

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
            <button className="icon-button" type="button" title="投影分頁" onClick={openDisplayWindow}>
              <MonitorUp size={20} />
            </button>
            <button className="icon-button" type="button" title="全螢幕" onClick={toggleFullscreen}>
              <Maximize2 size={20} />
            </button>
          </div>
        )}
      </header>

      <main className="workspace">
        {!isDisplayOnly && (
          <aside className="panel roster-panel">
            <section className="panel-section">
              <div className="section-title">
                <ListPlus size={18} />
                <h2>名單</h2>
              </div>

              <div className="quick-add">
                <input
                  value={newName}
                  placeholder="名稱"
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
                  onChange={(event) => setNewWeight(Number(event.target.value))}
                />
                <button className="icon-button accent" type="button" title="新增" onClick={addItem}>
                  <Plus size={20} />
                </button>
              </div>

              <textarea
                className="import-box"
                value={importText}
                placeholder={'貼上名單，每行一筆\n王小明,2\n李小華,1'}
                onChange={(event) => setImportText(event.target.value)}
              />
              <div className="button-row">
                <button type="button" onClick={() => applyImport(false)}>
                  <Upload size={17} />
                  匯入
                </button>
                <button type="button" onClick={() => applyImport(true)}>
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
                <button
                  type="button"
                  onClick={() => {
                    const url = createShareUrl(items, settings);
                    setShareUrl(url);
                    setShowQrModal(true);
                  }}
                >
                  <QrCode size={17} />
                  QR
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
                <div className={`roster-item ${item.drawn ? 'is-drawn' : ''}`} key={item.id}>
                  <button
                    className="drawn-toggle"
                    type="button"
                    title="抽中狀態"
                    onClick={() => updateItem(item.id, { drawn: !item.drawn })}
                  >
                    {item.drawn ? <Check size={15} /> : <Trophy size={15} />}
                  </button>
                  <input value={item.name} onChange={(event) => updateItem(item.id, { name: event.target.value })} />
                  <input
                    className="weight-input"
                    min="0.1"
                    step="0.1"
                    type="number"
                    value={item.weight}
                    onChange={(event) => updateItem(item.id, { weight: Math.max(0, Number(event.target.value) || 0) })}
                  />
                  <button className="icon-button quiet" type="button" title="刪除" onClick={() => deleteItem(item.id)}>
                    <Trash2 size={17} />
                  </button>
                </div>
              ))}
            </section>
          </aside>
        )}

        <section className="stage-shell">
          <div className="mode-tabs" role="tablist" aria-label="玩法">
            {modeOptions.map(({ value, label, Icon }) => (
              <button
                className={settings.mode === value ? 'is-active' : ''}
                type="button"
                role="tab"
                aria-selected={settings.mode === value}
                key={value}
                disabled={isDrawing || isDisplayOnly}
                onClick={() => {
                  updateSettings({ mode: value });
                  setWinner(null);
                  setWinners([]);
                  setShowWinnerOverlay(false);
                  setRunPool([]);
                  setGachaRevealId(null);
                  setCardPhase('idle');
                  setCardWinner(null);
                }}
              >
                <Icon size={18} />
                {label}
              </button>
            ))}
          </div>

          <div className="stage-card">
            <div className="stage-status">
              <div>
                <span className="eyebrow">
                  {isDrawing ? '抽選中' : winners.length ? (winners.length > 1 ? `本次得主 ${winners.length} 位` : '本次得主') : '待命'}
                </span>
                <strong>
                  {winners.length
                    ? winners.length === 1
                      ? winners[0].name
                      : winners.map((w) => w.name).join('、')
                    : activeMode.label}
                </strong>
              </div>
              <div className="pool-stats">
                <span>{playableItems.length} 位</span>
                <span>{totalWeight.toFixed(1)} 權重</span>
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
              gachaRevealId={gachaRevealId}
              gachaShuffleKey={gachaShuffleKey}
              cardPhase={cardPhase}
              cardWinner={cardWinner}
              winner={winner}
              isDrawing={isDrawing}
              palette={activePalette}
            />

            <div className="control-deck">
              <button className="start-button" type="button" disabled={isDrawing || !playableItems.length} onClick={() => runDraw()}>
                <Play size={22} fill="currentColor" />
                {isDrawing ? '抽選中' : '開始抽獎'}
              </button>
              {!isDisplayOnly && (
                <button className="secondary-button" type="button" onClick={resetDrawn}>
                  <RotateCcw size={18} />
                  重置抽中
                </button>
              )}
            </div>
          </div>
        </section>

        {!isDisplayOnly && (
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
                <span>
                  緊張感 <em className="field-hint">{excitementLabels[settings.excitement] ?? ''}</em>
                </span>
                <input
                  min="1"
                  max="10"
                  type="range"
                  value={settings.excitement}
                  onChange={(event) => updateSettings({ excitement: Number(event.target.value) })}
                />
              </label>

              <label className="field">
                <span>抽出人數</span>
                <div className="count-stepper">
                  <button
                    className="icon-button quiet"
                    type="button"
                    onClick={() => updateSettings({ drawCount: Math.max(1, (settings.drawCount ?? 1) - 1) })}
                  >
                    −
                  </button>
                  <span className="count-display">{settings.drawCount ?? 1}</span>
                  <button
                    className="icon-button quiet"
                    type="button"
                    onClick={() =>
                      updateSettings({ drawCount: Math.min(Math.max(1, playableItems.length), (settings.drawCount ?? 1) + 1) })
                    }
                  >
                    ＋
                  </button>
                </div>
              </label>

              <label className="field">
                <span>
                  <Timer size={14} style={{ verticalAlign: 'middle' }} /> 倒數
                </span>
                <select
                  value={settings.countdown ?? 0}
                  onChange={(event) => updateSettings({ countdown: Number(event.target.value) })}
                >
                  {countdownOptions.map((opt) => (
                    <option value={opt.value} key={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>
                  <Palette size={14} style={{ verticalAlign: 'middle' }} /> 轉盤色盤
                </span>
                <select
                  value={settings.wheelPalette ?? 'rainbow'}
                  onChange={(event) => updateSettings({ wheelPalette: event.target.value as WheelPalette })}
                >
                  {Object.entries(wheelPalettes).map(([key, palette]) => (
                    <option value={key} key={key}>
                      {palette.label}
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
                <button
                  className={`toggle ${settings.bgMusic ? 'is-on' : ''}`}
                  type="button"
                  onClick={() => updateSettings({ bgMusic: !settings.bgMusic })}
                >
                  <Music size={17} />
                  氣氛音樂
                </button>
                <button
                  className={`toggle ${settings.voiceAnnounce ? 'is-on' : ''}`}
                  type="button"
                  onClick={() => updateSettings({ voiceAnnounce: !settings.voiceAnnounce })}
                >
                  <Megaphone size={17} />
                  語音播報
                </button>
                <button
                  className={`toggle ${settings.quickMode ? 'is-on' : ''}`}
                  type="button"
                  onClick={() => updateSettings({ quickMode: !settings.quickMode })}
                >
                  <Zap size={17} />
                  快速連抽
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
                      </span>
                    </article>
                  ))
                ) : (
                  <p className="empty-state">尚無紀錄</p>
                )}
              </div>
              <div className="button-row">
                <button type="button" onClick={() => setShowStats(true)} disabled={!history.length}>
                  <BarChart3 size={17} />
                  統計
                </button>
                <button type="button" onClick={exportHistoryCsv} disabled={!history.length}>
                  <FileSpreadsheet size={17} />
                  CSV
                </button>
                <button type="button" onClick={clearHistory}>
                  <Trash2 size={17} />
                  清空
                </button>
              </div>
            </section>
          </aside>
        )}
      </main>
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
  gachaRevealId,
  gachaShuffleKey,
  cardPhase,
  cardWinner,
  winner,
  isDrawing,
  palette
}: {
  mode: GameMode;
  items: DrawItem[];
  marqueeIndex: number;
  wheelRotation: number;
  wheelMs: number;
  slotReels: string[][];
  gachaCards: DrawItem[];
  gachaRevealId: string | null;
  gachaShuffleKey: number;
  cardPhase: 'idle' | 'shaking' | 'flipping' | 'revealed';
  cardWinner: DrawItem | null;
  winner: DrawItem | null;
  isDrawing: boolean;
  palette: string[];
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
    return <WheelStage items={items} rotation={wheelRotation} duration={wheelMs} winner={winner} colors={palette} />;
  }

  if (mode === 'slot') {
    return (
      <SlotStage
        reels={slotReels.length ? slotReels : createReels(items.map((item) => item.name))}
        winner={winner}
        isDrawing={isDrawing}
      />
    );
  }

  if (mode === 'gacha') {
    return (
      <GachaStage
        cards={gachaCards.length ? gachaCards : buildGachaDeck(items, null)}
        revealId={gachaRevealId}
        winner={winner}
        isDrawing={isDrawing}
        shuffleKey={gachaShuffleKey}
      />
    );
  }

  if (mode === 'card') {
    return <CardStage phase={cardPhase} winner={cardWinner ?? winner} />;
  }

  return <MarqueeStage items={items} activeIndex={marqueeIndex} />;
}

function CardStage({
  phase,
  winner
}: {
  phase: 'idle' | 'shaking' | 'flipping' | 'revealed';
  winner: DrawItem | null;
}) {
  return (
    <div className="card-stage">
      <div className={`single-card phase-${phase}`}>
        <div className="single-card-inner">
          <div className="single-card-face single-card-back">
            <div className="single-card-pattern">
              <Sparkles size={56} />
              <div className="single-card-back-text">LUCKY</div>
              <Sparkles size={56} />
            </div>
          </div>
          <div className="single-card-face single-card-front">
            <Trophy size={42} />
            <strong>{winner?.name ?? '— ' /* fallback */}</strong>
            <span className="single-card-tag">恭喜中獎</span>
          </div>
        </div>
      </div>
      <p className="card-stage-hint">
        {phase === 'idle' && '按下開始抽獎，命運之卡將翻面揭曉'}
        {phase === 'shaking' && '緊張感醞釀中…'}
        {phase === 'flipping' && '翻牌！'}
        {phase === 'revealed' && '本次得主已揭曉'}
      </p>
    </div>
  );
}

function MarqueeStage({ items, activeIndex }: { items: DrawItem[]; activeIndex: number }) {
  return (
    <div className="marquee-grid">
      {items.map((item, index) => (
        <div className={`marquee-tile ${index === activeIndex ? 'is-hot' : ''} ${item.drawn ? 'is-drawn' : ''}`} key={item.id}>
          <span>{item.name}</span>
          <small>{item.weight}x</small>
        </div>
      ))}
    </div>
  );
}

function WheelStage({
  items,
  rotation,
  duration,
  winner,
  colors
}: {
  items: DrawItem[];
  rotation: number;
  duration: number;
  winner: DrawItem | null;
  colors: string[];
}) {
  const segment = 360 / items.length;
  const gradient = items
    .map((item, index) => {
      const start = index * segment;
      const end = (index + 1) * segment;
      return `${colors[index % colors.length]} ${start}deg ${end}deg`;
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
                '--label-bg': colors[index % colors.length]
              } as CSSProperties
            }
          >
            {item.name}
          </span>
        ))}
      </div>
      <div className="wheel-hub">
        <Trophy size={24} />
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

function SlotStage({ reels, winner, isDrawing }: { reels: string[][]; winner: DrawItem | null; isDrawing: boolean }) {
  return (
    <div className={`slot-machine ${isDrawing ? 'is-spinning' : ''}`}>
      {reels.map((reel, column) => (
        <div className="slot-reel" key={`${column}-${reel.join('-')}`}>
          {reel.map((name, index) => (
            <div
              className={`slot-cell ${index === 1 ? 'is-center' : ''} ${winner?.name === name && index === 1 ? 'is-winner' : ''}`}
              key={`${name}-${index}`}
            >
              {name}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function GachaStage({
  cards,
  revealId,
  winner,
  isDrawing,
  shuffleKey
}: {
  cards: DrawItem[];
  revealId: string | null;
  winner: DrawItem | null;
  isDrawing: boolean;
  shuffleKey: number;
}) {
  return (
    <div className={`gacha-stage ${isDrawing ? 'is-drawing' : ''}`} data-shuffle={shuffleKey}>
      {cards.map((card, index) => {
        const revealed = card.id === revealId || (!isDrawing && winner?.id === card.id);
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
                <Trophy size={28} />
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

function Confetti({ burstKey, colors = wheelColors }: { burstKey: number; colors?: string[] }) {
  const particles = useMemo(() => {
    if (!burstKey) return [];
    return Array.from({ length: 56 }, (_, index) => ({
      id: `${burstKey}-${index}`,
      left: 8 + Math.random() * 84,
      delay: Math.random() * 0.24,
      duration: 1.25 + Math.random() * 1.1,
      rotate: Math.random() * 720,
      size: 7 + Math.random() * 9,
      color: colors[index % colors.length]
    }));
  }, [burstKey, colors]);

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

function buildGachaDeck(pool: DrawItem[], winningItem: DrawItem | null) {
  const available = pool.filter((item) => item.name.trim() && item.weight > 0);
  const others = available.filter((item) => item.id !== winningItem?.id);
  const deck = winningItem ? [winningItem, ...shuffleDrawItems(others)] : shuffleDrawItems(available);
  return shuffleDrawItems(deck.slice(0, Math.min(12, deck.length)));
}

function shuffleDrawItems(items: DrawItem[]) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(cryptoRandomFloat() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

function createReels(names: string[]) {
  return [createReelWindow(names), createReelWindow(names), createReelWindow(names)];
}

function createReelWindow(names: string[], center?: string) {
  if (!names.length) return ['-', '-', '-'];
  const middle = center ?? pickName(names);
  return [pickName(names), middle, pickName(names)];
}

function pickName(names: string[]) {
  const index = Math.floor(cryptoRandomFloat() * names.length);
  return names[index] ?? names[0] ?? '-';
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

function CountdownOverlay({ value }: { value: number }) {
  const display = value > 0 ? value : 'GO!';
  return (
    <div className="countdown-overlay" aria-hidden="true">
      <div className="countdown-number" key={String(value)}>
        {display}
      </div>
    </div>
  );
}

function QrModal({ url, onClose }: { url: string; onClose: () => void }) {
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(url)}`;
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="QR Code 分享">
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" type="button" onClick={onClose} aria-label="關閉">
          <X size={20} />
        </button>
        <h2 className="modal-title">
          <QrCode size={22} /> 掃描加入抽獎
        </h2>
        <div className="qr-frame">
          <img src={qrSrc} alt="分享連結 QR Code" width={320} height={320} />
        </div>
        <p className="modal-hint">用手機相機掃描即可開啟此抽獎名單</p>
        <code className="qr-url">{url}</code>
      </div>
    </div>
  );
}

function StatsModal({
  history,
  items,
  onClose,
  colors
}: {
  history: DrawRecord[];
  items: DrawItem[];
  onClose: () => void;
  colors: string[];
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    history.forEach((rec) => map.set(rec.winnerName, (map.get(rec.winnerName) ?? 0) + 1));
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [history]);

  const total = history.length;
  const max = counts[0]?.[1] ?? 1;
  const distinct = items.filter((it) => it.name.trim() && it.weight > 0).length;
  const distinctWinners = counts.length;

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="抽獎統計">
      <div className="modal-card stats-card" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" type="button" onClick={onClose} aria-label="關閉">
          <X size={20} />
        </button>
        <h2 className="modal-title">
          <BarChart3 size={22} /> 抽獎統計
        </h2>
        <div className="stats-summary">
          <div>
            <strong>{total}</strong>
            <span>總抽獎次數</span>
          </div>
          <div>
            <strong>{distinctWinners}</strong>
            <span>不同得主</span>
          </div>
          <div>
            <strong>{distinct}</strong>
            <span>名單筆數</span>
          </div>
        </div>
        <div className="stats-list">
          {counts.length ? (
            counts.map(([name, count], i) => (
              <div className="stats-row" key={name}>
                <span className="stats-name" title={name}>
                  {name}
                </span>
                <div className="stats-bar-track">
                  <div
                    className="stats-bar-fill"
                    style={{
                      width: `${Math.max(8, (count / max) * 100)}%`,
                      background: colors[i % colors.length]
                    }}
                  />
                </div>
                <span className="stats-count">{count}</span>
              </div>
            ))
          ) : (
            <p className="empty-state">尚無紀錄</p>
          )}
        </div>
      </div>
    </div>
  );
}

function pickMultipleWeighted(pool: DrawItem[], count: number): DrawItem[] {
  const results: DrawItem[] = [];
  let remaining = [...pool];
  const target = Math.min(count, remaining.length);
  for (let i = 0; i < target; i++) {
    const picked = weightedPick(remaining);
    if (!picked) break;
    results.push(picked);
    remaining = remaining.filter((item) => item.id !== picked.id);
  }
  return results;
}

function WinnerOverlay({ winners, onDismiss }: { winners: DrawItem[]; onDismiss: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onDismiss]);

  const isMulti = winners.length > 1;
  const burstParticles = useMemo(
    () =>
      Array.from({ length: 24 }, (_, i) => ({
        id: i,
        angle: (360 / 24) * i + Math.random() * 12,
        distance: 220 + Math.random() * 180,
        delay: Math.random() * 0.18,
        size: 6 + Math.random() * 10
      })),
    []
  );

  return (
    <div className="winner-overlay" onClick={onDismiss} role="dialog" aria-modal="true" aria-label="中獎結果">
      <div className="winner-overlay-content" onClick={(e) => e.stopPropagation()}>
        <div className="winner-overlay-icon">
          <Trophy size={72} />
        </div>
        <p className="winner-overlay-label">{isMulti ? `本次得主 ${winners.length} 位` : '恭喜得主'}</p>
        <div className={`winner-names-grid${isMulti ? ' is-multi' : ''}`}>
          {winners.map((w, i) => (
            <div className="winner-name-wrapper" key={w.id}>
              {!isMulti && i === 0 && (
                <div className="name-burst" aria-hidden="true">
                  {burstParticles.map((p) => (
                    <span
                      key={p.id}
                      className="name-burst-particle"
                      style={
                        {
                          '--angle': `${p.angle}deg`,
                          '--distance': `${p.distance}px`,
                          '--delay': `${p.delay}s`,
                          '--size': `${p.size}px`
                        } as CSSProperties
                      }
                    />
                  ))}
                </div>
              )}
              <div className="winner-name-card" style={{ animationDelay: `${i * 0.12}s` } as CSSProperties}>
                {w.name}
              </div>
            </div>
          ))}
        </div>
        <p className="winner-overlay-hint">點擊任意處或按 Esc 關閉</p>
      </div>
    </div>
  );
}

export default App;
