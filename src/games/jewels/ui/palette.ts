// Colours of each jewel kind (index = kind): body gradient and rim, plus the spark / glow colour.
export interface Palette {
  hi: string;
  mid: string;
  low: string;
  rim: string;
}

export const PALETTES: Palette[] = [
  { hi: '#ffffff', mid: '#cfe6f5', low: '#7fa3bd', rim: '#3f5f78' }, // diamond
  { hi: '#b7f7d0', mid: '#22b86a', low: '#0a5a32', rim: '#053a1f' }, // emerald
  { hi: '#ffb3bd', mid: '#e0253f', low: '#7a0a1c', rim: '#4a0410' }, // ruby
  { hi: '#bcd8ff', mid: '#2f66e0', low: '#0e2a78', rim: '#081a4d' }, // sapphire
  { hi: '#ecc9ff', mid: '#9444dc', low: '#46127a', rim: '#2b0a4d' }, // amethyst
  { hi: '#fff0b8', mid: '#f0ad24', low: '#8a5208', rim: '#553104' }, // topaz
];

/** Particle / glow colour of each kind (index = kind). */
export const KIND_GLOW = ['#e9f6ff', '#5dffa4', '#ff5d74', '#6aa0ff', '#c98bff', '#ffd05a'];
