export const SHAPES = ['square', 'triangle'] as const;
export const COLORS = ['red', 'blue', 'yellow'] as const;

export const COLOR_MAP: { [key: string]: string } = {
  red: 'fill-red-500',
  blue: 'fill-blue-500',
  yellow: 'fill-yellow-500',
};

// Short celebratory messages shown after building a unique house
export const SUCCESS_MESSAGES: string[] = [
  'Quelle jolie maison !',
  'Bravo, jolie maison !',
  'Super maison !',
  'Quelle belle construction !',
  'Tu as construit une maison !',
  'Maison toute jolie !',
  'Construction réussie !',
  'Wouah, quelle maison !',
  'Ta maison est belle !',
  'Maison parfaite !',
  'Félicitations pour ta maison !',
  'Maison réussie !',
  'Bravo pour ta maison !',
  'Maison magnifique !',
  'Tu as fait une super maison !',
  'Incroyable maison !',
  'Maison splendide !',
  'Bravo, quelle maison !',
  'Superbe maison !',
  'Top, une maison !',
  'Bravo, c\'est une maison !',
];