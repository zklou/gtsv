import { LIDAR } from './browArray';
import mask from './lidarMask.json';

/* The street drawn around the van (worldScene.ts), as the LiDAR simulation sees it.
   x is lateral, + to the vehicle's right; the van drives toward -z in the right-hand lane. */
export const STREET = {
  kerbRight: 3.4, kerbLeft: -14.5, kerbH: 0.15, sidewalk: 2.7, soffit: 5.0,
  asphalt: 0.12, concrete: 0.30,      // assumed reflectivity at 865 nm
};

/** Spec range on a 10 % target (Rev8 OS1 datasheet) and the Lambertian link budget built on it. */
export const R10 = 90;
export const reach = (rho: number, cosI: number) => R10 * Math.sqrt(Math.max(0, rho * cosI) / 0.1);

/** Beam directions in the van frame for one rotation at the mask's column count. */
export function beamDirection(beam: number, column: number, beams: number, columns: number) {
  const elev = (-LIDAR.fovDown + (LIDAR.fovDown + LIDAR.fovUp) * beam / (beams - 1)) * Math.PI / 180;
  const phi = column / columns * Math.PI * 2, a = LIDAR.pitch * Math.PI / 180;
  const ct = Math.cos(elev), st = Math.sin(elev), sp = Math.sin(phi), cp = Math.cos(phi);
  // forward = (0, -sin a, -cos a), spin axis = (0, cos a, -sin a)
  return [ct * sp, st * Math.cos(a) - ct * cp * Math.sin(a), -st * Math.sin(a) - ct * cp * Math.cos(a)];
}

/** Ground returns of one rotation, from the occlusion mask that tools/lidar-sim.mts writes.
    Colours run from white near the van to pink at 30 m, so they stand out from the camera fans. */
export function lidarFootprint() {
  const { beams, columns, bits } = mask as { beams: number; columns: number; bits: string };
  const raw = typeof atob === 'function' ? atob(bits) : Buffer.from(bits, 'base64').toString('binary');
  const blocked = (i: number) => (raw.charCodeAt(i >> 3) >> (i & 7)) & 1;
  const pos: number[] = [], col: number[] = [];
  const near = [1, 1, 1], far = [0.92, 0.12, 0.38];   // linear RGB: white near the van to pink at the edge of reach
  for (let b = 0; b < beams; b++) for (let c = 0; c < columns; c++) {
    if (blocked(b * columns + c)) continue;
    const d = beamDirection(b, c, beams, columns);
    if (d[1] >= 0) continue;
    let t = -LIDAR.y / d[1], x = d[0] * t;
    const walk = (x >= STREET.kerbRight && x <= STREET.kerbRight + STREET.sidewalk) || (x <= STREET.kerbLeft && x >= STREET.kerbLeft - STREET.sidewalk);
    if (walk) { t = (STREET.kerbH - LIDAR.y) / d[1]; x = d[0] * t; }
    const inside = (x > STREET.kerbLeft - STREET.sidewalk) && (x < STREET.kerbRight + STREET.sidewalk);
    if (!inside || t > reach(walk ? STREET.concrete : STREET.asphalt, -d[1])) continue;
    const k = Math.min(1, t / 30);
    pos.push(x, (walk ? STREET.kerbH : 0) + 0.025, LIDAR.z + d[2] * t);
    col.push(...near.map((v, i) => v + (far[i] - v) * k));
  }
  return { positions: new Float32Array(pos), colors: new Float32Array(col) };
}
