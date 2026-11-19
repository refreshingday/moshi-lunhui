// Renderer, camera, lighting, time-of-day and the post pass (ACES + tilt-shift + rebirth warp)
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export const isTouch = matchMedia('(pointer:coarse)').matches;

const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function createRenderer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'high-performance', premultipliedAlpha: true });
  let quality = isTouch ? 1.25 : Math.min(devicePixelRatio, 1.5);
  renderer.setPixelRatio(quality);
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NoToneMapping;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 1.5, 240);
  const HOME_BASE = new THREE.Vector3(15.5, 15.5, 20.5);
  const HOME = { pos: HOME_BASE.clone(), target: new THREE.Vector3(0, 0, 0.3) };
  camera.position.copy(HOME.pos);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(HOME.target);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.minDistance = 5; controls.maxDistance = 110;
  controls.maxPolarAngle = 1.22; controls.minPolarAngle = 0.25;
  controls.enablePan = false;
  controls.rotateSpeed = 0.6; controls.zoomSpeed = 0.8;

  // ---------- lights ----------
  const hemi = new THREE.HemisphereLight(0xdfe8f0, 0x8a7a62, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(isTouch ? 1024 : 2048, isTouch ? 1024 : 2048);
  const sc = sun.shadow.camera; sc.left = -12; sc.right = 12; sc.top = 12; sc.bottom = -12; sc.near = 1; sc.far = 80;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0xb8c8ff, 0.25); fill.position.set(-8, 6, -6); scene.add(fill);

  const pointLights = [];
  for (let i = 0; i < 4; i++) {
    const p = new THREE.PointLight(0xffb36b, 0, 4.5, 1.6);
    scene.add(p); pointLights.push(p);
  }
  const fireLight = new THREE.PointLight(0xff7a2a, 0, 5, 1.5); scene.add(fireLight);
  // the survivor's own lantern: keeps the fight readable once the city goes dark
  const playerLight = new THREE.PointLight(0xffe0b4, 0, 5.2, 1.3); scene.add(playerLight);

  // ---------- post ----------
  const size = new THREE.Vector2();
  const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: isTouch ? 0 : 4, depthBuffer: true });
  const postMat = new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: rt.texture }, uRes: { value: new THREE.Vector2(1, 1) },
      uTilt: { value: 0.55 }, uFocus: { value: 0.46 }, uExposure: { value: 1.0 },
      uDesat: { value: 0 }, uRed: { value: 0 }, uWarp: { value: 0 }, uTime: { value: 0 }, uHurt: { value: 0 }, uGrade: { value: new THREE.Vector3(1, 1, 1) },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
    fragmentShader: /* glsl */`
      precision highp float;
      varying vec2 vUv; uniform sampler2D tDiffuse; uniform vec2 uRes;
      uniform float uTilt, uFocus, uExposure, uDesat, uRed, uWarp, uTime, uHurt; uniform vec3 uGrade;
      vec3 aces(vec3 x){ const float a=2.51,b=0.03,c=2.43,d=0.59,e=0.14; return clamp((x*(a*x+b))/(x*(c*x+d)+e),0.,1.); }
      vec3 toSRGB(vec3 c){ return mix(c*12.92, 1.055*pow(c, vec3(1./2.4))-0.055, step(0.0031308, c)); }
      vec2 warp(vec2 uv){
        if(uWarp <= 0.0) return uv;
        vec2 d = uv - 0.5; float r = length(d);
        float a = uWarp * 2.2 * (1.0 - smoothstep(0.0, 0.75, r)) * sin(uTime*1.3 + r*6.0);
        float s = sin(a), c = cos(a);
        return 0.5 + mat2(c,-s,s,c) * d * (1.0 - uWarp*0.06*sin(uTime*2.0));
      }
      void main(){
        vec2 uv = warp(vUv);
        float dy = abs(uv.y - uFocus);
        float blur = smoothstep(0.14, 0.55, dy) * uTilt * 7.0 + uWarp * 5.0;
        vec4 col = texture2D(tDiffuse, uv);
        if (blur > 0.25) {
          vec2 px = blur / uRes;
          vec4 acc = col; float w = 1.0;
          for (int i = 0; i < 12; i++) {
            float fi = float(i);
            float ang = fi * 2.39996; float rr = sqrt((fi + 0.5) / 12.0);
            vec2 o = vec2(cos(ang), sin(ang)) * rr;
            acc += texture2D(tDiffuse, uv + o * px); w += 1.0;
          }
          col = acc / w;
        }
        if (uWarp > 0.0) { // chromatic split while time rewinds
          vec2 d = (uv - 0.5) * uWarp * 0.012;
          col.r = texture2D(tDiffuse, uv + d).r; col.b = texture2D(tDiffuse, uv - d).b;
        }
        float a = clamp(col.a, 0.0, 1.0);
        vec3 c = a > 0.0001 ? col.rgb / max(col.a, 0.0001) : vec3(0.0);
        c *= uExposure * uGrade;
        c = aces(c);
        float l = dot(c, vec3(0.299, 0.587, 0.114));
        c = mix(c, vec3(l), uDesat);
        c = mix(c, vec3(l * 1.25, l * 0.38, l * 0.28), uRed);
        c = toSRGB(c);
        // hurt vignette (only visible on the diorama)
        float vg = smoothstep(0.35, 0.85, length(vUv - 0.5));
        c = mix(c, vec3(0.6, 0.05, 0.03), vg * uHurt);
        gl_FragColor = vec4(c * a, a);
      }`,
    depthTest: false, depthWrite: false, transparent: false,
  });
  const postScene = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat);
  quad.frustumCulled = false;
  postScene.add(quad);
  const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w < 700 ? 38 : 28;
    camera.updateProjectionMatrix();
    // pull the home view back on narrow aspects so the whole block fits
    const aspect = w / h, fit = w < 700 ? 0.95 : 1.55;
    const f = Math.min(2.1, Math.max(1, fit / aspect));
    HOME.pos.copy(HOME.target).addScaledVector(HOME_BASE.clone().sub(HOME.target), f);
    renderer.getDrawingBufferSize(size);
    rt.setSize(size.x, size.y);
    postMat.uniforms.uRes.value.copy(size);
  }
  addEventListener('resize', resize);
  resize();

  function setQuality(q) { quality = q; renderer.setPixelRatio(q); resize(); }

  // ---------- time of day ----------
  // hour: 0..24 ; apoc: 0..1 (world gone wrong: red haze)
  const C = (h) => new THREE.Color(h);
  const cSunNoon = C(0xfff3e2), cSunGold = C(0xffb26b), cSunRed = C(0xff7348), cMoon = C(0x8fa6ff);
  const cSkyDay = C(0xe4ecf2), cSkyDusk = C(0xf3c9a0), cSkyNight = C(0x2a3550), cSkyApoc = C(0xb5745c);
  const cGndDay = C(0x9a8a70), cGndNight = C(0x1e1a1c), cGndApoc = C(0x5a3426);
  const tmp = new THREE.Color();
  const state = { night: 0, day: 1 };
  function setTimeOfDay(hour, apoc = 0) {
    const ang = ((hour - 6) / 12) * Math.PI; // 6h sunrise, 18h sunset
    const elev = Math.sin(ang);
    const day = sstep(-0.12, 0.22, elev);
    const gold = 1 - sstep(0.05, 0.55, elev);
    const az = 0.85 + (hour - 12) * 0.12;
    const r = 26;
    if (day > 0.02) {
      const e = Math.max(elev, 0.08);
      sunRel.set(Math.cos(az) * r * Math.cos(e * 1.1), r * Math.sin(Math.max(0.12, e)) + 2, Math.sin(az) * r * 0.75 + 10);
      tmp.copy(cSunNoon).lerp(cSunGold, gold * 0.9).lerp(cSunRed, apoc * 0.45);
      sun.color.copy(tmp).lerp(cMoon, 1 - day);
      sun.intensity = lerp(0.45, 2.7, day) * (1 - apoc * 0.25);
    } else {
      sunRel.set(-10, 20, 14);
      sun.color.copy(cMoon).lerp(cSunRed, apoc * 0.25);
      sun.intensity = 0.45;
    }
    hemi.color.copy(cSkyDay).lerp(cSkyDusk, gold * day).lerp(cSkyNight, 1 - day).lerp(cSkyApoc, apoc * (0.35 + 0.25 * day));
    hemi.groundColor.copy(cGndDay).lerp(cGndNight, 1 - day).lerp(cGndApoc, apoc * 0.4);
    hemi.intensity = lerp(0.42, 1.0, day);
    postMat.uniforms.uExposure.value = lerp(1.35, 1.0, day);
    postMat.uniforms.uGrade.value.set(1 + apoc * 0.06, 1 - apoc * 0.04, 1 - apoc * 0.1 + (1 - day) * 0.06);
    state.night = 1 - day; state.day = day;
    return state;
  }

  // the sun follows the camera focus so the shadow box stays on what we look at
  const focus = new THREE.Vector3(), sunRel = new THREE.Vector3(10, 20, 14);
  let shadowSpan = 12;
  function setShadowSpan(s) { if (Math.abs(s - shadowSpan) < 0.5) return; shadowSpan = s; sc.left = sc.bottom = -s; sc.right = sc.top = s; sc.updateProjectionMatrix(); }
  function render() {
    const snap = shadowSpan * 2 / sun.shadow.mapSize.x * 4;
    const fx = Math.round(focus.x / snap) * snap, fz = Math.round(focus.z / snap) * snap;
    sun.position.set(fx + sunRel.x, sunRel.y, fz + sunRel.z); sun.target.position.set(fx, 0, fz); sun.target.updateMatrixWorld();
    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.clear();
    renderer.render(postScene, postCam);
  }

  return { renderer, scene, camera, controls, sun, hemi, pointLights, fireLight, playerLight, post: postMat.uniforms, render, resize, setQuality, setTimeOfDay, HOME, focus, setShadowSpan, get quality() { return quality; } };
}

export { lerp, sstep };
