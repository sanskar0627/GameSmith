/**
 * Tiny synth for feedback sounds without asset files. Browsers only allow
 * audio after a user gesture, so the context starts on first input.
 */
let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (!ctx && typeof AudioContext !== "undefined") ctx = new AudioContext();
  if (ctx?.state === "suspended") void ctx.resume();
  return ctx;
}

export function blip(frequency = 660, duration = 0.12, type: OscillatorType = "square", volume = 0.08) {
  const audio = context();
  if (!audio) return;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, audio.currentTime);
  osc.frequency.exponentialRampToValueAtTime(frequency * 1.6, audio.currentTime + duration);
  gain.gain.setValueAtTime(volume, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + duration);
  osc.connect(gain).connect(audio.destination);
  osc.start();
  osc.stop(audio.currentTime + duration);
}

export const sfx = {
  pickup: () => blip(880, 0.1, "triangle"),
  jump: () => blip(440, 0.15, "square", 0.05),
  hit: () => blip(160, 0.18, "sawtooth", 0.07),
  win: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 0.16, "triangle"), i * 90)),
};
