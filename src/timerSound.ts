let context: AudioContext | undefined;

// Unlock audio during an operator gesture so the later timer sound is allowed.
export function enableTimerSound() {
  try {
    context ??= new AudioContext();
    if (context.state === 'suspended') void context.resume().catch(() => {});
  } catch {
    // The visual TIME UP indicator remains available if audio is unsupported.
  }
}

export function playTimerSound() {
  if (!context || context.state !== 'running') return;
  const start = context.currentTime;
  for (const offset of [0, 0.24]) {
    const tone = context.createOscillator();
    const volume = context.createGain();
    tone.type = 'sine';
    tone.frequency.value = 880;
    volume.gain.setValueAtTime(0, start + offset);
    volume.gain.linearRampToValueAtTime(0.18, start + offset + 0.015);
    volume.gain.exponentialRampToValueAtTime(0.001, start + offset + 0.19);
    tone.connect(volume);
    volume.connect(context.destination);
    tone.start(start + offset);
    tone.stop(start + offset + 0.2);
    tone.onended = () => {
      tone.disconnect();
      volume.disconnect();
    };
  }
}
