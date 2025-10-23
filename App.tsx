
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
  // track built unique combinations as strings like "red|blue" (body|roof)
  const [builtCombos, setBuiltCombos] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<'success' | 'warning' | null>(null);
  const [allDone, setAllDone] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [childName, setChildName] = useState('');
  const [pendingPlacement, setPendingPlacement] = useState<{
    target: 'house-body' | 'house-roof';
    part: PlacedShape;
  } | null>(null);
  
  const playgroundRef = useRef<HTMLDivElement>(null);
  const successTimeoutRef = useRef<number | null>(null);
  const advanceTimeoutRef = useRef<number | null>(null);

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

  // NOTE: house creation logic moved into `finalizePlacement` to avoid ordering/race issues

  const handleStartNewHouse = () => {
    // start a new house: simply reset current house and confetti
    setHouseState({ body: null, roof: null });
    setShowConfetti(false);
    setMessage(null);
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
    setBuiltCombos({});
    setAllDone(false);
    setMessage(null);
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

  // After both parts have been set on houseState, call this to evaluate duplicates / additions.
  useEffect(() => {
    if (!houseState.body || !houseState.roof) return;

    const comboKey = `${houseState.body.color}|${houseState.roof.color}`;

    // Check visible history for duplicates
    const existsInHistory = houseHistory.some(h => h.body.color === houseState.body!.color && h.roof.color === houseState.roof!.color);

  if (existsInHistory) {
      // duplicate - warning and reset current house after a short delay
      setMessage('Cette combinaison de couleurs a déjà été construite. Essaie une autre!');
      setMessageType('warning');
      setShowConfetti(false);
      setTimeout(() => {
        setHouseState({ body: null, roof: null });
        setMessage(null);
        setMessageType(null);
      }, 1200);
      return;
    }

    // New unique house: add to history and builtCombos, celebrate
    setHouseHistory(prev => {
      const newHistory = [...prev, houseState as House];
      return newHistory;
    });
    setBuiltCombos(prev => ({ ...prev, [comboKey]: true }));
    setShowConfetti(true);
    setMessage('Maison construite !');
    setMessageType('success');

    // clear the success message after 1500ms (store the timer so we can clean it up)
    if (successTimeoutRef.current) {
      window.clearTimeout(successTimeoutRef.current);
    }
    successTimeoutRef.current = window.setTimeout(() => {
      setMessage(null);
      setMessageType(null);
    }, 1500);

    // If this addition makes 9 unique houses, set allDone and show final message
    const newUniqueCount = houseHistory.length + 1;
    if (newUniqueCount >= 9) {
      setAllDone(true);
      setMessage('Félicitations ! Tu as construit les 9 maisons différentes 🎉');
      setMessageType('success');
      // Do not auto-advance when the game is complete
      return;
    }

    // Otherwise, auto-advance to the next house shortly after the success message clears
    if (advanceTimeoutRef.current) {
      window.clearTimeout(advanceTimeoutRef.current);
    }
    advanceTimeoutRef.current = window.setTimeout(() => {
      setHouseState({ body: null, roof: null });
      setShowConfetti(false);
    }, 1700);
    // cleanup timers when effect re-runs or component unmounts
    return () => {
      if (successTimeoutRef.current) {
        window.clearTimeout(successTimeoutRef.current);
        successTimeoutRef.current = null;
      }
      if (advanceTimeoutRef.current) {
        window.clearTimeout(advanceTimeoutRef.current);
        advanceTimeoutRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [houseState.body, houseState.roof]);

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
            <button
              onClick={resetCurrentHouse}
              aria-label="Réinitialiser la maison"
              className="px-4 py-3 bg-amber-500 text-white rounded-lg shadow-md hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-opacity-75 transition-transform transform hover:scale-105"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 12a9 9 0 11-3.75-7.05" />
                <polyline points="21 3 21 9 15 9" />
              </svg>
              <span className="sr-only">Réinitialiser la maison</span>
            </button>
            <button
              onClick={resetAll}
              aria-label="Tout réinitialiser"
              className="px-4 py-3 bg-red-500 text-white rounded-lg shadow-md hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-opacity-75 transition-transform transform hover:scale-105"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6" />
                <path d="M14 11v6" />
              </svg>
              <span className="sr-only">Tout réinitialiser</span>
            </button>
          </div>
        </header>
        <main className="flex-1 flex flex-col gap-4 overflow-hidden">
        
          <div className="flex-1 flex gap-8 min-h-0">
            <Palette />
            <div ref={playgroundRef} className="flex-1 flex relative">
              {/* Playground area */}
              <Playground
                shapes={placedShapes}
                houseBody={houseState.body}
                houseRoof={houseState.roof}
                pendingPlacement={pendingPlacement}
                onPlacementFinalized={finalizePlacement}
              />

              {/* Message overlay centered over the playground */}
              {message && (
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-40">
                  <div className={`pointer-events-auto rounded-lg shadow-lg px-6 py-4 max-w-md text-center ${messageType === 'success' ? 'bg-green-100 border-l-4 border-green-400 text-green-800' : 'bg-yellow-100 border-l-4 border-yellow-400 text-yellow-800'}`}>
                    {message}
                  </div>
                </div>
              )}
            </div>
          </div>
           <History history={houseHistory} childName={childName} />
        </main>
        {allDone && (
          <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
            <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-8 shadow-2xl text-center pointer-events-auto">
              <h2 className="text-3xl font-extrabold text-green-700 mb-3">Félicitations 🎉</h2>
              <p className="text-lg text-gray-700">Tu as construit toutes les maisons possibles !</p>
              <div className="mt-6">
                <button
                  onClick={() => { setAllDone(false); setMessage(null); setShowConfetti(false); }}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700"
                >
                  Continuer
                </button>
              </div>
            </div>
          </div>
        )}
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
