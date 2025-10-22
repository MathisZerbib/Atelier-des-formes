
import { SHAPES, COLORS } from './constants';

export type ShapeType = typeof SHAPES[number];
export type ShapeColor = typeof COLORS[number];

export interface ShapeConfig {
  type: ShapeType;
  color: ShapeColor;
}

export interface PlacedShape extends ShapeConfig {
  id: string;
  top: number;
  left: number;
}
