export type Anchor = { x: number; y: number; width?: number; height?: number };
export type Area = { x: number; y: number; width: number; height: number };
export type Size = { width: number; height: number };
export function placeNearAnchor(anchor: Anchor, workArea: Area, windowSize: Size, gap?: number): { x: number; y: number };
export function distanceToWorkArea(point: { x: number; y: number }, area: Area): number;
