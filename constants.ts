export const SHAPES = ['square', 'triangle'] as const;
export const COLORS = ['red', 'blue', 'yellow'] as const;

export const COLOR_MAP: { [key: string]: string } = {
  red: 'fill-red-500',
  blue: 'fill-blue-500',
  yellow: 'fill-yellow-500',
};