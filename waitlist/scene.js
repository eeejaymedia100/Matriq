/* ═══════════════════════════════════════════════════════════════
   Matriq — The Stack
   The hero's signature: a procedurally-built tower of past-question
   sheets. It IS the product's material — the archive your seniors
   built — rendered as ~90 paper sheets with a few lime "smart" ones
   (the AI's voice) glowing from within the pile. No model downloads;
   the whole scene is generated on device.

   Interaction: drag to spin (with inertia). It slowly turns on its
   own when idle. Pointer parallax when you don't touch it. Fully
   static (single frame) under prefers-reduced-motion.
   ═══════════════════════════════════════════════════════════════ */

import * as THREE from "three";

const LIME = 0xc6ff3d;
const PAPER_A = 0xe9e6df;
const PAPER_B = 0xd8d4cb;
const INK = 0x17181a;

const container = document.getElementById("scene");
const hint = document.getElementById("drag-hint");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

if (container) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch {
    // No WebGL — the CSS void carries the hero; nothing to clean up.
  }

  if (renderer) {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);

    let width = 0;
    let height = 0;

    function layout() {
      width = container.clientWidth || window.innerWidth;
      height = container.clientHeight || window.innerHeight;
      // Phones get a harder DPR cap — the pile is fill-rate heavy.
      const compact = width < 860;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, compact ? 1.6 : 2));
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();

      if (compact) {
        // Mobile: the scene is a dedicated band at the hero's foot — one
        // neat tower, centred, with the camera moved in so it fills the
        // frame instead of floating as a distant mush behind the copy.
        group.scale.setScalar(0.8);
        group.position.set(0, -0.55, 0);
        camera.position.set(0, 2.7, 7.0);
      } else {
        // Desktop: the Stack sits right-of-center beside the copy.
        const scale = Math.min(width / 1280, 1.15);
        group.scale.setScalar(scale);
        group.position.set(2.6, -0.4, 0);
        camera.position.set(0, 3.4, 9.2);
      }
      camera.lookAt(0, 0.6, 0);
    }

    /* ── Lights: a study-lamp mood — warm key, cool fill, lime rim ── */
    scene.add(new THREE.AmbientLight(0xffffff, 0.35));
    const key = new THREE.DirectionalLight(0xfff4e0, 1.25);
    key.position.set(-6, 8, 6);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xbfd0ff, 0.35);
    fill.position.set(7, 3, -4);
    scene.add(fill);
    const rim = new THREE.PointLight(LIME, 14, 22);
    rim.position.set(2.5, 2, 3);
    scene.add(rim);

    /* Ruled-paper textures, generated on device (no downloads). A handful
       of SHARED materials instead of one per sheet — the old loop created
       ~90 canvases (~30MB GPU memory) for identical paper, which is what
       made phones crawl. */
    function sheetTexture(kind) {
      const c = document.createElement("canvas");
      c.width = 256; c.height = 340;
      const g = c.getContext("2d");
      const lime = kind === "lime";
      g.fillStyle = lime ? "#c6ff3d" : kind === "b" ? "#d8d4cb" : "#e9e6df";
      g.fillRect(0, 0, c.width, c.height);
      if (!lime) {
        // Ruled lines — the exam-hall vernacular.
        g.strokeStyle = "rgba(23,24,26,0.14)";
        g.lineWidth = 1;
        for (let y = 46; y < c.height - 20; y += 22) {
          g.beginPath();
          g.moveTo(18, y);
          g.lineTo(c.width - 18, y);
          g.stroke();
        }
        // A red margin line, like every exam answer booklet.
        g.strokeStyle = "rgba(190,60,60,0.35)";
        g.beginPath();
        g.moveTo(36, 14);
        g.lineTo(36, c.height - 14);
        g.stroke();
      } else {
        g.fillStyle = "rgba(23,24,26,0.85)";
        g.font = "700 26px Inter, Arial, sans-serif";
        g.fillText("AI", 20, 44);
      }
      const tex = new THREE.CanvasTexture(c);
      tex.anisotropy = 4;
      return tex;
    }

    const matPaperA = new THREE.MeshStandardMaterial({ map: sheetTexture("a"), roughness: 0.92, metalness: 0 });
    const matPaperB = new THREE.MeshStandardMaterial({ map: sheetTexture("b"), roughness: 0.95, metalness: 0 });
    const matLime = new THREE.MeshStandardMaterial({
      map: sheetTexture("lime"), roughness: 0.55, metalness: 0,
      emissive: LIME, emissiveIntensity: 0.35,
    });

    const geo = new THREE.BoxGeometry(2.1, 0.035, 2.9);

    /* ── Build the Stack: slight rotations + offsets = human handling ── */
    const group = new THREE.Group();
    // Fewer sheets on phones (fill rate); fewer still for reduced motion.
    const compact = window.innerWidth < 860;
    const SHEETS = reduceMotion ? 46 : compact ? 72 : 92;
    const stack = new THREE.Group();
    for (let i = 0; i < SHEETS; i++) {
      const isLime = i % 17 === 11; // a few "smart" sheets inside the pile
      const sheet = new THREE.Mesh(geo, isLime ? matLime : i % 2 ? matPaperA : matPaperB);
      sheet.position.y = i * 0.038;
      sheet.rotation.y = (Math.random() - 0.5) * 0.14;
      sheet.position.x = (Math.random() - 0.5) * 0.06;
      sheet.position.z = (Math.random() - 0.5) * 0.06;
      stack.add(sheet);
    }
    group.add(stack);

    /* The table the stack rests on — a quiet disc, ink dark. */
    const table = new THREE.Mesh(
      new THREE.CylinderGeometry(3.4, 3.4, 0.12, 64),
      new THREE.MeshStandardMaterial({ color: INK, roughness: 0.6, metalness: 0.2 }),
    );
    table.position.y = -0.35;
    group.add(table);

    /* A soft shadow disc under the stack. */
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(2.6, 48),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4 }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -0.28;
    group.add(shadow);

    scene.add(group);

    // Mount the canvas — without this the whole scene renders to a
    // detached element and the hero's Stack is invisible.
    container.appendChild(renderer.domElement);

    layout();
    window.addEventListener("resize", layout);

    /* ── Interaction: drag to spin, inertia, idle drift, parallax ── */
    let targetRotY = reduceMotion ? 0.5 : 0.5;
    let rotY = targetRotY;
    let dragging = false;
    let lastX = 0;
    let velocity = 0;
    let parallaxX = 0, parallaxY = 0;
    let idleTimer = null;

    function markInteracted() {
      if (hint) hint.style.opacity = "0.4";
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => { if (hint) hint.style.opacity = "1"; }, 4000);
    }

    container.addEventListener("pointerdown", (e) => {
      dragging = true;
      lastX = e.clientX;
      velocity = 0;
      // No setPointerCapture: on touch it fights the browser's own
      // pan-y handling; vertical swipes must keep scrolling the page.
    });
    container.addEventListener("pointermove", (e) => {
      if (dragging) {
        const dx = e.clientX - lastX;
        lastX = e.clientX;
        targetRotY += dx * 0.005;
        velocity = dx * 0.005;
        markInteracted();
      } else if (!reduceMotion) {
        // Pointer parallax — the stack leans toward your cursor.
        const nx = (e.clientX / window.innerWidth - 0.5) * 2;
        const ny = (e.clientY / window.innerHeight - 0.5) * 2;
        parallaxX = ny * 0.06;
        parallaxY = nx * 0.1;
      }
    });
    const endDrag = () => { dragging = false; };
    container.addEventListener("pointerup", endDrag);
    container.addEventListener("pointercancel", endDrag);

    /* ── Render loop ── */
    let raf = null;
    function tick(t) {
      if (!dragging && !reduceMotion) {
        // Inertia + gentle idle drift.
        velocity *= 0.94;
        targetRotY += velocity + 0.0012;
      }
      rotY += (targetRotY - rotY) * 0.08;

      stack.rotation.y = rotY;
      if (!reduceMotion) {
        stack.rotation.x += (parallaxX - stack.rotation.x) * 0.05;
        group.rotation.y += (parallaxY - group.rotation.y) * 0.05;
        // Breathing lime rim — the AI is alive in there.
        rim.intensity = 12 + Math.sin(t * 0.0012) * 4;
      }

      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    }

    // Camera framing happens in layout() — desktop and mobile differ.

    if (reduceMotion) {
      // One still frame — beautiful, silent, cheap.
      renderer.render(scene, camera);
    } else {
      raf = requestAnimationFrame(tick);
    }

    // Stop the loop when the hero is far off-screen (battery kindness).
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && raf === null && !reduceMotion) {
            raf = requestAnimationFrame(tick);
          } else if (!entry.isIntersecting && raf !== null) {
            cancelAnimationFrame(raf);
            raf = null;
          }
        });
      }, { threshold: 0.02 });
      io.observe(container);
    }
  }
}
