
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import type { PlacedShape, ShapeConfig } from './types';
import { Palette } from './components/Palette';
import { Playground } from './components/Playground';
import { Shape } from './components/Shape';
import { History } from './components/History';
import Confetti from './components/Confetti';
import ConfirmationModal from './components/ConfirmationModal';
import AddChildModal from './components/AddChildModal';
import PWAUpdatePrompt from './components/PWAUpdatePrompt';
import * as storage from './storage';

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
  const [showDuplicateGif, setShowDuplicateGif] = useState(false);
  const [allDone, setAllDone] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [childName, setChildName] = useState('');
  const [classrooms, setClassrooms] = useState<storage.Classroom[]>([]);
  const [selectedClassroomId, setSelectedClassroomId] = useState<string | null>(null);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingChildId, setEditingChildId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropdownQuery, setDropdownQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const [pendingPlacement, setPendingPlacement] = useState<{
    target: 'house-body' | 'house-roof';
    part: PlacedShape;
  } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    action: 'clear-history' | 'delete-child' | null;
    classroomId?: string;
    childId?: string;
    childName?: string;
    count?: number;
  }>({ open: false, action: null });
  const [addChildModalOpen, setAddChildModalOpen] = useState(false);
  
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
    setShowDuplicateGif(false);
  };

  // Load classrooms from storage on mount (ensure IndexedDB init first)
  useEffect(() => {
    (async () => {
      await storage.init();
      let classes = storage.loadClassrooms();
      // ensure there's at least one classroom (single-classroom app)
      if (classes.length === 0) {
        const created = storage.addClassroom('Classe 1');
        classes = [created];
      }
      setClassrooms(classes);
      // always use first classroom
      setSelectedClassroomId(classes[0].id);
      if (classes[0].children.length > 0) {
        setSelectedChildId(classes[0].children[0].id);
        setChildName(classes[0].children[0].name);
        setHouseHistory(classes[0].children[0].history || []);
        const combos: Record<string, boolean> = {};
        (classes[0].children[0].history || []).forEach(h => { combos[`${h.body.color}|${h.roof.color}`] = true; });
        setBuiltCombos(combos);
      }
    })();
  }, []);

  // close dropdown on outside click
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!dropdownRef.current) return;
      if (!(e.target instanceof Node)) return;
      if (!dropdownRef.current.contains(e.target)) setDropdownOpen(false);
    }
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, []);

  // Persist houseHistory to the selected child whenever it changes
  useEffect(() => {
    if (!selectedClassroomId || !selectedChildId) return;
    storage.updateChildHistory(selectedClassroomId, selectedChildId, houseHistory);
    // update local classrooms state copy as well
    setClassrooms(prev => {
      const copy = prev.map(c => ({ ...c, children: c.children.map(ch => ({ ...ch })) }));
      const cls = copy.find(c => c.id === selectedClassroomId);
      if (cls) {
        const ch = cls.children.find(ch => ch.id === selectedChildId);
        if (ch) ch.history = houseHistory;
      }
      return copy;
    });
  }, [houseHistory, selectedClassroomId, selectedChildId]);

  const handleAddChild = (name: string) => {
    const classroomId = selectedClassroomId ?? classrooms[0]?.id;
    if (!classroomId) return;
    const ch = storage.addChildToClassroom(classroomId, name);
    if (!ch) return;
    setClassrooms(prev => prev.map(c => c.id === classroomId ? { ...c, children: [...c.children, ch] } : c));
    setSelectedChildId(ch.id);
    setChildName(ch.name);
    setHouseHistory([]);
    setBuiltCombos({});
  };

  const startEditChild = (chId: string, currentName: string) => {
    setEditingChildId(chId);
    setEditingText(currentName);
  };

  const saveChildRename = (classroomId: string, childId: string) => {
    const newName = editingText.trim();
    if (!newName) return;
    const classes = storage.loadClassrooms();
    const cls = classes.find(c => c.id === classroomId);
    if (!cls) return;
    const ch = cls.children.find(ch => ch.id === childId);
    if (!ch) return;
    ch.name = newName;
    storage.saveClassrooms(classes);
    // update local copy
    setClassrooms(prev => prev.map(c => c.id === classroomId ? { ...c, children: c.children.map(child => child.id === childId ? { ...child, name: newName } : child) } : c));
    if (selectedChildId === childId) setChildName(newName);
    setEditingChildId(null);
    setEditingText('');
  };

  const cancelEditChild = () => {
    setEditingChildId(null);
    setEditingText('');
  };

  const handleClearChildHistory = (classroomId: string, childId: string) => {
    // open confirmation modal instead of immediate confirm
    const classes = storage.loadClassrooms();
    const cls = classes.find(c => c.id === classroomId);
    if (!cls) return;
    const ch = cls.children.find(ch => ch.id === childId);
    if (!ch) return;
    const count = (ch.history || []).length;
    if (count === 0) {
      alert("L'historique de cet enfant est déjà vide.");
      return;
    }
    setConfirmModal({ open: true, action: 'clear-history', classroomId, childId, childName: ch.name, count });
  };

  const performClearChildHistory = (classroomId: string, childId: string) => {
    const classes = storage.loadClassrooms();
    const cls = classes.find(c => c.id === classroomId);
    if (!cls) return;
    const ch = cls.children.find(ch => ch.id === childId);
    if (!ch) return;
    ch.history = [];
    storage.saveClassrooms(classes);
    setClassrooms(prev => prev.map(c => c.id === classroomId ? { ...c, children: c.children.map(child => child.id === childId ? { ...child, history: [] } : child) } : c));
    if (selectedChildId === childId) {
      setHouseHistory([]);
      setBuiltCombos({});
    }
    setConfirmModal({ open: false, action: null });
  };

  const openConfirmDeleteChild = (classroomId: string, childId: string) => {
    const classes = storage.loadClassrooms();
    const cls = classes.find(c => c.id === classroomId);
    if (!cls) return;
    const ch = cls.children.find(ch => ch.id === childId);
    if (!ch) return;
    setConfirmModal({ open: true, action: 'delete-child', classroomId, childId, childName: ch.name });
  };

  const performDeleteChild = (classroomId: string, childId: string) => {
    const classes = storage.loadClassrooms();
    const cls = classes.find(c => c.id === classroomId);
    if (!cls) return;
    const idx = cls.children.findIndex(ch => ch.id === childId);
    if (idx === -1) return;
    cls.children.splice(idx, 1);
    storage.saveClassrooms(classes);
    setClassrooms(prev => prev.map(c => c.id === classroomId ? { ...c, children: c.children.filter(child => child.id !== childId) } : c));

    // if deleted child was selected, switch to another child or clear state
    if (selectedChildId === childId) {
      const nextChild = cls.children[0] || null;
      if (nextChild) {
        setSelectedChildId(nextChild.id);
        setChildName(nextChild.name);
        setHouseHistory(nextChild.history || []);
        const combos: Record<string, boolean> = {};
        (nextChild.history || []).forEach(h => { combos[`${h.body.color}|${h.roof.color}`] = true; });
        setBuiltCombos(combos);
      } else {
        setSelectedChildId(null);
        setChildName('');
        setHouseHistory([]);
        setBuiltCombos({});
      }
    }

    setConfirmModal({ open: false, action: null });
  };

  const handleSelectChild = (classroomId: string, childId: string) => {
    const child = storage.getChild(classroomId, childId);
    setSelectedClassroomId(classroomId);
    setSelectedChildId(childId);
    if (child) {
      setChildName(child.name);
      setHouseHistory(child.history || []);
      const combos: Record<string, boolean> = {};
      (child.history || []).forEach(h => { combos[`${h.body.color}|${h.roof.color}`] = true; });
      setBuiltCombos(combos);
    } else {
      setChildName('');
      setHouseHistory([]);
      setBuiltCombos({});
    }
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
    setShowDuplicateGif(false);
  };
  
  const resetAll = () => {
    setPlacedShapes([]);
    setHouseState({ body: null, roof: null });
    setHouseHistory([]);
    setShowConfetti(false);
    setBuiltCombos({});
    setAllDone(false);
    setMessage(null);
    setShowDuplicateGif(false);
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
      // duplicate - show GIF and reset current house after a short delay
      setShowDuplicateGif(true);
      setShowConfetti(false);
      setTimeout(() => {
        setHouseState({ body: null, roof: null });
        setShowDuplicateGif(false);
      }, 3000);
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
      // setMessage('Félicitations ! Tu as construit les 9 maisons différentes 🎉');
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
    <>
    <PWAUpdatePrompt />
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      {showConfetti && <Confetti />}
      <div className="flex flex-col h-screen p-4 md:p-8 font-sans bg-sky-50">
        <header className="flex flex-wrap justify-between items-center gap-4 mb-6">
          <div className="flex items-baseline gap-4">
            <h1 className="text-3xl md:text-4xl font-bold text-gray-800">Atelier des Formes</h1>
            <div ref={dropdownRef} className="relative ml-4">
              <button
                onClick={() => setDropdownOpen(o => !o)}
                className="flex items-center gap-2 p-2 bg-white border rounded-md shadow-sm"
                aria-haspopup="listbox"
                aria-expanded={dropdownOpen}
              >
                <span className="text-sm text-gray-700">{childName || "Choisir enfant"}</span>
                <svg className="w-4 h-4 text-gray-500" viewBox="0 0 20 20" fill="none" stroke="currentColor"><path d="M6 8l4 4 4-4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white border rounded-md shadow-lg z-50">
                  <div className="p-2">
                    <input
                      value={dropdownQuery}
                      onChange={e => setDropdownQuery(e.target.value)}
                      className="w-full p-2 border rounded"
                      placeholder="Rechercher..."
                    />
                  </div>
                  <ul role="listbox" className="max-h-48 overflow-auto p-2 space-y-1">
                    {(classrooms[0]?.children || []).filter(ch => ch.name.toLowerCase().includes(dropdownQuery.toLowerCase())).map(ch => (
                      <li key={ch.id}>
                        <button
                          onClick={() => { setDropdownOpen(false); setDropdownQuery(''); handleSelectChild(classrooms[0].id, ch.id); }}
                          className={`w-full text-left px-3 py-2 rounded ${selectedChildId === ch.id ? 'bg-sky-100' : 'hover:bg-gray-50'}`}>
                          {ch.name}
                        </button>
                      </li>
                    ))}
                    {((classrooms[0]?.children || []).filter(ch => ch.name.toLowerCase().includes(dropdownQuery.toLowerCase())).length === 0) && (
                      <li className="px-3 py-2 text-sm text-gray-500">Aucun enfant trouvé</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-4 items-center">
            <button
              onClick={() => setPanelOpen(true)}
              className="px-3 py-2 bg-sky-600 text-white rounded-md"
              aria-label="Ouvrir la classe"
            >Ma classe</button>

            <button
              onClick={async () => {
                const el = document.getElementById('history-panel');
                if (!el) { alert("Aucun historique à capturer"); return; }
                try {
                  const html2canvas = (await import('html2canvas')).default;
                  const canvas = await html2canvas(el as HTMLElement, { backgroundColor: null });
                  canvas.toBlob((blob) => {
                    if (!blob) { alert('Erreur: impossible de générer l\'image'); return; }
                    const date = new Date();
                    const day = String(date.getDate()).padStart(2, '0');
                    const month = String(date.getMonth() + 1).padStart(2, '0');
                    const year = String(date.getFullYear());
                    const safeName = (childName || 'enfant').replace(/[^a-z0-9-_]/gi, '_');
                    const filename = `${safeName}_${day}-${month}-${year}.png`;
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    URL.revokeObjectURL(url);
                  }, 'image/png');
                } catch (err) {
                  console.error(err);
                  alert("Erreur lors de la capture. Installez 'html2canvas' ou vérifiez la console.");
                }
              }}
              className="px-3 py-2 bg-emerald-600 text-white rounded-md"
              aria-label="Capturer l'historique"
            >📸</button>

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
            {/* <button
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
            </button> */}
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
                {(showDuplicateGif || message) && (
                  
                  /// display it at the far left of the playground
                <div className="absolute left-60 top-1/2 transform -translate-y-1/2 flex items-center justify-center pointer-events-none">
                  {showDuplicateGif ? (
                    <img
                      src="/images/emoji-no.gif"
                      alt="Combinaison déjà construite"
                      className="ml-4 w-28 h-28 md:w-36 md:h-36 select-none"
                    />
                  ) : (
                    <div className={`pointer-events-auto rounded-lg shadow-lg px-6 py-4 max-w-md text-center ${messageType === 'success' ? 'bg-green-100 border-l-4 border-green-400 text-green-800' : 'bg-yellow-100 border-l-4 border-yellow-400 text-yellow-800'}`}>
                      {message}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
           <History history={houseHistory} childName={childName} />
        </main>
        {/* Right-side classroom panel drawer */}
        <div aria-hidden={!panelOpen} className={`fixed right-0 top-0 h-full w-80 bg-white shadow-lg transform transition-transform ${panelOpen ? 'translate-x-0' : 'translate-x-full'}`}>
          <div className="flex flex-col h-full">
            <div className="p-4 flex items-center justify-between border-b">
              <h3 className="text-lg font-bold">Classe</h3>
              <button onClick={() => setPanelOpen(false)} className="px-2 py-1 text-sm text-gray-600">Fermer</button>
            </div>
            {/* Scrollable list area */}
            <div className="flex-1 p-4 overflow-y-auto">
              <div className="mb-4">
              <h4 className="text-sm font-semibold mb-2">Enfants</h4>
              <ul className="space-y-2">
                {classrooms[0]?.children?.length ? (
                  classrooms[0].children.map(ch => (
                    <li key={ch.id} className="flex items-center gap-2">
                      {editingChildId === ch.id ? (
                        <div className="flex-1">
                          <input value={editingText} onChange={e => setEditingText(e.target.value)} className="w-full p-2 border rounded" />
                        </div>
                      ) : (
                        <button
                          onClick={() => { setPanelOpen(false); handleSelectChild(classrooms[0].id, ch.id); }}
                          className={`flex-1 text-left p-2 rounded ${selectedChildId === ch.id ? 'bg-sky-100' : 'hover:bg-gray-50'}`}>
                          {ch.name}
                        </button>
                      )}

                      <div className="flex items-center gap-1">
                        {editingChildId === ch.id ? (
                          <>
                            <button onClick={() => saveChildRename(classrooms[0].id, ch.id)} className="px-2 py-1 bg-green-500 text-white rounded">OK</button>
                            <button onClick={cancelEditChild} className="px-2 py-1 bg-gray-200 rounded">Annuler</button>
                          </>
                        ) : (
                          <>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => startEditChild(ch.id, ch.name)}
                                aria-label={`Renommer ${ch.name}`}
                                title="Renommer"
                                className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-gray-200 bg-white text-gray-700 hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-400"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                                  <path d="M4 13.5V16h2.5L15.81 6.69a1 1 0 0 0 0-1.41L14.12 3.6a1 1 0 0 0-1.41 0L4 12.31z" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              </button>

                              <button
                                onClick={() => handleClearChildHistory(classrooms[0].id, ch.id)}
                                aria-label={`Effacer historique ${ch.name}`}
                                title="Effacer historique"
                                className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-amber-200 bg-white text-amber-600 hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-300 transition-colors"
                              >
                                {/* /// cercle with eraser icon */}
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                                  <path d="M6 6h8M6 10h8M6 14h8" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              </button>

                              <button
                                onClick={() => openConfirmDeleteChild(classrooms[0].id, ch.id)}
                                aria-label={`Supprimer ${ch.name}`}
                                title="Supprimer"
                                className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-transparent bg-red-50 text-red-600 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-300"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                                  <path d="M6 6l8 8M14 6L6 14" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </li>
                  ))
                ) : (
                  <li className="text-sm text-gray-500">Aucun enfant – ajoutez-en un</li>
                )}
                </ul>
              </div>
            </div>

            {/* Sticky footer with persistent add button */}
            <div className="p-4 border-t bg-white">
              <button
                onClick={() => setAddChildModalOpen(true)}
                className="w-full px-3 py-2 bg-indigo-600 text-white rounded-md"
              >Ajouter un enfant</button>
            </div>
          </div>
        </div>
        {allDone && (
          <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
            <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-8 shadow-2xl text-center pointer-events-auto">
              {/* <span className="sr-only">Félicitations 🎉</span> */}
              <div className="flex justify-center mb-3">
                <img
                  src="/images/emoji-sucess.gif"
                  alt="Félicitations"
                  className="w-28 h-28 select-none"
                />
              </div>
              <p className="text-lg text-gray-700">Tu as construit les 9 maisons possibles !</p>
              <div className="mt-6">
                <button
                  onClick={() => { setAllDone(false); setMessage(null); setShowConfetti(false); setShowDuplicateGif(false); }}
                  className="px-6 py-3 bg-sky-600 text-white rounded-lg shadow hover:bg-blue-700"
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
    <ConfirmationModal
        open={confirmModal.open}
        title={confirmModal.action === 'delete-child' ? `Supprimer "${confirmModal.childName || ''}" ?` : `Effacer l'historique de "${confirmModal.childName || ''}" ?`}
        message={
          confirmModal.action === 'clear-history'
            ? `Effacer l'historique de "${confirmModal.childName || ''}" (${confirmModal.count || 0} maison(s)) ?\nCette action est irréversible.`
            : `Supprimer définitivement l'enfant "${confirmModal.childName || ''}" ?\nCette action supprimera aussi son historique.`
        }
        confirmLabel={confirmModal.action === 'delete-child' ? 'Supprimer' : 'Effacer'}
        cancelLabel="Annuler"
        onConfirm={() => {
          if (confirmModal.action === 'clear-history' && confirmModal.classroomId && confirmModal.childId) {
            performClearChildHistory(confirmModal.classroomId, confirmModal.childId);
          } else if (confirmModal.action === 'delete-child' && confirmModal.classroomId && confirmModal.childId) {
            performDeleteChild(confirmModal.classroomId, confirmModal.childId);
          } else {
            setConfirmModal({ open: false, action: null });
          }
        }}
        onCancel={() => setConfirmModal({ open: false, action: null })}
      />
    <AddChildModal
      open={addChildModalOpen}
      onCancel={() => setAddChildModalOpen(false)}
      onConfirm={(name) => {
        if (!name) { setAddChildModalOpen(false); return; }
        if (!classrooms.length) {
          const c = storage.addClassroom('Classe 1');
          setClassrooms([c]);
          setSelectedClassroomId(c.id);
        }
        handleAddChild(name);
        // Keep drawer open as requested
        setAddChildModalOpen(false);
      }}
    />
    </>
  );
};

export default App;
