import * as THREE from 'three';

// Illustrative packaging dimensions in metres, not fabrication dimensions.
export const FLIP = {
  openingWidth: 0.84,
  openingLength: 2.40,
  panelWidth: 0.72,
  panelLength: 2.24,
  pivotRise: 0.035,
  sensorTop: 1.16,
  sensorWidth: 0.46,
  sensorDepth: 0.50,
  rearOffset: 1.60,
};

/** Subtract an open-topped rectangular prism from the actual body mesh.
 * Splitting intersecting triangles leaves a real aperture, including in raycasts.
 */
export function openRoof(geometry: THREE.BufferGeometry, roof: number, centerZ: number) {
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const positions = source.getAttribute('position');
  const output: number[] = [];
  const planes = [
    new THREE.Plane(new THREE.Vector3(1, 0, 0), FLIP.openingWidth / 2),
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), FLIP.openingWidth / 2),
    new THREE.Plane(new THREE.Vector3(0, 0, 1), -centerZ + FLIP.openingLength / 2),
    new THREE.Plane(new THREE.Vector3(0, 0, -1), centerZ + FLIP.openingLength / 2),
    new THREE.Plane(new THREE.Vector3(0, 1, 0), -roof + 0.18),
  ];
  const clip = (polygon: THREE.Vector3[], plane: THREE.Plane, inside: boolean) => {
    const result: THREE.Vector3[] = [];
    polygon.forEach((a, i) => {
      const b = polygon[(i + 1) % polygon.length];
      const da = plane.distanceToPoint(a), db = plane.distanceToPoint(b);
      const aIn = inside ? da >= 0 : da < 0;
      const bIn = inside ? db >= 0 : db < 0;
      if (aIn) result.push(a);
      if (aIn !== bIn) result.push(a.clone().lerp(b, da / (da - db)));
    });
    return result;
  };
  const emit = (polygon: THREE.Vector3[]) => {
    for (let i = 1; i + 1 < polygon.length; i++) {
      [polygon[0], polygon[i], polygon[i + 1]].forEach(p => output.push(p.x, p.y, p.z));
    }
  };
  for (let i = 0; i < positions.count; i += 3) {
    let remaining = [0, 1, 2].map(n => new THREE.Vector3().fromBufferAttribute(positions, i + n));
    for (const plane of planes) {
      if (remaining.length < 3) break;
      emit(clip(remaining, plane, false));
      remaining = clip(remaining, plane, true);
    }
  }
  if (source !== geometry) source.dispose();
  geometry.dispose();
  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(output, 3));
  result.computeVertexNormals();
  return result;
}
