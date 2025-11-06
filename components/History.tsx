
import React from 'react';
import type { PlacedShape } from '../types';
import { Shape } from './Shape';

interface HistoryProps {
  history: { body: PlacedShape; roof: PlacedShape }[];
  childName: string;
}

export const History: React.FC<HistoryProps> = ({ history, childName }) => {
  const title = childName
    ? `Maisons Construites par ${childName}`
    : "Maisons Construites";

  if (history.length === 0) {
    return (
      <div id="history-panel" className="bg-white rounded-xl shadow-lg p-4">
        <h2 className="text-xl font-bold text-gray-700 mb-3 text-center">{title}</h2>
        <div className="p-10 flex items-center justify-center">
          <p className="text-gray-500 text-center my-14">Commence à construire les maisons !</p>
        </div>
      </div>
    );
  }

  return (
    <div id="history-panel" className="bg-white rounded-xl shadow-lg p-4">
      <h2 className="text-xl font-bold text-gray-700 mb-3 text-center">{title}</h2>
      <div className="flex overflow-x-auto gap-6 p-4 scrollbar-thin scrollbar-thumb-blue-300 scrollbar-track-blue-100">
        {history.map((house, index) => (
          <div 
            key={index} 
            className="relative w-28 h-48 pt-2 flex-shrink-0"
            aria-label={`Maison ${index + 1} avec un corps ${house.body.color} et un toit ${house.roof.color}`}
          >
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2">
              <Shape type={house.body.type} color={house.body.color} className="w-24 h-24" showDoor={true} showChimney={false} />
            </div>            
            <div className="absolute left-1/2 -translate-x-1/2 bottom-24">
              {/* Position roof bottom at the body's top so the triangle base snaps flush (no overlay) */}
              <Shape type={house.roof.type} color={house.roof.color} className="w-24 h-auto" showChimney={true} showDoor={false} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
