
import React from 'react';
import { SHAPES, COLORS } from '../constants';
import { DraggableShape } from './DraggableShape';

export const Palette: React.FC = () => {
  return (
    <div className="w-48 bg-white rounded-xl shadow-lg p-4 flex flex-col items-center gap-4">
       <h2 className="text-xl font-bold text-gray-700 mb-2">Formes</h2>
      <div className="grid grid-cols-2 gap-4">
        {COLORS.flatMap(color =>
          SHAPES.map(shape => (
            <DraggableShape
              key={`${shape}-${color}`}
              id={`palette-${shape}-${color}`}
              shapeInfo={{ type: shape, color }}
              fromPalette={true}
            />
          ))
        )}
      </div>
    </div>
  );
};
