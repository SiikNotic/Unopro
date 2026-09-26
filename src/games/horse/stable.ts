// The stable: the 8 horses a race is drawn from. Number, coat and silks are fixed (the database only knows the
// numbers); names are in the locale files (horse.names.<n>).

export interface HorseLook {
  n: number;
  /** Coat: base, shade and highlight, mane/tail. */
  coat: [string, string, string, string];
  /** Jockey silks and cap; the colour the app shows for this horse. */
  silk: string;
  silk2: string;
  /** A white blaze on the face / white socks. */
  blaze?: boolean;
  socks?: boolean;
}

export const STABLE: HorseLook[] = [
  { n: 1, coat: ['#1d1a1c', '#0b0a0b', '#4a4448', '#060506'], silk: '#c8202f', silk2: '#e8c46a' },
  { n: 2, coat: ['#7a4322', '#4a250f', '#a8683c', '#1a0e08'], silk: '#138a5a', silk2: '#e8c46a' },
  { n: 3, coat: ['#9aa0a8', '#6a7078', '#d4d8de', '#4c5058'], silk: '#1f58c8', silk2: '#e8eef8' },
  { n: 4, coat: ['#a2501f', '#6e3010', '#d27c3e', '#7a3a14'], silk: '#d9a33a', silk2: '#1a1208', blaze: true },
  { n: 5, coat: ['#e8e4dc', '#b8b2a6', '#ffffff', '#cfc8ba'], silk: '#15151a', silk2: '#e8c46a' },
  { n: 6, coat: ['#d4a24c', '#a0742a', '#f0cc80', '#f3e6c4'], silk: '#6a2bb8', silk2: '#e8c46a', socks: true },
  { n: 7, coat: ['#4a2616', '#2a140a', '#744028', '#120804'], silk: '#e07a1a', silk2: '#1a1208' },
  { n: 8, coat: ['#8a4a3e', '#5e2e26', '#b87a6c', '#3a1a14'], silk: '#f1e6cf', silk2: '#b01d3a', blaze: true },
];

export const lookOf = (n: number): HorseLook => STABLE[(n - 1 + STABLE.length) % STABLE.length];
