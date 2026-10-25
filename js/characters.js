// 플레이어 동물 캐릭터. 게임을 시작할 때 사람마다 랜덤으로 하나씩 배정된다 (game.chars).
// 모두 같은 그림체: 굵은 테두리, 동그란 얼굴, 볼터치.
const INK = '#2b2d42';
const S = `stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"`;

// 눈·볼·입 (얼굴 중심 높이 y)
const eyes = (y) => `<circle cx="18" cy="${y}" r="2.7" fill="${INK}"/><circle cx="30" cy="${y}" r="2.7" fill="${INK}"/>`
  + `<circle cx="19" cy="${y - 1}" r="0.9" fill="#fff"/><circle cx="31" cy="${y - 1}" r="0.9" fill="#fff"/>`;
const blush = (y) => `<ellipse cx="13" cy="${y}" rx="3.3" ry="2" fill="#ff8fa3" opacity=".85"/><ellipse cx="35" cy="${y}" rx="3.3" ry="2" fill="#ff8fa3" opacity=".85"/>`;
const smile = (y) => `<path d="M21 ${y}q1.5 2 3 0q1.5 2 3 0" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/>`;
const svg = (body) => `<svg viewBox="0 0 48 48" aria-hidden="true">${body}</svg>`;

export const CHARACTERS = [
  {
    name: '갈매기', bg: '#d9f4ff',
    svg: svg(`<path d="M19 11q5-7 10 0" fill="none" ${S} stroke-linecap="round"/>`
      + `<circle cx="24" cy="27" r="16" fill="#fff" ${S}/>`
      + `<path d="M10 22q14-8 28 0" fill="none" stroke="#c9d6e3" stroke-width="3" stroke-linecap="round"/>`
      + eyes(25) + blush(31) + `<path d="M20.5 30h7l-3.5 4.5z" fill="#ffb703" ${S}/>`),
  },
  {
    name: '수달', bg: '#ffe9c7',
    svg: svg(`<circle cx="11" cy="15" r="5" fill="#9a6a3c" ${S}/><circle cx="37" cy="15" r="5" fill="#9a6a3c" ${S}/>`
      + `<circle cx="24" cy="26" r="17" fill="#b98250" ${S}/>`
      + `<ellipse cx="24" cy="32" rx="9.5" ry="6.5" fill="#f5dfc3" ${S}/>`
      + eyes(23) + blush(30) + `<ellipse cx="24" cy="29.5" rx="2.8" ry="1.9" fill="${INK}"/>`
      + `<path d="M24 31.5v2.5" stroke="${INK}" stroke-width="1.6"/>`
      + `<path d="M14 31h-5M14 33.5l-4.5 1.5M34 31h5M34 33.5l4.5 1.5" stroke="${INK}" stroke-width="1.3" stroke-linecap="round"/>`),
  },
  {
    name: '고양이', bg: '#fff1d6',
    svg: svg(`<path d="M9 22 11 5l11 8z" fill="#ffab4c" ${S}/><path d="M39 22 37 5l-11 8z" fill="#ffab4c" ${S}/>`
      + `<path d="M12.5 15 13 9l4.5 3.5z" fill="#ff8fa3"/><path d="M35.5 15 35 9l-4.5 3.5z" fill="#ff8fa3"/>`
      + `<circle cx="24" cy="27" r="16" fill="#ffb35c" ${S}/>`
      + `<path d="M24 12v5M19 13l1.2 4M29 13l-1.2 4" stroke="#e07b1a" stroke-width="2.2" stroke-linecap="round"/>`
      + eyes(26) + blush(32) + `<path d="M22.5 29.5h3l-1.5 1.8z" fill="#ff6b8a"/>` + smile(32)),
  },
  {
    name: '강아지', bg: '#ffe3e8',
    svg: svg(`<circle cx="24" cy="26" r="16" fill="#fff3df" ${S}/>`
      + `<path d="M10 13q-7 10 1 20q6-6 5-17z" fill="#b5784a" ${S}/><path d="M38 13q7 10-1 20q-6-6-5-17z" fill="#b5784a" ${S}/>`
      + `<ellipse cx="30" cy="22" rx="5" ry="4" fill="#f0c99a"/>`
      + eyes(24) + blush(31) + `<ellipse cx="24" cy="29" rx="3" ry="2.2" fill="${INK}"/>` + smile(32)),
  },
  {
    name: '토끼', bg: '#efe4ff',
    svg: svg(`<path d="M17 21q-7-16 0-18q6 1 4 18z" fill="#fff" ${S}/><path d="M31 21q7-16 0-18q-6 1-4 18z" fill="#fff" ${S}/>`
      + `<path d="M17.5 17q-3-9 0-10q2.5 1 1.5 10z" fill="#ffc2d1"/><path d="M30.5 17q3-9 0-10q-2.5 1-1.5 10z" fill="#ffc2d1"/>`
      + `<circle cx="24" cy="31" r="14" fill="#fff" ${S}/>`
      + eyes(29) + blush(35) + `<path d="M22.5 33h3l-1.5 1.8z" fill="#ff6b8a"/>` + smile(35.5)),
  },
  {
    name: '곰돌이', bg: '#e3f7e6',
    svg: svg(`<circle cx="12" cy="14" r="6" fill="#9c6b3e" ${S}/><circle cx="36" cy="14" r="6" fill="#9c6b3e" ${S}/>`
      + `<circle cx="12" cy="14" r="2.8" fill="#e0b48a"/><circle cx="36" cy="14" r="2.8" fill="#e0b48a"/>`
      + `<circle cx="24" cy="27" r="17" fill="#ad7a4c" ${S}/>`
      + `<ellipse cx="24" cy="33" rx="8.5" ry="6" fill="#f0d2a8" ${S}/>`
      + eyes(24) + blush(30) + `<ellipse cx="24" cy="31" rx="2.8" ry="2" fill="${INK}"/>` + smile(34)),
  },
];

// 인원수만큼 서로 다른 캐릭터를 랜덤으로
export function pickCharacters(players, rng = Math.random) {
  const idx = CHARACTERS.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx.slice(0, players);
}

// 캐릭터 동그라미 (HTML 문자열)
export function avatarHtml(i, extraClass = '') {
  const c = CHARACTERS[i] || CHARACTERS[0];
  return `<span class="avatar ${extraClass}" style="background:${c.bg}">${c.svg}</span>`;
}
