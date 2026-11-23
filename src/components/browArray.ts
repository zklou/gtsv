import * as THREE from 'three';

// Illustrative packaging dimensions in metres, not fabrication dimensions.
// z runs nose to tail, y is height above ground, +x is the vehicle's right.
export const BROW = {
  width: 1.90,
  rearZ: 2.15,
  taper: 0.556,        // plan-view narrowing per metre ahead of rearZ
  faceZ: 1.715,
  fairingTop: 2.628,
  barY: 2.29,           // inside the housing wings, clear of the brow panel
  barZ: 1.78,
  barLength: 1.46,
  earX: 1.13,          // outboard of the body side, inside the mirrors
  earY: 2.42,
  earZ: 1.93,
};

/** Survey GNSS antenna: level, on a plate bolted to the front of the roof. */
export const GNSS = { z: 2.80, plate: 0.018, radius: 0.083, height: 0.07 };

/** Fairing side profile as [z, y]; the rear edge is buried in the sloped brow panel. */
export const browProfile: [number, number][] = [
  [1.800, 2.222], [1.715, 2.262], [1.715, 2.480], [1.765, 2.530],
  [2.150, BROW.fairingTop], [2.150, 2.590], [1.955, 2.400], [1.800, 2.200],
];

export const browHalfWidth = (z: number) => BROW.width / 2 * (1 - BROW.taper * (BROW.rearZ - z));

/* LiDAR: Ouster OS1-128 Rev8 on a short tube post from the frame, tipped toward the road.
   Figures from the Rev8 datasheet: 87 mm diameter, 58.4 mm body, 74.2 mm with the halo cap,
   beam origin about 40 mm above the mounting face, beams evenly spread from -22° to +22°. */
export const LIDAR = {
  model: 'Ouster OS1-128 Rev8',
  y: 2.72,             // optical centre above ground
  z: 1.90,
  pitch: 15,           // forward-down tilt, degrees
  radius: 0.0435,
  body: 0.0584,
  cap: 0.0158,         // halo cap above the body
  origin: 0.040,       // optical centre above the mounting face
  window: [0.021, 0.054] as [number, number],   // window band, above the mounting face
  fovDown: 22,
  fovUp: 22,
  clearance: 3,        // degrees kept clear below the lowest beam by every panel
};

/** Sensor frame: origin at the optical centre, y along the spin axis, tipped forward by LIDAR.pitch. */
export function lidarFrame() {
  const m = new THREE.Matrix4().makeRotationX(-LIDAR.pitch * Math.PI / 180);   // top toward the nose
  return m.setPosition(0, LIDAR.y, LIDAR.z);
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const piecewise = (pts: [number, number][]) => (u: number) => {
  if (u <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (u <= pts[i][0]) {
    const [u0, v0] = pts[i - 1], [u1, v1] = pts[i];
    return lerp(v0, v1, (u - u0) / (u1 - u0));
  }
  return pts[pts.length - 1][1];
};
/** The brow panel in side view, along the centre line, as [z, y]; housings and feet sit on it. */
const PANEL: [number, number][] = [[1.800, 2.211], [1.955, 2.400], [BROW.rearZ, 2.590]];
export const panelY = piecewise(PANEL);
const panelZ = piecewise(PANEL.map(([z, y]) => [y, z]));

/** Highest point a panel may reach at (x, z) and stay LIDAR.clearance degrees under the lowest beam. */
export function beamFloor(x: number, z: number) {
  const inv = lidarFrame().invert(), p = new THREE.Vector3();
  const limit = Math.tan(-(LIDAR.fovDown + LIDAR.clearance) * Math.PI / 180);
  let lo = 1.5, hi = LIDAR.y + 0.3;
  for (let i = 0; i < 32; i++) {
    const mid = (lo + hi) / 2;
    p.set(x, mid, z).applyMatrix4(inv);
    if (p.y - limit * Math.hypot(p.x, p.z) < 0) lo = mid; else hi = mid;
  }
  return lo;
}

/* Camera housing, flat panels only: a tall centre round C1, C4 and the foot of the LiDAR post,
   and two low wings for the stereo pair. Each is a straight prism, so it folds from sheet; its
   back edge is scribed to the brow panel. Every top corner stays under the lowest LiDAR beam
   (tools/lidar-sim.mts reports the clearance). */
export const HOUSING = { bottom: 2.225, centreTop: 2.47, centreHalf: 0.20, wingTop: 2.335, wingHalf: 0.62 };

/** Side section of a housing prism, [z, y], from the face back to the brow panel. */
export function housingSection(top: number): [number, number][] {
  const z0 = panelZ(HOUSING.bottom), z1 = panelZ(top);
  const along = PANEL.filter(([z]) => z > z0 && z < z1).reverse();
  return [[BROW.faceZ, HOUSING.bottom], [BROW.faceZ, top], [z1, top], ...along, [z0, HOUSING.bottom]];
}

function prism(section: [number, number][], x0: number, x1: number) {
  const shape = new THREE.Shape();
  section.forEach(([z, y], i) => { if (i) shape.lineTo(z, y); else shape.moveTo(z, y); });
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: x1 - x0, bevelEnabled: false });
  g.rotateY(-Math.PI / 2);   // shape x becomes z, extrusion runs along -x
  g.translate(x1, 0, 0);
  return g;
}

/** The housing as separate prisms: centre, left wing, right wing. */
export function housingGeometries() {
  const { centreHalf: c, wingHalf: w } = HOUSING;
  const wing = housingSection(HOUSING.wingTop);
  return [prism(housingSection(HOUSING.centreTop), -c, c), prism(wing, -w, -c), prism(wing, c, w)];
}

/** The original printed fairing: the side profile extruded and narrowed toward the nose (the old mast design). */
export function browFairingGeometry() {
  const shape = new THREE.Shape();
  browProfile.forEach(([z, y], i) => { if (i) shape.lineTo(z, y); else shape.moveTo(z, y); });
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: BROW.width, bevelEnabled: false });
  g.rotateY(-Math.PI / 2);
  g.translate(BROW.width / 2, 0, 0);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setX(i, pos.getX(i) * (1 - BROW.taper * (BROW.rearZ - pos.getZ(i))));
  g.computeVertexNormals();
  return g;
}

/* LiDAR post: a Ø110 mm aluminium tube on the LiDAR's own axis, cut once at the bottom, with a
   round top plate the sensor bolts to. Its rim is 36° below the optical centre, outside the beams,
   and the finned base stays in open air. */
export const POST = { radius: 0.055, plate: 0.008, length: 0.28 };

/** Tube and top plate in the sensor frame (y along the spin axis, 0 at the optical centre). */
export function lidarPostParts() {
  const plateTop = -LIDAR.origin, plateMid = plateTop - POST.plate / 2;
  const tubeTop = plateTop - POST.plate, tubeMid = tubeTop - POST.length / 2;
  return {
    plate: { radius: POST.radius + 0.003, height: POST.plate, y: plateMid },
    tube: { radius: POST.radius, height: POST.length, y: tubeMid },
    foot: new THREE.Vector3(0, tubeTop - POST.length, 0).applyMatrix4(lidarFrame()),
  };
}

/** Highest point of the LiDAR: the rear edge of the halo cap once the sensor is tipped forward. */
export function lidarTop() {
  const top = LIDAR.body + LIDAR.cap - LIDAR.origin, a = LIDAR.pitch * Math.PI / 180;
  return LIDAR.y + top * Math.cos(a) + LIDAR.radius * Math.sin(a);
}

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
  { id: 'C2', role: 'Forward stereo, left', x: -0.55, y: 2.285, z: BROW.faceZ, az: 0, pitch: 0, hfov: 60, range: 6.5 },
  { id: 'C3', role: 'Forward stereo, right', x: 0.55, y: 2.285, z: BROW.faceZ, az: 0, pitch: 0, hfov: 60, range: 6.5 },
  { id: 'C4', role: 'Road-facing', x: 0, y: 2.31, z: BROW.faceZ, az: 0, pitch: 22, hfov: 80, range: 3 },
  { id: 'C5', role: 'Left corner', x: -cornerX, y: 2.27, z: cornerZ, az: -62, pitch: 0, hfov: 90, range: 5.5 },
  { id: 'C6', role: 'Right corner', x: cornerX, y: 2.27, z: cornerZ, az: 62, pitch: 0, hfov: 90, range: 5.5 },
  { id: 'C7', role: 'Left rear-side', x: -BROW.earX, y: BROW.earY, z: BROW.earZ, az: -130, pitch: 0, hfov: 100, range: 8.5 },
  { id: 'C8', role: 'Right rear-side', x: BROW.earX, y: BROW.earY, z: BROW.earZ, az: 130, pitch: 0, hfov: 100, range: 8.5 },
  { id: 'C9', role: 'Tail, left', x: -0.55, y: 0.06, z: -0.02, az: -160, pitch: 18, hfov: 100, range: 3.6, tail: true },
  { id: 'C10', role: 'Tail, right', x: 0.55, y: 0.06, z: -0.02, az: 160, pitch: 18, hfov: 100, range: 3.6, tail: true },
];
