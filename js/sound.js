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

// kind: 'place' 바닥에 놓기 / 'snap' 다른 타일에 착 붙기 / 'rack' 받침대로 돌려놓기 / 'opp' 상대가 놓기(작고 조금 낮은 '톡')
// count: 여러 장을 한 번에 놓으면 '따다닥' (최대 3번)
export function playTile(kind = 'place', count = 1) {
  if (!enabled || !ctx || ctx.state !== 'running') return;
  const n = Math.min(3, Math.max(1, count));
  for (let i = 0; i < n; i++) {
    const t = ctx.currentTime + 0.005 + i * 0.04;
    const v = 0.9 + Math.random() * 0.2; // 매번 조금씩 다른 소리
    if (kind === 'opp') {
      click(t, 2100 * v, 0.22, 0.03);
      thud(t, 210 * v, 0.14, 0.05);
    } else if (kind === 'rack') {
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

// 초시계 '똑딱' — 남은 시간 5초부터 1초마다. 마지막 1~2초는 조금 높고 크게(급한 느낌)
export function playClockTick(secLeft) {
  if (!enabled || !ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime + 0.005;
  const urgent = secLeft <= 2;
  const hi = secLeft % 2 === 1; // 똑·딱 번갈아
  click(t, (hi ? 3400 : 2600) * (urgent ? 1.2 : 1), urgent ? 0.6 : 0.45, 0.025);
  thud(t, hi ? 900 : 760, urgent ? 0.12 : 0.08, 0.04);
}

// 타일 회수 '사라락': 여러 장이 미끄러져 돌아가는 소리 (되돌리기·시간 초과). soft = 상대 쪽이라 작게
export function playCollect(count = 1, soft = false) {
  if (!enabled || !ctx || ctx.state !== 'running') return;
  const t0 = ctx.currentTime + 0.01;
  const k = soft ? 0.55 : 1;
  // 미끄러지는 바람 소리: 잡음을 높은 대역에서 낮은 대역으로 쓸어내림
  const len = 0.22 + Math.min(4, count) * 0.03;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 0.9;
  bp.frequency.setValueAtTime(3200, t0);
  bp.frequency.exponentialRampToValueAtTime(700, t0 + len);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.12 * k, t0 + 0.04);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
  src.connect(bp).connect(g).connect(ctx.destination);
  src.start(t0);
  src.stop(t0 + len + 0.02);
  // 타일끼리 부딪히는 '다다닥' (장수만큼, 최대 5번, 점점 낮게)
  const n = Math.min(5, Math.max(2, count));
  for (let i = 0; i < n; i++) {
    const t = t0 + 0.05 + i * 0.045;
    const v = 0.9 + Math.random() * 0.2;
    click(t, (2600 - i * 220) * v, 0.28 * k, 0.025);
    if (i === n - 1) thud(t, 140 * v, 0.22 * k, 0.06);
  }
}

// 맑은 음 하나 (입장·시작·승리 멜로디용). type: 'sine' 부드럽게 / 'triangle' 조금 또렷하게
function note(t, freq, len, gain, type = 'triangle') {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const v = ctx.createGain();
  v.gain.setValueAtTime(0.0001, t);
  v.gain.exponentialRampToValueAtTime(gain, t + 0.012);
  v.gain.exponentialRampToValueAtTime(0.0001, t + len);
  o.connect(v).connect(ctx.destination);
  o.start(t);
  o.stop(t + len + 0.02);
}
const ready = () => enabled && ctx && ctx.state === 'running';

// 대기실에 누가 들어옴 '뾰롱' (낮은 음 → 높은 음)
export function playJoin() {
  if (!ready()) return;
  const t = ctx.currentTime + 0.01;
  note(t, 587.33, 0.18, 0.12);        // 레
  note(t + 0.09, 880, 0.3, 0.12);     // 라
}

// 판 시작 '빠라밤' — 파도처럼 올라가는 짧은 화음
export function playStart() {
  if (!ready()) return;
  const t = ctx.currentTime + 0.02;
  [523.25, 659.25, 783.99].forEach((f, i) => note(t + i * 0.08, f, 0.35, 0.11)); // 도 미 솔
  note(t + 0.26, 1046.5, 0.6, 0.12, 'sine');                                     // 높은 도
  note(t + 0.26, 523.25, 0.6, 0.06, 'sine');
}

// 승리 팡파르. mine = 내가 이김(신나게) / 아니면 짧고 차분하게
export function playWin(mine) {
  if (!ready()) return;
  const t = ctx.currentTime + 0.02;
  if (mine) {
    const seq = [[523.25, 0], [659.25, 0.12], [783.99, 0.24], [1046.5, 0.36], [783.99, 0.52], [1046.5, 0.64]];
    seq.forEach(([f, d]) => note(t + d, f, 0.22, 0.13));
    [523.25, 659.25, 783.99, 1046.5].forEach((f) => note(t + 0.8, f, 1.1, 0.07, 'sine')); // 마지막 화음
    for (let i = 0; i < 4; i++) click(t + 0.8 + i * 0.07, 5000 + i * 400, 0.12, 0.05);    // 반짝
  } else {
    [[659.25, 0], [587.33, 0.16], [523.25, 0.32]].forEach(([f, d]) => note(t + d, f, 0.3, 0.1, 'sine')); // 미 레 도
    note(t + 0.5, 392, 0.8, 0.08, 'sine');
  }
}
