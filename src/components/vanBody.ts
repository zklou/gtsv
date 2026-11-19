import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* A high-roof Transit built from lofted cross-sections. Side profile follows Ford's published
   envelope; surface detail follows the photo of unit 1705. Shapes are visual, not measured. */

type Pt = [number, number];
export type VanSpec = { length: number; height: number; frontAxle: number; rearAxle: number; wheelR: number; trackF: number; trackR: number };
export type VanMaterials = Record<'paint' | 'glass' | 'trim' | 'lamp' | 'tyre' | 'rim', THREE.Material>;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const smooth = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/** Smooth interpolation through knots. */
function table(knots: Pt[]) {
  const n = knots.length;
  const slope = (i: number) => {
    const a = knots[Math.max(0, i - 1)], b = knots[Math.min(n - 1, i + 1)];
    return (b[1] - a[1]) / (b[0] - a[0]);
  };
  return (x: number) => {
    if (x <= knots[0][0]) return knots[0][1];
    if (x >= knots[n - 1][0]) return knots[n - 1][1];
    let i = 0;
    while (knots[i + 1][0] < x) i++;
    const [x0, y0] = knots[i], [x1, y1] = knots[i + 1];
    const h = x1 - x0, t = (x - x0) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * slope(i) + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * slope(i + 1);
  };
}

function roundCorners(points: Pt[], radius: number) {
  const out: Pt[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const [a, p, b] = [points[i - 1], points[i], points[i + 1]];
    const la = Math.hypot(a[0] - p[0], a[1] - p[1]), lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
    const d = Math.min(radius, la * 0.45, lb * 0.45);
    const s: Pt = [p[0] + (a[0] - p[0]) / la * d, p[1] + (a[1] - p[1]) / la * d];
    const e: Pt = [p[0] + (b[0] - p[0]) / lb * d, p[1] + (b[1] - p[1]) / lb * d];
    for (let k = 0; k <= 8; k++) {
      const t = k / 8, u = 1 - t;
      out.push([u * u * s[0] + 2 * u * t * p[0] + t * t * e[0], u * u * s[1] + 2 * u * t * p[1] + t * t * e[1]]);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

function polyline(points: Pt[]) {
  return (x: number) => {
    if (x <= points[0][0]) return points[0][1];
    for (let i = 1; i < points.length; i++) {
      if (x <= points[i][0]) {
        const [x0, y0] = points[i - 1], [x1, y1] = points[i];
        return x1 === x0 ? y1 : lerp(y0, y1, (x - x0) / (x1 - x0));
      }
    }
    return points[points.length - 1][1];
  };
}

function hexTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 148;
  const g = c.getContext('2d')!;
  g.fillStyle = '#23272b';
  g.fillRect(0, 0, 128, 148);
  g.fillStyle = '#040506';
  const cell = (cx: number, cy: number) => {
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + i * Math.PI / 3;
      g.lineTo(cx + Math.cos(a) * 33, cy + Math.sin(a) * 33);
    }
    g.closePath();
    g.fill();
  };
  [[0, 0], [128, 0], [64, 37], [0, 74], [128, 74], [64, 111], [0, 148], [128, 148]].forEach(([x, y]) => cell(x, y));
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function buildVanBody(spec: VanSpec, M: VanMaterials, options: { roofRibs: boolean }) {
  const L = spec.length, H = spec.height, Z0 = 0.042;
  const ARCH_R = 0.445;
  const axles = [spec.frontAxle, spec.rearAxle];
  const group = new THREE.Group();

  const std = (color: number, roughness: number, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness, side: THREE.DoubleSide, ...extra });
  const hexMap = hexTexture();
  const mat = {
    hex: std(0xffffff, 0.42, 0.25, { map: hexMap }),
    seam: std(0x08090a, 0.8),
    arch: std(0x0b0c0d, 0.9),
    chrome: std(0xd9dde0, 0.14, 1),
    lampInner: std(0x0b0d0f, 0.42, 0.15),
    steel: std(0xaeb4b8, 0.34, 0.85),
    amber: std(0xd9791a, 0.28, 0.1, { emissive: 0x7a3a06, emissiveIntensity: 0.35 }),
    red: std(0x8e1313, 0.22, 0.1, { emissive: 0x4a0505, emissiveIntensity: 0.5 }),
    drl: std(0xffffff, 0.3, 0, { emissive: 0xfff1d8, emissiveIntensity: 3.2 }),
    blue: std(0x10356f, 0.25, 0.4),
    rib: (M.paint as THREE.MeshPhysicalMaterial).clone(),
  };
  mat.rib.side = THREE.DoubleSide;
  M.trim.side = THREE.DoubleSide;

  /* ------------------------------ cross-sections ------------------------------ */
  const topLine = polyline(roundCorners([
    [Z0, 1.02], [0.098, 1.175], [0.245, 1.262], [0.6, 1.338], [1.02, 1.428], [1.78, 2.205], [1.955, 2.432],
    [2.175, 2.652], [2.42, 2.778], [2.69, H], [L - 0.3, H], [L - 0.11, H - 0.032], [L - 0.02, H - 0.124], [L, H - 0.3],
  ], 0.09));
  const beltW = table([[Z0, 0.8], [0.22, 0.93], [0.55, 0.99], [1, 1.02], [1.6, 1.03], [L - 0.5, 1.03], [L - 0.1, 1.015], [L, 0.99]]);
  const roofW = table([[Z0, 0.5], [0.25, 0.66], [0.62, 0.72], [1.02, 0.76], [1.4, 0.75], [1.78, 0.74], [2.4, 0.75], [3, 0.76], [L - 0.3, 0.76], [L, 0.7]]);
  const shoulderR = table([[Z0, 0.07], [0.3, 0.12], [1.02, 0.14], [1.78, 0.1], [2.5, 0.16], [3.1, 0.18], [L - 0.3, 0.18], [L, 0.14]]);
  const crownH = table([[Z0, 0.03], [0.3, 0.07], [1.02, 0.07], [1.4, 0.085], [1.78, 0.07], [2.5, 0.045], [L, 0.04]]);
  const sillY = table([[Z0, 0.76], [0.075, 0.6], [0.12, 0.52], [0.5, 0.5], [1.5, 0.47], [L - 0.45, 0.49], [L - 0.1, 0.56], [L, 0.62]]);
  const beltY = table([[Z0, 0.92], [0.5, 1.14], [1, 1.36], [1.6, 1.46], [L, 1.47]]);

  const section = (z: number) => {
    const yt = topLine(z), yb = sillY(z), w = beltW(z), xs = roofW(z), cr = crownH(z);
    const rs = Math.min(shoulderR(z), (yt - yb) * 0.3);
    const ys = yt - cr - rs, xe = Math.min(w - 0.02, xs + rs * 0.9);
    return { yt, yb, w, xs, cr, rs, ys, xe, yBelt: Math.min(beltY(z), ys - 0.03) };
  };
  type Section = ReturnType<typeof section>;

  const sideX = (s: Section, y: number, z: number) => {
    const x = y >= s.yBelt
      ? lerp(s.w, s.xe, clamp01((y - s.yBelt) / Math.max(0.001, s.ys - s.yBelt)) ** 1.25)
      : s.w - 0.045 * clamp01((s.yBelt - y) / Math.max(0.001, s.yBelt - s.yb)) ** 2.4;
    const cargo = smooth(2.7, 3.1, z) * (1 - smooth(L - 0.25, L - 0.05, z));
    const panel = smooth(1.08, 1.16, y) * (1 - smooth(1.9, 2.02, y));
    return x - 0.016 * cargo * smooth(2.12, 2.19, y) + 0.007 * cargo * Math.exp(-(((y - 1.03) / 0.035) ** 2)) - 0.007 * cargo * panel;
  };

  const TOP = 10, SHOULDER = 10, SIDE = 46;
  const ringCache = new Map<number, Pt[]>();
  const ring = (z: number) => {
    const key = Math.round(z * 4000);
    const hit = ringCache.get(key);
    if (hit) return hit;
    const s = section(z), pts: Pt[] = [];
    for (let i = 0; i <= TOP; i++) { const t = i / TOP; pts.push([s.xs * t, s.yt - s.cr * t * t]); }
    const xEnd = sideX(s, s.ys, z), y0 = s.yt - s.cr;
    for (let i = 1; i <= SHOULDER; i++) {
      const t = i / SHOULDER, u = 1 - t;
      pts.push([u * u * s.xs + 2 * u * t * xEnd + t * t * xEnd, u * u * y0 + 2 * u * t * y0 + t * t * s.ys]);
    }
    for (let i = 1; i <= SIDE; i++) {
      const y = s.yb + (s.ys - s.yb) * (1 - i / SIDE) ** 1.55;
      pts.push([sideX(s, y, z), y]);
    }
    pts.push([pts[pts.length - 1][0] - 0.06, s.yb], [0, s.yb]);
    ringCache.set(key, pts);
    return pts;
  };

  /** Nose and tail curve in plan view: corners sit further back than the centre line. */
  const warpZ = (x: number, z: number) => {
    const r = Math.min(1, Math.abs(x) / beltW(z));
    return z + 0.19 * (1 - smooth(Z0, 1.25, z)) * r ** 2.3 - 0.05 * smooth(L - 0.6, L, z) * r ** 6;
  };
  const place = (x: number, y: number, z: number): [number, number, number] => {
    let pz = warpZ(x, z), py = y, px = x;
    if (Math.abs(x) > 0.5 && y < 1.05) {
      for (const a of axles) {
        const dz = pz - a, dy = py - spec.wheelR, d = Math.hypot(dz, dy);
        if (d < ARCH_R) { pz = a + dz / d * ARCH_R; py = spec.wheelR + dy / d * ARCH_R; }
        else if (d < ARCH_R + 0.07) px += Math.sign(x) * 0.014 * (1 - (d - ARCH_R) / 0.07);
      }
    }
    return [px, py, pz];
  };

  /* ------------------------------ painted shell ------------------------------- */
  const stations: number[] = [];
  for (let z = Z0; z < L; z += z < 0.34 || z > L - 0.34 ? 0.012 : 0.022) stations.push(z);
  stations.push(L);

  const buildShell = () => {
    const n = ring(Z0).length, columns = 2 * n - 2;
    const pos: number[] = [], index: number[] = [];
    const pushRing = (z: number) => {
      const pts = ring(z);
      for (let j = 0; j < n; j++) pos.push(...place(pts[j][0], pts[j][1], z));
      for (let j = n - 2; j > 0; j--) pos.push(...place(-pts[j][0], pts[j][1], z));
    };
    stations.forEach(pushRing);
    for (let i = 0; i < stations.length - 1; i++) for (let j = 0; j < columns; j++) {
      const a = i * columns + j, b = i * columns + (j + 1) % columns, c = a + columns, d = b + columns;
      index.push(a, c, b, b, c, d);
    }
    const loft = new THREE.BufferGeometry();
    loft.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    loft.setIndex(index);
    loft.computeVertexNormals();
    const probe = (Math.floor(stations.length / 2)) * columns + TOP + SHOULDER + 20;
    if (loft.attributes.normal.getX(probe) < 0) {
      for (let i = 0; i < index.length; i += 3) [index[i + 1], index[i + 2]] = [index[i + 2], index[i + 1]];
      loft.setIndex(index);
      loft.computeVertexNormals();
    }
    const cap = (z: number, facing: number) => {
      const pts = ring(z), s = section(z), outline: Pt[] = [...pts];
      for (let j = n - 2; j > 0; j--) outline.push([-pts[j][0], pts[j][1]]);
      const cy = (s.yt + s.yb) / 2, capPos: number[] = [], capIndex: number[] = [], LAYERS = 8;
      for (let k = 0; k < LAYERS; k++) outline.forEach(([x, y]) => {
        const t = k / LAYERS, px = x * (1 - t);
        capPos.push(px, lerp(y, cy, t), warpZ(px, z));
      });
      capPos.push(0, cy, z);
      const count = outline.length, centre = LAYERS * count;
      for (let k = 0; k < LAYERS; k++) for (let j = 0; j < count; j++) {
        const a = k * count + j, b = k * count + (j + 1) % count;
        if (k === LAYERS - 1) capIndex.push(a, b, centre);
        else capIndex.push(a, b, a + count, b, b + count, a + count);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(capPos, 3));
      g.setIndex(capIndex);
      g.computeVertexNormals();
      if (g.attributes.normal.getZ(centre) * facing < 0) {
        for (let i = 0; i < capIndex.length; i += 3) [capIndex[i + 1], capIndex[i + 2]] = [capIndex[i + 2], capIndex[i + 1]];
        g.setIndex(capIndex);
        g.computeVertexNormals();
      }
      return g;
    };
    const merged = mergeGeometries([loft, cap(Z0, -1), cap(L, 1)])!;
    loft.dispose();
    return merged;
  };
  const shell = new THREE.Mesh(buildShell(), M.paint);
  shell.castShadow = true;
  shell.receiveShadow = true;
  group.add(shell);

  /* ------------------------------ surface decals ------------------------------ */
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const queue = (m: THREE.Material, g: THREE.BufferGeometry) => { if (!batches.has(m)) batches.set(m, []); batches.get(m)!.push(g); };
  const gridGeometry = (positions: number[], uvs: number[], nu: number, nv: number) => {
    const index: number[] = [];
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const a = i * (nv + 1) + j, b = a + 1, c = a + nv + 1, d = c + 1;
      index.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(index);
    g.computeVertexNormals();
    return g;
  };

  const arcCache = new Map<number, number[]>();
  const arcs = (z: number) => {
    const key = Math.round(z * 4000);
    let cum = arcCache.get(key);
    if (!cum) {
      const pts = ring(z);
      cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      arcCache.set(key, cum);
    }
    return cum;
  };
  /** Point at arc length s from the roof centre line, lifted off the surface. */
  const surface = (z: number, s: number, off: number, side: number): [number, number, number] => {
    const pts = ring(z), cum = arcs(z);
    let i = 0;
    while (i < cum.length - 2 && cum[i + 1] < s) i++;
    const t = clamp01((s - cum[i]) / Math.max(1e-6, cum[i + 1] - cum[i]));
    const tx = pts[i + 1][0] - pts[i][0], ty = pts[i + 1][1] - pts[i][1], l = Math.hypot(tx, ty) || 1;
    const x = lerp(pts[i][0], pts[i + 1][0], t) - ty / l * off, y = lerp(pts[i][1], pts[i + 1][1], t) + tx / l * off;
    return [side * x, y, warpZ(x, z)];
  };
  const arcAtY = (z: number, y: number) => {
    const pts = ring(z), cum = arcs(z);
    for (let i = TOP; i < pts.length - 3; i++) {
      if (pts[i][1] >= y && pts[i + 1][1] <= y) return lerp(cum[i], cum[i + 1], (pts[i][1] - y) / Math.max(1e-6, pts[i][1] - pts[i + 1][1]));
    }
    return cum[pts.length - 3];
  };
  type DecalOptions = { nz?: number; ns?: number; off?: number; sides?: number[]; uvScale?: number };
  const decal = (m: THREE.Material, z0: number, z1: number, a: (z: number) => number, b: (z: number) => number, o: DecalOptions = {}) => {
    const { nz = 36, ns = 8, off = 0.006, sides = [1, -1], uvScale = 1 } = o;
    sides.forEach(side => {
      const positions: number[] = [], uvs: number[] = [];
      for (let i = 0; i <= nz; i++) {
        const z = lerp(z0, z1, i / nz), sa = a(z), sb = b(z);
        for (let j = 0; j <= ns; j++) {
          const s = lerp(sa, sb, j / ns);
          positions.push(...surface(z, s, off, side));
          uvs.push(z * uvScale, s * uvScale);
        }
      }
      queue(m, gridGeometry(positions, uvs, nz, ns));
    });
  };
  const onSide = (m: THREE.Material, z0: number, z1: number, low: (z: number) => number, high: (z: number) => number, o: DecalOptions = {}) =>
    decal(m, z0, z1, z => arcAtY(z, high(z)), z => arcAtY(z, low(z)), o);
  const fixed = (v: number) => () => v;

  /** Horizontal contour of the nose at height y, from the centre line outwards. */
  const contourCache = new Map<number, { pts: Pt[]; cum: number[] }>();
  const xAtHeight = (z: number, y: number) => {
    const pts = ring(z);
    if (y > pts[0][1]) return null;
    for (let i = 0; i < pts.length - 3; i++) {
      if (pts[i][1] >= y && pts[i + 1][1] <= y) return lerp(pts[i][0], pts[i + 1][0], (pts[i][1] - y) / Math.max(1e-6, pts[i][1] - pts[i + 1][1]));
    }
    return null;
  };
  const contour = (height: number) => {
    const key = Math.round(height * 1000);
    const hit = contourCache.get(key);
    if (hit) return hit;
    const y = key / 1000, pts: Pt[] = [];
    const first = xAtHeight(Z0, y);
    if (first !== null) for (let k = 0; k <= 20; k++) { const x = first * k / 20; pts.push([x, warpZ(x, Z0)]); }
    for (let z = Z0 + 0.012; z < 1.5; z += 0.012) {
      const x = xAtHeight(z, y);
      if (x !== null) pts.push([x, warpZ(x, z)]);
    }
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const result = { pts, cum };
    contourCache.set(key, result);
    return result;
  };
  const aroundNose = (u: number, y: number, off: number, side: number): [number, number, number] => {
    const { pts, cum } = contour(y);
    let i = 0;
    while (i < cum.length - 2 && cum[i + 1] < u) i++;
    const t = clamp01((u - cum[i]) / Math.max(1e-6, cum[i + 1] - cum[i]));
    const tx = pts[i + 1][0] - pts[i][0], tz = pts[i + 1][1] - pts[i][1], l = Math.hypot(tx, tz) || 1;
    return [side * (lerp(pts[i][0], pts[i + 1][0], t) + tz / l * off), y, lerp(pts[i][1], pts[i + 1][1], t) - tx / l * off];
  };
  /** Panel standing just proud of the nose, so it cannot intersect the receding hood lip. */
  const nosePlate = (m: THREE.Material, halfW: number, yLow: number, yHigh: number, off: number, uvScale: number) => {
    const nx = 48, ny = 12, positions: number[] = [], uvs: number[] = [], lip: number[] = [], lipUv: number[] = [];
    for (let i = 0; i <= nx; i++) {
      const x = lerp(-halfW, halfW, i / nx), t = Math.abs(x) / halfW;
      const low = yLow + 0.02 * t, high = yHigh - 0.06 * t ** 3, z = warpZ(x, Z0) - off;
      for (let j = 0; j <= ny; j++) {
        const y = lerp(low, high, j / ny);
        positions.push(x, y, z);
        uvs.push(x * uvScale, y * uvScale);
      }
      lip.push(x, high, z, x, high + 0.008, z + 0.1);
      lipUv.push(i / nx, 0, i / nx, 1);
    }
    queue(m, gridGeometry(positions, uvs, nx, ny));
    queue(m, gridGeometry(lip, lipUv, nx, 1));
  };

  // Windshield with its black ceramic border, cowl and wipers.
  const shieldArc = (z: number) => lerp(0.9, 0.78, smooth(1.04, 1.77, z));
  decal(M.trim, 1.0, 1.8, fixed(0), z => shieldArc(z) + 0.05, { nz: 50, ns: 22, off: 0.005 });
  decal(M.glass, 1.05, 1.74, fixed(0), shieldArc, { nz: 50, ns: 22, off: 0.011 });
  decal(M.trim, 0.965, 1.05, fixed(0), fixed(0.98), { nz: 8, ns: 24, off: 0.012 });

  // Hood vents, shut lines and fender seams.
  decal(mat.hex, 0.72, 0.93, z => 0.15 + (z - 0.72) * 0.12, z => 0.64 - (z - 0.72) * 0.22, { nz: 10, ns: 16, off: 0.006, uvScale: 20 });
  decal(mat.seam, 0.2, 0.208, fixed(0), fixed(0.78), { nz: 2, ns: 20, off: 0.003 });
  decal(mat.seam, 0.2, 0.97, fixed(0.78), fixed(0.787), { nz: 36, ns: 1, off: 0.003 });

  // Cab door glass with a black surround and pillar triangle.
  const glassLow = (z: number) => 1.52 + (z - 1.5) * 0.02;
  const glassHigh = (z: number) => Math.min(2.06, 1.54 + Math.max(0, z - 1.5) * 1.02);
  onSide(M.trim, 1.26, 2.76, z => glassLow(z) - 0.035, z => Math.min(2.1, 1.5 + Math.max(0, z - 1.26) * 0.86), { nz: 50, ns: 14, off: 0.005 });
  onSide(M.glass, 1.52, 2.72, glassLow, glassHigh, { nz: 50, ns: 14, off: 0.011 });

  // Door shut lines; the sliding door and its track are on the right-hand side only.
  const line = (z: number, y0: number, y1: number, sides = [1, -1]) => onSide(mat.seam, z, z + 0.008, fixed(y0), fixed(y1), { nz: 1, ns: 30, off: 0.003, sides });
  const rail = (z0: number, z1: number, y: number, sides = [1, -1], h = 0.008) => onSide(mat.seam, z0, z1, fixed(y), fixed(y + h), { nz: 30, ns: 1, off: 0.003, sides });
  line(2.76, 0.8, 2.14);
  rail(1.5, 2.76, 0.8);
  rail(2.05, 2.76, 2.14);
  line(2.84, 0.8, 2.14, [1]);
  line(4.12, 0.8, 2.14, [1]);
  rail(2.84, 4.12, 0.8, [1]);
  rail(2.84, 4.12, 2.14, [1]);
  rail(4.12, L - 0.34, 1.44, [1], 0.03);

  // Black lower cladding between and behind the wheel arches.
  onSide(M.trim, spec.frontAxle + ARCH_R + 0.03, spec.rearAxle - ARCH_R - 0.03, z => sillY(z) + 0.01, fixed(0.78), { nz: 40, ns: 8, off: 0.009 });
  onSide(M.trim, spec.rearAxle + ARCH_R + 0.03, L - 0.05, z => sillY(z) + 0.01, fixed(0.78), { nz: 20, ns: 8, off: 0.009 });

  // Pressed roof ribs.
  if (options.roofRibs) [0.1, 0.27, 0.44, 0.61].forEach(s =>
    decal(mat.rib, 2.9, L - 0.42, fixed(s), fixed(s + 0.05), { nz: 40, ns: 3, off: 0.009 }));

  // Grille.
  nosePlate(M.trim, 0.6, 0.775, 1.135, 0.012, 1);
  nosePlate(mat.hex, 0.56, 0.8, 1.1, 0.02, 9);

  // Headlamps: a face panel beside the grille, continuing back along the fender.
  const lampStart = Z0 + 0.004, lampEnd = 0.74;
  const lampLowY = (z: number) => lerp(0.99, 1.17, smooth(Z0, lampEnd, z));
  const lampHighY = (z: number) => Math.max(lampLowY(z) + 0.01, Math.min(topLine(z) - 0.11, lerp(1.13, 1.3, smooth(Z0, 0.55, z))));
  const lampLower = (z: number) => arcAtY(z, lampLowY(z));
  const lampUpper = (z: number) => lerp(arcAtY(z, lampHighY(z)), lampLower(z) - 0.01, smooth(0.46, lampEnd, z));
  const lampBand = (from: number) => (z: number) => lerp(lampUpper(z), lampLower(z), from);
  const lampOpts = { nz: 70, ns: 14 };
  decal(mat.lampInner, lampStart, lampEnd, lampUpper, lampLower, { ...lampOpts, off: 0.012 });
  decal(mat.amber, 0.5, 0.66, lampBand(0.18), lampBand(0.84), { nz: 14, ns: 6, off: 0.018 });
  decal(mat.drl, lampStart + 0.02, 0.5, lampBand(0.8), lampBand(0.92), { nz: 40, ns: 2, off: 0.02 });
  decal(M.lamp, lampStart, lampEnd, lampUpper, lampLower, { ...lampOpts, off: 0.03 });
  [1, -1].forEach(side => {
    const face = (m: THREE.Material, off: number, y0: number, y1: number) => {
      const positions: number[] = [], uvs: number[] = [];
      for (let i = 0; i <= 14; i++) {
        const x = lerp(0.6, 0.745, i / 14);
        for (let j = 0; j <= 4; j++) {
          positions.push(side * x, lerp(y0, y1, j / 4), warpZ(x, Z0) - off);
          uvs.push(i / 14, j / 4);
        }
      }
      queue(m, gridGeometry(positions, uvs, 14, 4));
    };
    face(mat.lampInner, 0.014, 0.965, 1.115);
    face(mat.drl, 0.019, 0.975, 0.99);
    face(M.lamp, 0.03, 0.965, 1.115);
  });

  // Wrap-around front bumper swept along the nose contour.
  const bumperProfile: Pt[] = [[-0.005, 0.86], [0.03, 0.835], [0.058, 0.76], [0.052, 0.64], [0.075, 0.56], [0.06, 0.47], [0.015, 0.42], [-0.02, 0.42]];
  {
    const { cum } = contour(0.84), uMax = Math.min(cum[cum.length - 1], 1.08), N = 80, positions: number[] = [], uvs: number[] = [];
    for (let i = 0; i <= N; i++) {
      const v = lerp(-1, 1, i / N), u = Math.abs(v) * uMax, side = v < 0 ? -1 : 1;
      const fade = smooth(1, 0.9, Math.abs(v));
      bumperProfile.forEach(([o, y], j) => {
        positions.push(...aroundNose(u, 0.84, o * fade - 0.01, side).map((c, k) => (k === 1 ? y : c)) as [number, number, number]);
        uvs.push(i / N, j / bumperProfile.length);
      });
    }
    queue(M.trim, gridGeometry(positions, uvs, N, bumperProfile.length - 1));
  }

  batches.forEach((list, m) => {
    const merged = mergeGeometries(list)!;
    list.forEach(g => g.dispose());
    group.add(new THREE.Mesh(merged, m));
  });

  /* ------------------------------ fitted parts ------------------------------- */
  const solid = (m: THREE.Material, g: THREE.BufferGeometry, x = 0, y = 0, z = 0, cast = true) => {
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = cast;
    group.add(mesh);
    return mesh;
  };
  const rounded = (m: THREE.Material, w: number, h: number, d: number, r: number, x: number, y: number, z: number) =>
    solid(m, new RoundedBoxGeometry(w, h, d, 4, Math.min(r, w / 2, h / 2, d / 2)), x, y, z);
  const rod = (m: THREE.Material, from: THREE.Vector3, to: THREE.Vector3, r: number) => {
    const dir = to.clone().sub(from), mesh = solid(m, new THREE.CylinderGeometry(r, r, dir.length(), 10));
    mesh.position.copy(from).addScaledVector(dir, 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    return mesh;
  };
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

  // Wheel wells.
  axles.forEach((a, i) => {
    const liner = solid(mat.arch, new THREE.CylinderGeometry(ARCH_R - 0.004, ARCH_R - 0.004, i ? 2.0 : 1.8, 40, 1, true, 0, Math.PI), 0, spec.wheelR, a, false);
    liner.rotation.z = Math.PI / 2;
    [-1, 1].forEach(s => {
      rounded(mat.arch, 0.02, 0.62, 0.96, 0.005, s * 0.6, 0.58, a);
      // Black arch flare following the opening.
      const positions: number[] = [], uvs: number[] = [], a0 = Math.asin((0.5 - spec.wheelR) / ARCH_R);
      for (let k = 0; k <= 44; k++) {
        const th = lerp(a0, Math.PI - a0, k / 44);
        [ARCH_R - 0.004, ARCH_R + 0.055].forEach((r, j) => {
          const z = a + Math.cos(th) * r, y = spec.wheelR + Math.sin(th) * r;
          positions.push(s * (sideX(section(z), y, z) + 0.022 - j * 0.012), y, z);
          uvs.push(k / 44, j);
        });
      }
      queue(M.trim, gridGeometry(positions, uvs, 44, 1));
      const flare = batches.get(M.trim)!.pop()!;
      group.add(new THREE.Mesh(flare, M.trim));
    });
  });

  // Wheels: tyre, painted steel rim, hub.
  const lathe = (m: THREE.Material, profile: Pt[], parent: THREE.Object3D) => {
    const mesh = new THREE.Mesh(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 72), m);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  ([[spec.frontAxle, spec.trackF], [spec.rearAxle, spec.trackR]] as Pt[]).forEach(([axle, track]) => {
    [-1, 1].forEach(s => {
      const wheel = new THREE.Group();
      wheel.position.set(s * track / 2, spec.wheelR, axle);
      wheel.rotation.z = -s * Math.PI / 2;
      group.add(wheel);
      lathe(M.tyre, [[0.228, 0.08], [0.245, 0.105], [0.3, 0.118], [0.338, 0.11], [0.352, 0.094], [0.356, 0.07], [0.356, -0.07], [0.352, -0.094], [0.338, -0.11], [0.3, -0.118], [0.245, -0.105], [0.228, -0.08]], wheel);
      lathe(mat.steel, [[0, 0.07], [0.06, 0.07], [0.078, 0.052], [0.108, 0.044], [0.158, 0.05], [0.188, 0.08], [0.214, 0.092], [0.232, 0.104], [0.246, 0.1], [0.246, -0.1]], wheel);
      for (let k = 0; k < 8; k++) {
        const th = k / 8 * Math.PI * 2;
        const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.006, 16), mat.seam);
        hole.position.set(Math.cos(th) * 0.136, 0.05, Math.sin(th) * 0.136);
        wheel.add(hole);
      }
      for (let k = 0; k < 6; k++) {
        const th = k / 6 * Math.PI * 2;
        const lug = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.012, 0.02, 6), mat.chrome);
        lug.position.set(Math.cos(th) * 0.048, 0.078, Math.sin(th) * 0.048);
        wheel.add(lug);
      }
    });
  });

  // Oval badge, plate holder, lower intake and fog lamps.
  const badge = (m: THREE.Material, r: number, z: number) => {
    const mesh = solid(m, new THREE.CylinderGeometry(r, r, 0.012, 48), 0, 0.95, z, false);
    mesh.rotation.x = Math.PI / 2;
    mesh.scale.set(1.72, 1, 0.72 * 1.0);
    return mesh;
  };
  badge(mat.chrome, 0.082, Z0 - 0.022);
  badge(mat.blue, 0.073, Z0 - 0.03);
  rounded(mat.seam, 1.04, 0.1, 0.03, 0.012, 0, 0.585, -0.022);
  rounded(mat.seam, 0.34, 0.125, 0.012, 0.005, 0, 0.72, -0.012);
  [-1, 1].forEach(s => {
    const fz = warpZ(0.68, Z0) - 0.052;
    const bezel = solid(mat.seam, new THREE.CylinderGeometry(0.066, 0.066, 0.02, 28), s * 0.68, 0.585, fz, false);
    bezel.rotation.x = Math.PI / 2;
    const fog = solid(mat.chrome, new THREE.CylinderGeometry(0.042, 0.042, 0.024, 28), s * 0.68, 0.585, fz - 0.004, false);
    fog.rotation.x = Math.PI / 2;
    // Projector behind the headlamp lens.
    const [x, y, z] = [s * 0.672, 1.05, warpZ(0.672, Z0) - 0.016];
    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.046, 24, 16), mat.chrome);
    lens.position.set(x, y, z);
    group.add(lens);
  });

  // Wipers resting at the base of the glass.
  ([[0.56, -0.2], [-0.12, -0.74]] as Pt[]).forEach(([from, to]) => {
    const a = surface(1.09, Math.abs(from), 0.03, Math.sign(from) || 1), b = surface(1.13, Math.abs(to), 0.03, Math.sign(to) || 1);
    rod(mat.seam, V(a[0], a[1], a[2]), V(b[0], b[1], b[2]), 0.007);
  });

  // Door mirrors on twin arms.
  [-1, 1].forEach(s => {
    const headX = s * 1.17;
    rod(M.trim, V(s * 0.97, 1.58, 1.74), V(headX, 1.72, 1.77), 0.016);
    rod(M.trim, V(s * 0.93, 1.94, 1.66), V(headX, 1.98, 1.77), 0.016);
    rounded(M.trim, 0.13, 0.42, 0.2, 0.05, headX, 1.84, 1.78);
    rounded(mat.chrome, 0.1, 0.25, 0.008, 0.004, headX, 1.91, 1.883);
    rounded(mat.chrome, 0.1, 0.1, 0.008, 0.004, headX, 1.71, 1.883);
    // Door handle.
    rounded(M.trim, 0.03, 0.045, 0.2, 0.014, s * 1.045, 1.31, 2.55);
  });
  rounded(M.trim, 0.03, 0.045, 0.2, 0.014, 1.045, 1.31, 3.02);

  // Side step at the sliding door, and the fender antenna seen in the photo.
  rounded(M.trim, 0.2, 0.035, 1.34, 0.012, 1.06, 0.42, 3.48);
  [3.0, 3.96].forEach(z => rounded(M.trim, 0.2, 0.05, 0.05, 0.01, 0.99, 0.455, z));
  rod(mat.seam, V(-0.78, 1.3, 0.6), V(-0.86, 1.98, 0.74), 0.004);

  // Rear doors, lamps, bumper and glass.
  const backZ = L + 0.004;
  rounded(mat.seam, 0.008, 1.84, 0.006, 0.002, 0, 1.56, backZ);
  rounded(mat.seam, 1.72, 0.008, 0.006, 0.002, 0, 2.48, backZ);
  [-1, 1].forEach(s => {
    rounded(mat.seam, 0.008, 1.84, 0.006, 0.002, s * 0.86, 1.56, backZ);
    rounded(M.trim, 0.62, 0.54, 0.012, 0.03, s * 0.42, 2.0, backZ);
    rounded(M.glass, 0.56, 0.48, 0.012, 0.025, s * 0.42, 2.0, backZ + 0.006);
    rounded(M.trim, 0.04, 0.2, 0.03, 0.012, s * 0.1, 1.32, backZ + 0.008);
    rounded(mat.red, 0.1, 0.42, 0.05, 0.018, s * 0.935, 1.62, L - 0.05);
    rounded(mat.amber, 0.1, 0.14, 0.05, 0.018, s * 0.935, 1.33, L - 0.05);
    rounded(mat.chrome, 0.1, 0.1, 0.05, 0.018, s * 0.935, 1.2, L - 0.05);
  });
  rounded(mat.red, 0.42, 0.04, 0.03, 0.012, 0, 2.56, L - 0.012);
  rounded(M.trim, 2.0, 0.2, 0.2, 0.05, 0, 0.62, L + 0.02);
  rounded(mat.seam, 0.34, 0.12, 0.012, 0.004, 0, 0.82, backZ);

  const fadeMaterials: THREE.Material[] = Object.values(mat);
  return {
    group,
    shell,
    fadeMaterials,
    dispose() {
      group.traverse(node => (node as THREE.Mesh).geometry?.dispose());
      fadeMaterials.forEach(m => m.dispose());
      hexMap.dispose();
    },
  };
}
