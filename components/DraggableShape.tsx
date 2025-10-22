
import * as React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Shape } from './Shape';
import type { ShapeConfig, PlacedShape } from '../types';

interface DraggableShapeProps {
  id: string;
  shapeInfo: ShapeConfig | PlacedShape;
  fromPalette?: boolean;
}

export const DraggableShape: React.FC<DraggableShapeProps> = ({ id, shapeInfo, fromPalette = false }) => {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id,
    data: {
      ...shapeInfo,
      fromPalette,
    },
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  const positionStyles = 'left' in shapeInfo ? { top: shapeInfo.top, left: shapeInfo.left } : {};

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, ...positionStyles }}
      {...listeners}
      {...attributes}
      className={`${fromPalette ? 'relative' : 'absolute'} cursor-grab touch-none`}
    >
      <Shape type={shapeInfo.type} color={shapeInfo.color} />
    </div>
  );
};
