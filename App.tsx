
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
import MigrateStorage from './components/MigrateStorage';
import { SUCCESS_MESSAGES } from './constants';
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
  const [confettiOrigin, setConfettiOrigin] = useState<{ x: number; y: number } | undefined>(undefined);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [uiMounted, setUiMounted] = useState(false);
  const settingsFileRef = useRef<HTMLInputElement | null>(null);
  const settingsIdbFileRef = useRef<HTMLInputElement | null>(null);
  
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
      const migrationNeeded = await storage.needsIdbToLocalMigration();
      let classes = storage.loadClassrooms();
      // Avoid creating a default class if a migration from IDB is pending,
      // to prevent conflicts and preserve the ability to overwrite LS.
      if (!migrationNeeded && classes.length === 0) {
        const created = storage.addClassroom('Classe 1');
        classes = [created];
      }
      if (classes.length === 0) {
        setClassrooms([]);
        setSelectedClassroomId(null);
        setSelectedChildId(null);
        setChildName('');
        setHouseHistory([]);
        setBuiltCombos({});
        return;
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

  // Mark UI as mounted to avoid initial slide-out animation flicker on drawers
  useEffect(() => {
    setUiMounted(true);
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
    if (showConfetti || showDuplicateGif || allDone) return; // Disable dragging when celebrating, duplicate modal, or final modal is open
    
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
  }, [houseState, showConfetti, showDuplicateGif, allDone]);

  const resetCurrentHouse = () => {
    setHouseState({ body: null, roof: null });
    setShowConfetti(false);
    setShowDuplicateGif(false);
  };
  
  // const resetAll = () => {
  //   setPlacedShapes([]);
  //   setHouseState({ body: null, roof: null });
  //   setHouseHistory([]);
  //   setShowConfetti(false);
  //   setBuiltCombos({});
  //   setAllDone(false);
  //   setMessage(null);
  //   setShowDuplicateGif(false);
  // };

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
      // duplicate - open a left-side modal and wait for user to continue
      setShowDuplicateGif(true);
      setShowConfetti(false);
      return;
    }

    // New unique house: add to history and builtCombos, celebrate
    setHouseHistory(prev => {
      const newHistory = [...prev, houseState as House];
      return newHistory;
    });
    setBuiltCombos(prev => ({ ...prev, [comboKey]: true }));
    // Set confetti origin to house location (center of #house-anchor relative to viewport)
    try {
      const anchor = document.getElementById('house-anchor');
      if (anchor) {
        const r = anchor.getBoundingClientRect();
        const x = (r.left + r.width / 2) / window.innerWidth;
        const y = (r.top + r.height / 2) / window.innerHeight;
        setConfettiOrigin({ x, y });
      } else {
        setConfettiOrigin(undefined);
      }
    } catch {
      setConfettiOrigin(undefined);
    }
    setShowConfetti(true);
    // pick a random success message (avoid repeating the immediately previous one)
    setMessage(prev => {
      const pool = SUCCESS_MESSAGES;
      if (!prev) return pool[Math.floor(Math.random() * pool.length)];
      let next = pool[Math.floor(Math.random() * pool.length)];
      if (pool.length > 1) {
        let safety = 0;
        while (next === prev && safety < 5) {
          next = pool[Math.floor(Math.random() * pool.length)];
          safety++;
        }
      }
      return next;
    });
    setMessageType('success');

    // clear the success message after a bit longer (e.g., 2200ms)
    if (successTimeoutRef.current) {
      window.clearTimeout(successTimeoutRef.current);
    }
    successTimeoutRef.current = window.setTimeout(() => {
      setMessage(null);
      setMessageType(null);
    }, 2200);

    // If this addition makes 9 unique houses, show only the final success modal (no small card)
    const newUniqueCount = houseHistory.length + 1;
    if (newUniqueCount >= 9) {
      setAllDone(true);
      setMessage(null);
      setMessageType(null);
      // Do not auto-advance when the game is complete
      return;
    }

    // Otherwise, auto-advance to the next house shortly after the success message clears
    if (advanceTimeoutRef.current) {
      window.clearTimeout(advanceTimeoutRef.current);
    }
    // give a small gap (e.g., 300ms) after the message disappears
    advanceTimeoutRef.current = window.setTimeout(() => {
      setHouseState({ body: null, roof: null });
      setShowConfetti(false);
    }, 2500);
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
    <MigrateStorage />
    <PWAUpdatePrompt />
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
  {showConfetti && <Confetti origin={confettiOrigin} />}
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

          <div className="flex gap-2 items-center">
            {/* Settings gear opens migration/export/import drawer */}
            <button
              onClick={() => setSettingsOpen(true)}
              aria-label="Paramètres"
              title="Paramètres"
              className="inline-flex items-center justify-center w-10 h-10 rounded-md border border-gray-200 bg-white text-gray-700 hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-400"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
                <path d="M12 9a3 3 0 100 6 3 3 0 000-6z" />
                <path fillRule="evenodd" d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.12a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.12a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06A2 2 0 016.07 3.4l.06.06c.47.47 1.13.65 1.76.49A1.65 1.65 0 009.4 2.4V2a2 2 0 014 0v.12c0 .67.39 1.27 1 1.51.63.16 1.29-.02 1.76-.49l.06-.06a2 2 0 012.83 2.83l-.06.06c-.47.47-.65 1.13-.49 1.76.24.61.84 1 1.51 1H21a2 2 0 010 4h-.12c-.67 0-1.27.39-1.51 1z" clipRule="evenodd" />
              </svg>
            </button>
            <button
              onClick={() => setPanelOpen(true)}
              className="px-3 py-2 bg-sky-600 text-white rounded-md"
              aria-label="Ouvrir ma classe"
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
              {allDone ? (
                <div className="flex-1 flex items-center justify-center w-full">
                  <h2 className="text-3xl md:text-5xl font-extrabold text-sky-700 text-center px-4">
                    {`Bravo ${childName} tu as réussi l'exercice !`}
                  </h2>
                </div>
              ) : (
                <>
                  {/* Playground area */}
                  <Playground
                    shapes={placedShapes}
                    houseBody={houseState.body}
                    houseRoof={houseState.roof}
                    pendingPlacement={pendingPlacement}
                    onPlacementFinalized={finalizePlacement}
                  />

                  {/* Duplicate modal on the left side (house remains visible) */}
                  {showDuplicateGif && (
                    <div className="absolute left-6 top-1/2 -translate-y-1/2 z-10 pl-52">
                      <div className="pointer-events-auto w-64 md:w-72 bg-white border border-red-200 rounded-xl shadow-xl p-4 flex flex-col items-center text-center">
                        <img
                          src="/images/emoji-no.gif"
                          alt="Combinaison déjà construite"
                          className="w-24 h-24 md:w-28 md:h-28 select-none"
                        />
                        <p className="mt-3 text-sm text-black font-medium">
                            Cette maison a déjà été construite !
                            Tente une autre combinaison.
                        </p>
                        <button
                          onClick={() => { setShowDuplicateGif(false); setHouseState({ body: null, roof: null }); }}
                          className="mt-4 inline-flex items-center px-4 py-2 bg-sky-600 text-white rounded-lg shadow hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-400"
                        >
                          Continuer
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Success/warning message aligned same as duplicate modal (left side) */}
                  {message && !showDuplicateGif && (
                    <div className="absolute left-6 top-1/2 -translate-y-1/2 z-10 pl-52">
                      <div
                        className={`pointer-events-auto w-64 md:w-72 rounded-xl shadow-xl p-4 text-center border ${
                          messageType === 'success'
                            ? 'bg-white border-green-200 text-green-700'
                            : 'bg-white border-yellow-200 text-yellow-700'
                        }`}
                      >
                        {message}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
           <History history={houseHistory} childName={childName} />
        </main>
        {/* Right-side classroom panel drawer */}
  <div aria-hidden={!panelOpen} className={`fixed right-0 top-0 h-full w-80 bg-white shadow-lg transform ${uiMounted ? 'transition-transform' : ''} ${panelOpen ? 'translate-x-0' : 'translate-x-full'}`}>
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
        {/* Final overlay removed; final success now shown in left-side panel inside the playground */}
      </div>
      <DragOverlay>
        {activeShape ? (
          <Shape type={activeShape.type} color={activeShape.color} className="w-16 h-16 opacity-75" />
        ) : null}
      </DragOverlay>
    </DndContext>
    {/* Settings / Migration Drawer */}
  <div aria-hidden={!settingsOpen} className={`fixed right-0 top-0 h-full w-96 max-w-[90vw] bg-white shadow-lg transform ${uiMounted ? 'transition-transform' : ''} ${settingsOpen ? 'translate-x-0' : 'translate-x-full'} z-50`}>
      <div className="flex flex-col h-full">
        <div className="p-4 flex items-center justify-between border-b">
          <h3 className="text-lg font-bold">Paramètres</h3>
          <button onClick={() => setSettingsOpen(false)} className="px-2 py-1 text-sm text-gray-600">Fermer</button>
        </div>
        <div className="flex-1 p-4 overflow-y-auto space-y-6">
          {/* Export current classes */}
          <section>
            <h4 className="text-sm font-semibold mb-2">Exporter ma classe</h4>
            <p className="text-xs text-gray-600 mb-2">Télécharge un fichier JSON contenant toutes les classes et historiques.</p>
            <button
              className="px-3 py-2 bg-white border rounded-md text-gray-700"
              onClick={async () => {
                try {
                  const { buildCurrentExportPayload } = await import('./storage');
                  const payload = buildCurrentExportPayload();
                  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  const ts = new Date().toISOString().replace(/[:.]/g, '-');
                  a.href = url;
                  a.download = `atelier-classrooms-export-${ts}.json`;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  URL.revokeObjectURL(url);
                } catch (e) {
                  console.error(e);
                  alert("Export impossible.");
                }
              }}
            >
              Exporter ma classe
            </button>
          </section>

          {/* Import classes from file */}
          <section>
            <h4 className="text-sm font-semibold mb-2">Importer une classe depuis un fichier</h4>
            <p className="text-xs text-gray-600 mb-2">Sélectionnez un fichier JSON précédemment exporté.</p>
            <input
              type="file"
              accept="application/json,.json"
              ref={settingsFileRef}
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  const text = await f.text();
                  const json = JSON.parse(text);
                  const confirm = window.confirm("Importer ces données dans le stockage local ?\nCela remplacera les données actuelles si elles diffèrent.");
                  if (!confirm) return;
                  const res = await storage.importLocalStorageFromJsonObject(json);
                  setImportStatus(res.message);
                  if (res.status === 'ok') {
                    const classes = storage.loadClassrooms();
                    setClassrooms(classes);
                  } else if (res.status === 'conflict') {
                    const force = window.confirm(res.message + "\n\nForcer l'écrasement ?");
                    if (force) {
                      const forced = await storage.importLocalStorageFromJsonObject(json, { forceOverwrite: true });
                      setImportStatus(forced.message);
                      if (forced.status === 'ok') setClassrooms(storage.loadClassrooms());
                    }
                  }
                } catch (err) {
                  console.error(err);
                  setImportStatus('Fichier invalide ou lecture impossible.');
                } finally {
                  if (settingsFileRef.current) settingsFileRef.current.value = '';
                }
              }}
            />
            <button
              className="px-3 py-2 bg-white border rounded-md text-gray-700"
              onClick={() => settingsFileRef.current?.click()}
            >
              Importer ma classe
            </button>
            {importStatus && (
              <p className="mt-2 text-xs text-gray-600">{importStatus}</p>
            )}
          </section>

          {/* TEST ONLY: Import into IndexedDB to simulate pre-migration */}
          <section className="border-t pt-4">
            <h4 className="text-sm font-semibold mb-2">[Test] Importer dans IndexedDB</h4>
            <p className="text-xs text-gray-600 mb-2">Charge un JSON d'export dans IndexedDB pour simuler un état avant migration. Idéal pour tester la bannière de migration.</p>
            <input
              type="file"
              accept="application/json,.json"
              ref={settingsIdbFileRef}
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  const text = await f.text();
                  const json = JSON.parse(text);
                  const confirm = window.confirm("Importer ce fichier dans IndexedDB (TEST) ?\nCela n'affecte pas immédiatement le stockage local.");
                  if (!confirm) return;
                  const res = await storage.testImportToIndexedDBFromJsonObject(json, { clearMigrationStatus: true });
                  setImportStatus(res.message + "\nAstuce: rechargez la page pour voir la proposition de migration.");
                } catch (err) {
                  console.error(err);
                  setImportStatus('Fichier invalide ou lecture impossible.');
                } finally {
                  if (settingsIdbFileRef.current) settingsIdbFileRef.current.value = '';
                }
              }}
            />
            <button
              className="px-3 py-2 bg-white border rounded-md text-gray-700"
              onClick={() => settingsIdbFileRef.current?.click()}
            >
              Importer dans IndexedDB (test)
            </button>
          </section>
        </div>
      </div>
    </div>
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
