let audio: AudioContext | null = null;

function ctx(): AudioContext | null {
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  audio ??= new AudioCtx();
  return audio;
}

export async function unlockAudio() {
  const c = ctx();
  if (c?.state === "suspended") await c.resume();
}

function tone(freq: number, duration: number, gain = 0.08, type: OscillatorType = "sine") {
  const c = ctx();
  if (!c) return;
  const osc = c.createOscillator();
  const amp = c.createGain();
  osc.frequency.value = freq;
  osc.type = type;
  amp.gain.setValueAtTime(gain, c.currentTime);
  amp.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
  osc.connect(amp).connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + duration);
}

export function playRoll() {
  for (let i = 0; i < 18; i += 1) {
    const delay = i * 70 + Math.random() * 55;
    const freq = 95 + Math.random() * 170;
    const gain = 0.028 + Math.random() * 0.035;
    window.setTimeout(() => tone(freq, 0.035 + Math.random() * 0.035, gain, "square"), delay);
  }
  [260, 180, 130].forEach((freq, i) => {
    window.setTimeout(() => tone(freq, 0.09, 0.055, "triangle"), 520 + i * 230);
  });
}

export function playWin() {
  [520, 660, 880].forEach((f, i) => window.setTimeout(() => tone(f, 0.18, 0.06), i * 120));
}

export function playFree() {
  [330, 440, 330].forEach((f, i) => window.setTimeout(() => tone(f, 0.14, 0.05, "triangle"), i * 90));
}

export function playJackpot() {
  [440, 660, 880, 1320, 1760].forEach((f, i) => window.setTimeout(() => tone(f, 0.32, 0.08), i * 100));
}
