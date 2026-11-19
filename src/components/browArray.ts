// Illustrative packaging dimensions in metres, not fabrication dimensions.
// z runs nose to tail, y is height above ground, +x is the vehicle's right.
export const BROW = {
  width: 1.90,
  rearZ: 2.15,
  taper: 0.556,        // plan-view narrowing per metre ahead of rearZ
  faceZ: 1.715,
  fairingTop: 2.628,
  barY: 2.39,
  barZ: 1.84,
  barLength: 1.46,
  earX: 1.13,          // outboard of the body side, inside the mirrors
  earY: 2.42,
  earZ: 1.93,
  mastZ: 1.92,
  mastTop: 2.79,
  lidarRadius: 0.075,
  lidarHeight: 0.12,
  top: 3.024,
};

/** Fairing side profile as [z, y]; the rear edge is buried in the sloped brow panel. */
export const browProfile: [number, number][] = [
  [1.800, 2.222], [1.715, 2.262], [1.715, 2.480], [1.765, 2.530],
  [2.150, BROW.fairingTop], [2.150, 2.590], [1.955, 2.400], [1.800, 2.200],
];

export const browHalfWidth = (z: number) => BROW.width / 2 * (1 - BROW.taper * (BROW.rearZ - z));

export type BrowCamera = {
  id: string;
  role: string;
  x: number;
  y: number;
  z: number;
  az: number;     // degrees from straight ahead, positive toward the vehicle's right
  pitch: number;  // degrees below horizontal
  hfov: number;   // horizontal field of view, degrees
  range: number;  // drawn length of the coverage fan, schematic
  tail?: boolean; // on the rear roof edge: y is relative to the roof, z to the tail
};

const cornerZ = 1.80;
const cornerX = browHalfWidth(cornerZ);

export const BROW_CAMERAS: BrowCamera[] = [
  { id: 'C1', role: 'Forward wide', x: 0, y: 2.41, z: BROW.faceZ, az: 0, pitch: 0, hfov: 90, range: 5.5 },
  { id: 'C2', role: 'Forward stereo, left', x: -0.60, y: 2.41, z: BROW.faceZ, az: 0, pitch: 0, hfov: 60, range: 6.5 },
  { id: 'C3', role: 'Forward stereo, right', x: 0.60, y: 2.41, z: BROW.faceZ, az: 0, pitch: 0, hfov: 60, range: 6.5 },
  { id: 'C4', role: 'Road-facing', x: 0, y: 2.31, z: BROW.faceZ, az: 0, pitch: 22, hfov: 80, range: 3 },
  { id: 'C5', role: 'Left corner', x: -cornerX, y: 2.40, z: cornerZ, az: -62, pitch: 0, hfov: 90, range: 5.5 },
  { id: 'C6', role: 'Right corner', x: cornerX, y: 2.40, z: cornerZ, az: 62, pitch: 0, hfov: 90, range: 5.5 },
  { id: 'C7', role: 'Left rear-side', x: -BROW.earX, y: BROW.earY, z: BROW.earZ, az: -130, pitch: 0, hfov: 100, range: 8.5 },
  { id: 'C8', role: 'Right rear-side', x: BROW.earX, y: BROW.earY, z: BROW.earZ, az: 130, pitch: 0, hfov: 100, range: 8.5 },
  { id: 'C9', role: 'Tail, left', x: -0.55, y: 0.06, z: -0.02, az: -160, pitch: 18, hfov: 100, range: 3.6, tail: true },
  { id: 'C10', role: 'Tail, right', x: 0.55, y: 0.06, z: -0.02, az: 160, pitch: 18, hfov: 100, range: 3.6, tail: true },
];
