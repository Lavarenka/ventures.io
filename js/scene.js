import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { state } from './state.js';

function makeGlowTexture() {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(210,230,255,0.85)');
  g.addColorStop(1, 'rgba(150,190,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

// ============ THE STONE — solid rock with glowing internal fracture veins ============
function createStone() {
  const geo = new THREE.IcosahedronGeometry(4.2, 24);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = Math.sin(x * 0.9 + y * 0.6) * Math.cos(y * 0.7 - z * 0.8) * Math.sin(z * 0.85 + x * 0.5);
    const n2 = Math.sin(x * 1.8 - z * 1.2) * Math.cos(y * 1.5) * 0.5;
    const scale = 1 + n * 0.16 + n2 * 0.08;
    pos.setXYZ(i, x * scale, y * scale * 1.35, z * scale * 0.9);
  }
  geo.computeVertexNormals();

  const uniforms = {
    uTime: { value: 0 },
    uCrackScale: { value: 3.2 },
    uCrackWidth: { value: 0.06 },
    uGlowColor: { value: new THREE.Color(0xdfefff) },
    uStoneColor: { value: new THREE.Color(0x1b2c3f) },
    uStoneDark: { value: new THREE.Color(0x060c16) },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vWorldPos;
      varying vec3 vObjPos;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vObjPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uCrackScale;
      uniform float uCrackWidth;
      uniform vec3 uGlowColor;
      uniform vec3 uStoneColor;
      uniform vec3 uStoneDark;
      varying vec3 vNormal;
      varying vec3 vWorldPos;
      varying vec3 vObjPos;

      vec3 hash3(vec3 p) {
        p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
                  dot(p, vec3(269.5, 183.3, 246.1)),
                  dot(p, vec3(113.5, 271.9, 124.6)));
        return fract(sin(p) * 43758.5453123);
      }

      vec2 worley(vec3 p) {
        vec3 ip = floor(p);
        vec3 fp = fract(p);
        float f1 = 8.0, f2 = 8.0;
        for (int z = -1; z <= 1; z++) {
          for (int y = -1; y <= 1; y++) {
            for (int x = -1; x <= 1; x++) {
              vec3 offset = vec3(float(x), float(y), float(z));
              vec3 pt = hash3(ip + offset);
              vec3 diff = offset + pt - fp;
              float d = length(diff);
              if (d < f1) { f2 = f1; f1 = d; }
              else if (d < f2) { f2 = d; }
            }
          }
        }
        return vec2(f1, f2);
      }

      void main() {
        vec3 p = vObjPos * uCrackScale * 0.28;
        vec2 w = worley(p);
        float cellEdge = w.y - w.x;

        float crack = 1.0 - smoothstep(0.0, uCrackWidth, cellEdge);
        float glowFalloff = 1.0 - smoothstep(0.0, uCrackWidth * 3.5, cellEdge);
        float pulse = 0.75 + 0.25 * sin(uTime * 1.4 + w.x * 12.0);

        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        float fres = pow(1.0 - max(dot(normalize(vNormal), viewDir), 0.0), 2.2);
        float topLight = clamp(dot(normalize(vNormal), normalize(vec3(-0.3, 1.0, 0.4))), 0.0, 1.0);
        vec3 stoneBase = mix(uStoneDark, uStoneColor, topLight * 0.7 + 0.15);
        stoneBase += fres * 0.08;

        vec3 col = mix(stoneBase, uGlowColor, glowFalloff * 0.5 * pulse);
        col += uGlowColor * crack * pulse * 1.4;

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  const mesh = new THREE.Mesh(geo, mat);
  return { mesh, uniforms, geo };
}

// ============ DISINTEGRATION PARTICLES ============
function createParticles(stoneGeo, glowTex) {
  const sampleCount = 6000;
  const basePositions = new Float32Array(sampleCount * 3);
  const randSeed = new Float32Array(sampleCount);
  const randDir = new Float32Array(sampleCount * 3);

  const posAttr = stoneGeo.attributes.position;
  const vertCount = posAttr.count;
  for (let i = 0; i < sampleCount; i++) {
    const vi = Math.floor(Math.random() * vertCount);
    basePositions[i * 3] = posAttr.getX(vi);
    basePositions[i * 3 + 1] = posAttr.getY(vi);
    basePositions[i * 3 + 2] = posAttr.getZ(vi);
    randSeed[i] = Math.random() * Math.PI * 2;
    const dx = Math.random() - 0.5, dy = Math.random() * 0.6 + 0.3, dz = Math.random() - 0.5;
    const len = Math.hypot(dx, dy, dz) || 1;
    randDir[i * 3] = dx / len;
    randDir[i * 3 + 1] = dy / len;
    randDir[i * 3 + 2] = dz / len;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(basePositions, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(randSeed, 1));
  geo.setAttribute('aDir', new THREE.BufferAttribute(randDir, 3));

  const uniforms = {
    uTime: { value: 0 },
    uTex: { value: glowTex },
    uDisintegrate: { value: 0.0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `
      attribute float aSeed;
      attribute vec3 aDir;
      uniform float uTime;
      uniform float uDisintegrate;
      varying float vAlpha;
      void main() {
        float travel = uDisintegrate * (3.0 + aSeed);
        vec3 p = position + aDir * travel;
        p.x += sin(uTime * 0.3 + aSeed) * uDisintegrate * 1.5;
        p.z += cos(uTime * 0.25 + aSeed) * uDisintegrate * 1.5;

        vAlpha = smoothstep(0.0, 0.15, uDisintegrate) * (1.0 - smoothstep(0.75, 1.0, uDisintegrate) * 0.5) * (0.5 + 0.5 * sin(uTime * 2.0 + aSeed));

        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float dist = max(-mv.z, 0.1);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(140.0 / dist, 1.0, 9.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D uTex;
      varying float vAlpha;
      void main() {
        vec4 tex = texture2D(uTex, gl_PointCoord);
        gl_FragColor = vec4(tex.rgb, tex.a * vAlpha);
      }
    `,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  return { points, uniforms };
}

// ============ LIVING SEA ============
function createSea() {
  const geo = new THREE.PlaneGeometry(300, 220, 280, 180);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColorDeep: { value: new THREE.Color(0x030810) },
      uColorMid: { value: new THREE.Color(0x0e2438) },
      uColorGlint: { value: new THREE.Color(0xbfe0ff) },
      uColorRim: { value: new THREE.Color(0x4f7ba8) },
      uColorFoam: { value: new THREE.Color(0xdcecff) },
      uLightDir: { value: new THREE.Vector3(-0.4, 1, 0.3).normalize() },
    },
    vertexShader: `
      uniform float uTime;
      varying vec3 vNormal;
      varying float vHeight;
      varying vec2 vUv;

      float wave(vec2 p, float freq, float speed, float amp, float t) {
        return sin(p.x * freq + t * speed) * amp;
      }

      float ripple(vec2 p, float t) {
        float n = 0.0;
        n += sin(p.x * 0.9 + p.y * 0.6 + t * 2.4) * 0.06;
        n += sin(p.x * 1.6 - p.y * 1.1 + t * 3.1) * 0.04;
        n += sin(p.x * 2.8 + p.y * 2.3 - t * 4.0) * 0.02;
        return n;
      }

      float heightAt(vec2 xz, float t) {
        float h = 0.0;
        h += wave(xz, 0.05, 0.85, 1.0, t);
        h += wave(xz.yx, 0.1, 1.3, 0.5, t * 1.25);
        h += wave(xz + xz.yx, 0.18, 2.0, 0.25, t * 1.6);
        h += ripple(xz, t);
        return h;
      }

      void main() {
        vUv = uv;
        vec3 p = position;
        float t = uTime;
        float h = heightAt(p.xz, t);
        p.y += h;
        vHeight = h;

        float eps = 0.5;
        float hX = heightAt(vec2(p.x + eps, p.z), t);
        float hZ = heightAt(vec2(p.x, p.z + eps), t);
        vec3 tangentX = normalize(vec3(eps, hX - h, 0.0));
        vec3 tangentZ = normalize(vec3(0.0, hZ - h, eps));
        vNormal = normalize(cross(tangentZ, tangentX));

        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColorDeep;
      uniform vec3 uColorMid;
      uniform vec3 uColorGlint;
      uniform vec3 uColorRim;
      uniform vec3 uColorFoam;
      uniform vec3 uLightDir;
      uniform float uTime;
      varying vec3 vNormal;
      varying float vHeight;
      varying vec2 vUv;

      void main() {
        vec3 N = normalize(vNormal);
        float diff = clamp(dot(N, normalize(uLightDir)), 0.0, 1.0);
        vec3 base = mix(uColorDeep, uColorMid, smoothstep(-1.2, 0.8, vHeight) * 0.75 + diff * 0.18);

        vec3 viewDir = vec3(0.0, 0.0, 1.0);
        vec3 halfDir = normalize(normalize(uLightDir) + viewDir);
        float specTight = pow(max(dot(N, halfDir), 0.0), 140.0);
        float specSoft = pow(max(dot(N, halfDir), 0.0), 18.0) * 0.35;

        float fres = pow(1.0 - max(dot(N, viewDir), 0.0), 3.0);

        float steep = 1.0 - clamp(N.y, 0.0, 1.0);
        float foamMask = smoothstep(0.85, 1.35, vHeight * 0.55 + steep * 1.1);

        vec3 col = base;
        col += uColorGlint * specTight * 1.1;
        col += uColorGlint * specSoft * 0.6;
        col += uColorRim * fres * 0.22;
        col = mix(col, uColorFoam, foamMask * 0.35);

        float fade = smoothstep(0.0, 0.55, vUv.y);
        col = mix(uColorDeep * 0.8, col, fade);

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  return { mesh, mat };
}

export function initScene(canvas, { onFps } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a1424);
  scene.fog = new THREE.FogExp2(0x0a1424, 0.014);

  const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 400);
  camera.position.set(0, 1, 34);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.75, 0.65, 0.42);
  composer.addPass(bloom);

  const glowTex = makeGlowTexture();

  const { mesh: stone, uniforms: stoneUniforms, geo: stoneGeo } = createStone();
  stone.position.set(0, 7, -6);
  scene.add(stone);

  const { points: particles, uniforms: particleUniforms } = createParticles(stoneGeo, glowTex);
  particles.position.copy(stone.position);
  scene.add(particles);

  const key = new THREE.DirectionalLight(0xbfe0ff, 1.4);
  key.position.set(-10, 14, 10);
  scene.add(key);
  scene.add(new THREE.AmbientLight(0x1a2a3a, 0.6));

  const { mesh: sea, mat: seaMat } = createSea();
  sea.position.y = -6;
  sea.position.z = -25;
  scene.add(sea);

  const mistGeo = new THREE.PlaneGeometry(300, 40);
  const mistMat = new THREE.MeshBasicMaterial({ color: 0x0e2030, transparent: true, opacity: 0.35, depthWrite: false });
  const mist = new THREE.Mesh(mistGeo, mistMat);
  mist.position.set(0, -3, -55);
  scene.add(mist);

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
  });

  const clock = new THREE.Clock();
  const orbitCenter = new THREE.Vector3(0, 6, -6);
  const orbitRadius = 34;
  const orbitSpeed = state.reducedMotion ? 0.012 : 0.045;

  let frameCount = 0, fpsClock = 0;

  function animate() {
    requestAnimationFrame(animate);
    const dt = clock.getDelta();
    const t = clock.elapsedTime;

    stoneUniforms.uTime.value = t;
    particleUniforms.uTime.value = t;
    seaMat.uniforms.uTime.value = t;

    // hero-only disintegration: fully driven by scrollFraction within [0, 1] of the hero height
    const dis = Math.min(1, state.scrollFraction / 0.7);
    particleUniforms.uDisintegrate.value = dis;
    stone.material.opacity = 1 - Math.min(1, state.scrollFraction / 0.55);
    stone.visible = stone.material.opacity > 0.01;

    stone.rotation.y = t * (state.reducedMotion ? 0.02 : 0.09);

    const angle = t * orbitSpeed + state.pointerNDC.x * 0.35;
    const heightOffset = 1 - state.pointerNDC.y * 3;
    const radius = orbitRadius - Math.min(state.scrollFraction, 0.7) * 8;
    camera.position.x = orbitCenter.x + Math.sin(angle) * radius;
    camera.position.z = orbitCenter.z + Math.cos(angle) * radius;
    camera.position.y += (orbitCenter.y - 5 + heightOffset - camera.position.y) * 0.02;
    camera.lookAt(orbitCenter);

    composer.render();

    if (onFps) {
      frameCount++;
      fpsClock += dt;
      if (fpsClock >= 0.5) {
        onFps(Math.round(frameCount / fpsClock));
        frameCount = 0;
        fpsClock = 0;
      }
    }
  }
  animate();
}
