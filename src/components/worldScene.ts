import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* A procedural street around the van: sky lighting, road, kerbs, trees and buildings.
   Everything is generated here, so the page loads no external models or textures. */

export const SUN_DIR = new THREE.Vector3(-0.52, 0.46, -0.72).normalize();

const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** Tileable value noise, 0..1. */
function tileNoise(size: number, cells: number, rand: () => number) {
  const lattice = Float32Array.from({ length: cells * cells }, () => rand());
  const out = new Float32Array(size * size);
  const fade = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const fx = x / size * cells, fy = y / size * cells;
    const ix = Math.floor(fx), iy = Math.floor(fy);
    const u = fade(fx - ix), v = fade(fy - iy);
    const at = (a: number, b: number) => lattice[(a % cells) + (b % cells) * cells];
    const top = at(ix, iy) * (1 - u) + at(ix + 1, iy) * u;
    const bottom = at(ix, iy + 1) * (1 - u) + at(ix + 1, iy + 1) * u;
    out[x + y * size] = top * (1 - v) + bottom * v;
  }
  return out;
}

type SurfaceSpec = { base: [number, number, number]; tint: number; speck: number; bump: number; rough: number; seed: number };

/** Colour, normal and roughness maps for a rough ground surface. */
function surfaceMaps({ base, tint, speck, bump, rough, seed }: SurfaceSpec) {
  const size = 512;
  const rand = seeded(seed);
  const broad = tileNoise(size, 6, rand), mid = tileNoise(size, 32, rand);
  const height = new Float32Array(size * size);
  const colour = new Uint8ClampedArray(size * size * 4);
  const gloss = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const grit = rand();
    const stone = grit > 0.965 ? speck : grit < 0.04 ? -speck * 0.7 : (grit - 0.5) * speck * 0.3;
    const shade = 1 + (broad[i] - 0.5) * tint + (mid[i] - 0.5) * tint * 0.6 + stone;
    height[i] = grit * 0.6 + mid[i] * 0.4;
    colour.set([base[0] * shade, base[1] * shade, base[2] * shade, 255], i * 4);
    const g = 255 * Math.min(1, rough + (broad[i] - 0.5) * 0.28);
    gloss.set([g, g, g, 255], i * 4);
  }
  const normal = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = height[((x + 1) % size) + y * size] - height[((x + size - 1) % size) + y * size];
    const dy = height[x + ((y + 1) % size) * size] - height[x + ((y + size - 1) % size) * size];
    const nx = -dx * bump, ny = -dy * bump, l = Math.hypot(nx, ny, 1);
    normal.set([(nx / l + 1) * 127.5, (ny / l + 1) * 127.5, (1 / l + 1) * 127.5, 255], (x + y * size) * 4);
  }
  const texture = (data: Uint8ClampedArray, srgb: boolean) => {
    const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  };
  return { map: texture(colour, true), normalMap: texture(normal, false), roughnessMap: texture(gloss, false) };
}

function groundMaterial(spec: SurfaceSpec, repeatX: number, repeatY: number) {
  const maps = surfaceMaps(spec);
  Object.values(maps).forEach(t => t.repeat.set(repeatX, repeatY));
  return new THREE.MeshStandardMaterial({ ...maps, roughness: 1, metalness: 0, normalScale: new THREE.Vector2(0.8, 0.8) });
}

function flat(width: number, length: number, x: number, y: number, z = 0) {
  const g = new THREE.PlaneGeometry(width, length);
  g.rotateX(-Math.PI / 2);
  g.translate(x, y, z);
  return g;
}

function facadeTexture(seed: number, wall: string, glassLit: string) {
  const rand = seeded(seed);
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = wall;
  g.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const lit = rand() > 0.72;
    g.fillStyle = lit ? glassLit : `rgb(${22 + rand() * 18},${32 + rand() * 20},${42 + rand() * 24})`;
    g.fillRect(x * 128 + 20, y * 128 + 24, 88, 84);
    g.fillStyle = 'rgba(0,0,0,.45)';
    g.fillRect(x * 128 + 62, y * 128 + 24, 4, 84);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function leafTexture() {
  const rand = seeded(77);
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  for (let i = 0; i < 34; i++) {
    const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * 46;
    g.save();
    g.translate(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
    g.rotate(rand() * Math.PI * 2);
    g.fillStyle = `hsl(${76 + rand() * 26},${20 + rand() * 12}%,${30 + rand() * 14}%)`;
    g.beginPath();
    g.ellipse(0, 0, 13, 6, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildWorld(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
  const group = new THREE.Group();
  scene.add(group);
  const rand = seeded(1705);

  /* ---- sky and image-based lighting ---- */
  const sky = new Sky();
  sky.scale.setScalar(4500);
  const uniforms = sky.material.uniforms;
  uniforms.turbidity.value = 4.5;
  uniforms.rayleigh.value = 1.5;
  uniforms.mieCoefficient.value = 0.004;
  uniforms.mieDirectionalG.value = 0.8;
  uniforms.sunPosition.value.copy(SUN_DIR);
  group.add(sky);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envSky = new Sky();
  envSky.scale.setScalar(4500);
  envSky.material.uniforms.turbidity.value = 4.5;
  envSky.material.uniforms.rayleigh.value = 1.5;
  envSky.material.uniforms.mieCoefficient.value = 0.004;
  envSky.material.uniforms.mieDirectionalG.value = 0.8;
  envSky.material.uniforms.sunPosition.value.copy(SUN_DIR);
  envScene.add(envSky);
  const envGround = new THREE.Mesh(new THREE.CircleGeometry(4000, 32), new THREE.MeshBasicMaterial({ color: 0x35352f }));
  envGround.rotation.x = -Math.PI / 2;
  envGround.position.y = -2;
  envScene.add(envGround);
  const env = pmrem.fromScene(envScene, 0.015, 0.5, 6000);
  envGround.geometry.dispose();
  (envGround.material as THREE.Material).dispose();
  envSky.geometry.dispose();
  envSky.material.dispose();
  pmrem.dispose();
  scene.environment = env.texture;
  scene.environmentIntensity = 0.62;
  scene.fog = new THREE.FogExp2(0xcfd0cb, 0.0064);

  /* ---- road, kerbs, pavement and verge ---- */
  const LENGTH = 700;
  const roadLeft = -14.5, roadRight = 3.4;
  const roadWidth = roadRight - roadLeft;
  const road = new THREE.Mesh(flat(roadWidth, LENGTH, (roadLeft + roadRight) / 2, 0),
    groundMaterial({ base: [62, 63, 65], tint: 0.34, speck: 0.5, bump: 2.4, rough: 0.78, seed: 11 }, roadWidth / 3.2, LENGTH / 3.2));
  group.add(road);

  const paint = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.62, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const white: THREE.BufferGeometry[] = [], yellow: THREE.BufferGeometry[] = [];
  white.push(flat(0.13, LENGTH, 1.85, 0.006), flat(0.13, LENGTH, -12.95, 0.006));
  yellow.push(flat(0.11, LENGTH, -5.47, 0.006), flat(0.11, LENGTH, -5.63, 0.006));
  for (let z = -LENGTH / 2; z < LENGTH / 2; z += 12.2) {
    white.push(flat(0.12, 3.05, -1.85, 0.006, z), flat(0.12, 3.05, -9.25, 0.006, z));
  }
  group.add(new THREE.Mesh(mergeGeometries(white), paint(0xcfccc2)), new THREE.Mesh(mergeGeometries(yellow), paint(0xb9892a)));
  white.concat(yellow).forEach(g => g.dispose());

  const concrete = groundMaterial({ base: [150, 147, 138], tint: 0.2, speck: 0.14, bump: 1, rough: 0.92, seed: 23 }, 2, LENGTH / 2.2);
  const kerbs = mergeGeometries([roadRight + 0.08, roadLeft - 0.08].map(x => {
    const g = new THREE.BoxGeometry(0.16, 0.16, LENGTH);
    g.translate(x, 0.08, 0);
    return g;
  }));
  group.add(new THREE.Mesh(kerbs, concrete));
  group.add(new THREE.Mesh(mergeGeometries([flat(2.7, LENGTH, 4.91, 0.15), flat(2.7, LENGTH, -15.91, 0.15)]), concrete));
  const joints = mergeGeometries(Array.from({ length: 2 * Math.floor(LENGTH / 2.2) }, (_, i) => {
    const side = i % 2 ? 4.91 : -15.91;
    return flat(2.7, 0.018, side, 0.153, -LENGTH / 2 + Math.floor(i / 2) * 2.2);
  }));
  group.add(new THREE.Mesh(joints, new THREE.MeshStandardMaterial({ color: 0x55534e, roughness: 1 })));

  const grass = groundMaterial({ base: [92, 96, 66], tint: 0.34, speck: 0.3, bump: 3, rough: 0.96, seed: 31 }, 150, 260);
  group.add(new THREE.Mesh(mergeGeometries([flat(600, 1000, 306.26, 0.14), flat(600, 1000, -317.26, 0.14)]), grass));

  /* ---- buildings ---- */
  const facades = [
    facadeTexture(5, '#8d8a82', '#e8c98c'), facadeTexture(6, '#6f7478', '#f0d9a8'),
    facadeTexture(7, '#9a7f6a', '#e6c27f'), facadeTexture(8, '#565d63', '#dcd3b4'),
  ];
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x3b3c3d, roughness: 0.95 });
  const walls = facades.map(map => new THREE.MeshStandardMaterial({ map, roughness: 0.55, metalness: 0.15 }));
  [1, -1].forEach(side => {
    for (let z = -330; z < 330;) {
      const along = 20 + rand() * 18, deep = 16 + rand() * 16, tall = 9 + rand() * rand() * 42;
      const x = side > 0 ? 135 + rand() * 70 + deep / 2 : -150 - rand() * 70 - deep / 2;
      const g = new THREE.BoxGeometry(deep, tall, along);
      const uv = g.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) {
        const face = Math.floor(i / 4);
        const u = face < 2 ? along : deep;
        uv.setXY(i, uv.getX(i) * Math.round(u / 7), uv.getY(i) * Math.round(tall / 7));
      }
      const wall = walls[Math.floor(rand() * walls.length)];
      const mesh = new THREE.Mesh(g, [wall, wall, roofMat, roofMat, wall, wall]);
      mesh.position.set(x, tall / 2, z + along / 2);
      group.add(mesh);
      z += along + 5 + rand() * 12;
    }
  });

  /* ---- street trees: alpha cards around a trunk ---- */
  const spots: [number, number][] = [];
  for (let z = -320; z < 360; z += 8 + rand() * 6) {
    spots.push([52 + rand() * 34, z], [-64 - rand() * 34, z + 4]);
    if (rand() > 0.4) spots.push([95 + rand() * 30, z + 3]);
    if (rand() > 0.4) spots.push([-108 - rand() * 30, z + 6]);
  }
  const CARDS = 240;
  const leafMap = leafTexture();
  const leafMat = new THREE.MeshStandardMaterial({ map: leafMap, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.82 });
  const leaves = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.7, 1.7), leafMat, spots.length * CARDS);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3f3429, roughness: 0.95 });
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.2, 1, 8), trunkMat, spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const p = new THREE.Vector3(), s = new THREE.Vector3(), col = new THREE.Color();
  spots.forEach(([x, z], t) => {
    const scale = 0.85 + rand() * 0.55;
    const trunkH = 3.1 * scale, crownY = trunkH + 2.1 * scale, crownR = 2.6 * scale;
    m.compose(p.set(x, trunkH / 2 + 0.14, z), q.identity(), s.set(scale, trunkH, scale));
    trunks.setMatrixAt(t, m);
    for (let i = 0; i < CARDS; i++) {
      const u = rand() * 2 - 1, a = rand() * Math.PI * 2, shell = 0.62 + rand() * 0.38;
      const ring = Math.sqrt(1 - u * u);
      const lobe = 1 + 0.2 * Math.sin(a * 3 + t) * Math.sin(u * 4 + t);
      p.set(x + ring * Math.cos(a) * crownR * shell * lobe, crownY + u * crownR * 0.82 * shell * lobe, z + ring * Math.sin(a) * crownR * shell * lobe);
      e.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
      const size = (0.75 + rand() * 0.7) * scale;
      m.compose(p, q.setFromEuler(e), s.set(size, size, size));
      leaves.setMatrixAt(t * CARDS + i, m);
      const light = 0.66 + 0.26 * (u + 1) / 2 * shell + rand() * 0.08;
      leaves.setColorAt(t * CARDS + i, col.setRGB(light, light * (0.96 + rand() * 0.08), light * 0.78));
    }
  });
  leaves.frustumCulled = false;
  trunks.frustumCulled = false;
  group.add(leaves, trunks);

  return {
    group,
    dispose() {
      scene.environment = null;
      scene.fog = null;
      env.dispose();
      const seen = new Set<THREE.Material>();
      group.traverse(node => {
        const mesh = node as THREE.Mesh;
        mesh.geometry?.dispose();
        const list = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
        list.forEach(mat => {
          if (seen.has(mat)) return;
          seen.add(mat);
          Object.values(mat).forEach(v => { if ((v as THREE.Texture)?.isTexture) (v as THREE.Texture).dispose(); });
          mat.dispose();
        });
      });
      leaves.dispose();
      trunks.dispose();
      scene.remove(group);
    },
  };
}
