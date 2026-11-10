// The editor keeps the current list of objects here so that object ovals (dropdowns) can show
// current names and hover descriptions without searching the workspace each time.
import type { ObjectInfo } from './objects';

let current: ObjectInfo[] = [];
export const setObjects = (list: ObjectInfo[]): void => { current = list; };
export const getObjects = (): readonly ObjectInfo[] => current;
export const findObject = (id: string): ObjectInfo | undefined => current.find((o) => o.id === id);
export const NO_OBJECTS_LABEL = 'no objects yet';
/** Dropdown options: [shown name, block id]. */
export const objectOptions = (): [string, string][] =>
  current.length ? current.map((o) => [o.name, o.id] as [string, string]) : [[NO_OBJECTS_LABEL, '']];
