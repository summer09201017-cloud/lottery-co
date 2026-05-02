let audioContext: AudioContext | null = null;

function getAudioContext() {
  audioContext ??= new AudioContext();
  return audioContext;
}

export function playTone(enabled: boolean, frequency: number, duration = 0.08, type: OscillatorType = 'sine') {
  if (!enabled) return;

  try {
    const context = getAudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, context.currentTime);
    gain.gain.setValueAtTime(0.001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.16, context.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + duration + 0.02);
  } catch {
    // Some browsers block audio until a direct user gesture.
  }
}

export function vibrate(enabled: boolean, pattern: number | number[]) {
  if (!enabled || !('vibrate' in navigator)) return;
  navigator.vibrate(pattern);
}

let bgMusicNodes: { osc1: OscillatorNode; osc2: OscillatorNode; gain: GainNode; lfo: OscillatorNode } | null = null;

export function startBgMusic() {
  stopBgMusic();
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.05, now + 0.4);
    gain.connect(ctx.destination);

    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(110, now);
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(220, now);

    const lfo = ctx.createOscillator();
    lfo.frequency.setValueAtTime(4.5, now);
    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(8, now);
    lfo.connect(lfoGain).connect(osc1.frequency);

    osc1.connect(gain);
    osc2.connect(gain);
    osc1.start();
    osc2.start();
    lfo.start();
    bgMusicNodes = { osc1, osc2, gain, lfo };
  } catch {
    // ignored
  }
}

export function stopBgMusic() {
  if (!bgMusicNodes) return;
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    bgMusicNodes.gain.gain.cancelScheduledValues(now);
    bgMusicNodes.gain.gain.setValueAtTime(bgMusicNodes.gain.gain.value, now);
    bgMusicNodes.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    const nodes = bgMusicNodes;
    setTimeout(() => {
      nodes.osc1.stop();
      nodes.osc2.stop();
      nodes.lfo.stop();
    }, 350);
  } catch {
    // ignored
  }
  bgMusicNodes = null;
}

export function speak(enabled: boolean, text: string) {
  if (!enabled || !text) return;
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'zh-TW';
    utter.rate = 0.95;
    utter.pitch = 1.05;
    utter.volume = 1;
    window.speechSynthesis.speak(utter);
  } catch {
    // ignored
  }
}
