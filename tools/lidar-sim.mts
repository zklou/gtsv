/* LiDAR placement simulation for unit 503-1705.
   Casts each candidate sensor's published beam pattern from candidate mounts against the same van
   body the review page draws, then scores what the beams reach on a straight test street.
   Run:  npx tsx tools/lidar-sim.mts                  prints the comparison
         npx tsx tools/lidar-sim.mts --json out.json  also writes the numbers for the report      */
import * as THREE from 'three';
import { readFileSync, writeFileSync } from 'node:fs';

// vanBody.ts paints a grille texture on a canvas; the simulation only needs triangles.
const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }) });
(globalThis as any).document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };

const { buildVanBody } = await import('../src/components/vanBody');
const { BROW, BROW_CAMERAS, GNSS, LIDAR, HOUSING, browFairingGeometry, housingGeometries, housingSection, lidarFrame, lidarPostParts, beamFloor } = await import('../src/components/browArray');
const { STREET } = await import('../src/components/lidarScan');

/* ------------------------------- van geometry ------------------------------- */
const IN = 0.0254;
const L = 263.9 * IN, H = 110.4 * IN;
const mat = () => new THREE.MeshPhysicalMaterial();
const M = { paint: mat(), glass: mat(), trim: mat(), lamp: mat(), tyre: mat(), rim: mat() };
const van = buildVanBody({ length: L, height: H, frontAxle: 40.3 * IN, rearAxle: (40.3 + 147.6) * IN, wheelR: 0.356, trackF: 68.2 * IN, trackR: 68.6 * IN }, M, { roofRibs: true });

function group(build: (g: THREE.Group) => void) { const g = new THREE.Group(); build(g); return g; }
const boxAt = (g: THREE.Group, w: number, h: number, d: number, x: number, y: number, z: number) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d)); m.position.set(x, y, z); g.add(m);
};
const fixtures = group(g => {
  boxAt(g, 1.09, 0.265, 0.71, 0, H + 0.1325, L - 1.10);                       // rear roof A/C
  boxAt(g, BROW.barLength, 0.04, 0.08, 0, BROW.barY, BROW.barZ);               // sensor bar, should sit under the skin
  BROW_CAMERAS.filter(c => !c.tail).forEach(c => boxAt(g, 0.12, 0.10, 0.13, c.x, c.y, c.z + 0.05));
  [-1, 1].forEach(s => {
    boxAt(g, 0.05, 0.05, 0.05, s * BROW.earX, BROW.earY, BROW.earZ);
    // outrigger to the rear-side camera
    const a = new THREE.Vector3(s * BROW.barLength / 2, BROW.barY, BROW.barZ), b = new THREE.Vector3(s * BROW.earX, BROW.earY, BROW.earZ);
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, a.distanceTo(b)));
    strut.position.copy(a).lerp(b, 0.5);
    strut.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), b.clone().sub(a).normalize());
    g.add(strut);
  });
  // struts from the bar to the feet on the brow panel
  [-1, 1].forEach(s => {
    const a = new THREE.Vector3(s * 0.55, BROW.barY, BROW.barZ), b = new THREE.Vector3(s * 0.55, 2.32, 1.88);
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, a.distanceTo(b)));
    strut.position.copy(a).lerp(b, 0.5);
    strut.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), b.clone().sub(a).normalize());
    g.add(strut);
  });
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(GNSS.radius, GNSS.radius, GNSS.plate + GNSS.height, 24));
  antenna.position.set(0, H + (GNSS.plate + GNSS.height) / 2, GNSS.z);
  g.add(antenna);
});
const fairings = {
  none: new THREE.Group(),
  current: group(g => g.add(new THREE.Mesh(browFairingGeometry()))),
  // the folded housing and the LiDAR post, as the page draws them
  housing: group(g => {
    housingGeometries().forEach(h => g.add(new THREE.Mesh(h)));
    const { tube, plate } = lidarPostParts();
    [tube, plate].forEach(p => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(p.radius, p.radius, p.height, 32));
      m.position.y = p.y;
      m.applyMatrix4(lidarFrame());
      g.add(m);
    });
  }),
};

function triangles(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const out: number[] = [];
  const v = new THREE.Vector3();
  root.traverse(o => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const p = mesh.geometry.attributes.position, idx = mesh.geometry.index;
    const n = idx ? idx.count : p.count;
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(p, idx ? idx.getX(i) : i).applyMatrix4(mesh.matrixWorld);
      out.push(v.x, v.y, v.z);
    }
  });
  return out;
}

/* ---------------------------------- BVH ---------------------------------- */
type Node = { min: number[]; max: number[]; left?: Node; right?: Node; start: number; count: number };
class Bvh {
  tri: Float32Array; order: Uint32Array; root: Node;
  constructor(tri: Float32Array) {
    this.tri = tri;
    const n = tri.length / 9;
    this.order = Uint32Array.from({ length: n }, (_, i) => i);
    const cen = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) cen[i * 3 + k] = (tri[i * 9 + k] + tri[i * 9 + 3 + k] + tri[i * 9 + 6 + k]) / 3;
    const build = (start: number, count: number): Node => {
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      for (let i = start; i < start + count; i++) {
        const t = this.order[i];
        for (let j = 0; j < 9; j++) { const k = j % 3, x = tri[t * 9 + j]; if (x < min[k]) min[k] = x; if (x > max[k]) max[k] = x; }
      }
      const node: Node = { min, max, start, count };
      if (count <= 6) return node;
      const ext = [0, 1, 2].map(k => max[k] - min[k]);
      const axis = ext.indexOf(Math.max(...ext));
      const slice = Array.from(this.order.subarray(start, start + count));
      slice.sort((a, b) => cen[a * 3 + axis] - cen[b * 3 + axis]);
      this.order.set(slice, start);
      const half = count >> 1;
      node.left = build(start, half);
      node.right = build(start + half, count - half);
      node.count = 0;
      return node;
    };
    this.root = build(0, n);
  }
  /** Distance to the nearest triangle along a unit ray, or Infinity. */
  hit(o: number[], d: number[], tMax = Infinity) {
    const inv = [1 / d[0], 1 / d[1], 1 / d[2]];
    let best = tMax;
    const stack: Node[] = [this.root];
    const tri = this.tri;
    while (stack.length) {
      const nd = stack.pop()!;
      let t0 = 0, t1 = best, miss = false;
      for (let k = 0; k < 3; k++) {
        let a = (nd.min[k] - o[k]) * inv[k], b = (nd.max[k] - o[k]) * inv[k];
        if (a > b) [a, b] = [b, a];
        if (a > t0) t0 = a; if (b < t1) t1 = b;
        if (t0 > t1) { miss = true; break; }
      }
      if (miss) continue;
      if (nd.left) { stack.push(nd.left, nd.right!); continue; }
      for (let i = nd.start; i < nd.start + nd.count; i++) {
        const b0 = this.order[i] * 9;
        const ax = tri[b0], ay = tri[b0 + 1], az = tri[b0 + 2];
        const e1x = tri[b0 + 3] - ax, e1y = tri[b0 + 4] - ay, e1z = tri[b0 + 5] - az;
        const e2x = tri[b0 + 6] - ax, e2y = tri[b0 + 7] - ay, e2z = tri[b0 + 8] - az;
        const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x;
        const det = e1x * px + e1y * py + e1z * pz;
        if (Math.abs(det) < 1e-12) continue;
        const id = 1 / det, sx = o[0] - ax, sy = o[1] - ay, sz = o[2] - az;
        const u = (sx * px + sy * py + sz * pz) * id; if (u < 0 || u > 1) continue;
        const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
        const v = (d[0] * qx + d[1] * qy + d[2] * qz) * id; if (v < 0 || u + v > 1) continue;
        const t = (e2x * qx + e2y * qy + e2z * qz) * id;
        if (t > 1e-4 && t < best) best = t;
      }
    }
    return best < tMax ? best : Infinity;
  }
}

/* --------------------------------- sensors --------------------------------- */
// Vertical layouts from the datasheets. Ouster Rev8 channels are evenly spaced across the FOV.
// columns: azimuth samples per 10 Hz rotation for each beam.
type Sensor = { id: string; name: string; colour: boolean; beams: { elev: number; columns: number }[]; r10: number; note: string };
const even = (n: number, lo: number, hi: number) => Array.from({ length: n }, (_, i) => lo + (hi - lo) * i / (n - 1));
const uniform = (elev: number[], columns: number) => elev.map(e => ({ elev: e, columns }));
export const SENSORS: Sensor[] = [
  { id: 'os0', name: 'Ouster OS0-128 Rev8', colour: true, beams: uniform(even(128, -45, 45), 2048), r10: 35, note: '90° vertical, 35 m at 10 %' },
  { id: 'os1', name: 'Ouster OS1-128 Rev8', colour: true, beams: uniform(even(128, -22, 22), 2048), r10: 90, note: '44° vertical, 90 m at 10 %' },
  { id: 'os1-64', name: 'Ouster OS1-64 Rev8', colour: true, beams: uniform(even(64, -22, 22), 2048), r10: 90, note: 'Half the channels of the OS1-128' },
  { id: 'os1max', name: 'Ouster OS1 Max Rev8 (256)', colour: true, beams: uniform(even(256, -22.5, 22.5), 2048), r10: 200, note: '45° vertical, 200 m at 10 %' },
  // Hesai OT128 high-resolution mode: 64 dense beams (0.1°) near the horizon, the rest at 0.2°.
  { id: 'ot128', name: 'Hesai OT128', colour: false, r10: 200, note: '40° vertical, no colour',
    beams: [...uniform(even(20, 15, 2.5), 1800), ...uniform(even(64, 2, -6), 3600), ...uniform(even(44, -6.5, -25), 1800)] },
];

/* ---------------------------------- street ---------------------------------- */
// The same street the page draws (lidarScan.ts): the van in the right lane, shoulder and kerb at
// +3.4 m, four more lanes to the left kerb at -14.5 m, 2.7 m sidewalks with a building / sign line at
// their back edge. A bridge soffit plane at 5.0 m is scored on its own for the overhead figure.
const REFLECT = { asphalt: STREET.asphalt, concrete: STREET.concrete };
const SPEED = 40 / 3.6, RATE = 10;

/** Lambertian link budget: a target of reflectivity rho at incidence i is seen out to r10 * sqrt(rho cos i / 0.1). */
const reach = (s: Sensor, rho: number, cosI: number) => s.r10 * Math.sqrt(Math.max(0, rho * cosI) / 0.1);

function castStreet(o: number[], d: number[]) {
  let t = Infinity, what = 'sky', n = [0, 1, 0];
  const take = (tt: number, w: string, nn: number[]) => { if (tt > 1e-4 && tt < t) { t = tt; what = w; n = nn; } };
  if (d[1] < 0) {
    const tg = -o[1] / d[1], gx = o[0] + d[0] * tg;
    if (gx < STREET.kerbRight && gx > STREET.kerbLeft) take(tg, 'road', [0, 1, 0]);
    const ts = (STREET.kerbH - o[1]) / d[1], sx = o[0] + d[0] * ts;
    if ((sx >= STREET.kerbRight && sx <= STREET.kerbRight + STREET.sidewalk) || (sx <= STREET.kerbLeft && sx >= STREET.kerbLeft - STREET.sidewalk)) take(ts, 'sidewalk', [0, 1, 0]);
  }
  for (const [kx, s] of [[STREET.kerbRight, -1], [STREET.kerbLeft, 1]] as [number, number][]) {
    if (d[0] * s >= 0) continue;
    const tk = (kx - o[0]) / d[0], ky = o[1] + d[1] * tk;
    if (ky >= 0 && ky <= STREET.kerbH) take(tk, 'kerb', [s, 0, 0]);
  }
  for (const s of [1, -1]) {
    if (d[0] * s <= 0) continue;
    const px = s > 0 ? STREET.kerbRight + STREET.sidewalk : STREET.kerbLeft - STREET.sidewalk;
    const tp = (px - o[0]) / d[0], py = o[1] + d[1] * tp;
    if (py >= STREET.kerbH && py <= 8) take(tp, 'roadside', [-s, 0, 0]);
  }
  return { t, what, n };
}

type Mount = { id: string; label: string; x: number; y: number; z: number; pitch: number };

function simulate(bvh: Bvh, s: Sensor, m: Mount, keepPoints = false) {
  const a = m.pitch * Math.PI / 180;
  const o = [m.x, m.y, m.z];
  const fwd = [0, -Math.sin(a), -Math.cos(a)], up = [0, Math.cos(a), -Math.sin(a)];
  let total = 0, onVan = 0, useful = 0, aheadMin = Infinity, kerbR = 0, kerbL = 0, overhead = 0;
  const lateral = new Float64Array(360);      // road + sidewalk returns per frame, 0.1 m bins, -18 .. +18 m
  const signs = new Float64Array(8);          // right building / sign line, 1 m height bands
  const blocked = new Float64Array(36);       // beams lost to the van, by 10° azimuth sector
  const pts: number[] = [];
  let farthestRoad = 0;
  for (const beam of s.beams) {
    const th = beam.elev * Math.PI / 180, ct = Math.cos(th), st = Math.sin(th);
    for (let c = 0; c < beam.columns; c++) {
      const phi = (c / beam.columns) * Math.PI * 2;
      const sp = Math.sin(phi), cp = Math.cos(phi);
      const d = [ct * sp, st * up[1] + ct * cp * fwd[1], st * up[2] + ct * cp * fwd[2]];
      total++;
      const street = castStreet(o, d);
      const tVan = bvh.hit(o, d, Math.min(street.t, 60));
      if (tVan < street.t) { onVan++; blocked[Math.floor(phi / (Math.PI * 2) * 36) % 36]++; continue; }
      if (d[1] > 0) {   // overhead structure, scored on its own plane
        const tb = (STREET.soffit - o[1]) / d[1], bx = o[0] + d[0] * tb;
        if (Math.abs(bx) < 6 && tb <= reach(s, REFLECT.concrete, d[1])) overhead++;
      }
      if (street.what === 'sky') continue;
      const cosI = Math.abs(street.n[0] * d[0] + street.n[1] * d[1] + street.n[2] * d[2]);
      const rho = street.what === 'road' ? REFLECT.asphalt : REFLECT.concrete;
      if (street.t > reach(s, rho, cosI)) continue;
      useful++;
      const x = o[0] + d[0] * street.t, y = o[1] + d[1] * street.t, z = o[2] + d[2] * street.t;
      if (keepPoints && c % 2 === 0) pts.push(+x.toFixed(2), +y.toFixed(2), +z.toFixed(2));
      if (street.what === 'road' || street.what === 'sidewalk') {
        const bin = Math.floor((x + 18) / 0.1);
        if (bin >= 0 && bin < 360) lateral[bin]++;
        if (Math.abs(x) < 0.5 && z < 0.04) aheadMin = Math.min(aheadMin, 0.04 - z);
        if (street.what === 'road') farthestRoad = Math.max(farthestRoad, street.t);
      } else if (street.what === 'kerb') { if (x > 0) kerbR++; else kerbL++; }
      else if (street.what === 'roadside' && x > 0) { const b = Math.floor(y); if (b >= 0 && b < 8) signs[b]++; }
    }
  }
  // Driving forward, every frame repaints the same pattern: density = hits per frame * rate / (speed * bin width).
  const per = (n: number, width: number) => n * RATE / (SPEED * width);
  // mean density over whole 0.1 m bins, divided by the width those bins actually cover
  const band = (x0: number, x1: number) => {
    const b0 = Math.round((x0 + 18) / 0.1), b1 = Math.round((x1 + 18) / 0.1);
    let n = 0;
    for (let b = b0; b < b1; b++) n += lateral[b];
    return per(n, (b1 - b0) * 0.1);
  };
  return {
    sensor: s.id, mount: m.id,
    vanShare: onVan / total,
    usefulPerSecond: useful * RATE,
    aheadOfBumper: aheadMin,
    asphaltReach: farthestRoad,
    density: {
      ownLane: band(-1.85, 1.85), rightShoulder: band(1.85, STREET.kerbRight), nextLane: band(-5.55, -1.85),
      farLanes: band(STREET.kerbLeft, -5.55), rightSidewalk: band(STREET.kerbRight, STREET.kerbRight + STREET.sidewalk),
      leftSidewalk: band(STREET.kerbLeft - STREET.sidewalk, STREET.kerbLeft),
    },
    kerbPerMetre: { right: per(kerbR, 1), left: per(kerbL, 1) },
    signBands: Array.from(signs, n => per(n, 1)),
    overhead: per(overhead, 12),
    lateral: Array.from(lateral, n => +per(n, 0.1).toFixed(1)),
    blocked: Array.from(blocked, n => n / (total / 36)),
    pts,
  };
}

/* ---------------------------------- mounts ---------------------------------- */
// Optical centres. The brow panel rises from the windshield header (z 1.78, y 2.21) to the
// roof (z 2.69, y 2.80); z runs nose to tail. pitch is forward-down tilt in degrees.
const MOUNTS: Mount[] = [
  { id: 'mast', label: 'Centre mast (current)', x: 0, y: 2.87, z: 1.92, pitch: 0 },
  { id: 'nose', label: 'Fairing nose', x: 0, y: 2.56, z: 1.80, pitch: 0 },
  { id: 'nose15', label: 'Fairing nose, 15° down', x: 0, y: 2.58, z: 1.80, pitch: 15 },
  { id: 'nose25', label: 'Fairing nose, 25° down', x: 0, y: 2.58, z: 1.80, pitch: 25 },
  { id: 'crown', label: 'Crown', x: 0, y: 2.72, z: 1.90, pitch: 0 },
  { id: 'crown10', label: 'Crown, 10° down', x: 0, y: 2.72, z: 1.90, pitch: 10 },
  { id: 'crown15', label: 'Crown, 15° down', x: 0, y: 2.72, z: 1.90, pitch: 15 },
  { id: 'crown20', label: 'Crown, 20° down', x: 0, y: 2.72, z: 1.90, pitch: 20 },
  { id: 'roofline15', label: 'Roof line, 15° down', x: 0, y: 2.80, z: 1.92, pitch: 15 },
  { id: 'chosen', label: 'Chosen mount', x: 0, y: LIDAR.y, z: LIDAR.z, pitch: LIDAR.pitch },
];

/* ----------------------------------- run ----------------------------------- */
const base = [...triangles(van.group), ...triangles(fixtures)];
const scene = (f: keyof typeof fairings) => new Bvh(new Float32Array([...base, ...triangles(fairings[f])]));
const bvhs = { none: scene('none'), current: scene('current'), housing: scene('housing') };
console.log(`van + fixtures: ${base.length / 9} triangles`);
// Housing top corners against the lowest beam: positive margin means the panel is under the beams.
for (const [name, top, half] of [['centre', HOUSING.centreTop, HOUSING.centreHalf], ['wings', HOUSING.wingTop, HOUSING.wingHalf]] as [string, number, number][]) {
  const sec = housingSection(top), zs = [sec[1][0], sec[2][0]];
  const margin = Math.min(...zs.flatMap(z => [half, -half].map(x => beamFloor(x, z) - top)));
  console.log(`housing ${name}: top ${top} m, half-width ${half} m, worst margin under the beam floor ${(margin * 1000).toFixed(0)} mm`);
}

const fmt = (v: number, d = 0) => Number.isFinite(v) ? v.toFixed(d) : '—';
const rows: any[] = [];
const run = (s: Sensor, m: Mount, f: keyof typeof bvhs, keep = false) => {
  const r = { ...simulate(bvhs[f], s, m, keep), fairing: f };
  rows.push(r);
  const dd = r.density;
  console.log([s.id.padEnd(7), m.id.padEnd(11), f.padEnd(8), `van ${fmt(r.vanShare * 100)}%`.padEnd(8),
    `useful ${fmt(r.usefulPerSecond / 1e6, 2)}M/s`, `ahead ${fmt(r.aheadOfBumper, 1)} m`.padEnd(12), `reach ${fmt(r.asphaltReach, 0)} m`,
    `lane ${fmt(dd.ownLane)}`, `shldr ${fmt(dd.rightShoulder)}`, `next ${fmt(dd.nextLane)}`, `far ${fmt(dd.farLanes)}`,
    `walkR ${fmt(dd.rightSidewalk)}`, `walkL ${fmt(dd.leftSidewalk)}`,
    `kerb ${fmt(r.kerbPerMetre.right)}/${fmt(r.kerbPerMetre.left)}`,
    `sign2-4 ${fmt((r.signBands[2] + r.signBands[3]) / 2)}`, `soffit ${fmt(r.overhead)}`].join('  '));
  return r;
};
const only = process.argv.includes('--chosen');
if (!only) {
  console.log('\n— sensor and mount, fairing left out (what the position allows) —');
  for (const m of MOUNTS.filter(m => m.id !== 'chosen')) for (const s of SENSORS) run(s, m, 'none');
  console.log('\n— current mast with the current fairing —');
  for (const s of SENSORS) run(s, MOUNTS[0], 'current');
}
console.log('\n— chosen mount, bare and with the folded housing and post —');
const chosen = MOUNTS.find(m => m.id === 'chosen')!;
for (const s of SENSORS) run(s, chosen, 'none');
for (const s of SENSORS) run(s, chosen, 'housing', s.id === 'os1');
// Occlusion mask for the page's Coverage view: one bit per beam and column, set where the van,
// the fairing or a fixture stops the beam before it reaches the street.
{
  const { beamDirection } = await import('../src/components/lidarScan');
  const beams = 128, columns = 1024, bytes = new Uint8Array(beams * columns / 8);
  const o = [0, LIDAR.y, LIDAR.z];
  let n = 0;
  for (let b = 0; b < beams; b++) for (let c = 0; c < columns; c++) {
    const d = beamDirection(b, c, beams, columns), i = b * columns + c;
    if (bvhs.housing.hit(o, d, Math.min(castStreet(o, d).t, 60)) < Infinity) { bytes[i >> 3] |= 1 << (i & 7); n++; }
  }
  writeFileSync(new URL('../src/components/lidarMask.json', import.meta.url),
    JSON.stringify({ model: LIDAR.model, pitch: LIDAR.pitch, y: LIDAR.y, z: LIDAR.z, beams, columns, bits: Buffer.from(bytes).toString('base64') }) + '\n');
  console.log(`\nmask: ${(n / (beams * columns) * 100).toFixed(1)} % of beams stop on the van or the array (src/components/lidarMask.json)`);
}
const jsonAt = process.argv.indexOf('--json');
if (jsonAt > 0) {
  writeFileSync(process.argv[jsonAt + 1], JSON.stringify({ sensors: SENSORS.map(({ beams, ...s }) => ({ ...s, channels: beams.length })), mounts: MOUNTS, street: STREET, speed: SPEED * 3.6, rows }));
  console.log(`wrote ${process.argv[jsonAt + 1]}`);
}

/* ------------------------------ coverage export ------------------------------
   --coverage lidar-coverage.html writes a standalone coverage page (a .json name writes only the data): one rotation's ground returns
   (top view), the closest scanning range over a straight drive in a road cross-section, every
   beam's first hit in the centre plane (side view), density across the road, and van outlines. */
const covAt = process.argv.indexOf('--coverage');
if (covAt > 0) {
  const os1 = SENSORS.find(s => s.id === 'os1')!, os0 = SENSORS.find(s => s.id === 'os0')!;
  const configs = [
    { id: 'post', label: 'OS1-128, tilted post', sensor: os1, mount: chosen, bvh: bvhs.housing },
    { id: 'mast', label: 'OS1-128, old mast', sensor: os1, mount: MOUNTS[0], bvh: bvhs.current },
    { id: 'os0', label: 'OS0-128, tilted post', sensor: os0, mount: chosen, bvh: bvhs.housing },
  ];
  const GRASS = 0.40;   // vegetation is bright at 865 nm
  /** Ground the page draws: road between the kerbs, raised sidewalks, then grass verge; kerb faces. */
  const castGround = (o: number[], d: number[]) => {
    let t = Infinity, what = 'none', rho = 0, n = [0, 1, 0];
    const take = (tt: number, w: string, r: number, nn: number[]) => { if (tt > 1e-4 && tt < t) { t = tt; what = w; rho = r; n = nn; } };
    if (d[1] < 0) {
      const tg = -o[1] / d[1], gx = o[0] + d[0] * tg;
      if (gx < STREET.kerbRight && gx > STREET.kerbLeft) take(tg, 'road', STREET.asphalt, [0, 1, 0]);
      const ts = (STREET.kerbH - o[1]) / d[1], sx = o[0] + d[0] * ts;
      const walk = (sx >= STREET.kerbRight && sx <= STREET.kerbRight + STREET.sidewalk) || (sx <= STREET.kerbLeft && sx >= STREET.kerbLeft - STREET.sidewalk);
      if (walk) take(ts, 'walk', STREET.concrete, [0, 1, 0]);
      const tv = (0.14 - o[1]) / d[1], vx = o[0] + d[0] * tv;
      if (vx > STREET.kerbRight + STREET.sidewalk || vx < STREET.kerbLeft - STREET.sidewalk) take(tv, 'grass', GRASS, [0, 1, 0]);
    }
    for (const [kx, s] of [[STREET.kerbRight, -1], [STREET.kerbLeft, 1]] as [number, number][]) {
      if (d[0] * s >= 0) continue;
      const tk = (kx - o[0]) / d[0], ky = o[1] + d[1] * tk;
      if (ky >= 0 && ky <= STREET.kerbH) take(tk, 'kerb', STREET.concrete, [s, 0, 0]);
    }
    return { t, what, rho, n };
  };
  const SURF = { road: 0, walk: 1, grass: 2, kerb: 3 } as Record<string, number>;
  const b64 = (a: ArrayBufferView) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');
  const GRID = { x0: -20, x1: 20, y0: 0, y1: 12, step: 0.1 };
  const nx = Math.round((GRID.x1 - GRID.x0) / GRID.step), ny = Math.round((GRID.y1 - GRID.y0) / GRID.step);

  const outline = (bvh: Bvh) => {
    const side: number[][] = [], plan: number[][] = [], front: number[][] = [];
    for (let z = -0.06; z <= L + 0.06; z += 0.02) {
      let top = -1, bottom = 9, half = 0;
      for (let x = -1.2; x <= 1.2; x += 0.05) {
        const tDown = bvh.hit([x, 4, z], [0, -1, 0], 4); if (tDown < Infinity) top = Math.max(top, 4 - tDown);
        const tUp = bvh.hit([x, 0.002, z], [0, 1, 0], 4); if (tUp < Infinity) bottom = Math.min(bottom, 0.002 + tUp);
      }
      for (let y = 0.2; y <= 3.1; y += 0.05) {
        const t = bvh.hit([1.6, y, z], [-1, 0, 0], 3.2); if (t < Infinity) half = Math.max(half, 1.6 - t);
      }
      if (top > 0) side.push([+z.toFixed(3), +top.toFixed(3), +bottom.toFixed(3)]);
      if (half > 0) plan.push([+z.toFixed(3), +half.toFixed(3)]);
    }
    for (let x = -1.3; x <= 1.3001; x += 0.02) {
      let top = -1;
      for (let z = 0; z <= L; z += 0.04) { const t = bvh.hit([x, 4, z], [0, -1, 0], 4); if (t < Infinity) top = Math.max(top, 4 - t); }
      if (top > 0) front.push([+x.toFixed(3), +top.toFixed(3)]);
    }
    return { side, plan, front };
  };

  const figures = configs.map(cfg => {
    const t0 = Date.now();
    const { sensor: s, mount: m, bvh } = cfg;
    const a = m.pitch * Math.PI / 180, o = [m.x, m.y, m.z];
    const fwd = [0, -Math.sin(a), -Math.cos(a)], up = [0, Math.cos(a), -Math.sin(a)];
    const dir = (elev: number, phi: number) => {
      const th = elev * Math.PI / 180, ct = Math.cos(th), st = Math.sin(th);
      return [ct * Math.sin(phi), st * up[1] + ct * Math.cos(phi) * fwd[1], st * up[2] + ct * Math.cos(phi) * fwd[2]];
    };
    const reach = (rho: number, cosI: number) => s.r10 * Math.sqrt(Math.max(0, rho * cosI) / 0.1);
    const top: number[] = [], surf: number[] = [];
    const closest = new Float32Array(nx * ny).fill(Infinity);
    const envReach = Math.min(60, reach(0.3, 1));
    let rays = 0, lost = 0;
    for (const beam of s.beams) for (let c = 0; c < beam.columns; c++) {
      const d = dir(beam.elev, c / beam.columns * Math.PI * 2);
      const g = castGround(o, d);
      const tVan = bvh.hit(o, d, Math.min(g.t, 80));
      rays++; if (tVan < Infinity) lost++;
      // top view: ground and kerb returns inside the link budget
      if (tVan === Infinity && g.t < Infinity) {
        const cosI = Math.abs(g.n[0] * d[0] + g.n[1] * d[1] + g.n[2] * d[2]);
        if (g.t <= reach(g.rho, cosI)) {
          top.push(Math.round((o[0] + d[0] * g.t) * 100), Math.round((o[2] + d[2] * g.t) * 100), Math.min(255, Math.round(g.t * 4)));
          surf.push(SURF[g.what]);
        }
      }
      // cross-section: march the ray's projection through the (x, y) grid, keeping the closest range
      const tEnd = Math.min(tVan, g.t, envReach);
      const planar = Math.hypot(d[0], d[1]);
      const dt = Math.min(0.25, 0.04 / Math.max(planar, 1e-3));
      for (let t = dt; t < tEnd; t += dt) {
        const x = o[0] + d[0] * t, y = o[1] + d[1] * t;
        if (x < GRID.x0 || x >= GRID.x1 || y < GRID.y0 || y >= GRID.y1) break;
        const k = Math.floor((y - GRID.y0) / GRID.step) * nx + Math.floor((x - GRID.x0) / GRID.step);
        if (t < closest[k]) closest[k] = t;
      }
    }
    // side view: every beam straight ahead and straight back, to its first hit
    const beams: number[][] = [];
    for (const phi of [0, Math.PI]) for (const beam of s.beams) {
      const d = dir(beam.elev, phi);
      const g = castGround(o, d), tVan = bvh.hit(o, d, 45);
      const t = Math.min(tVan, g.t, 45), what = tVan <= g.t && tVan < 45 ? 1 : g.t < 45 ? 2 : 0;
      beams.push([+(o[2] + d[2] * t).toFixed(3), +(o[1] + d[1] * t).toFixed(3), what]);
    }
    const env = new Uint8Array(nx * ny);
    closest.forEach((v, i) => { env[i] = Number.isFinite(v) ? Math.min(254, Math.round(v * 4)) + 1 : 0; });
    const density = simulate(bvh, s, m).lateral;
    console.log(`coverage ${cfg.id}: ${surf.length} ground returns, ${Date.now() - t0} ms`);
    return {
      id: cfg.id, label: cfg.label, sensor: s.name, mount: { y: m.y, z: m.z, pitch: m.pitch }, fov: [Math.min(...s.beams.map(b => b.elev)), Math.max(...s.beams.map(b => b.elev))],
      columns: s.beams[0].columns, channels: s.beams.length, r10: s.r10, envReach, lostShare: lost / rays,
      top: b64(Int16Array.from(top)), surf: b64(Uint8Array.from(surf)), env: b64(env), beams, density,
      outline: outline(bvh),
    };
  });
  const target = process.argv[covAt + 1];
  const json = JSON.stringify({
    made: new Date().toISOString().slice(0, 10), van: { length: L, height: H }, street: STREET, grass: GRASS, speed: SPEED * 3.6,
    grid: { ...GRID, nx, ny }, densityBins: { x0: -18, step: 0.1 }, figures,
  });
  if (target.endsWith('.html')) {
    // A standalone page: the template's head and body, the data inline, a link back to the review page.
    const template = readFileSync(new URL('./lidar-coverage.template.html', import.meta.url), 'utf8');
    const cut = template.indexOf('<main');
    const body = template.slice(cut)
      .replace('<header class="head">', '<header class="head">\n    <a class="back" href="./">← Sensing van review</a>')
      .replace('__DATA__', () => json);
    writeFileSync(target, '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n'
      + template.slice(0, cut) + '</head>\n<body>\n' + body + '\n</body>\n</html>\n');
  } else writeFileSync(target, json);
  console.log(`wrote ${target}`);
}
