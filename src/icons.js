// Chunky two-tone SVG icon set (24×24). ic('food') → '<svg …>'.
const O = '#2a2420';
const P = {
  food: `<path d="M5 9h14l-2 11H7z" fill="#f2ede2"/><path d="M5.6 12.5h12.8l-.7 3.5H6.3z" fill="#d9644a"/><path d="M4 8.5h16v2H4z" fill="#e6b84a"/><path d="M8 8c0-3 2-4 2-4M12 8c0-3 1.6-4.5 1.6-4.5M16 8c0-2.5 1-3.5 1-3.5" fill="none"/>`,
  water: `<path d="M10 2.5h4v3h-4z" fill="#3d6f86"/><path d="M9 5.5h6l1.5 3v12a1.5 1.5 0 0 1-1.5 1.5H9a1.5 1.5 0 0 1-1.5-1.5v-12z" fill="#9fd0ef"/><path d="M7.6 12h8.8v4H7.6z" fill="#4a86a8"/>`,
  wood: `<path d="M3 8.5l15-3 2.5 3-15 3z" fill="#c49a62"/><path d="M3 8.5l2.5 3v3L3 11.5z" fill="#8a6440"/><path d="M5.5 11.5l15-3v3l-15 3z" fill="#b08050"/><path d="M3.5 15.5l15-3 2.5 3-15 3z" fill="#d4aa72"/><path d="M6 18.5l15-3v3l-15 3zM3.5 15.5L6 18.5v3l-2.5-3z" fill="#8a6440"/>`,
  nails: `<path d="M6 4h7v3H6z" fill="#c8ccd0"/><path d="M8.5 7h2v11l-1 3-1-3z" fill="#9aa1a6"/><path d="M13 9h6v2.6h-6z" fill="#c8ccd0"/><path d="M15 11.6h2V19l-1 2.4-1-2.4z" fill="#9aa1a6"/>`,
  scrap: `<path d="M12 3l2 2.4 3-.4.6 3 2.8 1.2-1 2.8 1 2.8-2.8 1.2-.6 3-3-.4L12 21l-2-2.4-3 .4-.6-3-2.8-1.2 1-2.8-1-2.8L6.4 8l.6-3 3 .4z" fill="#9aa3ad"/><circle cx="12" cy="12" r="3.2" fill="#5a6470"/>`,
  gas: `<path d="M5 7.5 9 4h9a1.5 1.5 0 0 1 1.5 1.5v14A1.5 1.5 0 0 1 18 21H6.5A1.5 1.5 0 0 1 5 19.5z" fill="#d9442f"/><path d="M12 4V2.5h3V4" fill="#5a5a5a"/><path d="M8.5 11l8 7M16.5 11l-8 7" stroke="#8e1d16" stroke-width="2"/>`,
  liquor: `<path d="M10 2h4v4.5l2 2.5v11.5a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 8 20.5V9l2-2.5z" fill="#cfe8d0"/><path d="M8 12h8v6H8z" fill="#c4442b"/><path d="M10 2h4v2h-4z" fill="#c4442b"/><text x="12" y="16.8" font-size="4.6" text-anchor="middle" fill="#fff" stroke="none" font-weight="900">酒</text>`,
  medkit: `<rect x="3" y="7" width="18" height="13" rx="2" fill="#f4f1ea"/><path d="M9 7V4.5h6V7" fill="none"/><path d="M10.4 9.6h3.2v3h3v3.2h-3v3h-3.2v-3h-3v-3.2h3z" fill="#d9442f"/>`,
  molotov: `<path d="M9.5 9h5v2l1.5 2v7.5a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 8 20.5V13l1.5-2z" fill="#7ac070"/><path d="M8 15h8v3H8z" fill="#f2ede2"/><path d="M12 9V6" fill="none"/><path d="M12 1.5c2.5 2 2.6 4.4.4 5.5-2.6-.6-2.8-3.2-.4-5.5z" fill="#ffb03a"/>`,
  spike: `<path d="M2.5 16h19v4h-19z" fill="#b08050"/><path d="M4.5 16l1.3-8 1.3 8M9.2 16l1.3-9 1.3 9M13.9 16l1.3-8 1.3 8M18.4 16l1.1-7 1.1 7" fill="#c8ccd0"/>`,
  firetrap: `<path d="M5 12h11v8.5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z" fill="#d9442f"/><path d="M5 15h11" fill="none"/><path d="M15 11.5c4-1.5 5-5.5 2.5-9-.5 3-3 3.5-3.5 6-1-1-1-2.4-1-2.4-1.8 2-.8 4.4 2 5.4z" fill="#ffb03a"/>`,
  knife: `<path d="M4 4h11.5v8.5H7.2L4 9z" fill="#d6dbe0"/><circle cx="12.6" cy="6.8" r="1.2" fill="#8a9096"/><path d="M8.5 12.5h4.5v8.5a1 1 0 0 1-1 1H9.5a1 1 0 0 1-1-1z" fill="#6a4a3a"/>`,
  bat: `<path d="M19.5 2.8a2 2 0 0 1 1.7 1.7l-9 12-4.4 4.4-2.7-2.7 4.4-4.4z" fill="#d8b56a"/><path d="M3 19.2l1.8 1.8M7.6 17.6l-2.7-2.7" fill="none"/><path d="M5 18.8l1.4 1.4-2.4 2.4a1 1 0 0 1-1.4-1.4z" fill="#7a5a3a"/>`,
  axe: `<path d="M5 21 15 8" fill="none" stroke-width="2.6"/><path d="M12 3.5c3.5-.5 7 1.8 8.5 5.5l-6.2 3.6c-1-2-2.5-3.6-4.6-4.4z" fill="#ffd45a"/><path d="M5 21 15 8" fill="none" stroke="#7a5a3a" stroke-width="1.4"/>`,
  fist: `<path d="M6 9.5a2 2 0 0 1 4 0V9a2 2 0 0 1 4 0 2 2 0 0 1 4 0v6.5a6 6 0 0 1-6 6H11a6 6 0 0 1-6-6V12a1.6 1.6 0 0 1 1-1.5z" fill="#f0c9a4"/><path d="M10 9.5V13M14 9v4M5.5 14c2-.5 4-.2 5.5 1.2" fill="none"/>`,
  money: `<rect x="2.5" y="6" width="19" height="12" rx="2" fill="#7fbf7a"/><circle cx="12" cy="12" r="3.6" fill="#e9f5df"/><path d="M10.3 10.2 12 12.2l1.7-2M12 12.2v3M10.6 13.2h2.8" fill="none" stroke-width="1.1"/>`,
  clock: `<circle cx="12" cy="13" r="8.5" fill="#f4f1ea"/><path d="M12 8.5V13l3 2" fill="none" stroke-width="1.8"/><path d="M9.5 2.5h5" fill="none" stroke-width="1.8"/>`,
  heart: `<path d="M12 20.5 4.2 13A4.6 4.6 0 0 1 12 6.6 4.6 4.6 0 0 1 19.8 13z" fill="#e0533a"/>`,
  house: `<path d="M3 11 12 3.5l9 7.5" fill="none"/><path d="M5 10v10.5h14V10L12 4.4z" fill="#e9dfcd"/><path d="M10 20.5v-6h4v6" fill="#7a5a3a"/>`,
  morale: `<circle cx="12" cy="12" r="9" fill="#f0c04a"/><circle cx="9" cy="10" r="1" fill="${O}"/><circle cx="15" cy="10" r="1" fill="${O}"/><path d="M8 14c2 2.6 6 2.6 8 0" fill="none"/>`,
  cart: `<path d="M2.5 4h3l2.5 11h10.5l2-8H7" fill="none"/><path d="M7 7h13.5l-2 8H8.4z" fill="#e0533a"/><circle cx="9.5" cy="19" r="1.6" fill="#555"/><circle cx="17" cy="19" r="1.6" fill="#555"/>`,
  wrench: `<path d="M14.5 3a5 5 0 0 0-4.6 6.8L3.3 16.4a2 2 0 0 0 2.8 2.8l6.6-6.6A5 5 0 0 0 19.5 8l-3 1.5-2.5-2.5L15.5 4z" fill="#e6b84a"/>`,
  pump: `<rect x="4" y="5" width="10" height="16" rx="1.5" fill="#2f8a5f"/><rect x="6" y="7.5" width="6" height="4" fill="#cfe8d0"/><path d="M14 9h2.5a1.5 1.5 0 0 1 1.5 1.5V17a1.5 1.5 0 0 0 3 0V8l-2.5-3" fill="none"/><path d="M3 21h12" fill="none"/>`,
  bank: `<path d="M12 2.8 21 7.5H3z" fill="#e2dccf"/><path d="M3 8h18v2H3zM3 19h18v2.2H3z" fill="#cfc6b5"/><path d="M5.5 10h2.4v9H5.5zM10.8 10h2.4v9h-2.4zM16.1 10h2.4v9h-2.4z" fill="#f2ede2"/>`,
  pharm: `<rect x="3" y="3" width="18" height="18" rx="4" fill="#2f8a5f"/><path d="M10 6.5h4v3.5h3.5v4H14v3.5h-4V14H6.5v-4H10z" fill="#e9fff0"/>`,
  gym: `<path d="M2.5 10h2v4h-2zM19.5 10h2v4h-2z" fill="#555"/><rect x="4.5" y="7" width="3" height="10" rx="1" fill="#c4442b"/><rect x="16.5" y="7" width="3" height="10" rx="1" fill="#c4442b"/><path d="M7.5 11h9v2h-9z" fill="#9aa1a6"/>`,
  chat: `<path d="M4 4.5h16a1.5 1.5 0 0 1 1.5 1.5v9.5A1.5 1.5 0 0 1 20 17h-8l-5 4v-4H4a1.5 1.5 0 0 1-1.5-1.5V6A1.5 1.5 0 0 1 4 4.5z" fill="#f4f1ea"/><circle cx="8" cy="11" r="1.1" fill="${O}"/><circle cx="12" cy="11" r="1.1" fill="${O}"/><circle cx="16" cy="11" r="1.1" fill="${O}"/>`,
  radio: `<rect x="2.5" y="8" width="19" height="12.5" rx="2" fill="#a4442b"/><circle cx="8" cy="14.2" r="3.2" fill="#3a3532"/><path d="M13.5 12h5M13.5 14.5h5M13.5 17h3" fill="none" stroke="#f2ede2"/><path d="M5 8l11-5" fill="none"/>`,
  door: `<rect x="5" y="2.5" width="14" height="19" rx="1" fill="#7a5a3a"/><rect x="7.5" y="5" width="9" height="6" fill="#a47a52"/><rect x="7.5" y="12.5" width="9" height="6.5" fill="#a47a52"/><circle cx="15" cy="12" r="1" fill="#ffd45a"/>`,
  shield: `<path d="M12 2.5 20 5.5v6c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10v-6z" fill="#9aa3ad"/><path d="M12 5.2 17.4 7.3v4.4c0 3.4-2.2 6-5.4 7.2z" fill="#c8ccd0"/>`,
  barricade: `<path d="M3 7.5l18 3v3l-18-3z" fill="#c49a62"/><path d="M3 13.5l18-3v3l-18 3z" fill="#b08050"/><path d="M5 5v15M19 5v15" fill="none" stroke-width="2.2"/><circle cx="7" cy="9" r=".8" fill="${O}"/><circle cx="17" cy="12" r=".8" fill="${O}"/>`,
  moon: `<path d="M15 3a8.5 8.5 0 1 0 6 13.5A7 7 0 0 1 15 3z" fill="#f0d27a"/>`,
  skull: `<path d="M12 2.8c-4.8 0-8 3.2-8 7.6 0 2.6 1.2 4.2 2.8 5.2V19a1 1 0 0 0 1 1h8.4a1 1 0 0 0 1-1v-3.4c1.6-1 2.8-2.6 2.8-5.2 0-4.4-3.2-7.6-8-7.6z" fill="#b7c99a"/><circle cx="8.8" cy="11" r="1.8" fill="${O}"/><circle cx="15.2" cy="11" r="1.8" fill="${O}"/><path d="M10.5 16.5v3.5M13.5 16.5v3.5" fill="none"/>`,
  bag: `<path d="M8 8V6a4 4 0 0 1 8 0v2" fill="none"/><path d="M5 8h14l1 12.5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" fill="#c9a06a"/><path d="M8.5 12h7v3.5h-7z" fill="#8a6440"/>`,
  sweep: `<path d="M2.5 4h3l2.5 11h10.5l2-8H7" fill="none"/><path d="M7 7h13.5l-2 8H8.4z" fill="#ffd45a"/><circle cx="9.5" cy="19" r="1.6" fill="#555"/><circle cx="17" cy="19" r="1.6" fill="#555"/><path d="M12 1.5v3.5M15 2.5l-1 3M9 2.5l1 3" fill="none" stroke="#c4442b"/>`,
  loan: `<rect x="2.5" y="5" width="19" height="13" rx="2" fill="#4a6aa0"/><path d="M2.5 9h19" fill="none" stroke-width="2.4"/><rect x="5" y="12.5" width="6" height="2.4" rx=".5" fill="#ffd45a"/>`,
  sleep: `<path d="M15 3a8.5 8.5 0 1 0 6 13.5A7 7 0 0 1 15 3z" fill="#6a7ab8"/><path d="M15 6h3.5L15 10h3.5" fill="none" stroke="#fff" stroke-width="1.2"/>`,
  craft: `<path d="M14.5 3.5l6 6-9.5 9.5H5v-6z" fill="#e6b84a"/><path d="M12.5 5.5l6 6" fill="none"/><path d="M5 19h6" fill="none"/>`,
  book: `<path d="M4 4h11a3 3 0 0 1 3 3v14H7a3 3 0 0 1-3-3z" fill="#c4442b"/><path d="M4 18a3 3 0 0 1 3-3h11" fill="none"/><path d="M8 8h6M8 11h4" fill="none" stroke="#fff"/>`,
  map: `<path d="M3 5.5 8.5 3l7 2.5L21 3v15.5L15.5 21l-7-2.5L3 21z" fill="#e9dfcd"/><path d="M8.5 3v15.5M15.5 5.5V21" fill="none"/><circle cx="12" cy="11" r="1.8" fill="#c4442b"/>`,
  run: `<circle cx="14.5" cy="4.5" r="2.2" fill="#f0c9a4"/><path d="M6 21l3.5-6 3 2.5 1-6.5-4 1.5L7 15M13.5 11l3 3h3.5M11 8l2.5 3" fill="none" stroke-width="2"/>`,
  key: `<circle cx="8" cy="12" r="4.2" fill="#ffd45a"/><path d="M12 12h9M18 12v3M15.5 12v2.4" fill="none" stroke-width="2"/>`,
  warn: `<path d="M12 3 22 20.5H2z" fill="#f0c04a"/><path d="M12 9.5v5" fill="none" stroke-width="2"/><circle cx="12" cy="17.4" r="1.1" fill="${O}"/>`,
  arrow: `<path d="M12 2.5 19 20l-7-3.5L5 20z" fill="#c4442b"/>`,
  plus: `<circle cx="12" cy="12" r="9" fill="#4e7d55"/><path d="M12 7.5v9M7.5 12h9" fill="none" stroke="#fff" stroke-width="2.2"/>`,
};
export const ICON_COLORS = { shop: '#e0533a', bank: '#4a6aa0', gym: '#c4442b', npc: '#f0c04a', home: '#7cf0a8', pharm: '#2f8a5f', hw: '#d49a2a', gas: '#2f8a5f' };
// on phones the "use" key is the key-shaped touch button, so prompts show that instead of <kbd>E</kbd>
export const TOUCH = typeof matchMedia === 'function' && matchMedia('(pointer:coarse)').matches;
export const kE = () => TOUCH ? ic('key') : '<kbd>E</kbd>';
export function ic(name, cls = '') {
  const body = P[name] || P.warn;
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" stroke="${O}" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round">${body}</svg>`;
}
export const SPOT_ICON = { home: 'house', mart: 'cart', pharm: 'pharm', hw: 'wrench', gas: 'pump', bank: 'bank', gym: 'gym', wang: 'chat', xiao: 'chat', radio: 'radio', li: 'chat' };
