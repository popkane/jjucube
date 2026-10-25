// 타일 놓는 소리. 소리 파일 없이 Web Audio로 만든다 (플라스틱 타일이 테이블에 '딱' 닿는 소리).
// 휴대폰은 사용자가 화면을 만진 뒤에만 소리를 낼 수 있어서, 첫 터치 때 unlockAudio()를 불러야 한다.
let ctx = null;
let noise = null;
let enabled = true;

export function setSoundEnabled(v) { enabled = v; }

export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.1), ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
}

// 딱: 짧은 잡음을 좁은 대역으로 걸러 빠르게 줄인다
function click(t, freq, gain, decay) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq;
  bp.Q.value = 1.3;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + decay);
  src.connect(bp).connect(g).connect(ctx.destination);
  src.start(t);
  src.stop(t + decay + 0.01);
}

// 탁: 테이블이 울리는 낮은 소리
function thud(t, freq, gain, decay) {
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(freq * 1.6, t);
  o.frequency.exponentialRampToValueAtTime(freq, t + 0.02);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + decay);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + decay + 0.01);
}

// kind: 'place' 바닥에 놓기 / 'snap' 다른 타일에 착 붙기 / 'rack' 받침대로 돌려놓기
// count: 여러 장을 한 번에 놓으면 '따다닥' (최대 3번)
export function playTile(kind = 'place', count = 1) {
  if (!enabled || !ctx || ctx.state !== 'running') return;
  const n = Math.min(3, Math.max(1, count));
  for (let i = 0; i < n; i++) {
    const t = ctx.currentTime + 0.005 + i * 0.04;
    const v = 0.9 + Math.random() * 0.2; // 매번 조금씩 다른 소리
    if (kind === 'rack') {
      click(t, 1800 * v, 0.3, 0.03);
      thud(t, 130 * v, 0.25, 0.06);
    } else {
      click(t, 2800 * v, 0.5, 0.035);
      thud(t, 160 * v, 0.35, 0.07);
      if (kind === 'snap' && i === n - 1) click(t + 0.045, 4200 * v, 0.3, 0.025); // 옆 타일에 닿는 '착'
    }
  }
}

// 내 차례 알림 '띵동' — 초인종처럼 높은 음 → 낮은 음, 작게
function bell(t, freq, gain) {
  for (const [mult, g] of [[1, gain], [2, gain * 0.25]]) { // 기본음 + 맑은 배음
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq * mult;
    const v = ctx.createGain();
    v.gain.setValueAtTime(0.0001, t);
    v.gain.exponentialRampToValueAtTime(g, t + 0.015);
    v.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o.connect(v).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.95);
  }
}

export function playTurnBell() {
  if (!enabled || !ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime + 0.01;
  bell(t, 659.25, 0.16);        // 띵 (미)
  bell(t + 0.28, 523.25, 0.14); // 동 (도)
}
