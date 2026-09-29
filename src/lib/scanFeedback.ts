// Short beep + vibration so a scan registers without looking at the screen.
let ctx: AudioContext | null = null;

export function scanFeedback(ok: boolean) {
  try {
    ctx ??= new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = ok ? 1320 : 220;
    gain.gain.value = 0.08;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (ok ? 0.08 : 0.25));
  } catch {
    /* no audio: the toast still shows */
  }
  navigator.vibrate?.(ok ? 40 : [80, 60, 80]);
}
