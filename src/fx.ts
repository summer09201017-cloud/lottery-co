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

const cheerPalettes: number[][] = [
  [523.25, 659.25, 783.99, 1046.5],
  [392, 523.25, 659.25, 880],
  [440, 554.37, 659.25, 880, 1108.73],
  [349.23, 440, 523.25, 698.46]
];

export function playCheer(enabled: boolean) {
  if (!enabled) return;
  const palette = cheerPalettes[Math.floor(Math.random() * cheerPalettes.length)];
  palette.forEach((freq, index) => {
    setTimeout(() => playTone(true, freq, 0.18, 'triangle'), index * 70);
  });
}
