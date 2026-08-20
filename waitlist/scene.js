/* Matriq waitlist — 3D scene: the lantern lighting your way through semester.
   Loaded via dynamic import() from app.js (importmap → jsdelivr three@0.160.0).
   Degrades gracefully: WebGL missing / load failure → CSS ambient stays. */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

(function () {
  "use strict";

  var canvas = document.getElementById("scene-canvas");
  if (!canvas) return;

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var conn = navigator.connection || { saveData: false, effectiveType: "4g" };
  var lite = conn.saveData === true || conn.effectiveType === "2g" || conn.effectiveType === "3g";

  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: !lite, alpha: true, powerPreference: "high-performance" });
  } catch (e) {
    return; // no WebGL → CSS orbs carry the look
  }

  var W = window.innerWidth, H = window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lite ? 1.5 : 2));
  renderer.setSize(W, H, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
  camera.position.set(0, 0.2, 6);

  // ── Lights (always on; HDR adds reflections on top when not in lite mode) ──
  var hemi = new THREE.HemisphereLight(0x8b5cf6, 0x0d0620, 0.75);
  scene.add(hemi);
  var key = new THREE.DirectionalLight(0xc084fc, 1.6);
  key.position.set(3, 4, 4);
  scene.add(key);
  var rim = new THREE.DirectionalLight(0x6c3baa, 0.8);
  rim.position.set(-4, -2, -3);
  scene.add(rim);

  // Lantern glow that always reads, even without HDR
  var glowLight = new THREE.PointLight(0xc084fc, 2.2, 12);
  glowLight.position.set(0, 1.1, 1.2);
  scene.add(glowLight);

  // ── Lantern group ──────────────────────────────────────────────
  var lantern = new THREE.Group();
  scene.add(lantern);

  var lanLoaded = false;
  var draco = new DRACOLoader();
  draco.setDecoderPath("assets/draco/");
  var loader = new GLTFLoader();
  loader.setDRACOLoader(draco);
  loader.load("assets/Lantern.opt.glb", function (gltf) {
    var model = gltf.scene;

    // Normalize scale so the lantern is ~2.2 units tall.
    var box = new THREE.Box3().setFromObject(model);
    var size = new THREE.Vector3();
    box.getSize(size);
    var scale = 2.2 / (size.y || 1);
    model.scale.setScalar(scale);
    model.position.y = -box.min.y * scale;

    // Give the glass a hint of the brand color.
    model.traverse(function (obj) {
      if (obj.isMesh) {
        obj.castShadow = false;
        if (obj.material && obj.material.emissive) {
          obj.material.emissiveIntensity = Math.max(obj.material.emissiveIntensity || 0, 0.35);
        }
      }
    });

    lantern.add(model);
    lanLoaded = true;
    lantern.scale.setScalar(reduceMotion ? 1 : 0.01);
    if (reduceMotion) renderer.render(scene, camera); // static frame once loaded
  });

  // ── HDR environment (premium PBR reflections) ──────────────────
  var pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  if (!lite) {
    new RGBELoader().load("assets/venice_sunset_1k.hdr", function (hdr) {
      var env = pmrem.fromEquirectangular(hdr).texture;
      scene.environment = env;
      env.dispose();
      pmrem.dispose();
    });
  }

  // ── Fireflies ───────────────────────────────────────────────────
  var FIREFLY_COUNT = lite ? 60 : 140;
  var fireflyGeo = new THREE.BufferGeometry();
  var flyPos = new Float32Array(FIREFLY_COUNT * 3);
  var flyPhase = new Float32Array(FIREFLY_COUNT);
  var flySpeed = new Float32Array(FIREFLY_COUNT);
  var flyBase = new Float32Array(FIREFLY_COUNT * 3);
  var flyVel = new Float32Array(FIREFLY_COUNT * 3);
  for (var i = 0; i < FIREFLY_COUNT; i++) {
    flyBase[i * 3] = (Math.random() - 0.5) * 9;
    flyBase[i * 3 + 1] = -1.2 + Math.random() * 5.2;
    flyBase[i * 3 + 2] = -2.5 + Math.random() * 3.5;
    flyPhase[i] = Math.random() * Math.PI * 2;
    flySpeed[i] = 0.4 + Math.random() * 1.1;
  }
  flyPos.set(flyBase);
  fireflyGeo.setAttribute("position", new THREE.BufferAttribute(flyPos, 3));

  // Soft round sprite via canvas (no extra asset needed)
  var spriteCanvas = document.createElement("canvas");
  spriteCanvas.width = spriteCanvas.height = 64;
  var sctx = spriteCanvas.getContext("2d");
  var grad = sctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255, 236, 200, 1)");
  grad.addColorStop(0.35, "rgba(198, 132, 252, 0.8)");
  grad.addColorStop(1, "rgba(139, 92, 246, 0)");
  sctx.fillStyle = grad;
  sctx.fillRect(0, 0, 64, 64);
  var spriteTex = new THREE.CanvasTexture(spriteCanvas);

  var fireflies = new THREE.Points(
    fireflyGeo,
    new THREE.PointsMaterial({
      size: 0.14,
      map: spriteTex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      color: 0xc084fc,
      opacity: 0.85,
    })
  );
  scene.add(fireflies);

  // ── Post-processing (bloom = the lantern glow) ─────────────────
  var composer = null;
  var bloom = null;
  if (!lite) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.75, 0.9, 0.12);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  }

  // ── Pointer parallax + tap-to-glow ─────────────────────────────
  var pointer = { x: 0, y: 0, world: new THREE.Vector3(0, 0, 0), hasWorld: false };
  var raycaster = new THREE.Raycaster();
  var planeZ = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  var tapBoost = 0;
  var spinVel = 0;

  window.addEventListener("pointermove", function (e) {
    pointer.x = (e.clientX / W) * 2 - 1;
    pointer.y = -(e.clientY / H) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    var hit = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(planeZ, hit)) {
      pointer.world.copy(hit);
      pointer.hasWorld = true;
    }
  }, { passive: true });

  function glowPulse() {
    tapBoost = 1;
    spinVel += 2.2;
    if (bloom) bloom.strength = 1.35;
  }
  window.addEventListener("pointerdown", function (e) {
    var nx = (e.clientX / W) * 2 - 1;
    var ny = -(e.clientY / H) * 2 + 1;
    raycaster.setFromCamera({ x: nx, y: ny }, camera);
    if (lanLoaded && raycaster.intersectObject(lantern, true).length > 0) {
      glowPulse();
    }
  }, { passive: true });

  // ── Scroll parallax ─────────────────────────────────────────────
  var baseLanternY = 0.35;
  var scrollOffset = 0;
  function onScroll() {
    var p = window.scrollY / Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    scrollOffset = p * -1.6;   // drifts up as you scroll
    lantern.rotation.z = p * -0.25;
    lantern.position.z = p * 0.8;  // recedes slightly
  }
  window.addEventListener("scroll", onScroll, { passive: true });

  // ── Responsive layout ───────────────────────────────────────────
  function isMobile() { return window.innerWidth < 760; }
  function layout() {
    W = window.innerWidth;
    H = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lite ? 1.5 : 2));
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    if (bloom) bloom.setSize(W, H);
    // On mobile the lantern sits above the headline; on desktop it floats right of the card.
    if (isMobile()) {
      lantern.position.x = 0;
      baseLanternY = 1.35;
    } else {
      lantern.position.x = 2.0;
      baseLanternY = 0.35;
    }
    onScroll();
  }
  layout();
  window.addEventListener("resize", layout, { passive: true });

  // ── Render loop ─────────────────────────────────────────────────
  var clock = new THREE.Clock();
  var fadeInDone = false;

  function render() {
    requestAnimationFrame(render);
    var dt = Math.min(clock.getDelta(), 0.05);
    var t = clock.elapsedTime;

    // Ease the lantern in once loaded
    if (lanLoaded && lantern.scale.x < 1) {
      var s = Math.min(1, lantern.scale.x + dt * 1.6);
      lantern.scale.setScalar(s);
      if (s >= 1) fadeInDone = true;
    }

    // Gentle idle float + mouse parallax (skipped for reduced motion)
    if (!reduceMotion) {
      lantern.position.y = baseLanternY + scrollOffset + Math.sin(t * 0.9) * 0.12;
      lantern.rotation.y += dt * 0.22 + spinVel * dt;
      spinVel *= Math.max(0, 1 - dt * 2.4);
      var targetRX = pointer.y * -0.12;
      var targetRY = pointer.x * 0.18;
      lantern.rotation.x += (targetRX - lantern.rotation.x) * 0.05;
      lantern.rotation.y += (targetRY - lantern.rotation.y) * 0.05;
    }

    // Bloom pulse decays back to resting strength
    if (bloom) {
      tapBoost = Math.max(0, tapBoost - dt * 1.4);
      bloom.strength = 0.75 + tapBoost * 0.6;
    }
    glowLight.intensity = 2.2 + tapBoost * 3.5 + Math.sin(t * 2.1) * 0.25;

    // Fireflies drift; ones near the pointer get nudged away
    var pos = fireflyGeo.attributes.position.array;
    for (var i = 0; i < FIREFLY_COUNT; i++) {
      var i3 = i * 3;
      var fx = flyBase[i3], fy = flyBase[i3 + 1], fz = flyBase[i3 + 2];
      var t1 = t * flySpeed[i] + flyPhase[i];
      var tx = fx + Math.sin(t1) * 0.7;
      var ty = fy + Math.cos(t1 * 0.8) * 0.5;
      var tz = fz + Math.sin(t1 * 1.3) * 0.6;

      if (pointer.hasWorld && !reduceMotion) {
        var dx = tx - pointer.world.x;
        var dy = ty - pointer.world.y;
        var d2 = dx * dx + dy * dy;
        var R = 0.55;
        if (d2 < R * R) {
          var d = Math.sqrt(d2) || 0.001;
          var push = ((R - d) / R) * 0.35;
          tx += (dx / d) * push;
          ty += (dy / d) * push;
        }
      }

      pos[i3] = tx;
      pos[i3 + 1] = ty;
      pos[i3 + 2] = tz;
    }
    fireflyGeo.attributes.position.needsUpdate = true;
    // Twinkle
    fireflies.material.opacity = 0.6 + Math.sin(t * 2.6) * 0.25;

    if (composer) composer.render();
    else renderer.render(scene, camera);
  }

  if (reduceMotion) {
    // Static frame: render once, no animation.
    lantern.scale.setScalar(1);
    fadeInDone = true;
    renderer.render(scene, camera);
  } else {
    render();
  }
})();
