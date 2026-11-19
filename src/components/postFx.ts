import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/** Lens finish applied last: slight fringing, vignette, grade and film grain. */
const LensShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime;
    varying vec2 vUv;
    float grain(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime) * 43758.5453); }
    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      vec2 shift = c * r2 * 0.012;
      vec3 col = vec3(texture2D(tDiffuse, vUv + shift).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - shift).b);
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(col * vec3(0.95, 1.0, 1.05), col * vec3(1.04, 1.0, 0.95), smoothstep(0.15, 0.75, luma));
      col = mix(col, col * col * (3.0 - 2.0 * col), 0.28);
      col *= 1.0 - smoothstep(0.12, 0.62, r2) * 0.42;
      col += (grain(vUv * 913.0) - 0.5) * 0.028;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export function createPostFx(renderer: THREE.WebGLRenderer, scene: THREE.Scene, startCamera: THREE.Camera) {
  const target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  const renderPass = new RenderPass(scene, startCamera);
  const ao = new GTAOPass(scene, startCamera as THREE.PerspectiveCamera, 4, 4);
  ao.blendIntensity = 0.9;
  ao.updateGtaoMaterial({ radius: 0.42, distanceExponent: 1.4, thickness: 1, scale: 1.15, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
  ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, radiusExponent: 1, rings: 2, samples: 12 });
  const bloom = new UnrealBloomPass(new THREE.Vector2(4, 4), 0.2, 0.55, 0.95);
  const output = new OutputPass();
  const lens = new ShaderPass(LensShader);
  [renderPass, ao, bloom, output, lens].forEach(pass => composer.addPass(pass));

  let wantAo = true;
  let quality = 2;       // 2 full, 1 no ambient occlusion, 0 also no bloom
  let slowFrames = 0;
  const applyQuality = () => {
    ao.enabled = wantAo && quality >= 2;
    bloom.enabled = quality >= 1;
  };
  applyQuality();

  return {
    render(seconds: number) {
      lens.uniforms.uTime.value = seconds % 10;
      composer.render();
    },
    setSize(width: number, height: number) {
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(width, height);
    },
    setCamera(camera: THREE.Camera) {
      renderPass.camera = camera;
      ao.camera = camera as THREE.PerspectiveCamera;
    },
    setAmbientOcclusion(on: boolean) {
      if (wantAo === on) return;
      wantAo = on;
      applyQuality();
    },
    /** Step quality down on machines that cannot hold an interactive frame rate. */
    noteFrame(milliseconds: number) {
      if (quality === 0 || milliseconds > 400) return;
      slowFrames = milliseconds > 45 ? slowFrames + 1 : Math.max(0, slowFrames - 2);
      if (slowFrames < 24) return;
      slowFrames = 0;
      quality -= 1;
      applyQuality();
    },
    dispose() {
      ao.dispose();
      bloom.dispose();
      output.dispose();
      lens.dispose();
      composer.dispose();
      target.dispose();
    },
  };
}
