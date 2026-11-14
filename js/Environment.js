/* ============================================================
   Environment — renderer, procedural sky, IBL, sun/shadows,
   fog, clouds, god rays and the EffectComposer pipeline.
   Quality presets rebuild the post chain without losing state.
   ============================================================ */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { makeRadialTexture, makeCloudTexture, makeShaftTexture, lerp, damp, clamp } from './Utils.js';

export const QUALITY = {
  low:    { shadow: false, shadowSize: 1024, bloom: false, ssao: false, dof: false, smaa: true,  maxPR: 0.85, bloomStrength: 0.0,  bloomRadius: 0.4,  bloomThreshold: 0.9 },
  medium: { shadow: true,  shadowSize: 2048, bloom: true,  ssao: false, dof: false, smaa: true,  maxPR: 1.0,  bloomStrength: 0.3,  bloomRadius: 0.5,  bloomThreshold: 0.88 },
  high:   { shadow: true,  shadowSize: 4096, bloom: true,  ssao: false, dof: true,  smaa: true,  maxPR: 1.4,  bloomStrength: 0.4,  bloomRadius: 0.6,  bloomThreshold: 0.84 },
  ultra:  { shadow: true,  shadowSize: 4096, bloom: true,  ssao: true,  dof: true,  smaa: true,  maxPR: 1.7,  bloomStrength: 0.46, bloomRadius: 0.65, bloomThreshold: 0.82 },
};

const AMBIANCE = {
  meadow: {
    fog: 0xc7e5dd, fogDensity: 0.0042, sun: 2.8, sunColor: 0xfff0cf, hemi: 0.72, exposure: 1.0,
    skyTop: 0x4e9fd8, skyHorizon: 0xd8ecdf, skyBottom: 0x6f8d7a, cloud: 0.55, bloom: 1.0, rays: true,
  },
  ruins: {
    fog: 0xdccdb4, fogDensity: 0.0052, sun: 2.65, sunColor: 0xffdba4, hemi: 0.62, exposure: 1.02,
    skyTop: 0x6d95b8, skyHorizon: 0xf2ddba, skyBottom: 0x8a7d60, cloud: 0.42, bloom: 1.0, rays: true,
  },
  crystal: {
    fog: 0x0a2b36, fogDensity: 0.019, sun: 0.55, sunColor: 0x9fe4e8, hemi: 0.62, exposure: 1.18,
    skyTop: 0x03141b, skyHorizon: 0x0d3540, skyBottom: 0x021014, cloud: 0.0, bloom: 1.5, rays: false,
  },
  sky: {
    fog: 0xe3f2f4, fogDensity: 0.0028, sun: 3.1, sunColor: 0xfff6dd, hemi: 0.95, exposure: 1.04,
    skyTop: 0x3d92dc, skyHorizon: 0xe6f2ed, skyBottom: 0x8fb9b5, cloud: 0.8, bloom: 1.15, rays: true,
  },
};

const SKY_VERT = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_Position.z = gl_Position.w; // always at far plane
  }
`;

const SKY_FRAG = /* glsl */`
  precision highp float;
  uniform vec3 uSunDir;
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uBottom;
  uniform vec3 uSunColor;
  uniform vec3 uCloudColor;
  uniform vec3 uCloudShade;
  uniform float uTime;
  uniform float uCloudAmount;
  varying vec3 vDir;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p = p * 2.03 + vec2(11.7, 5.3);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 dir = normalize(vDir);
    float up = clamp(dir.y, -1.0, 1.0);
    float h = clamp(up * 0.5 + 0.5, 0.0, 1.0);

    // Base vertical gradient, extra warm at the horizon.
    vec3 col = mix(uBottom, uHorizon, smoothstep(-0.18, 0.06, up));
    col = mix(col, uTop, pow(clamp(up, 0.0, 1.0), 0.58));

    float sun = clamp(dot(dir, uSunDir), 0.0, 1.0);
    float az = max(0.0, dot(normalize(vec3(dir.x, 0.0, dir.z)), normalize(vec3(uSunDir.x, 0.0, uSunDir.z))));

    // Warm horizon wash on the sun's side.
    float horizonWarm = pow(1.0 - abs(up), 7.0) * pow(az, 2.0);
    col += uSunColor * horizonWarm * 0.22;

    // Sun disk + broad halo.
    col += uSunColor * pow(sun, 900.0) * 4.2;
    col += uSunColor * pow(sun, 32.0) * 0.34;
    col += uSunColor * pow(sun, 6.0) * 0.08;

    // Procedural cloud deck (projected on a virtual plane).
    vec2 cuv = dir.xz / max(up, 0.055) * 0.42;
    cuv += vec2(uTime * 0.0018, uTime * 0.0007);
    float n = fbm(cuv * 1.7 + fbm(cuv * 0.8) * 0.9);
    float cloud = smoothstep(0.51, 0.74, n) * smoothstep(0.015, 0.24, up);
    cloud *= uCloudAmount;
    float lit = clamp(0.35 + sun * 0.9, 0.0, 1.0);
    vec3 cloudCol = mix(uCloudShade, uCloudColor, lit);
    cloudCol += uSunColor * pow(sun, 4.0) * 0.16;
    col = mix(col, cloudCol, cloud * 0.82);

    // Subtle atmospheric noise / dithering.
    float dither = (hash(gl_FragCoord.xy) - 0.5) * 0.0035;
    col += dither;

    gl_FragColor = vec4(col, 1.0);
  }
`;

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 0.36 },
    uSaturation: { value: 1.12 },
    uGrain: { value: 0.018 },
    uWarmth: { value: 0.04 },
    uAberration: { value: 0.0016 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime, uVignette, uSaturation, uGrain, uWarmth, uAberration;
    varying vec2 vUv;
    void main() {
      vec2 uv = vUv;
      vec2 d = uv - 0.5;
      float r2 = dot(d, d);
      float ca = uAberration * (0.35 + r2 * 2.2);
      vec3 col;
      col.r = texture2D(tDiffuse, uv + d * ca).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - d * ca).b;

      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(lum), col, uSaturation);
      // teal shadows / warm highlights, filmic split-tone
      col *= vec3(1.0 + uWarmth, 1.0 + uWarmth * 0.35, 1.0 - uWarmth * 0.35);
      col += vec3(-0.004, 0.006, 0.010) * (1.0 - smoothstep(0.0, 0.45, lum));
      col += vec3(0.012, 0.006, -0.006) * smoothstep(0.55, 1.0, lum);

      float vig = smoothstep(1.03, 0.26, length(d) * 1.42);
      col *= mix(1.0, vig, uVignette);

      float grain = fract(sin(dot(uv * (1.0 + fract(uTime) * 0.01) * 1013.0, vec2(12.9898, 78.233))) * 43758.5453);
      col += (grain - 0.5) * uGrain;

      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }
  `,
};

export class Environment {
  constructor(container, { quality = 'high', renderScale = 1.0 } = {}) {
    this.container = container;
    this.qualityName = quality;
    this.renderScale = renderScale;
    this.autoScale = 1;
    this.tmpColor = new THREE.Color();
    this.zone = 'meadow';
    this.ambiance = { ...AMBIANCE.meadow };
    this.currentAmbiance = {
      fog: new THREE.Color(AMBIANCE.meadow.fog),
      fogDensity: AMBIANCE.meadow.fogDensity,
      sun: AMBIANCE.meadow.sun,
      sunColor: new THREE.Color(AMBIANCE.meadow.sunColor),
      hemi: AMBIANCE.meadow.hemi,
      exposure: AMBIANCE.meadow.exposure,
      skyTop: new THREE.Color(AMBIANCE.meadow.skyTop),
      skyHorizon: new THREE.Color(AMBIANCE.meadow.skyHorizon),
      skyBottom: new THREE.Color(AMBIANCE.meadow.skyBottom),
      cloud: AMBIANCE.meadow.cloud,
      bloom: 1.0,
    };
    this.dayTime = 0.42;
    this.sunDir = new THREE.Vector3(0.55, 0.74, 0.38).normalize();

    /* ---------- renderer ---------- */
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
      logarithmicDepthBuffer: false,
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.info.autoReset = true;
    this.renderer.domElement.setAttribute('aria-label', 'Aetherbound game viewport');
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(AMBIANCE.meadow.fog, AMBIANCE.meadow.fogDensity);

    this.camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 1200);
    this.camera.position.set(0, 6, 14);
    this.cameraTarget = new THREE.Vector3(0, 2, 0);

    /* ---------- sky ---------- */
    this.sunColor = new THREE.Color(0xfff0cf);
    this.skyUniforms = {
      uSunDir: { value: this.sunDir.clone() },
      uTop: { value: new THREE.Color(AMBIANCE.meadow.skyTop) },
      uHorizon: { value: new THREE.Color(AMBIANCE.meadow.skyHorizon) },
      uBottom: { value: new THREE.Color(AMBIANCE.meadow.skyBottom) },
      uSunColor: { value: new THREE.Color(0xfff0c8) },
      uCloudColor: { value: new THREE.Color(0xfdfbf4) },
      uCloudShade: { value: new THREE.Color(0xb9cfd4) },
      uTime: { value: 0 },
      uCloudAmount: { value: AMBIANCE.meadow.cloud },
    };
    const skyMat = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms,
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      toneMapped: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(620, 48, 32), skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -20;
    this.scene.add(this.sky);

    // Separate scene used once to bake the sky into an IBL environment.
    this._buildEnvironmentMap();

    /* ---------- lighting ---------- */
    this.hemi = new THREE.HemisphereLight(0xbfe9ff, 0x6f7f4f, AMBIANCE.meadow.hemi);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(AMBIANCE.meadow.sunColor, AMBIANCE.meadow.sun);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 280;
    this.sun.shadow.camera.left = -60;
    this.sun.shadow.camera.right = 60;
    this.sun.shadow.camera.top = 60;
    this.sun.shadow.camera.bottom = -60;
    this.sun.shadow.bias = -0.0007;
    this.sun.shadow.normalBias = 0.035;
    this.sun.shadow.radius = 3.5;
    this.scene.add(this.sun);
    this.sun.target.position.set(0, 0, 0);
    this.scene.add(this.sun.target);

    this.fill = new THREE.DirectionalLight(0x9fdfff, 0.38);
    this.fill.position.set(-45, 35, -30);
    this.scene.add(this.fill);

    /* ---------- sun sprite + atmospheric shafts ---------- */
    this.glowTex = makeRadialTexture(128, 'rgba(255,248,220,1)', 'rgba(255,210,120,0)', 0.12);
    this.sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glowTex, color: 0xfff0c8, transparent: true, opacity: 0.72,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, toneMapped: false,
    }));
    this.sunSprite.scale.set(74, 74, 1);
    this.sunSprite.renderOrder = -10;
    this.scene.add(this.sunSprite);

    this.rays = new THREE.Group();
    this.godRaysEnabled = true;
    const shaftTex = makeShaftTexture(128);
    for (let i = 0; i < 8; i++) {
      const w = 8 + Math.random() * 22;
      const h = 38 + Math.random() * 50;
      const mat = new THREE.MeshBasicMaterial({
        map: shaftTex, color: 0xffe8b8, transparent: true,
        opacity: 0.035 + Math.random() * 0.045, blending: THREE.AdditiveBlending,
        depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false,
      });
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      plane.position.set(-15 + i * 9 + Math.random() * 6, 16 + Math.random() * 15, 12 - i * 5);
      plane.rotation.z = -0.35 + Math.random() * 0.2;
      plane.rotation.y = Math.random() * 0.4 - 0.2;
      plane.renderOrder = 2;
      this.rays.add(plane);
    }
    this.scene.add(this.rays);

    /* ---------- cloud layers ---------- */
    this.cloudTex = makeCloudTexture(256, 4);
    this.clouds = new THREE.Group();
    for (let i = 0; i < 22; i++) {
      const mat = new THREE.SpriteMaterial({
        map: this.cloudTex, transparent: true,
        opacity: 0.1 + Math.random() * 0.2,
        color: new THREE.Color().setHSL(0.52, 0.18, 0.94),
        depthWrite: false, fog: false, toneMapped: false,
      });
      const s = new THREE.Sprite(mat);
      const scale = 42 + Math.random() * 80;
      s.scale.set(scale * 1.7, scale * 0.62, 1);
      s.position.set((Math.random() - 0.5) * 360, 26 + Math.random() * 70, -260 + Math.random() * 310);
      s.userData.speed = 0.12 + Math.random() * 0.2;
      this.clouds.add(s);
    }
    this.scene.add(this.clouds);

    /* ---------- post ---------- */
    this.composer = null;
    this._buildComposer();
    this.applyQuality(quality, { silent: true });
    this._bindResize();
  }

  _buildEnvironmentMap() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    pmrem.compileEquirectangularShader();
    const envScene = new THREE.Scene();
    const envSky = new THREE.Mesh(this.sky.geometry, this.sky.material.clone());
    envSky.material.depthTest = true;
    envSky.material.side = THREE.BackSide;
    envScene.add(envSky);
    // A soft ground disc gives the IBL a believable bounce colour.
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(500, 32),
      new THREE.MeshBasicMaterial({ color: 0x6b7d54 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -12;
    envScene.add(ground);
    const rt = pmrem.fromScene(envScene, 0.02, 0.1, 1000);
    this.envMap = rt.texture;
    this.scene.environment = rt.texture;
    pmrem.dispose();
  }

  _buildComposer() {
    if (this.composer) {
      this.composer.dispose?.();
      this.composer = null;
    }
    const preset = QUALITY[this.qualityName] || QUALITY.high;
    this.composer = new EffectComposer(this.renderer);
    this.composer.setPixelRatio(this._effectivePixelRatio());
    this.composer.setSize(window.innerWidth, window.innerHeight);

    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    this.ssaoPass = null;
    if (preset.ssao) {
      try {
        this.ssaoPass = new SSAOPass(this.scene, this.camera, window.innerWidth, window.innerHeight);
        this.ssaoPass.kernelRadius = 1.4;
        this.ssaoPass.minDistance = 0.002;
        this.ssaoPass.maxDistance = 0.08;
        this.ssaoPass.output = SSAOPass.OUTPUT.Default;
        this.composer.addPass(this.ssaoPass);
      } catch (err) {
        console.warn('SSAO unavailable:', err);
        this.ssaoPass = null;
      }
    }

    this.bokehPass = null;
    if (preset.dof) {
      try {
        this.bokehPass = new BokehPass(this.scene, this.camera, { focus: 12, aperture: 0.00045, maxblur: 0.0055 });
        this.composer.addPass(this.bokehPass);
      } catch (err) {
        console.warn('DOF unavailable:', err);
        this.bokehPass = null;
      }
    }

    this.bloomPass = null;
    if (preset.bloom) {
      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        preset.bloomStrength, preset.bloomRadius, preset.bloomThreshold
      );
      this.composer.addPass(this.bloomPass);
    }

    this.gradePass = new ShaderPass(GradeShader);
    this.composer.addPass(this.gradePass);

    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);

    if (preset.smaa) {
      this.smaaPass = new SMAAPass(window.innerWidth, window.innerHeight);
      this.composer.addPass(this.smaaPass);
    } else {
      this.smaaPass = null;
    }

    this.renderer.shadowMap.enabled = preset.shadow;
    this.sun.castShadow = preset.shadow;
    this.sun.shadow.mapSize.set(preset.shadowSize, preset.shadowSize);
    if (this.sun.shadow.map) {
      this.sun.shadow.map.dispose();
      this.sun.shadow.map = null;
    }
  }

  _effectivePixelRatio() {
    const preset = QUALITY[this.qualityName] || QUALITY.high;
    const dpr = Math.min(window.devicePixelRatio || 1, preset.maxPR);
    return clamp(dpr * this.renderScale * this.autoScale, 0.5, 2.2);
  }

  applyQuality(name, { silent = false, renderScale = this.renderScale } = {}) {
    if (!QUALITY[name]) name = 'high';
    this.qualityName = name;
    this.renderScale = renderScale;
    if (!silent) this._buildComposer();
    this._applyResolution();
    return QUALITY[name];
  }

  _applyResolution() {
    const pr = this._effectivePixelRatio();
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    if (this.composer) {
      this.composer.setPixelRatio(pr);
      this.composer.setSize(window.innerWidth, window.innerHeight);
    }
    if (this.smaaPass && this.smaaPass.setSize) this.smaaPass.setSize(window.innerWidth, window.innerHeight);
  }

  setRenderScale(scale, { rebuild = false } = {}) {
    this.renderScale = clamp(scale, 0.6, 1.5);
    if (rebuild) this._buildComposer();
    this._applyResolution();
  }

  setAutoScale(scale) {
    this.autoScale = clamp(scale, 0.6, 1.0);
    this._applyResolution();
  }

  _bindResize() {
    window.addEventListener('resize', () => {
      const w = window.innerWidth, h = window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
      if (this.composer) this.composer.setSize(w, h);
      if (this.smaaPass && this.smaaPass.setSize) this.smaaPass.setSize(w, h);
      if (this.bokehPass) {
        this.bokehPass.uniforms.aspect.value = this.camera.aspect;
      }
    });
  }

  setZone(zone, instant = false) {
    const target = AMBIANCE[zone] || AMBIANCE.meadow;
    this.zone = zone;
    this.ambiance = target;
    if (instant) {
      this.currentAmbiance.fog.set(target.fog);
      this.currentAmbiance.fogDensity = target.fogDensity;
      this.currentAmbiance.sun = target.sun;
      this.currentAmbiance.sunColor.set(target.sunColor);
      this.currentAmbiance.hemi = target.hemi;
      this.currentAmbiance.exposure = target.exposure;
      this.currentAmbiance.skyTop.set(target.skyTop);
      this.currentAmbiance.skyHorizon.set(target.skyHorizon);
      this.currentAmbiance.skyBottom.set(target.skyBottom);
      this.currentAmbiance.cloud = target.cloud;
      this.currentAmbiance.bloom = target.bloom;
      this._applyAmbiance();
    }
  }

  _applyAmbiance() {
    const a = this.currentAmbiance;
    this.scene.fog.color.copy(a.fog);
    this.scene.fog.density = a.fogDensity;
    this.sun.intensity = a.sun;
    this.sun.color.copy(a.sunColor);
    this.hemi.intensity = a.hemi;
    this.hemi.color.copy(a.skyTop);
    this.hemi.groundColor.set(0x6f7f4f).lerp(a.fog, 0.25);
    this.renderer.toneMappingExposure = a.exposure;
    this.skyUniforms.uTop.value.copy(a.skyTop);
    this.skyUniforms.uHorizon.value.copy(a.skyHorizon);
    this.skyUniforms.uBottom.value.copy(a.skyBottom);
    this.skyUniforms.uCloudAmount.value = a.cloud;
    if (this.bloomPass) this.bloomPass.strength = (QUALITY[this.qualityName]?.bloomStrength || 0.35) * a.bloom;
    if (this.gradePass) this.gradePass.uniforms.uVignette.value = this.zone === 'crystal' ? 0.46 : 0.34;
    this.rays.visible = this.godRaysEnabled !== false && !!this.ambiance.rays;
  }

  setGodRays(enabled) {
    this.godRaysEnabled = !!enabled;
    this.rays.visible = this.godRaysEnabled && !!this.ambiance.rays;
  }

  getAmbiance() { return this.currentAmbiance; }

  update(dt, playerPos) {
    if (!playerPos) return;
    // slow time-of-day orbit
    this.dayTime += dt * 0.0032;
    const az = this.dayTime * 0.62;
    const elev = 0.55 + Math.sin(this.dayTime * 1.7) * 0.13;
    this.sunDir.set(Math.cos(az) * 0.95, elev, Math.sin(az) * 0.85).normalize();
    this.skyUniforms.uSunDir.value.copy(this.sunDir);
    this.skyUniforms.uTime.value += dt;

    // sky + sun sprite follow the camera; shadow light follows the player
    this.sky.position.copy(this.camera.position);
    this.sunSprite.position.copy(this.camera.position).addScaledVector(this.sunDir, 480);
    // keep the sun sprite on-screen sized consistently
    this.sunSprite.material.opacity = this.zone === 'crystal' ? 0.0 : 0.72;

    const shadowTarget = playerPos.clone();
    shadowTarget.y += 0.5;
    this.sun.target.position.copy(shadowTarget);
    this.sun.position.copy(shadowTarget).addScaledVector(this.sunDir, 105);
    this.sun.target.updateMatrixWorld();
    this.fill.position.copy(shadowTarget).add(new THREE.Vector3(-45, 35, -30));

    // smooth zone ambience
    const a = this.ambiance;
    const c = this.currentAmbiance;
    const k = 1 - Math.exp(-dt * 1.65);
    c.fog.lerp(this.tmpColor.set(a.fog), k);
    c.fogDensity = lerp(c.fogDensity, a.fogDensity, k);
    c.sun = lerp(c.sun, a.sun, k);
    c.sunColor.lerp(this.tmpColor.set(a.sunColor), k);
    c.hemi = lerp(c.hemi, a.hemi, k);
    c.exposure = lerp(c.exposure, a.exposure, k);
    c.skyTop.lerp(this.tmpColor.set(a.skyTop), k);
    c.skyHorizon.lerp(this.tmpColor.set(a.skyHorizon), k);
    c.skyBottom.lerp(this.tmpColor.set(a.skyBottom), k);
    c.cloud = lerp(c.cloud, a.cloud, k);
    c.bloom = lerp(c.bloom, a.bloom, k);
    this._applyAmbiance();
    this.skyUniforms.uSunColor.value.set(0xfff0c8).lerp(this.tmpColor.set(0xffc789), clamp(1 - this.sunDir.y, 0, 1) * 0.65);

    // clouds drift
    for (const cloud of this.clouds.children) {
      cloud.position.x += dt * cloud.userData.speed;
      if (cloud.position.x > 210) cloud.position.x = -210;
    }
    this.rays.rotation.y += dt * 0.002;

    // sun shafts gently pulse
    for (let i = 0; i < this.rays.children.length; i++) {
      const p = this.rays.children[i];
      p.material.opacity = (0.035 + Math.sin(performance.now() * 0.0002 + i) * 0.012) * (this.zone === 'crystal' ? 0 : 1);
    }

    if (this.gradePass) {
      this.gradePass.uniforms.uTime.value += dt;
      this.gradePass.uniforms.uSaturation.value = this.zone === 'crystal' ? 1.05 : 1.13;
    }
    if (this.bokehPass) {
      const dist = this.camera.position.distanceTo(playerPos);
      this.bokehPass.uniforms.focus.value = damp(this.bokehPass.uniforms.focus.value, dist, 4, dt);
      this.bokehPass.uniforms.aperture.value = 0.00045;
      this.bokehPass.uniforms.maxblur.value = 0.006;
    }
  }

  render(dt) {
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }
}
