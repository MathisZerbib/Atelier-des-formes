
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import type { PlacedShape, ShapeConfig } from './types';
import { Palette } from './components/Palette';
import { Playground } from './components/Playground';
import { Shape } from './components/Shape';
import { History } from './components/History';
import Confetti from './components/Confetti';

type House = { body: PlacedShape; roof: PlacedShape };

const App: React.FC = () => {

  
  const [placedShapes, setPlacedShapes] = useState<PlacedShape[]>([]);
  const [activeShape, setActiveShape] = useState<ShapeConfig | null>(null);
  const [houseState, setHouseState] = useState<{ body: PlacedShape | null; roof: PlacedShape | null }>({
    body: null,
    roof: null,
  });
  const [houseHistory, setHouseHistory] = useState<House[]>([]);
  const [showConfetti, setShowConfetti] = useState(false);
  const [childName, setChildName] = useState('');
  const [pendingPlacement, setPendingPlacement] = useState<{
    target: 'house-body' | 'house-roof';
    part: PlacedShape;
  } | null>(null);
  
  const playgroundRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { type, color } = event.active.data.current as ShapeConfig;
    setActiveShape({ type, color });
  }, []);

  useEffect(() => {
    if (houseState.body && houseState.roof) {
      setShowConfetti(true);
    }
  }, [houseState.body, houseState.roof]);

  const handleStartNewHouse = () => {
    if (houseState.body && houseState.roof) {
      setHouseHistory(prev => [...prev, houseState as House]);
    }
    setHouseState({ body: null, roof: null });
    setShowConfetti(false);
  };

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    if (showConfetti) return; // Disable dragging when celebrating
    
    setActiveShape(null);
    const { active, over, delta } = event;

    if (!over) {
      return;
    }

    const { fromPalette, ...shapeInfo } = active.data.current as PlacedShape & { fromPalette: boolean };
    const shapeType = shapeInfo.type;

    if (over.id === 'house-body' && shapeType === 'square' && !houseState.body && !pendingPlacement) {
      const newPart = { ...shapeInfo, id: String(active.id), top: 0, left: 0 };
      // set pending placement; Playground will animate and call finalizePlacement when done
      setPendingPlacement({ target: 'house-body', part: newPart });
      if (!fromPalette) {
        setPlacedShapes(prev => prev.filter(s => s.id !== active.id));
      }
      return;
    }

    if (over.id === 'house-roof' && shapeType === 'triangle' && !houseState.roof && !pendingPlacement) {
      const newPart = { ...shapeInfo, id: String(active.id), top: 0, left: 0 };
      setPendingPlacement({ target: 'house-roof', part: newPart });
      if (!fromPalette) {
        setPlacedShapes(prev => prev.filter(s => s.id !== active.id));
      }
      return;
    }

    if (over.id === 'playground') {
      const playgroundNode = playgroundRef.current;
      if (!playgroundNode) return;
      
      if (fromPalette) {
        const initialShapeRect = active.rect.current.initial;
        if (!initialShapeRect) return;
        
        const playgroundRect = playgroundNode.getBoundingClientRect();
        const left = initialShapeRect.left - playgroundRect.left + delta.x;
        const top = initialShapeRect.top - playgroundRect.top + delta.y;
        
        const newShape: PlacedShape = {
          id: `shape-${Date.now()}`,
          type: shapeInfo.type,
          color: shapeInfo.color,
          top: Math.max(0, Math.min(top, playgroundRect.height - 64)),
          left: Math.max(0, Math.min(left, playgroundRect.width - 64)),
        };
        setPlacedShapes(prev => [...prev, newShape]);
      } else {
        setPlacedShapes(prev =>
          prev.map(shape =>
            shape.id === active.id
              ? {
                  ...shape,
                  left: Math.max(0, Math.min(shape.left + delta.x, playgroundNode.clientWidth - 64)),
                  top: Math.max(0, Math.min(shape.top + delta.y, playgroundNode.clientHeight - 64)),
                }
              : shape
          )
        );
      }
    }
  }, [houseState, showConfetti]);

  const resetCurrentHouse = () => {
    setHouseState({ body: null, roof: null });
    setShowConfetti(false);
  };
  
  const resetAll = () => {
    setPlacedShapes([]);
    setHouseState({ body: null, roof: null });
    setHouseHistory([]);
    setShowConfetti(false);
  };

  const finalizePlacement = (target: 'house-body' | 'house-roof') => {
    if (!pendingPlacement) return;
    if (pendingPlacement.target !== target) return;
    const part = pendingPlacement.part;
    if (target === 'house-body') {
      setHouseState(prev => ({ ...prev, body: part }));
    } else {
      setHouseState(prev => ({ ...prev, roof: part }));
    }
    setPendingPlacement(null);
  };

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      {showConfetti && <Confetti />}
      <div className="flex flex-col h-screen p-4 md:p-8 font-sans bg-sky-50">
        <header className="flex flex-wrap justify-between items-center gap-4 mb-6">
          <div className="flex items-baseline gap-4">
            <h1 className="text-3xl md:text-4xl font-bold text-gray-800">Atelier des Formes</h1>
            <input
              type="text"
              value={childName}
              onChange={(e) => setChildName(e.target.value)}
              placeholder="Écris ton nom ici..."
              className="text-xl md:text-2xl font-semibold text-gray-700 bg-sky-100 p-2 rounded-lg border-2 border-transparent focus:border-blue-400 focus:outline-none focus:ring-0 transition"
              aria-label="Nom de l'enfant"
            />
          </div>
          <div className="flex gap-4 items-center">
             {showConfetti && (
               <button
                  onClick={handleStartNewHouse}
                  className="px-6 py-3 bg-green-500 text-white font-semibold rounded-lg shadow-md hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-opacity-75 transition-transform transform hover:scale-105 animate-pulse"
                >
                  Maison Suivante
                </button>
             )}
             <button
              onClick={resetCurrentHouse}
              className="px-6 py-3 bg-amber-500 text-white font-semibold rounded-lg shadow-md hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-opacity-75 transition-transform transform hover:scale-105"
            >
              Réinitialiser la maison
            </button>
            <button
              onClick={resetAll}
              className="px-6 py-3 bg-red-500 text-white font-semibold rounded-lg shadow-md hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-opacity-75 transition-transform transform hover:scale-105"
            >
              Tout réinitialiser
            </button>
          </div>
        </header>
        <main className="flex-1 flex flex-col gap-4 overflow-hidden">
          <div className="flex-1 flex gap-8 min-h-0">
            <Palette />
              <div ref={playgroundRef} className="flex-1 flex">
              <Playground
                shapes={placedShapes}
                houseBody={houseState.body}
                houseRoof={houseState.roof}
                pendingPlacement={pendingPlacement}
                onPlacementFinalized={finalizePlacement}
              />
            </div>
          </div>
           <History history={houseHistory} childName={childName} />
        </main>
      </div>
      <DragOverlay>
        {activeShape ? (
          <Shape type={activeShape.type} color={activeShape.color} className="w-16 h-16 opacity-75" />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};

export default App;
