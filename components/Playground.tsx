import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import type { PlacedShape } from '../types';
import { DraggableShape } from './DraggableShape';
import { Shape } from './Shape';

interface PlaygroundProps {
  shapes: PlacedShape[];
  houseBody: PlacedShape | null;
  houseRoof: PlacedShape | null;
  pendingPlacement?: { target: 'house-body' | 'house-roof'; part: PlacedShape } | null;
  onPlacementFinalized?: (target: 'house-body' | 'house-roof') => void;
}

const DropZone: React.FC<{
  id: string;
  isOccupied: boolean;
  children: React.ReactNode;
  className: string;
  expectedShape: string;
  onPlacementFinalized?: () => void;
}> = ({ id, isOccupied, children, className, expectedShape, onPlacementFinalized }) => {
  const { setNodeRef, isOver } = useDroppable({ id, disabled: isOccupied });

  // We'll render an overlay (border/background/placeholder) that fades out when occupied,
  // and render the placed child above it with a transform animation so it "snaps" into place.
  const overlayBase = "absolute inset-0 border-4 border-dashed flex items-center justify-center transition-opacity duration-300";
  const overlayState = isOver ? "border-green-400 bg-green-100" : "border-blue-300 bg-transparent";

  return (
    <div ref={setNodeRef} className={`relative ${className}`}>
      {/* overlay visual (fades when occupied) */}
      <div className={`${overlayBase} ${overlayState} ${isOccupied ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        <span className="text-lg text-blue-400 opacity-60 font-semibold capitalize">{expectedShape}</span>
      </div>

      {/* placed child - snaps into place with a transform animation */}
      <div className={`relative flex items-center justify-center transition-transform duration-300 ${isOccupied ? 'scale-100' : 'scale-95'}`} onTransitionEnd={() => {
        // bubble the finalization up when transition ends and the place is occupied
        if (isOccupied && onPlacementFinalized) onPlacementFinalized();
      }}>
        {isOccupied ? children : null}
      </div>
    </div>
  );
};

export const Playground: React.FC<PlaygroundProps> = ({ shapes, houseBody, houseRoof, pendingPlacement, onPlacementFinalized }) => {
  const { setNodeRef } = useDroppable({
    id: 'playground',
  });

  return (
    <div
      ref={setNodeRef}
      className="flex-1 bg-blue-100 rounded-2xl relative overflow-hidden shadow-inner p-8 flex items-center justify-center"
    >
      {/* House structure */}
      <div className="relative w-48 h-72 flex flex-col items-center">
        <DropZone 
          id="house-roof" 
          isOccupied={!!houseRoof || (pendingPlacement?.target === 'house-roof')}
          className="w-48 h-48 mb-1"
          expectedShape="toit"
          onPlacementFinalized={() => onPlacementFinalized && onPlacementFinalized('house-roof')}
        >
          {(houseRoof || (pendingPlacement?.target === 'house-roof' ? pendingPlacement.part : null)) && (
            <div
              // when pendingPlacement exists, animate the snap and call onPlacementFinalized on transitionend
              onTransitionEnd={() => {
                if (pendingPlacement?.target === 'house-roof') onPlacementFinalized && onPlacementFinalized('house-roof');
              }}
            >
              <Shape type={(houseRoof || pendingPlacement?.part)!.type} color={(houseRoof || pendingPlacement?.part)!.color} className="w-36 h-18 my-1 transition-transform duration-300" />
            </div>
          )}
        </DropZone>
        <DropZone 
          id="house-body" 
          isOccupied={!!houseBody || (pendingPlacement?.target === 'house-body')}
          className="w-48 h-48 mt-1"
          expectedShape="maison"
          onPlacementFinalized={() => onPlacementFinalized && onPlacementFinalized('house-body')}
        >
           {(houseBody || (pendingPlacement?.target === 'house-body' ? pendingPlacement.part : null)) && (
             <div
               onTransitionEnd={() => {
                 if (pendingPlacement?.target === 'house-body') onPlacementFinalized && onPlacementFinalized('house-body');
               }}
             >
               <Shape type={(houseBody || pendingPlacement?.part)!.type} color={(houseBody || pendingPlacement?.part)!.color} className="w-36 h-36 my-1 transition-transform duration-300" />
             </div>
           )}
        </DropZone>
      </div>

      {/* Free-floating shapes */}
      {shapes.map(shape => (
        <DraggableShape key={shape.id} id={shape.id} shapeInfo={shape} />
      ))}
    </div>
  );
};