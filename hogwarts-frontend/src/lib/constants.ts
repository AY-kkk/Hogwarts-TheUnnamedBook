
export interface HouseTheme {
  primary: string;
  secondary: string;
  crest: string; // URL to the crest image (PNG/SVG)
  id: string; // Unique identifier
}

export const HOUSE_CONFIG: Record<string, HouseTheme> = {
  'Gryffindor': {
    id: 'gryffindor',
    primary: '#740001', // Deep Red
    secondary: '#D3A625', // Gold
    crest: '/assets/houses/gryffindor-crest.png'
  },
  'Slytherin': {
    id: 'slytherin',
    primary: '#1A472A', // Emerald Green
    secondary: '#5D5D5D', // Silver
    crest: '/assets/houses/slytherin-crest.png'
  },
  'Ravenclaw': {
    id: 'ravenclaw',
    primary: '#0E1A40', // Navy Blue
    secondary: '#946B2D', // Bronze
    crest: '/assets/houses/ravenclaw-crest.png'
  },
  'Hufflepuff': {
    id: 'hufflepuff',
    primary: '#ECB939', // Yellow
    secondary: '#372E29', // Black
    crest: '/assets/houses/hufflepuff-crest.png'
  }
};

export const DEFAULT_THEME: HouseTheme = {
  id: 'default',
  primary: '#5c4d3c', // Neutral Brown
  secondary: '#8c7b6c', // Light Brown
  crest: '' // No crest by default
};
