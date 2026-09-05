/* Matriq waitlist — form logic (student pitch + growth survey) + 3D interactivity */
(function () {
  "use strict";

  // The site domain (matriq.com.ng) serves the waitlist UI only; the API
  // lives exclusively at the api subdomain (see Caddyfile).
  var API = "https://api.matriq.com.ng/v1";
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  document.getElementById("year").textContent = new Date().getFullYear();

  // Keep the email field's error state in sync as the user types.
  function clearInvalid(el) {
    if (el) {
      el.removeAttribute("aria-invalid");
      el.classList.remove("invalid");
    }
  }
  ["email", "cta-email"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", function () { clearInvalid(el); });
      el.addEventListener("blur", function () {
        if (el.value.trim() && !EMAIL_RE.test(el.value.trim())) {
          el.setAttribute("aria-invalid", "true");
          el.classList.add("invalid");
          var msg = id === "cta-email" ? document.getElementById("cta-form-msg") : document.getElementById("form-msg");
          show(msg, "err", "Please enter a valid email address.");
        }
      });
    }
  });

  function show(msgEl, type, text) {
    msgEl.classList.remove("ok", "err");
    if (type) msgEl.classList.add(type);
    msgEl.textContent = text || "";
  }

  // ── Live signup counter ───────────────────────────────────────
  var countEl = document.getElementById("count");
  function loadCount() {
    fetch(API + "/waitlist/count", { headers: { Accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (data && typeof data.total === "number") {
          countEl.textContent = data.total.toLocaleString("en-NG");
          countEl.classList.remove("pop");
          void countEl.offsetWidth; // restart animation
          countEl.classList.add("pop");
        }
      })
      .catch(function () { /* keep placeholder */ });
  }
  loadCount();
  setInterval(loadCount, 30000);

  // ── Exec yes/no toggle (reveal level / department / faculty) ──
  var execToggle = document.getElementById("exec-toggle");
  var execFollowup = document.getElementById("exec-followup");
  if (execToggle && execFollowup) {
    var radios = execToggle.querySelectorAll('input[name="isExec"]');
    radios.forEach(function (radio) {
      radio.addEventListener("change", function () {
        var isYes = execToggle.querySelector('input[name="isExec"]:checked').value === "yes";
        execFollowup.classList.toggle("visible", isYes);
        execToggle.querySelectorAll(".radio-option").forEach(function (opt) {
          opt.classList.toggle("is-selected", opt.querySelector("input").checked);
        });
      });
    });
  }

  function resetExecToggle() {
    if (execFollowup) execFollowup.classList.remove("visible");
    if (execToggle) {
      execToggle.querySelectorAll(".radio-option").forEach(function (opt) {
        opt.classList.remove("is-selected");
      });
    }
  }

  // ── Shared submit helper ──────────────────────────────────────
  function readVal(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : "";
  }

  function submitForm(formEl, msgEl, btnEl, opts) {
    opts = opts || {};
    var label = opts.label || "Join the waitlist";
    var loadingLabel = opts.loadingLabel || "Joining…";
    var email = readVal(opts.emailId || "email");
    var fullName = readVal(opts.nameId || "fullName");

    var emailEl = document.getElementById(opts.emailId || "email");
    if (!email || !EMAIL_RE.test(email)) {
      show(msgEl, "err", "Please enter a valid email address.");
      if (emailEl) {
        emailEl.setAttribute("aria-invalid", "true");
        emailEl.classList.add("invalid");
        emailEl.focus();
      }
      return;
    }
    clearInvalid(emailEl);

    btnEl.disabled = true;
    btnEl.classList.add("loading");
    if (btnEl.querySelector(".btn-label")) {
      btnEl.querySelector(".btn-label").textContent = loadingLabel;
    } else {
      btnEl.textContent = loadingLabel;
    }

    var payload = { email: email };
    if (fullName) payload.fullName = fullName;

    // Survey fields — only on the full (hero) form.
    if (opts.survey) {
      var painPoint = readVal("painPoint");
      if (painPoint) payload.painPoint = painPoint;

      var checkedExec = execToggle && execToggle.querySelector('input[name="isExec"]:checked');
      if (checkedExec) {
        var isYes = checkedExec.value === "yes";
        payload.isAssociationExec = isYes;
        if (isYes) {
          var lvl = readVal("execLevel");
          var dept = readVal("execDepartment");
          var fac = readVal("execFaculty");
          if (lvl) payload.execLevel = lvl;
          if (dept) payload.execDepartment = dept;
          if (fac) payload.execFaculty = fac;
        }
      }
    }

    var website = document.getElementById("website");
    if (website && website.value) payload.website = website.value; // honeypot

    fetch(API + "/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (data) {
        if (data && data.position && typeof data.position === "number") {
          var name = fullName ? fullName.split(" ")[0] + ", you're" : "You're";
            // A duplicate submit is still reported as “already on the list” with the
      // same line number — never reveals that the email existed before (the
      // backend treats duplicates identically on purpose).
      show(msgEl, "ok", name + " on the list. You're #" + data.position.toLocaleString("en-NG") + " in line.");
          formEl.reset();
          resetExecToggle();
          if (countEl) {
            countEl.textContent = data.position.toLocaleString("en-NG");
            countEl.classList.remove("pop");
            void countEl.offsetWidth;
            countEl.classList.add("pop");
          }
        } else if (data && data.error && data.error.message) {
          show(msgEl, "err", data.error.message);
        } else {
          show(msgEl, "ok", "You're on the list. We'll email you at launch.");
          formEl.reset();
          resetExecToggle();
        }
      })
      .catch(function () {
        show(msgEl, "err", "Something went wrong. Please try again in a moment.");
      })
      .finally(function () {
        btnEl.disabled = false;
        btnEl.classList.remove("loading");
        var labelEl = btnEl.querySelector(".btn-label");
        if (labelEl) labelEl.textContent = label;
        else btnEl.textContent = label;
      });
  }

  // ── Bind the two forms ────────────────────────────────────────
  var heroForm = document.getElementById("waitlist-form");
  if (heroForm) {
    heroForm.addEventListener("submit", function (e) {
      e.preventDefault();
      submitForm(heroForm, document.getElementById("form-msg"), document.getElementById("email-btn"), {
        survey: true,
        label: "Email me at launch",
        loadingLabel: "Sending…",
      });
    });
  }

  var ctaForm = document.getElementById("waitlist-form-cta");
  if (ctaForm) {
    ctaForm.addEventListener("submit", function (e) {
      e.preventDefault();
      submitForm(ctaForm, document.getElementById("cta-form-msg"), ctaForm.querySelector("button"), {
        emailId: "cta-email",
        nameId: "",
        label: "Email me",
        loadingLabel: "Sending…",
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // 3D + motion polish (progressive enhancement — page works without it)
  // ═══════════════════════════════════════════════════════════════

  // ── Scroll progress + nav state ───────────────────────────────
  var progressEl = document.getElementById("scroll-progress");
  var navEl = document.getElementById("nav");
  var scrollSpies = Array.prototype.slice.call(document.querySelectorAll("[data-scrollspy]"));
  var spySections = scrollSpies
    .map(function (link) { return document.getElementById(link.getAttribute("data-scrollspy")); })
    .filter(Boolean);

  function onScroll() {
    var doc = document.documentElement;
    var max = doc.scrollHeight - window.innerHeight;
    var p = max > 0 ? window.scrollY / max : 0;
    if (progressEl) progressEl.style.transform = "scaleX(" + Math.min(1, Math.max(0, p)) + ")";
    if (navEl) navEl.classList.toggle("scrolled", window.scrollY > 24);

    // Scrollspy — highlight the nav link for the section in view
    var current = "";
    var probe = window.scrollY + window.innerHeight * 0.35;
    spySections.forEach(function (sec) {
      if (sec && sec.offsetTop <= probe) current = sec.id;
    });
    scrollSpies.forEach(function (link) {
      link.classList.toggle("active", link.getAttribute("data-scrollspy") === current);
    });
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // ── Reveal-on-scroll ──────────────────────────────────────────
  var revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in-view");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: "0px 0px -40px 0px" });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add("in-view"); });
  }

  // ── 3D tilt on cards (pointer-driven, desktops/touch both work) ──
  var tiltEls = document.querySelectorAll("[data-tilt]");
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!reduceMotion && tiltEls.length && window.matchMedia("(pointer: fine)").matches) {
    tiltEls.forEach(function (card) {
      var rx = 0, ry = 0, tx = 0, ty = 0, cx = 0, cy = 0, raf = null;

      function apply() {
        rx += (ty - rx) * 0.12;
        ry += (tx - ry) * 0.12;
        cx += (tx - cx) * 0.12;
        cy += (ty - cy) * 0.12;
        card.style.transform =
          "perspective(900px) rotateX(" + rx.toFixed(2) + "deg) rotateY(" + ry.toFixed(2) + "deg) translate3d(" +
          (cx * 6).toFixed(2) + "px, " + (cy * 6).toFixed(2) + "px, 0)";
        raf = null;
      }

      card.addEventListener("pointermove", function (e) {
        if (card.classList.contains("reveal") && !card.classList.contains("in-view")) return;
        var r = card.getBoundingClientRect();
        tx = ((e.clientY - r.top) / r.height - 0.5) * -10;
        ty = ((e.clientX - r.left) / r.width - 0.5) * 10;
        if (!raf) raf = requestAnimationFrame(apply);
      });
      card.addEventListener("pointerleave", function () {
        tx = 0; ty = 0;
        if (!raf) raf = requestAnimationFrame(apply);
        setTimeout(function () { card.style.transform = ""; }, 350);
      });
    });
  }

  // ── Cursor glow (fine pointers only) ──────────────────────────
  var glow = document.getElementById("cursor-glow");
  if (glow && window.matchMedia("(pointer: fine)").matches && !reduceMotion) {
    var gx = 0, gy = 0, gtx = 0, gty = 0, graf = null;
    window.addEventListener("pointermove", function (e) {
      gtx = e.clientX; gty = e.clientY;
      glow.classList.add("is-on");
      if (!graf) {
        graf = requestAnimationFrame(function loop() {
          gx += (gtx - gx) * 0.12;
          gy += (gty - gy) * 0.12;
          glow.style.transform = "translate(" + gx + "px, " + gy + "px) translate(-50%, -50%)";
          if (Math.abs(gtx - gx) > 0.5 || Math.abs(gty - gy) > 0.5) {
            graf = requestAnimationFrame(loop);
          } else {
            graf = null;
          }
        });
      }
    });
    window.addEventListener("pointerleave", function () { glow.classList.remove("is-on"); });
  }

  // ── Load the Three.js scene (importmap + dynamic import) ──────
  function supportsImportMap() {
    return typeof HTMLScriptElement !== "undefined" && "supports" in HTMLScriptElement &&
      HTMLScriptElement.supports("importmap");
  }

  // The scene is procedural (no model downloads), so the only real cost is
  // the three.js module itself (~330KB gzipped from the CDN). Skip it only
  // for data-saver users and 2G: everyone else gets the full hero.
  function shouldSkipScene() {
    var conn = (typeof navigator !== "undefined" && navigator.connection) || null;
    if (conn) {
      if (conn.saveData === true) return true;
      var et = (conn.effectiveType || "4g").toLowerCase();
      if (et === "2g" || et === "slow-2g") return true;
    }
    return false;
  }

  function initScene() {
    if (!supportsImportMap()) return; // old browser → CSS orbs carry the look
    try {
      if (!(window.WebGL2RenderingContext || window.WebGLRenderingContext)) return;
    } catch (e) { return; }
    if (shouldSkipScene()) return;

    var map = document.createElement("script");
    map.type = "importmap";
    map.textContent = JSON.stringify({
      imports: {
        three: "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
        "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/",
      },
    });
    document.head.appendChild(map);

    import("./scene.js").catch(function () {
      /* scene failed to load — the CSS ambient background remains */
    });
  }

  // Start the scene once the hero is near the viewport (keeps first paint fast).
  var started = false;
  function startWhenVisible() {
    if (started) return;
    var hero = document.getElementById("join");
    var r = hero && hero.getBoundingClientRect();
    if (!r || r.top < window.innerHeight * 1.2) {
      started = true;
      initScene();
    }
  }
  startWhenVisible();
  window.addEventListener("scroll", startWhenVisible, { passive: true });
  window.addEventListener("resize", startWhenVisible, { passive: true });
})();
