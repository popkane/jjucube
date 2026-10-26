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

// 소리 장치가 실제로 켜질 때까지 기다림 (휴대폰은 첫 터치 직후 잠깐 꺼져 있음)
export function whenReady() {
  unlockAudio();
  return ctx && ctx.state !== 'running' ? ctx.resume().catch(() => {}) : Promise.resolve();
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
  return src;
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

// 긴박한 초시계 '째깍째깍' — 남은 시간(ms)부터 0까지 미리 예약해서 정확한 박자로 울린다.
// 5~2초는 0.5초마다(째·깍 번갈아), 마지막 2초는 0.25초마다 더 빠르고 조금 크게. 돌려주는 함수를 부르면 멈춘다(차례가 끝났을 때)
export function startClock(msLeft) {
  if (!ready()) return () => {};
  const now = ctx.currentTime;
  const nodes = [];
  const end = msLeft / 1000;
  let n = 0;
  for (let rem = Math.min(5, Math.floor(end * 4) / 4); rem > 0.001; rem -= rem > 2.001 ? 0.5 : 0.25) {
    const t = now + (end - rem);
    if (t < now) continue;
    const urgent = rem <= 2.001;
    const tick = n++ % 2 === 0;
    const v = urgent ? 1.25 : 1;
    // 째: 높고 날카롭게 / 깍: 조금 낮게. 금속 소리 + 짧은 울림
    nodes.push(click(t, (tick ? 5200 : 3800), 0.55 * v, 0.012));
    nodes.push(click(t + 0.004, (tick ? 2000 : 1500), 0.3 * v, 0.022));
  }
  return () => { for (const nd of nodes) { try { nd.stop(); } catch { /* 이미 끝남 */ } } };
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

// 조커가 내 손에 들어올 때 '샤라랑~' — 빠르게 올라가는 반짝이는 음 + 잔향
export function playShimmer() {
  if (!ready()) return;
  const t = ctx.currentTime + 0.02;
  const scale = [1046.5, 1174.66, 1318.51, 1567.98, 1760, 2093, 2349.32, 2637.02]; // 높은 도~미 (펜타토닉 느낌)
  scale.forEach((f, i) => {
    note(t + i * 0.045, f, 0.5, 0.06, 'sine');
    note(t + i * 0.045, f * 2, 0.25, 0.015, 'sine'); // 맑은 배음
  });
  note(t + 0.38, 2093, 1.0, 0.05, 'sine');  // 마지막에 길게 울림
  note(t + 0.38, 1567.98, 1.0, 0.04, 'sine');
  for (let i = 0; i < 6; i++) click(t + 0.05 + i * 0.07, 6000 + Math.random() * 2000, 0.05, 0.04); // 반짝반짝
}

// ---------- 이모티콘 소리 (약 2초, 만화풍) ----------
// 목소리 비슷한 소리: 톱니파를 입 모양 대역(formant)으로 걸러서, 음높이를 f0 → f1로 미끄러뜨리고 살짝 떨림
function voice(t, f0, f1, len, gain, formant = 1100, vib = 0) {
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + len);
  if (vib) {
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = 6.5;
    depth.gain.value = vib;
    lfo.connect(depth).connect(o.frequency);
    lfo.start(t);
    lfo.stop(t + len + 0.02);
  }
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = formant;
  bp.Q.value = 2.2;
  const v = ctx.createGain();
  v.gain.setValueAtTime(0.0001, t);
  v.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.04, len / 4));
  v.gain.setValueAtTime(gain, t + len * 0.7);
  v.gain.exponentialRampToValueAtTime(0.0001, t + len);
  o.connect(bp).connect(v).connect(ctx.destination);
  o.start(t);
  o.stop(t + len + 0.02);
}

// 👏 짝짝짝: 두세 사람이 치는 박수가 커졌다 잦아듦 (1.9초)
function clapSound(t0) {
  const dur = 1.9;
  for (let t = 0; t < dur; t += 0.055 + Math.random() * 0.05) {
    const env = Math.sin((Math.PI * t) / dur); // 커졌다 작아짐
    const v = 0.85 + Math.random() * 0.3;
    click(t0 + t, 1500 * v, 0.55 * env + 0.05, 0.03);
    click(t0 + t + 0.004, 2600 * v, 0.25 * env, 0.02);
  }
}

// 😭 으아앙~ 엉엉: 길게 울고 두 번 흐느낌 (2초)
function crySound(t0) {
  voice(t0, 560, 430, 0.8, 0.22, 1000, 18);
  voice(t0 + 0.95, 500, 420, 0.32, 0.2, 900, 10);
  voice(t0 + 1.4, 480, 380, 0.5, 0.18, 850, 14);
}

// 🤭 키득키득 크크: 짧고 높은 웃음 두 묶음 (1.8초)
function giggleSound(t0) {
  const burst = (t, n, f) => {
    for (let i = 0; i < n; i++) voice(t + i * 0.11, f * (1 - i * 0.03), f * (0.9 - i * 0.03), 0.07, 0.16, 2200);
  };
  burst(t0, 4, 950);
  burst(t0 + 0.75, 5, 880);
}

export function playEmote(kind) {
  if (!ready()) return;
  const t = ctx.currentTime + 0.02;
  if (kind === 'clap') clapSound(t);
  else if (kind === 'cry') crySound(t);
  else if (kind === 'giggle') giggleSound(t);
}
