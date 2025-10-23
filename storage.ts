import type { PlacedShape } from './types';

// Stable localStorage key (versioned for future schema changes)
const LOCAL_KEY = 'atelier:classrooms:v1';

export type House = { body: PlacedShape; roof: PlacedShape };

export type Child = {
  id: string;
  name: string;
  history: House[]; // ordered history of houses built by this child
};

export type Classroom = {
  id: string;
  name: string;
  children: Child[];
};

function safeParse(raw: string | null) {
  try {
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch (e) {
    console.warn('Failed to parse stored classrooms', e);
    return [];
  }
}

export function loadClassrooms(): Classroom[] {
  const raw = localStorage.getItem(LOCAL_KEY);
  return safeParse(raw) as Classroom[];
}

export function saveClassrooms(classrooms: Classroom[]) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(classrooms));
}

function makeId(prefix = '') {
  return `${prefix}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function addClassroom(name: string): Classroom {
  const classes = loadClassrooms();
  const c: Classroom = { id: makeId('class-'), name: name || `Classe ${classes.length + 1}`, children: [] };
  classes.push(c);
  saveClassrooms(classes);
  return c;
}

export function addChildToClassroom(classroomId: string, childName: string): Child | null {
  const classes = loadClassrooms();
  const cls = classes.find(c => c.id === classroomId);
  if (!cls) return null;
  const child: Child = { id: makeId('child-'), name: childName || `Enfant ${cls.children.length + 1}`, history: [] };
  cls.children.push(child);
  saveClassrooms(classes);
  return child;
}

export function updateChildHistory(classroomId: string, childId: string, history: House[]) {
  const classes = loadClassrooms();
  const cls = classes.find(c => c.id === classroomId);
  if (!cls) return;
  const child = cls.children.find(ch => ch.id === childId);
  if (!child) return;
  child.history = history;
  saveClassrooms(classes);
}

export function getChild(classroomId: string, childId: string): Child | null {
  const classes = loadClassrooms();
  const cls = classes.find(c => c.id === classroomId);
  if (!cls) return null;
  const child = cls.children.find(ch => ch.id === childId) || null;
  return child;
}
