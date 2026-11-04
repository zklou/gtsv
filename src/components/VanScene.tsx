import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export type View = 'exterior' | 'roof' | 'plan' | 'interior' | 'rear';
export type Body = 'extended' | 'long';
export type Layout = 'sheet' | 'pathrunner' | 'hybrid';
export type GantryLevel = 'roof' | 'lowered';
export type Phase = 'phase1' | 'full';
export type Tone = 'base' | 'requested' | 'reference' | 'provision';
export type Part =
  | 'beam' | 'lidar' | 'cameras' | 'gnss' | 'pass'
  | 'frontCams' | 'acRear'
  | 'pvConsole' | 'pvScreen' | 'pvCable' | 'pvPower'
  | 'seats' | 'desk' | 'rack' | 'power'
  | 'rqLidar' | 'rqCamera' | 'rqDepth' | 'rqGnss' | 'rqTobii'
  | 'pgDeck' | 'pgMast' | 'pgPavement' | 'pgDmi' | 'pgFront'
  | 'p1Liner' | 'p1Ceiling' | 'p1Seats' | 'p1Power';
export type Annotation = { id: string; name: string; point: [number, number, number]; view: View };

/* ------------------------------------------------------------------
   Ford Transit cargo van, published dimensions (inches -> metres).
   The envelope is Ford's; equipment sizes are representative.
------------------------------------------------------------------- */
const IN = 0.0254;
const bodies = {
  extended: { length: 263.9 * IN, height: 110.4 * IN, cargo: 172.2 * IN, floor: 28.0 * IN },
  long: { length: 235.5 * IN, height: 109.6 * IN, cargo: 143.7 * IN, floor: 28.7 * IN },
};
type Spec = typeof bodies.extended;

const WIDTH = 81.3 * IN;
const HALF = WIDTH / 2;
const FRONT_AXLE = 40.3 * IN;
const REAR_AXLE = (40.3 + 147.6) * IN;
const CARGO_W = 70.2 * IN;
const WHEEL_W = 54.8 * IN;
const WHEEL_R = 0.356;
const TRACK_F = 68.2 * IN;
const TRACK_R = 68.6 * IN;
const LIMIT_Y = 2.60;
const REAR_DOOR_W = 61.7 * IN;   // Ford published rear cargo door opening
const REAR_DOOR_H = 74.3 * IN;
const BEVEL = 0.075;

const BEAM_Z = 2.95;
const BEAM_FOOT = 0.05;
const BEAM_H = 0.06;
const LIDAR_H = 0.095;
const REAR_BAR_DROP = 0.174;   // crossbar sits this far below the roof line
const REAR_BAR_HALF = 0.045;   // half the crossbar section
const AC = { w: 1.09, h: 0.24, d: 0.71 };
const frontCamZ = 3.18;                         // three forward cameras, front of the roof
const acRearZ = (b: Spec) => b.length - 1.10;   // A/C goes on later, rear third
const FRONT_CAM_RISE = 0.14;
const passZ = (b: Spec) => b.length - 0.36; // paired rear roof entries in the reference photo
const beamTop = (b: Spec) => b.height + BEAM_FOOT + BEAM_H;
const GANTRY_LOW_Y = 2.24;
const GANTRY_FRAME_RISE = 0.42; // photo shows the crossarm clearly above the roof
const GANTRY_MAST_RISE = 0.50; // representative upper sensor envelope above crossarm
const AC_RISE = 0.27; // 0.03 m base + 0.24 m assumed unit

export function heightCases(body: Body) {
  const roof = bodies[body].height;
  const ac = roof + AC_RISE;                    // rear A/C, fitted later
  const frontCams = roof + FRONT_CAM_RISE;
  const rearCarrier = roof - REAR_BAR_DROP + REAR_BAR_HALF + LIDAR_H;   // stays under the roof
  const sensors = Math.max(frontCams, rearCarrier);
  const sheet = Math.max(ac, sensors);
  const pathrunner = Math.max(ac, roof + GANTRY_FRAME_RISE + GANTRY_MAST_RISE);
  const loweredHead = GANTRY_LOW_Y + GANTRY_MAST_RISE;
  const lowered = Math.max(roof, ac, loweredHead);
  return { roof, ac, sensors, frontCams, rearCarrier, sheet, pathrunner, raisedBar: roof + GANTRY_FRAME_RISE, lowered, loweredDeck: GANTRY_LOW_Y, loweredHead };
}

/* cowl and header define the windscreen plane; reused for the glass */
const COWL: [number, number] = [1.020, 1.428];
const HEADER: [number, number] = [1.780, 2.205];

export const tags: Record<Part, { label: string; views: View[]; tone: Tone }> = {
  beam:       { label: '01', views: ['exterior', 'roof', 'rear'], tone: 'base' },
  lidar:      { label: '02', views: ['exterior', 'roof', 'rear'], tone: 'base' },
  cameras:    { label: '03', views: ['exterior', 'roof', 'rear'], tone: 'base' },
  gnss:       { label: '04', views: ['exterior', 'roof', 'rear'], tone: 'base' },
  pass:       { label: '05', views: ['exterior', 'roof', 'rear'], tone: 'base' },
  frontCams:  { label: '06', views: ['exterior', 'roof'], tone: 'base' },
  acRear:     { label: '11', views: ['exterior', 'roof'], tone: 'base' },
  seats:      { label: '07', views: ['interior'], tone: 'base' },
  desk:       { label: '08', views: ['interior'], tone: 'base' },
  rack:       { label: '09', views: ['interior'], tone: 'base' },
  power:      { label: '10', views: ['interior'], tone: 'base' },
  rqLidar:    { label: 'A1', views: ['exterior', 'roof'], tone: 'requested' },
  rqGnss:     { label: 'A2', views: ['exterior', 'roof'], tone: 'requested' },
  rqCamera:   { label: 'A3', views: ['exterior', 'roof'], tone: 'requested' },
  rqDepth:    { label: 'A4', views: ['exterior', 'roof'], tone: 'requested' },
  rqTobii:    { label: 'A5', views: ['interior'], tone: 'requested' },
  pvConsole:  { label: 'V1', views: ['interior'], tone: 'provision' },
  pvScreen:   { label: 'V2', views: ['interior'], tone: 'provision' },
  pvCable:    { label: 'V3', views: ['interior'], tone: 'provision' },
  pvPower:    { label: 'V4', views: ['interior'], tone: 'provision' },
  pgDeck:     { label: 'P1', views: ['rear', 'exterior'], tone: 'reference' },
  pgMast:     { label: 'P2', views: ['rear', 'exterior'], tone: 'reference' },
  pgPavement: { label: 'P3', views: ['rear', 'exterior'], tone: 'reference' },
  pgDmi:      { label: 'P4', views: ['rear', 'exterior'], tone: 'reference' },
  pgFront:    { label: 'P5', views: ['rear', 'exterior'], tone: 'reference' },
  p1Liner:    { label: 'Q1', views: ['interior'], tone: 'base' },
  p1Ceiling:  { label: 'Q2', views: ['interior'], tone: 'base' },
  p1Seats:    { label: 'Q3', views: ['interior'], tone: 'base' },
  p1Power:    { label: 'Q4', views: ['interior'], tone: 'base' },
};

/* --------------------- body silhouette, nose to tail --------------------- */
function silhouette(b: Spec): [number, number][] {
  const L = b.length, H = b.height;
  return [
    [0.105, 0.520], [0.048, 0.760], [0.042, 1.020], [0.098, 1.175],
    [0.245, 1.262], [0.600, 1.338], COWL, HEADER,
    [1.955, 2.432], [2.175, 2.652], [2.420, 2.778], [2.690, H],
    [L - 0.300, H], [L - 0.110, H - 0.032], [L - 0.020, H - 0.124], [L, H - 0.300],
    [L, 0.620], [L - 0.430, 0.494], [1.500, 0.472], [0.420, 0.494],
  ];
}

/** Narrow the nose and tail in plan view, the way a real van tapers. */
function taperAt(z: number, L: number) {
  const smooth = (t: number) => t * t * (3 - 2 * t);
  let f = 1;
  if (z < 1.15) f = 0.800 + 0.200 * smooth(Math.max(0, z) / 1.15);
  if (z > L - 0.55) f = Math.min(f, 1 - 0.045 * smooth((z - (L - 0.55)) / 0.55));
  return f;
}

/** Inset a closed polygon by d, by offsetting each edge and re-intersecting. */
function insetPolygon(pts: [number, number][], d: number): [number, number][] {
  const n = pts.length;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % n];
    area += x1 * y2 - x2 * y1;
  }
  const ccw = area > 0 ? 1 : -1;
  // each edge, pushed inward by d
  const lines = pts.map((p, i) => {
    const q = pts[(i + 1) % n];
    const ex = q[0] - p[0], ey = q[1] - p[1];
    const len = Math.hypot(ex, ey) || 1;
    const nx = (-ey / len) * ccw, ny = (ex / len) * ccw;
    return { px: p[0] + nx * d, py: p[1] + ny * d, dx: ex / len, dy: ey / len };
  });
  return pts.map((p, i) => {
    const a = lines[(i - 1 + n) % n], b = lines[i];
    const det = a.dx * -b.dy - a.dy * -b.dx;
    if (Math.abs(det) < 1e-7) return [a.px, a.py] as [number, number];
    const rx = b.px - a.px, ry = b.py - a.py;
    const t = (rx * -b.dy - ry * -b.dx) / det;
    return [a.px + a.dx * t, a.py + a.dy * t] as [number, number];
  });
}

function shellGeometry(b: Spec) {
  const shape = new THREE.Shape();
  const pts = insetPolygon(silhouette(b), BEVEL);
  shape.moveTo(pts[0][0], pts[0][1]);
  pts.slice(1).forEach(p => shape.lineTo(p[0], p[1]));
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: WIDTH - 2 * BEVEL,
    bevelEnabled: true,
    bevelThickness: BEVEL,
    bevelSize: BEVEL,
    bevelSegments: 6,
    curveSegments: 1,
  });
  geo.rotateY(-Math.PI / 2);
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  geo.translate(-(bb.min.x + bb.max.x) / 2, 0, 0);

  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    pos.setX(i, pos.getX(i) * taperAt(pos.getZ(i), b.length));
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/** Flat quad from four corners. */
function quad(a: number[], b: number[], c: number[], d: number[]) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3));
  g.computeVertexNormals();
  return g;
}

type Props = {
  view: View;
  body: Body;
  selected: Part | null;
  showLimit: boolean;
  showRearFrame: boolean;
  showRequested: boolean;
  showDoorSwing: boolean;
  showProvision: boolean;
  layout: Layout;
  phase: Phase;
  seatSide: boolean;
  gantryLevel: GantryLevel;
  onSelect: (part: Part) => void;
  annotations: Annotation[];
  addMode: boolean;
  selectedAnnotation: string | null;
  onAddAnnotation: (point: Annotation['point'], view: View) => void;
  onMoveAnnotation: (id: string, point: Annotation['point']) => void;
  onSelectAnnotation: (id: string) => void;
};
type Screen = { x: number; y: number; ax: number; ay: number; visible: boolean };

export default function VanScene({ view, body, selected, showLimit, showRearFrame, showRequested, showDoorSwing, showProvision, layout, phase, seatSide, gantryLevel, onSelect, annotations, addMode, selectedAnnotation, onAddAnnotation, onMoveAnnotation, onSelectAnnotation }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [positions, setPositions] = useState<Record<string, Screen>>({});
  const [axis, setAxis] = useState<Record<string, Screen>>({});
  const [showPins, setShowPins] = useState(true);
  const [annotationPositions, setAnnotationPositions] = useState<Record<string, Screen>>({});
  const annotationRef = useRef(annotations);
  annotationRef.current = annotations;
  const actionRef = useRef({ onAddAnnotation, onMoveAnnotation });
  actionRef.current = { onAddAnnotation, onMoveAnnotation };
  const dragRef = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null);
  const canvasDownRef = useRef<[number, number] | null>(null);
  const api = useRef<{
    setView: (v: View) => void;
    setLimit: (on: boolean) => void;
    setRear: (on: boolean) => void;
    setRequested: (on: boolean) => void;
    setDoorSwing: (on: boolean) => void;
    setProvision: (on: boolean) => void;
    highlight: (p: Part | null) => void;
    addAt: (x: number, y: number) => void;
    moveAt: (id: string, x: number, y: number) => void;
    setDragging: (dragging: boolean) => void;
    redraw: () => void;
  } | null>(null);

  useEffect(() => {
    const el = host.current, cv = canvas.current;
    if (!el || !cv) return;
    const b = bodies[body];
    const L = b.length, H = b.height, F = b.floor;
    const sideX = HALF + 0.006;
    const pr = layout === 'pathrunner';
    const hy = layout === 'hybrid';
    const p1 = phase === 'phase1';

    const scene = new THREE.Scene();
    const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;

    const perspectiveCamera = new THREE.PerspectiveCamera(33, 1, 0.05, 120);
    const roofCamera = new THREE.OrthographicCamera(-4.3, 4.3, 2.5, -2.5, 0.05, 120);
    roofCamera.up.set(1, 0, 0); // front at left, rear at right in the roof plan
    const flat = (v: View) => v === 'roof' || v === 'plan';
    let camera: THREE.PerspectiveCamera | THREE.OrthographicCamera = flat(view) ? roofCamera : perspectiveCamera;
    const controls = new OrbitControls(camera, cv);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = true;
    controls.screenSpacePanning = true;
    controls.minDistance = 5;
    controls.maxDistance = 30;
    controls.maxPolarAngle = Math.PI * 0.493;

    scene.add(new THREE.HemisphereLight(0xdfe9f4, 0x55504a, 1.25));
    const cabinLight = new THREE.PointLight(0xfff2d8, 18, 7, 2);   // soft fill so the cargo bay is not flat
    scene.add(cabinLight);
    const sun = new THREE.DirectionalLight(0xffffff, 1.9);
    sun.position.set(-5.0, 9.5, 3.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.bias = -0.0012;
    sun.shadow.normalBias = 0.02;
    Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 2, far: 24 });
    sun.target.position.set(0, 1.1, L / 2);
    scene.add(sun, sun.target);
    const rim = new THREE.DirectionalLight(0xffffff, 0.45);
    rim.position.set(6.5, 2.5, -7);
    scene.add(rim);

    const std = (color: number, roughness = 0.6, metalness = 0) =>
      new THREE.MeshStandardMaterial({ color, roughness, metalness });
    const M = {
      paint: new THREE.MeshPhysicalMaterial({ color: 0xe8ebee, roughness: 0.42, metalness: 0.02, clearcoat: 0.45, clearcoatRoughness: 0.3 }),
      trim: std(0x272d34, 0.72),
      dark: std(0x191e24, 0.6),
      glass: new THREE.MeshPhysicalMaterial({ color: 0x16222b, roughness: 0.30, metalness: 0.0, specularIntensity: 0.55, transparent: true, opacity: 0.9, clearcoat: 0.15, clearcoatRoughness: 0.4, side: THREE.DoubleSide }),
      lamp: new THREE.MeshPhysicalMaterial({ color: 0xd2dae0, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.92 }),
      tyre: std(0x141719, 0.95),
      rim: std(0xa9b1b8, 0.36, 0.8),
      alu: std(0xb6bdc4, 0.3, 0.85),
      sensor: std(0x2b3137, 0.45, 0.3),
      lens: std(0x0b0e11, 0.14, 0.55),
      shell: std(0xe6e9ec, 0.55),
      gold: std(0xb3a369, 0.36, 0.55),
      instrument: std(0x2f6f96, 0.42, 0.3),
      amber: std(0xd08a1e, 0.4, 0.2),
      furn: std(0x7d848c, 0.58, 0.18),
      seat: std(0x3f464e, 0.88),
      screen: new THREE.MeshStandardMaterial({ color: 0x0d1217, roughness: 0.2, emissive: 0x17384a, emissiveIntensity: 0.8 }),
      floor: std(0x2f353b, 0.95),
      deskTop: std(0xb99467, 0.72),
      cabinet: std(0xd4dce1, 0.66),
      rackFace: std(0x173b53, 0.48),
      seatFabric: std(0x456b7b, 0.92),
      battery: std(0xd59b32, 0.55),
      indicator: new THREE.MeshBasicMaterial({ color: 0x46d2a1 }),
      tailRed: std(0x9e2524, 0.42),
    };
    const owned: THREE.Material[] = Object.values(M);
    const geoms: THREE.BufferGeometry[] = [];
    const keep = <T extends THREE.BufferGeometry>(g: T) => { geoms.push(g); return g; };

    const add = (p: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, cast = true) => {
      const mesh = new THREE.Mesh(keep(g), m);
      mesh.position.set(x, y, z);
      mesh.castShadow = cast;
      p.add(mesh);
      return mesh;
    };
    const box = (p: THREE.Object3D, m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, cast = true) =>
      add(p, new THREE.BoxGeometry(w, h, d), m, x, y, z, cast);
    const tube = (p: THREE.Object3D, m: THREE.Material, r: number, h: number, x: number, y: number, z: number, axis: 'x' | 'y' | 'z' = 'y') => {
      const mesh = add(p, new THREE.CylinderGeometry(r, r, h, 26), m, x, y, z);
      if (axis === 'x') mesh.rotation.z = Math.PI / 2;
      if (axis === 'z') mesh.rotation.x = Math.PI / 2;
      return mesh;
    };

    const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const strut = (p: THREE.Object3D, m: THREE.Material, from: THREE.Vector3, to: THREE.Vector3, t = 0.07) => {
      const dir = new THREE.Vector3().subVectors(to, from);
      const mesh = new THREE.Mesh(keep(new THREE.BoxGeometry(t, t, dir.length())), m);
      mesh.position.copy(from).addScaledVector(dir, 0.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.clone().normalize());
      mesh.castShadow = true;
      p.add(mesh);
      return mesh;
    };
    const rearCableEntries = (p: THREE.Object3D, endY: number, endZ: number) => {
      const entries = new THREE.Group();
      [-0.68, 0.68].forEach(x => {
        box(entries, M.shell, 0.22, 0.035, 0.18, x, H + 0.02, passZ(b), false);
        box(entries, M.alu, 0.105, 0.11, 0.10, x, H + 0.09, passZ(b));
        strut(entries, M.dark, V3(x, H + 0.15, passZ(b) + 0.04), V3(x, endY, endZ), 0.025);
      });
      p.add(entries);
      return entries;
    };

    /* ------------------------------ shell ------------------------------ */
    const exterior = new THREE.Group();
    scene.add(exterior);
    const shell = add(exterior, shellGeometry(b), M.paint);
    shell.receiveShadow = true;

    // windscreen, sitting on the cowl-to-header plane
    const dz = HEADER[0] - COWL[0], dy = HEADER[1] - COWL[1];
    const len = Math.hypot(dz, dy);
    const ox = (-dy / len) * 0.014, oy = (dz / len) * 0.014;
    add(exterior, quad(
      [-0.830, COWL[1] + oy, COWL[0] + ox], [0.830, COWL[1] + oy, COWL[0] + ox],
      [0.760, HEADER[1] + oy, HEADER[0] + ox], [-0.760, HEADER[1] + oy, HEADER[0] + ox],
    ), M.glass, 0, 0, 0, false);

    // cab side glass and rear door glass
    [1, -1].forEach(s => {
      add(exterior, quad(
        [s * sideX, 1.470, 1.905], [s * sideX, 1.470, 2.700],
        [s * sideX, 2.075, 2.700], [s * sideX, 2.075, 2.015],
      ), M.glass, 0, 0, 0, false);
    });
    box(exterior, M.glass, 1.30, 0.58, 0.02, 0, 2.00, L + 0.010, false);
    box(exterior, M.trim, 0.03, 1.78, 0.03, 0, 1.56, L + 0.018, false);
    [-0.78, 0.78].forEach(x => box(exterior, M.trim, 0.10, 0.05, 0.07, x, 1.28, L + 0.03));

    // front: bumper, valance, grille bars, badge, lamps
    box(exterior, M.trim, WIDTH - 0.18, 0.235, 0.13, 0, 0.470, 0.040);
    box(exterior, M.trim, WIDTH - 0.34, 0.10, 0.10, 0, 0.345, 0.045, false);
    box(exterior, M.dark, 1.10, 0.38, 0.036, 0, 0.975, 0.058, false);
    for (let i = 0; i < 3; i++) box(exterior, M.trim, 1.08, 0.042, 0.045, 0, 0.855 + i * 0.122, 0.072, false);
    box(exterior, M.alu, 0.28, 0.105, 0.04, 0, 1.132, 0.104, false);
    box(exterior, M.trim, 0.66, 0.10, 0.05, 0, 0.655, 0.092, false);
    [-0.660, 0.660].forEach(x => {
      const lamp = box(exterior, M.lamp, 0.32, 0.20, 0.055, x, 1.105, 0.098, false);
      lamp.rotation.y = Math.sign(x) * 0.26;
      box(exterior, M.trim, 0.17, 0.072, 0.05, x * 0.90, 0.600, 0.088, false);
    });

    box(exterior, M.trim, 0.52, 0.02, 0.13, -0.28, 1.418, 0.965, false);

    // mirrors, rocker, roof rails, panel seams, handles, mud flaps
    [-1, 1].forEach(s => {
      box(exterior, M.trim, 0.12, 0.06, 0.15, s * (HALF + 0.055), 1.88, 1.90, false);
      const head = box(exterior, M.trim, 0.09, 0.34, 0.21, s * (HALF + 0.175), 1.84, 1.90);
      head.rotation.y = s * 0.14;
      box(exterior, M.trim, 0.07, 0.10, L - 2.6, s * (HALF - 0.02), 0.535, (L + 1.8) / 2, false);
      box(exterior, M.trim, 0.085, 0.05, L - 3.35, s * (HALF - 0.10), H - 0.045, (2.95 + L - 0.30) / 2, false);
      [2.78, 4.06].forEach(z => box(exterior, M.trim, 0.012, 1.44, 0.014, s * sideX, 1.27, z, false));
      box(exterior, M.trim, 0.09, 0.045, 0.28, s * sideX, 1.215, 3.80, false);
      box(exterior, M.trim, 0.05, 0.28, 0.02, s * (HALF - 0.03), 0.30, REAR_AXLE + 0.55, false);
    });

    // wheels and arch trims
    ([[FRONT_AXLE, TRACK_F], [REAR_AXLE, TRACK_R]] as [number, number][]).forEach(([z, track]) => {
      [-1, 1].forEach(s => {
        const arch = add(exterior, new THREE.TorusGeometry(WHEEL_R + 0.055, 0.05, 10, 28, Math.PI), M.trim,
          s * (HALF * taperAt(z, L) - 0.015), WHEEL_R, z, false);
        arch.rotation.y = s * Math.PI / 2;
        const w = new THREE.Group();
        tube(w, M.tyre, WHEEL_R, 0.235, 0, 0, 0, 'x');
        tube(w, M.rim, WHEEL_R * 0.60, 0.245, 0, 0, 0, 'x');
        tube(w, M.trim, WHEEL_R * 0.17, 0.26, 0, 0, 0, 'x');
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2;
          const spoke = box(w, M.rim, 0.05, WHEEL_R * 0.5, 0.09, 0, Math.sin(a) * WHEEL_R * 0.29, Math.cos(a) * WHEEL_R * 0.29, false);
          spoke.rotation.x = -a;
        }
        w.position.set(s * (track / 2), WHEEL_R, z);
        exterior.add(w);
      });
    });

    /* -------------------------- roof equipment -------------------------- */
    const roofKit = new THREE.Group();   // earlier front-sensor interpretation, retained as hidden reference geometry
    roofKit.visible = false;
    scene.add(roofKit);
    const parts: Partial<Record<Part, THREE.Object3D>> = {};
    const anchorOn: Partial<Record<Part, THREE.Object3D>> = {};

    const beam = new THREE.Group();
    box(beam, M.alu, 1.96, BEAM_H, 0.11, 0, beamTop(b) - BEAM_H / 2, BEAM_Z);
    [-0.84, 0.84].forEach(x => box(beam, M.alu, 0.13, BEAM_FOOT, 0.17, x, H + BEAM_FOOT / 2, BEAM_Z));
    roofKit.add(beam);

    const lidar = new THREE.Group();
    [-0.76, 0, 0.76].forEach(x => {
      tube(lidar, M.sensor, 0.060, LIDAR_H, x, beamTop(b) + LIDAR_H / 2, BEAM_Z);
      tube(lidar, M.gold, 0.062, 0.030, x, beamTop(b) + LIDAR_H * 0.62, BEAM_Z);
    });
    roofKit.add(lidar);

    const cameras = new THREE.Group();
    const beamCams = new THREE.Group();
    [-0.38, 0.38].forEach(x => {
      box(beamCams, M.sensor, 0.11, 0.085, 0.14, x, beamTop(b) + 0.043, BEAM_Z - 0.115);
      tube(beamCams, M.lens, 0.028, 0.03, x, beamTop(b) + 0.043, BEAM_Z - 0.20, 'z');
    });
    cameras.add(beamCams);
    // forward-looking at the leading roof edge, rear-looking at the tail (sheet 02)
    box(cameras, M.sensor, 0.14, 0.095, 0.16, 0, H + 0.058, 2.760);
    tube(cameras, M.lens, 0.032, 0.03, 0, H + 0.058, 2.672, 'z');
    box(cameras, M.sensor, 0.14, 0.095, 0.16, 0, H + 0.058, L - 0.360);
    tube(cameras, M.lens, 0.032, 0.03, 0, H + 0.058, L - 0.272, 'z');
    roofKit.add(cameras);

    const gnss = new THREE.Group();
    tube(gnss, M.shell, 0.088, 0.055, 0, beamTop(b) - 0.02, BEAM_Z + 0.42);
    box(gnss, M.sensor, 0.17, 0.085, 0.15, -0.42, H + 0.10, BEAM_Z + 0.42);
    roofKit.add(gnss);

    const pass = new THREE.Group();
    box(pass, M.alu, 0.48, 0.028, 0.36, 0, H + 0.014, passZ(b), false);
    box(pass, M.dark, 0.20, 0.07, 0.16, 0.10, H + 0.05, passZ(b));
    roofKit.add(pass);

    const frontCams = new THREE.Group();
    box(frontCams, M.trim, 0.92, 0.024, 0.26, 0, H + 0.012, frontCamZ, false);
    [-0.30, 0, 0.30].forEach(x => {
      box(frontCams, M.alu, 0.10, 0.024, 0.10, x, H + 0.036, frontCamZ, false);
      box(frontCams, M.sensor, 0.15, 0.105, 0.20, x, H + 0.0875, frontCamZ);
      tube(frontCams, M.lens, 0.042, 0.03, x, H + 0.0875, frontCamZ - 0.105, 'z');
    });
    frontCams.visible = !p1;
    scene.add(frontCams); parts.frontCams = frontCams;

    // A/C is a later addition, on the rear third of the roof
    const acRear = new THREE.Group();
    const az = acRearZ(b);
    box(acRear, M.trim, AC.w + 0.06, 0.025, AC.d + 0.06, 0, H + 0.013, az, false);
    box(acRear, M.shell, AC.w, AC.h, AC.d, 0, H + 0.025 + AC.h / 2, az);
    for (let i = 0; i < 5; i++) box(acRear, M.dark, 0.025, 0.08, AC.d * 0.78, -0.28 + i * 0.14, H + 0.025 + AC.h * 0.72, az, false);
    tube(acRear, M.trim, 0.19, 0.03, 0, H + 0.016, az - AC.d / 2 - 0.12);
    scene.add(acRear); parts.acRear = acRear;

    // User-corrected sheet: A/C forward, existing sensor package carried aft.
    // This is a planning envelope; the exact rear bracket is not dimensioned.
    const sheetRear = new THREE.Group();
    sheetRear.visible = !pr && !p1;
    scene.add(sheetRear);
    const rearBarY = H - REAR_BAR_DROP;
    const postX = 0.78;          // inboard of the rear track, clear of the wheels
    const yBase = 0.46;          // chassis rail height
    const zPost = L + 0.16;      // posts just clear of the rear doors, which must still open
    const zBar = L + 0.56;       // sensor crossbar, cantilevered aft of the posts
    const rearBeam = new THREE.Group();

    // base frame: bolts to the chassis under the body, then carries everything above
    [-1, 1].forEach(sd => strut(rearBeam, M.trim, V3(sd * postX, yBase, L - 0.55), V3(sd * postX, yBase, L + 0.34), 0.085));
    box(rearBeam, M.trim, postX * 2 + 0.09, 0.085, 0.09, 0, yBase, L + 0.30);
    box(rearBeam, M.trim, postX * 2 + 0.09, 0.085, 0.09, 0, yBase, L - 0.42);

    [-1, 1].forEach(sd => {
      const x = sd * postX;
      strut(rearBeam, M.alu, V3(x, yBase, zPost), V3(x, rearBarY, zPost), 0.085);        // post
      strut(rearBeam, M.alu, V3(x, rearBarY, zPost), V3(x, rearBarY, zBar), 0.070);      // cantilever arm
      strut(rearBeam, M.alu, V3(x, rearBarY, zBar), V3(x, yBase + 0.10, zPost), 0.060);  // brace against the cantilever
    });
    box(rearBeam, M.alu, postX * 2 + 0.16, REAR_BAR_HALF * 2, 0.13, 0, rearBarY, zBar);  // sensor crossbar
    box(rearBeam, M.alu, postX * 2, 0.06, 0.07, 0, 1.52, zPost);                         // transverse cross-brace
    strut(rearBeam, M.alu, V3(0, rearBarY, zBar), V3(0, rearBarY, L + 0.72), 0.05);      // GNSS stub

    // low pavement bar, hung off the base frame
    [-1, 1].forEach(sd => strut(rearBeam, M.trim, V3(sd * postX, yBase, L + 0.30), V3(sd * postX, 0.40, L + 0.50), 0.05));
    box(rearBeam, M.trim, postX * 2 + 0.12, 0.08, 0.10, 0, 0.40, L + 0.50);
    [-0.54, 0.54].forEach(x => {
      box(rearBeam, M.sensor, 0.30, 0.16, 0.22, x, 0.37, L + 0.50);
      tube(rearBeam, M.lens, 0.04, 0.025, x, 0.28, L + 0.50);
    });
    sheetRear.add(rearBeam);
    const rearLidar = new THREE.Group();
    [-0.68, 0, 0.68].forEach(x => {
      tube(rearLidar, M.sensor, 0.06, LIDAR_H, x, rearBarY + REAR_BAR_HALF + LIDAR_H / 2, zBar);
      tube(rearLidar, M.gold, 0.062, 0.03, x, rearBarY + REAR_BAR_HALF + LIDAR_H * 0.75, zBar);
    });
    sheetRear.add(rearLidar);
    const rearCameras = new THREE.Group();
    [-0.34, 0.34].forEach(x => {
      box(rearCameras, M.sensor, 0.12, 0.09, 0.16, x, rearBarY - 0.14, zPost + 0.05);
      tube(rearCameras, M.lens, 0.03, 0.03, x, rearBarY - 0.14, zPost - 0.04, 'z');
    });
    sheetRear.add(rearCameras);
    const rearGnss = new THREE.Group();
    tube(rearGnss, M.shell, 0.08, 0.055, 0, rearBarY + REAR_BAR_HALF + 0.028, L + 0.72);
    sheetRear.add(rearGnss);
    const rearPass = rearCableEntries(sheetRear, H + 0.02, passZ(b));
    if (!pr) {
      parts.beam = rearBeam; parts.lidar = rearLidar; parts.cameras = rearCameras;
      parts.gnss = rearGnss; parts.pass = rearPass;
    }

    /* ----------------------------- interior ----------------------------- */
    const inside = new THREE.Group();
    inside.visible = false;
    scene.add(inside);
    const zBulk = L - b.cargo;

    /* Cab provisioning: rail, cable route and power fitted now; screen added later. */
    const provision = new THREE.Group();
    provision.visible = false;
    inside.add(provision);
    const ghost = new THREE.MeshStandardMaterial({ color: 0x4a6b57, roughness: 0.5, metalness: 0.1, transparent: true, opacity: 0.6 });
    const ghostFace = new THREE.MeshStandardMaterial({ color: 0x12211b, roughness: 0.28, transparent: true, opacity: 0.8, emissive: 0x1d4436, emissiveIntensity: 0.55 });
    owned.push(ghostFace);
    owned.push(ghost);
    const cabFloor = 0.70, zConsole = 2.16;

    const pvConsole = new THREE.Group();
    box(pvConsole, M.dark, 0.30, 0.07, 0.86, 0, cabFloor + 0.035, zConsole);
    for (let i = 0; i < 6; i++) box(pvConsole, M.trim, 0.04, 0.02, 0.04, 0, cabFloor + 0.075, zConsole - 0.36 + i * 0.145, false);
    provision.add(pvConsole); parts.pvConsole = pvConsole;

    const pvScreen = new THREE.Group();
    box(pvScreen, ghost, 0.06, 0.52, 0.06, 0.02, cabFloor + 0.33, zConsole - 0.30);
    box(pvScreen, ghost, 0.30, 0.05, 0.05, 0.17, cabFloor + 0.58, zConsole - 0.30);
    const bezel = box(pvScreen, ghost, 0.58, 0.36, 0.022, 0.34, cabFloor + 0.60, zConsole - 0.34);
    bezel.rotation.y = -0.45;
    const pane = box(pvScreen, ghostFace, 0.54, 0.32, 0.012, 0.34, cabFloor + 0.60, zConsole - 0.352);
    pane.rotation.y = -0.45;
    provision.add(pvScreen); parts.pvScreen = pvScreen;

    const pvCable = new THREE.Group();
    box(pvCable, M.trim, 0.10, 0.06, 1.30, -0.44, F - 0.02, zBulk + 0.62, false);
    box(pvCable, M.trim, 0.09, 0.06, 0.55, -0.30, cabFloor + 0.02, zConsole + 0.30, false);
    provision.add(pvCable); parts.pvCable = pvCable;

    const pvPower = new THREE.Group();
    box(pvPower, M.dark, 0.24, 0.14, 0.05, 0, cabFloor + 0.14, zConsole + 0.40);
    [-0.06, 0.06].forEach(x => box(pvPower, M.gold, 0.05, 0.05, 0.02, x, cabFloor + 0.14, zConsole + 0.372, false));
    provision.add(pvPower); parts.pvPower = pvPower;

    box(inside, M.floor, CARGO_W, 0.03, b.cargo, 0, F - 0.015, zBulk + b.cargo / 2, false);
    [-1, 1].forEach(s => box(inside, M.furn, (CARGO_W - WHEEL_W) / 2, 0.30, 0.99,
      s * (CARGO_W + WHEEL_W) / 4, F + 0.15, REAR_AXLE));

    const concept = new THREE.Group();   // everything beyond the phase-one quote
    concept.visible = !p1;
    inside.add(concept);

    const seats = new THREE.Group();
    [-0.45, 0.45].forEach(x => {
      box(seats, M.seatFabric, 0.50, 0.12, 0.50, x, F + 0.42, 4.35);
      box(seats, M.seatFabric, 0.50, 0.66, 0.12, x, F + 0.80, 4.63);
      box(seats, M.seatFabric, 0.46, 0.10, 0.20, x, F + 1.19, 4.65);
      box(seats, M.dark, 0.34, 0.20, 0.34, x, F + 0.13, 4.35);
      box(seats, M.alu, 0.045, 0.24, 0.40, x + 0.28, F + 0.53, 4.35);
    });
    concept.add(seats); parts.seats = seats;

    const desk = new THREE.Group();
    box(desk, M.deskTop, 1.62, 0.05, 0.72, 0, F + 0.755, 3.47);
    box(desk, M.cabinet, 1.62, 0.04, 0.58, 0, F + 0.32, 3.47);
    [-0.78, 0.78].forEach(x => box(desk, M.cabinet, 0.05, 0.78, 0.68, x, F + 0.39, 3.47));
    box(desk, M.dark, 0.23, 0.46, 0.50, 0.54, F + 0.56, 3.47);
    box(desk, M.dark, 0.07, 0.42, 0.07, -0.16, F + 0.99, 3.31);
    const mon = box(desk, M.screen, 0.56, 0.34, 0.025, -0.16, F + 1.28, 3.11);
    mon.rotation.x = 0.10;
    box(desk, M.dark, 0.42, 0.02, 0.15, 0.14, F + 0.79, 3.68, false);
    concept.add(desk); parts.desk = desk;

    const rack = new THREE.Group();
    box(rack, M.cabinet, 0.62, 1.10, 0.78, -0.34, F + 0.55, 5.55);
    for (let i = 0; i < 4; i++) {
      box(rack, M.rackFace, 0.55, 0.15, 0.035, -0.34, F + 0.24 + i * 0.23, 5.14, false);
      box(rack, M.indicator, 0.025, 0.025, 0.006, -0.12, F + 0.24 + i * 0.23, 5.119, false);
      box(rack, M.alu, 0.20, 0.012, 0.007, -0.47, F + 0.24 + i * 0.23, 5.115, false);
    }
    concept.add(rack); parts.rack = rack;

    const power = new THREE.Group();
    box(power, M.rackFace, 0.54, 0.40, 0.48, 0.52, F + 0.22, L - 0.88);
    box(power, M.battery, 0.38, 0.24, 0.32, 0.52, F + 0.54, L - 0.88);
    box(power, M.dark, 0.27, 0.035, 0.035, 0.52, F + 0.68, L - 0.88);
    concept.add(power); parts.power = power;

    box(concept, M.furn, 0.40, 0.46, 1.55, CARGO_W / 2 - 0.20, F + 1.66, L - 1.35);
    box(concept, M.dark, 0.13, 0.11, 2.30, -(CARGO_W / 2 - 0.07), F + 1.22, 4.60, false);
    [3.60, L - 1.10].forEach(z => box(concept, M.shell, 0.40, 0.03, 0.10, 0, H - 0.16, z, false));

    /* ------------------- phase one, as Leonard quoted it -------------------
       Quotes 368-QUO-100610 / 368-QUO-100657 of 30 Oct 2026: A/C, Legend
       insulation and liners, a 5000 W inverter with 0-gauge wiring, and the
       seating option. No rack, no sensors.

       Topology follows the reference build: workstation and wall monitor on
       the LEFT wall, passenger seating longitudinal along the RIGHT wall with
       its cushion facing the aisle, equipment drawers forward on the left,
       and a clear aisle down the middle. Solid = quoted; outlined and
       translucent = discussed on 21 Oct but on neither quote.              */
    const phaseOne = new THREE.Group();
    phaseOne.visible = p1;
    inside.add(phaseOne);

    const P = {
      liner: std(0xccd1d6, 0.78),
      ceiling: std(0xf0f3f5, 0.72),
      plate: std(0xd9dfe3, 0.34, 0.25),
      seam: std(0xb0b7bd, 0.85),
      vinyl: std(0x23282e, 0.5),
      fabric: std(0xc9ccc8, 0.96),
      wood: std(0xc9a470, 0.68),
      alu: std(0xc2c8cd, 0.36, 0.55),
      belt: std(0x3a4047, 0.7),
      lampRing: std(0xe8ecee, 0.5),
      lampFace: new THREE.MeshStandardMaterial({ color: 0xfdf7e6, roughness: 0.25, emissive: 0xffe9b8, emissiveIntensity: 0.9 }),
      notQuoted: new THREE.MeshStandardMaterial({ color: 0x8d99a3, roughness: 0.7, transparent: true, opacity: 0.085, depthWrite: false }),
      edge: new THREE.LineBasicMaterial({ color: 0x64737f, transparent: true, opacity: 0.8 }),
      crease: new THREE.LineBasicMaterial({ color: 0x3f4a53, transparent: true, opacity: 0.35 }),
    };
    Object.values(P).forEach(m => owned.push(m));

    /* a solid part, with its edges drawn so blocky volumes read as drafted */
    const solid = (p: THREE.Object3D, m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, cast = true) => {
      const mesh = box(p, m, w, h, d, x, y, z, cast);
      const line = new THREE.LineSegments(keep(new THREE.EdgesGeometry(mesh.geometry)), P.crease);
      line.position.set(x, y, z);
      p.add(line);
      return mesh;
    };
    /* a proposed volume: barely-there fill plus an outline */
    const ghostBox = (p: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number) => {
      const mesh = box(p, P.notQuoted, w, h, d, x, y, z, false);
      const line = new THREE.LineSegments(keep(new THREE.EdgesGeometry(mesh.geometry)), P.edge);
      line.position.set(x, y, z);
      p.add(line);
      return mesh;
    };

    cabinLight.position.set(0, b.height - 0.35, zBulk + b.cargo * 0.55);
    const linerX = CARGO_W / 2 - 0.012;
    const zMid = zBulk + b.cargo / 2;
    const dLiner = b.cargo - 0.12;

    /* ---- Legend wall, door and wheel liners ---- */
    const p1Liner = new THREE.Group();
    const linerPos = new THREE.Group(), linerNeg = new THREE.Group(), linerRear = new THREE.Group();
    p1Liner.add(linerPos, linerNeg, linerRear);
    const zLinerBack = L - 0.06;
    const panel = (g: THREE.Object3D, sd: number, z0: number, z1: number) =>
      box(g, P.liner, 0.022, 1.44, z1 - z0, sd * linerX, F + 0.74, (z0 + z1) / 2, false);
    panel(linerNeg, -1, zBulk + 0.06, zLinerBack);
    panel(linerPos, 1, zBulk + 0.06, 2.72);
    panel(linerPos, 1, 4.12, zLinerBack);
    ([[linerNeg, -1], [linerPos, 1]] as [THREE.Group, number][]).forEach(([g, sd]) => {
      box(g, P.plate, 0.030, 0.070, dLiner, sd * linerX, F + 1.50, zMid, false);          // diamond-plate rail
      [3.05, 4.40, 5.70].forEach(z => box(g, P.seam, 0.026, 1.40, 0.012, sd * linerX, F + 0.74, z, false));
      box(g, P.liner, 0.26, 0.36, 1.02, sd * 0.78, F + 0.18, REAR_AXLE, false);           // wheel-arch cover
    });
    [-0.40, 0.40].forEach(x => box(linerRear, P.liner, 0.74, 1.46, 0.020, x, F + 0.77, L - 0.05, false));
    phaseOne.add(p1Liner); parts.p1Liner = p1Liner;

    /* ---- ceiling liner with recessed downlights ---- */
    const p1Ceiling = new THREE.Group();
    const ceilPanel = new THREE.Group();
    box(ceilPanel, P.ceiling, CARGO_W - 0.10, 0.025, dLiner, 0, H - 0.055, zMid, false);
    p1Ceiling.add(ceilPanel);
    [0.24, 0.48, 0.72].forEach(f => {
      const z = zBulk + b.cargo * f;
      tube(p1Ceiling, P.lampRing, 0.085, 0.016, 0, H - 0.072, z);
      tube(p1Ceiling, P.lampFace, 0.070, 0.010, 0, H - 0.082, z);
    });
    phaseOne.add(p1Ceiling); parts.p1Ceiling = p1Ceiling;

    const cutaway = () => {
      if (!p1) return;
      const planView = currentView === 'plan';
      phaseOneRoof.visible = !planView;
      acRear.visible = !planView;
      linerPos.visible = camera.position.x < 0.25;
      linerNeg.visible = camera.position.x > -0.25;
      linerRear.visible = camera.position.z < L;
      ceilPanel.visible = camera.position.y < H;
    };

    /* ---- RIGHT wall: passenger seating on swivel bases ----
       The seats change facing rather than sliding fore and aft: forward, or
       turned in to face the aisle and the workstation. Two shells, per the
       double seat kit on the quote; back height and belt positions are not
       established by the photos and are not drawn in.                      */
    const p1Seats = new THREE.Group();
    const seatDepth = 0.54;
    const seatX = CARGO_W / 2 - seatDepth / 2 - 0.05;
    const railZ0 = 4.95, railZ1 = 6.55;
    solid(p1Seats, P.vinyl, seatDepth + 0.04, 0.09, railZ1 - railZ0, seatX, F + 0.045,
      (railZ0 + railZ1) / 2);                                                            // floor base rail
    [-1, 1].forEach(sd => box(p1Seats, P.plate, seatDepth + 0.04, 0.012, 0.06, seatX, F + 0.095,
      (railZ0 + railZ1) / 2 + sd * ((railZ1 - railZ0) / 2 - 0.05), false));

    const seatShells: THREE.Group[] = [];
    [-1, 1].forEach(sd => {
      const shell = new THREE.Group();
      shell.position.set(seatX, 0, (railZ0 + railZ1) / 2 + sd * 0.40);
      p1Seats.add(shell);
      seatShells.push(shell);

      tube(shell, P.plate, 0.16, 0.05, 0, F + 0.12, 0);                                  // swivel plate
      tube(shell, P.vinyl, 0.07, 0.22, 0, F + 0.25, 0);                                  // pedestal column
      solid(shell, P.vinyl, 0.48, 0.10, seatDepth - 0.04, 0, F + 0.41, 0);               // seat frame
      solid(shell, P.fabric, 0.50, 0.13, seatDepth, 0, F + 0.50, 0);                     // seat cushion
      [-1, 1].forEach(o => box(shell, P.seam, 0.014, 0.012, seatDepth - 0.06, o * 0.14, F + 0.567, 0, false));
      box(shell, P.vinyl, 0.50, 0.07, 0.08, 0, F + 0.47, -seatDepth / 2 + 0.02, false);  // front nosing

      const back = new THREE.Group();
      back.position.set(0, F + 0.55, seatDepth / 2 - 0.05);
      back.rotation.x = -0.13;
      shell.add(back);
      solid(back, P.vinyl, 0.50, 0.54, 0.13, 0, 0.26, 0.01);                             // back bolster
      box(back, P.fabric, 0.38, 0.46, 0.05, 0, 0.26, -0.055, false);                     // light facing
      [0.13, 0.27, 0.41].forEach(y => box(back, P.seam, 0.34, 0.012, 0.014, 0, y, -0.082, false));
    });

    const setFacing = (side: boolean) =>
      seatShells.forEach(shell => { shell.rotation.y = side ? Math.PI / 2 : 0; });
    setFacing(seatSide);
    phaseOne.add(p1Seats); parts.p1Seats = p1Seats;

    /* ---- LEFT wall: workstation, monitor and drawer cabinets (not quoted) ---- */
    const p1Gap = new THREE.Group();
    const deskZ0 = 4.05, deskZ1 = 5.80, deskX = -0.52, deskY = F + 0.76;
    ghostBox(p1Gap, 0.58, 0.045, deskZ1 - deskZ0, deskX, deskY, (deskZ0 + deskZ1) / 2);            // wooden worktop
    ghostBox(p1Gap, 0.60, 0.030, 0.05, deskX, deskY + 0.038, deskZ0 + 0.03);                       // upstand at the wall end
    ghostBox(p1Gap, 0.56, 0.70, 0.035, deskX, F + 0.39, deskZ1 - 0.02);                            // closed end panel, rear
    ghostBox(p1Gap, 0.56, 0.70, 0.035, deskX, F + 0.39, deskZ0 + 0.02);                            // closed end panel, front
    ghostBox(p1Gap, 0.52, 0.10, deskZ1 - deskZ0 - 0.12, deskX - 0.02, F + 0.68, (deskZ0 + deskZ1) / 2);  // frame rail, otherwise open underneath
    ghostBox(p1Gap, 0.52, 0.74, 0.88, -0.55, F + 0.37, 3.55);                                      // drawer cabinets
    for (let i = 0; i < 6; i++) {
      box(p1Gap, P.notQuoted, 0.014, 0.095, 0.82, -0.292, F + 0.08 + i * 0.118, 3.55, false);
      box(p1Gap, P.seam, 0.010, 0.020, 0.18, -0.286, F + 0.08 + i * 0.118, 3.55, false);           // recessed handle
    }
    ghostBox(p1Gap, 0.05, 0.08, 0.30, -0.80, F + 1.22, 4.95);                                      // monitor arm
    ghostBox(p1Gap, 0.035, 0.52, 0.92, -0.755, F + 1.26, 4.95);                                    // wall monitor
    phaseOne.add(p1Gap);

    /* ---- quoted power, tucked under the worktop ---- */
    const p1Power = new THREE.Group();
    const pwX = -0.70;
    solid(p1Power, M.rackFace, 0.42, 0.22, 0.28, pwX, F + 0.13, 5.50);                             // 5000 W inverter
    [-0.07, 0.07].forEach(o => box(p1Power, P.seam, 0.28, 0.022, 0.016, pwX, F + 0.13 + o, 5.36, false));
    ghostBox(p1Power, 0.36, 0.28, 0.32, pwX, F + 0.16, 4.85);                                      // battery: on neither quote
    strut(p1Power, M.dark, V3(pwX - 0.04, F + 0.24, 4.85), V3(pwX - 0.04, F + 0.24, 5.50), 0.026);
    solid(p1Power, M.dark, 0.06, 0.06, 0.06, pwX - 0.04, F + 0.24, 5.18, false);                   // 250 A fuse holder
    phaseOne.add(p1Power); parts.p1Power = p1Power;

    /* ---- fold-up jump seat between the cab seats: a later option, not quoted.
       "It's like a center console. The trucks will lift up." (21 Oct)      */
    const p1Jump = new THREE.Group();
    ghostBox(p1Jump, 0.40, 0.46, 0.54, 0, F + 0.26, zBulk - 0.42);
    ghostBox(p1Jump, 0.36, 0.40, 0.09, 0, F + 0.68, zBulk - 0.17);                                 // back, shown folded up
    phaseOne.add(p1Jump);

    /* ---- roof: only the A/C, with the rear held for phase two ---- */
    const phaseOneRoof = new THREE.Group();
    phaseOneRoof.visible = p1;
    scene.add(phaseOneRoof);
    const reserve = new THREE.MeshStandardMaterial({ color: 0xb3a369, roughness: 0.55, transparent: true, opacity: 0.34 });
    owned.push(reserve);
    box(phaseOneRoof, reserve, 1.70, 0.014, 0.72, 0, H + 0.012, L - 0.36, false);

    /* ------- upgrades the group asked for by name (sheet 03, 补充) -------- */
    const requested = new THREE.Group();
    requested.visible = false;
    scene.add(requested);
    const gold = M.gold;

    const rqLidar = new THREE.Group();
    tube(rqLidar, gold, 0.062, LIDAR_H + 0.01, -0.38, beamTop(b) + 0.05, BEAM_Z + 0.20);
    box(rqLidar, M.alu, 0.12, BEAM_FOOT, 0.14, -0.38, H + BEAM_FOOT / 2, BEAM_Z + 0.20);
    requested.add(rqLidar); parts.rqLidar = rqLidar;

    const rqGnss = new THREE.Group();
    tube(rqGnss, gold, 0.088, 0.06, 0.30, beamTop(b) - 0.02, BEAM_Z + 0.42);
    requested.add(rqGnss); parts.rqGnss = rqGnss;

    const rqCamera = new THREE.Group();
    box(rqCamera, gold, 0.15, 0.115, 0.19, 0.58, beamTop(b) + 0.058, BEAM_Z - 0.13);
    tube(rqCamera, M.lens, 0.040, 0.03, 0.58, beamTop(b) + 0.058, BEAM_Z - 0.24, 'z');
    requested.add(rqCamera); parts.rqCamera = rqCamera;

    const rqDepth = new THREE.Group();
    box(rqDepth, gold, 0.34, 0.075, 0.10, 0, beamTop(b) + 0.042, BEAM_Z - 0.30);
    [-0.13, 0.13].forEach(x => tube(rqDepth, M.lens, 0.024, 0.03, x, beamTop(b) + 0.042, BEAM_Z - 0.36, 'z'));
    requested.add(rqDepth); parts.rqDepth = rqDepth;

    const rqTobii = new THREE.Group();
    const tobii = box(rqTobii, gold, 0.30, 0.035, 0.035, -0.16, F + 1.09, 3.47);
    tobii.rotation.x = 0.10;
    requested.add(rqTobii); parts.rqTobii = rqTobii;
    // Requested roof hardware follows the corrected rear sensor carrier.
    const rearShift = L + 0.54 - BEAM_Z;
    [rqLidar, rqGnss, rqCamera, rqDepth].forEach(group => { group.position.z = rearShift; });

    /* ------- PathRunner-style reference rig (not in the base plan) -------- */
    const rearFrame = new THREE.Group();
    rearFrame.visible = false;
    scene.add(rearFrame);
    const deckY = pr && gantryLevel === 'lowered' ? GANTRY_LOW_Y : H + GANTRY_FRAME_RISE;
    const zBack = L + 1.15, xr = 0.95;
    const pgDeck = new THREE.Group(), pgMast = new THREE.Group();
    const pgPavement = new THREE.Group(), pgDmi = new THREE.Group(), pgFront = new THREE.Group();
    rearFrame.add(pgDeck, pgMast, pgPavement, pgDmi, pgFront);

    [-1, 1].forEach(s2 => {
      const x = s2 * xr;
      strut(pgDeck, M.trim, V3(x, 0.50, L + 0.08), V3(x, deckY, L + 0.08), 0.085);   // upright
      strut(pgDeck, M.trim, V3(x, deckY, L - 0.10), V3(x, deckY, zBack), 0.085);      // raised cantilever rail
      strut(pgDeck, M.trim, V3(x, deckY, zBack), V3(x, 0.74, L + 0.14), 0.07);        // main diagonal
      if (!hy) strut(pgDeck, M.trim, V3(x, deckY, L + 0.58), V3(x, 1.38, L + 0.11), 0.06);
      strut(pgDeck, M.trim, V3(x, deckY, L + 0.55), V3(0, deckY - 0.08, L + 0.07), 0.045);
      [0.93, 1.20].forEach(y => tube(pgDeck, M.tailRed, 0.085, 0.025, x, y, L + 0.16, 'z'));
    });
    [L - 0.05, L + 0.55, zBack].forEach(z => box(pgDeck, M.trim, 2 * xr, 0.07, 0.085, 0, deckY, z));

    // The amber bars in the photo sit on the van roof, below the raised crossarm.
    [-0.57, 0.57].forEach(x => box(pgDeck, M.amber, 0.65, 0.095, 0.18, x, H + 0.095, L - 0.23));

    // Two prominent instrument housings on the elevated transverse arm.
    [-1.08, 1.08].forEach(x => {
      box(pgMast, M.alu, 0.38, 0.05, 0.30, x, deckY + 0.025, zBack - 0.04);
      box(pgMast, M.shell, 0.45, 0.39, 0.43, x, deckY + 0.255, zBack - 0.04);
      box(pgMast, M.trim, 0.30, 0.022, 0.015, x, deckY + 0.10, zBack + 0.185, false);
    });

    // mast carrying the 360 imaging head, above the deck
    box(pgMast, M.trim, 0.13, 0.22, 0.13, 0, deckY + 0.14, L + 0.50);
    box(pgMast, M.instrument, 0.24, 0.11, 0.24, 0, deckY + 0.31, L + 0.50);
    const dome = new THREE.Mesh(keep(new THREE.SphereGeometry(0.105, 20, 14)), M.instrument);
    dome.position.set(0, deckY + 0.385, L + 0.50);
    dome.castShadow = true;
    pgMast.add(dome);

    // low crossbar carrying the downward-looking pavement sensors
    box(pgPavement, M.trim, 2.00, 0.09, 0.09, 0, 0.42, L + 0.42);
    [-0.62, 0.62].forEach(x => {
      const head = box(pgPavement, M.shell, 0.34, 0.16, 0.22, x, 0.45, L + 0.42);
      head.rotation.x = -0.18;
      tube(pgPavement, M.lens, 0.045, 0.03, x, 0.37, L + 0.40);
    });
    [-0.88, 0.88].forEach(x => box(pgPavement, M.dark, 0.11, 0.34, 0.03, x, 0.22, L + 0.26, false));

    // DMI encoder on the rear wheel hubs
    [-1, 1].forEach(s2 => {
      tube(pgDmi, M.alu, 0.085, 0.07, s2 * (TRACK_R / 2 + 0.145), WHEEL_R, REAR_AXLE, 'x');
      tube(pgDmi, M.trim, 0.030, 0.10, s2 * (TRACK_R / 2 + 0.190), WHEEL_R, REAR_AXLE, 'x');
    });

    // front bumper carrier, the way RetroTek-D mounts
    box(pgFront, M.instrument, 1.18, 0.26, 0.24, 0, 0.62, -0.20);
    [-0.38, 0, 0.38].forEach(x => tube(pgFront, M.lens, 0.045, 0.03, x, 0.62, -0.325, 'z'));
    box(pgFront, M.trim, 0.86, 0.07, 0.22, 0, 0.62, -0.03, false);

    if (hy) {
      [-0.42, 0.42].forEach(x => {
        box(pgDeck, M.sensor, 0.13, 0.10, 0.16, x, deckY + 0.13, zBack - 0.14);
        tube(pgDeck, M.lens, 0.034, 0.03, x, deckY + 0.13, zBack - 0.05, 'z');
      });
      rearFrame.visible = true;
    }
    parts.pgPavement = pgPavement; parts.pgDmi = pgDmi; parts.pgFront = pgFront;
    if (!pr) parts.pgDeck = pgDeck;
    if (!pr && !hy) parts.pgMast = pgMast;

    if (pr) {
      rearFrame.visible = true;
      parts.pass = rearCableEntries(scene, deckY + 0.12, L + 0.25);
      // survey LiDAR and 360 head ride the mast
      const prLidar = new THREE.Group();
      tube(prLidar, M.sensor, 0.085, 0.14, 0, deckY + 0.42, L + 0.50);
      tube(prLidar, M.gold, 0.088, 0.035, 0, deckY + 0.45, L + 0.50);
      scene.add(prLidar); parts.lidar = prLidar;
      // imaging on the deck: forward pair plus a rear-facing pair
      const prCams = new THREE.Group();
      [-0.42, 0.42].forEach(x => {
        box(prCams, M.sensor, 0.13, 0.10, 0.16, x, deckY + 0.13, L + 0.16);
        tube(prCams, M.lens, 0.034, 0.03, x, deckY + 0.13, L + 0.07, 'z');
        box(prCams, M.sensor, 0.13, 0.10, 0.16, x, deckY + 0.13, zBack - 0.16);
        tube(prCams, M.lens, 0.034, 0.03, x, deckY + 0.13, zBack - 0.07, 'z');
      });
      scene.add(prCams); parts.cameras = prCams;
      // GNSS pair on the deck, baseline across the width for heading
      const prGnss = new THREE.Group();
      [-0.70, 0.70].forEach(x => tube(prGnss, M.shell, 0.085, 0.05, x, deckY + 0.11, L + 0.78));
      box(prGnss, M.sensor, 0.18, 0.09, 0.16, 0, deckY + 0.12, L + 0.78);
      scene.add(prGnss); parts.gnss = prGnss;
      // the gantry itself is what carries the package
      parts.beam = pgDeck;
    }

    /* ---------------------------- environment ---------------------------- */
    const shadowMat = new THREE.ShadowMaterial({ opacity: 0.16 });
    owned.push(shadowMat);
    const shadowPlane = add(scene, new THREE.PlaneGeometry(22, 22), shadowMat, 0, 0, L / 2, false);
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.receiveShadow = true;

    const gridTex = (() => {
      const s = 1024, c = document.createElement('canvas');
      c.width = c.height = s;
      const g = c.getContext('2d')!;
      g.strokeStyle = '#000';
      for (let i = 0; i <= 40; i++) {
        const p = (i / 40) * s;
        g.lineWidth = i % 5 === 0 ? 2.4 : 1;
        g.beginPath(); g.moveTo(p, 0); g.lineTo(p, s); g.stroke();
        g.beginPath(); g.moveTo(0, p); g.lineTo(s, p); g.stroke();
      }
      const fade = g.createRadialGradient(s / 2, s / 2, s * 0.08, s / 2, s / 2, s * 0.47);
      fade.addColorStop(0, 'rgba(0,0,0,1)');
      fade.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalCompositeOperation = 'destination-in';
      g.fillStyle = fade; g.fillRect(0, 0, s, s);
      return new THREE.CanvasTexture(c);
    })();
    const gridMat = new THREE.MeshBasicMaterial({ map: gridTex, color: 0x33506a, transparent: true, opacity: 0.18, depthWrite: false });
    owned.push(gridMat);
    const grid = add(scene, new THREE.PlaneGeometry(40, 40), gridMat, 0, 0.002, L / 2, false);
    grid.rotation.x = -Math.PI / 2;

    const limit = new THREE.Group();
    limit.visible = false;
    scene.add(limit);
    const limitMat = new THREE.MeshBasicMaterial({ color: 0xb04a2c, transparent: true, opacity: 0.15, side: THREE.DoubleSide, depthWrite: false });
    owned.push(limitMat);
    const limitPlane = add(limit, new THREE.PlaneGeometry(4.8, L + 2.2), limitMat, 0, LIMIT_Y, L / 2, false);
    limitPlane.rotation.x = -Math.PI / 2;
    const edgeMat = new THREE.LineBasicMaterial({ color: 0xb04a2c });
    owned.push(edgeMat);
    limit.add(new THREE.LineLoop(keep(new THREE.BufferGeometry().setAttribute('position',
      new THREE.Float32BufferAttribute([-2.4, LIMIT_Y, -1.1, 2.4, LIMIT_Y, -1.1, 2.4, LIMIT_Y, L + 1.1, -2.4, LIMIT_Y, L + 1.1], 3))), edgeMat));

    /* anchor every pin on the part it labels, measured from the built geometry */
    scene.updateMatrixWorld(true);
    const anchors: Partial<Record<Part, THREE.Vector3>> = {};
    const measure = new THREE.Box3();
    const mid = new THREE.Vector3();
    (Object.keys(parts) as Part[]).forEach(id => {
      const part = anchorOn[id] ?? parts[id];
      if (!part) return;
      measure.setFromObject(part).getCenter(mid);
      const high = tags[id].views.includes('roof') || tags[id].tone === 'reference';
      anchors[id] = new THREE.Vector3(mid.x, high ? measure.max.y + 0.09 : mid.y, mid.z);
    });

    /* rear doors swung to 90 degrees: the leaves sweep exactly where a rear frame wants to stand */
    const doorSwing = new THREE.Group();
    doorSwing.visible = false;
    scene.add(doorSwing);
    const doorHalf = REAR_DOOR_W / 2;
    const swingMat = new THREE.MeshBasicMaterial({ color: 0xb04a2c, transparent: true, opacity: 0.20, side: THREE.DoubleSide, depthWrite: false });
    owned.push(swingMat);
    const arcMat = new THREE.LineBasicMaterial({ color: 0xb04a2c });
    owned.push(arcMat);
    [-1, 1].forEach(sd => {
      const leaf = new THREE.Mesh(keep(new THREE.PlaneGeometry(doorHalf, REAR_DOOR_H)), swingMat);
      leaf.rotation.y = Math.PI / 2;
      leaf.position.set(sd * doorHalf, F + REAR_DOOR_H / 2, L + doorHalf / 2);
      doorSwing.add(leaf);
      const pts: number[] = [];
      for (let i = 0; i <= 20; i++) {
        const th = (i / 20) * Math.PI / 2;
        pts.push(sd * doorHalf * (1 - Math.cos(th)), 0.03, L + doorHalf * Math.sin(th));
      }
      doorSwing.add(new THREE.Line(keep(new THREE.BufferGeometry().setAttribute('position',
        new THREE.Float32BufferAttribute(pts, 3))), arcMat));
    });

    const outline = new THREE.Box3Helper(new THREE.Box3(), new THREE.Color(0xb3a369));
    outline.visible = false;
    scene.add(outline);

    /* -------------------------------- views ------------------------------- */
    const VIEWS: Record<View, { pos: THREE.Vector3; target: THREE.Vector3; inside: boolean; shell: number }> = {
      exterior: { pos: new THREE.Vector3(8.3, 4.5, L + 5.8), target: new THREE.Vector3(0, 1.28, L * 0.54), inside: false, shell: 1 },
      roof: { pos: new THREE.Vector3(0, 12, L * 0.50), target: new THREE.Vector3(0, 1.55, L * 0.50), inside: false, shell: 1 },
      plan: { pos: new THREE.Vector3(0, 12, L * 0.50), target: new THREE.Vector3(0, 1.55, L * 0.50), inside: true, shell: 0.05 },
      interior: { pos: new THREE.Vector3(0.85, 1.88, L + 3.25), target: new THREE.Vector3(0, 1.02, L * 0.52), inside: true, shell: 0.07 },
      rear: { pos: new THREE.Vector3(5.6, 3.0, L + 6.4), target: new THREE.Vector3(0, 1.55, L * 0.82), inside: false, shell: 1 },
    };
    const fade = [M.paint, M.glass, M.trim, M.lamp, M.tyre, M.rim];
    fade.forEach(m => { m.transparent = true; });

    let currentView: View = view;
    grid.visible = !flat(view);
    shadowPlane.visible = !flat(view);
    let wantShell = VIEWS[view].shell;
    const wantPos = VIEWS[view].pos.clone();
    const wantTarget = VIEWS[view].target.clone();
    camera.position.copy(wantPos);
    controls.target.copy(wantTarget);
    controls.update();
    inside.visible = VIEWS[view].inside;
    limit.visible = showLimit;
    rearFrame.visible = pr || hy || showRearFrame;
    requested.visible = showRequested && !pr;

    /* re-bake the shadow map only when what casts shadows actually changes */
    const bumpShadows = () => { renderer.shadowMap.needsUpdate = true; };
    bumpShadows();

    /* the camera animates only while flying to a preset; any drag hands it back */
    let flying = false;
    controls.addEventListener('start', () => { flying = false; });

    const forward = new THREE.Vector3();
    const proj = new THREE.Vector3();
    const world = new THREE.Vector3();
    const ray = new THREE.Raycaster();
    const dir = new THREE.Vector3();
    const pointer = new THREE.Vector2();
    const pickPoint = (clientX: number, clientY: number) => {
      const rect = cv.getBoundingClientRect();
      pointer.set((clientX - rect.left) / rect.width * 2 - 1, 1 - (clientY - rect.top) / rect.height * 2);
      ray.setFromCamera(pointer, camera);
      if (currentView !== 'roof') {
        const targets = currentView === 'interior' ? [inside] : scene.children.filter(o => o !== grid && o !== shadowPlane && o !== limit && o !== outline);
        const hit = ray.intersectObjects(targets, true).find(h => {
          let node: THREE.Object3D | null = h.object;
          while (node && node !== scene) { if (!node.visible) return false; node = node.parent; }
          return true;
        });
        if (hit) return hit.point;
      }
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(currentView === 'interior' ? F + 0.75 : H + 0.03));
      const point = new THREE.Vector3();
      return ray.ray.intersectPlane(plane, point) ? point : null;
    };

    const project = () => {
      const w = el.clientWidth, h = el.clientHeight;
      camera.getWorldDirection(forward);
      const next: Record<string, Screen> = {};
      (Object.keys(tags) as Part[]).forEach(id => {
        const tag = tags[id];
        if (!tag.views.includes(currentView)) return;
        if (tag.tone === 'requested' && !requested.visible) return;
        if (tag.tone === 'reference' && !rearFrame.visible) return;
        let walk: THREE.Object3D | null | undefined = parts[id];
        while (walk && walk !== scene) { if (!walk.visible) return; walk = walk.parent; }
        const anchor = anchors[id];
        if (!anchor) return;
        world.copy(anchor);
        proj.copy(world).project(camera);
        let visible = proj.z > -1 && proj.z < 1 && Math.abs(proj.x) < 1.02 && Math.abs(proj.y) < 1.02;
        if (visible && currentView !== 'interior') {
          dir.copy(world).sub(camera.position);
          const dist = dir.length();
          ray.set(camera.position, dir.normalize());
          const hit = ray.intersectObject(shell, false)[0];
          if (hit && hit.distance + 0.14 < dist) visible = false;
        }
        const sx = (proj.x + 1) * 0.5 * w, sy = (1 - proj.y) * 0.5 * h;
        next[id] = { x: sx, y: sy, ax: sx, ay: sy, visible };
      });
      const live = Object.keys(next).filter(k => next[k].visible);
      if (live.length) {
        let cx = 0, cy = 0;
        live.forEach(k => { cx += next[k].ax; cy += next[k].ay; });
        cx /= live.length; cy /= live.length;
        live.forEach(k => {
          const p = next[k];
          let dx = p.ax - cx, dy = p.ay - cy - 26;
          const d = Math.hypot(dx, dy) || 1;
          p.x = p.ax + (dx / d) * 46;
          p.y = p.ay + (dy / d) * 46;
        });
      }
      for (let pass = 0; pass < 3; pass++) {
        for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
          const a = next[live[i]], c = next[live[j]];
          let ddx = c.x - a.x, ddy = c.y - a.y, d = Math.hypot(ddx, ddy);
          if (d > 34) continue;
          if (d < 0.01) { ddx = 1; ddy = 0; d = 1; }
          const push = (34 - d) / 2;
          a.x -= ddx / d * push; a.y -= ddy / d * push;
          c.x += ddx / d * push; c.y += ddy / d * push;
        }
      }
      setPositions(next);

      const custom: Record<string, Screen> = {};
      annotationRef.current.forEach(mark => {
        if ((mark.view === 'interior') !== (currentView === 'interior')) return;
        proj.set(...mark.point).project(camera);
        const x = (proj.x + 1) * 0.5 * w, y = (1 - proj.y) * 0.5 * h;
        custom[mark.id] = { x, y, ax: x, ay: y, visible: proj.z > -1 && proj.z < 1 && x > 12 && x < w - 12 && y > 12 && y < h - 12 };
      });
      setAnnotationPositions(custom);

      const ends: Record<string, Screen> = {};
      ([['front', -0.78], ['rear', L + 0.78]] as [string, number][]).forEach(([id, z]) => {
        proj.set(0, 0.30, z).project(camera);
        const ex = (proj.x + 1) * 0.5 * w, ey = (1 - proj.y) * 0.5 * h;
        ends[id] = { x: ex, y: ey, ax: ex, ay: ey, visible: proj.z < 1 && Math.abs(proj.x) < 1.05 && Math.abs(proj.y) < 1.05 };
      });
      setAxis(ends);
    };

    let raf = 0;
    const tick = () => {
      raf = 0;
      if (document.hidden) return;
      if (flying) {
        camera.position.lerp(wantPos, 0.09);
        controls.target.lerp(wantTarget, 0.09);
        if (camera.position.distanceToSquared(wantPos) < 2e-5 &&
            controls.target.distanceToSquared(wantTarget) < 2e-5) flying = false;
      }
      const moved = controls.update();

      const o = M.paint.opacity + (wantShell - M.paint.opacity) * 0.12;
      fade.forEach(m => {
        m.opacity = m === M.glass ? Math.min(o, 0.9) : o;
        m.depthWrite = o > 0.9;
      });
      shadowMat.opacity = 0.16 * Math.max(0, (o - 0.15) / 0.85);
      cutaway();
      renderer.render(scene, camera);
      project();
      if (flying || moved || Math.abs(o - wantShell) > 0.001) wake();
    };
    const wake = () => { if (!raf && !document.hidden) raf = requestAnimationFrame(tick); };
    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      perspectiveCamera.aspect = w / h;
      perspectiveCamera.updateProjectionMatrix();
      // Fit the whole van across the roof plan without perspective distortion.
      const halfWidth = Math.max((L + 1.5) / 2, 2.45 * w / h);
      roofCamera.left = -halfWidth;
      roofCamera.right = halfWidth;
      roofCamera.top = halfWidth * h / w;
      roofCamera.bottom = -roofCamera.top;
      roofCamera.updateProjectionMatrix();
      wake();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    controls.addEventListener('change', wake);
    resize();
    const repaint = () => { bumpShadows(); wake(); };
    document.addEventListener('visibilitychange', repaint);
    cv.addEventListener('webglcontextrestored', repaint);
    wake();

    api.current = {
      setView: v => {
        currentView = v;
        grid.visible = v !== 'roof';
        shadowPlane.visible = v !== 'roof';
        const nextCamera = flat(v) ? roofCamera : perspectiveCamera;
        if (camera !== nextCamera) {
          camera = nextCamera;
          controls.object = camera;
          camera.position.copy(VIEWS[v].pos);
          controls.target.copy(VIEWS[v].target);
          controls.update();
        }
        wantPos.copy(VIEWS[v].pos);
        wantTarget.copy(VIEWS[v].target);
        wantShell = VIEWS[v].shell;
        inside.visible = VIEWS[v].inside;
        flying = true;
        bumpShadows();
        wake();
      },
      setLimit: on => { limit.visible = on; bumpShadows(); wake(); },
      setRear: on => { rearFrame.visible = pr || hy || on; bumpShadows(); wake(); },
      setRequested: on => { requested.visible = on && !pr; bumpShadows(); wake(); },
      setDoorSwing: on => { doorSwing.visible = on; wake(); },
      setProvision: on => { provision.visible = on; bumpShadows(); wake(); },
      highlight: p => {
        const target = p ? parts[p] : null;
        if (!target || !target.visible) outline.visible = false;
        else { outline.box.setFromObject(target).expandByScalar(0.06); outline.visible = true; }
        wake();
      },
      addAt: (x, y) => {
        const point = pickPoint(x, y);
        if (point) actionRef.current.onAddAnnotation(point.toArray() as Annotation['point'], currentView);
      },
      moveAt: (id, x, y) => {
        const point = pickPoint(x, y);
        if (point) actionRef.current.onMoveAnnotation(id, point.toArray() as Annotation['point']);
      },
      setDragging: dragging => { controls.enabled = !dragging; },
      redraw: wake,
    };

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener('visibilitychange', repaint);
      cv.removeEventListener('webglcontextrestored', repaint);
      controls.removeEventListener('change', wake);
      controls.dispose();
      geoms.forEach(g => g.dispose());
      owned.forEach(m => m.dispose());
      gridTex.dispose();
      renderer.dispose();
      api.current = null;
    };
  }, [body, layout, phase, seatSide, gantryLevel]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { api.current?.setView(view); }, [view]);
  useEffect(() => { api.current?.setLimit(showLimit); }, [showLimit]);
  useEffect(() => { api.current?.setRear(showRearFrame); }, [showRearFrame]);
  useEffect(() => { api.current?.setRequested(showRequested); }, [showRequested]);
  useEffect(() => { api.current?.setDoorSwing(showDoorSwing); }, [showDoorSwing]);
  useEffect(() => { api.current?.setProvision(showProvision); }, [showProvision]);
  useEffect(() => { api.current?.highlight(selected); }, [selected, view, showRearFrame]);
  useEffect(() => { api.current?.redraw(); }, [annotations]);

  return (
    <div className={`van-stage ${addMode ? 'placing-point' : ''}`} ref={host}>
      <canvas ref={canvas} aria-label="Interactive 3D Ford Transit buildout model"
        onPointerDown={e => { canvasDownRef.current = [e.clientX, e.clientY]; }}
        onClick={e => {
          const start = canvasDownRef.current;
          canvasDownRef.current = null;
          if (addMode && start && Math.hypot(e.clientX - start[0], e.clientY - start[1]) < 5) api.current?.addAt(e.clientX, e.clientY);
        }} />
      <svg className="pin-leaders" aria-hidden="true">
        {showPins && (Object.entries(positions) as [Part, Screen][]).map(([id, pos]) => pos.visible && (
          <line key={id} x1={pos.ax} y1={pos.ay} x2={pos.x} y2={pos.y} />
        ))}
      </svg>
      <button type="button" className="pin-toggle" onClick={() => setShowPins(v => !v)}>
        {showPins ? 'Hide labels' : 'Show labels'}
      </button>
      <div className="pin-layer">
        {showPins && (Object.entries(positions) as [Part, Screen][]).map(([id, pos]) => pos.visible && (
          <button
            key={id}
            type="button"
            className={`pin pin-${tags[id].tone} ${selected === id ? 'selected' : ''}`}
            style={{ left: pos.x, top: pos.y }}
            onClick={() => onSelect(id)}
            aria-label={`Show ${tags[id].label} details`}
          >{tags[id].label}</button>
        ))}
      </div>
      <div className="pin-layer">
        {annotations.map((mark, index) => {
          const pos = annotationPositions[mark.id];
          return pos?.visible && <button key={mark.id} type="button"
            className={`pin custom-pin ${selectedAnnotation === mark.id ? 'selected' : ''}`}
            style={{ left: pos.x, top: pos.y }} title={mark.name}
            aria-label={`Edit ${mark.name}; drag to move`}
            onPointerDown={e => {
              e.stopPropagation();
              e.currentTarget.setPointerCapture(e.pointerId);
              dragRef.current = { id: mark.id, x: e.clientX, y: e.clientY, moved: false };
              api.current?.setDragging(true);
            }}
            onPointerMove={e => {
              const drag = dragRef.current;
              if (!drag || drag.id !== mark.id) return;
              if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 4) drag.moved = true;
              if (drag.moved) api.current?.moveAt(mark.id, e.clientX, e.clientY);
            }}
            onPointerUp={e => {
              e.stopPropagation();
              dragRef.current = null;
              api.current?.setDragging(false);
              onSelectAnnotation(mark.id);
            }}
            onPointerCancel={() => { dragRef.current = null; api.current?.setDragging(false); }}
          >U{index + 1}</button>;
        })}
      </div>
      <div className="pin-layer">
        {(['front', 'rear'] as const).map(id => axis[id]?.visible && (
          <div key={id} className="axis-tag" style={{ left: axis[id].x, top: axis[id].y }}>
            {id === 'front' ? 'FRONT / 车头' : 'REAR / 车尾'}
          </div>
        ))}
      </div>
      <div className="stage-scale">FORD ENVELOPE &middot; METRES &middot; EQUIPMENT POSITION CONCEPTUAL</div>
    </div>
  );
}
