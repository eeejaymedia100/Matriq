/* Matriq waitlist — form logic (student pitch + growth survey) */
(function () {
  "use strict";

  // The site domain (matriq.com.ng) serves the waitlist UI only; the API
  // lives exclusively at the api subdomain (see Caddyfile).
  var API = "https://api.matriq.com.ng/v1";
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  document.getElementById("year").textContent = new Date().getFullYear();

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
    var email = readVal(opts.emailId || "email");
    var fullName = readVal(opts.nameId || "fullName");

    if (!EMAIL_RE.test(email)) {
      show(msgEl, "err", "Please enter a valid email address.");
      return;
    }

    btnEl.disabled = true;
    btnEl.classList.add("loading");
    if (btnEl.querySelector(".btn-label")) {
      btnEl.querySelector(".btn-label").textContent = "Joining…";
    } else {
      btnEl.textContent = "Joining…";
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
          show(msgEl, "ok", name + " on the list! 🎉 You're #" + data.position.toLocaleString("en-NG") + " in line.");
          formEl.reset();
          resetExecToggle();
          if (countEl) countEl.textContent = data.position.toLocaleString("en-NG");
        } else if (data && data.error && data.error.message) {
          show(msgEl, "err", data.error.message);
        } else {
          show(msgEl, "ok", "You're on the list! We'll email you at launch. 🎉");
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
        var label = btnEl.querySelector(".btn-label");
        if (label) label.textContent = "Join the waitlist";
        else btnEl.textContent = "Join the waitlist";
      });
  }

  // ── Bind the two forms ────────────────────────────────────────
  var heroForm = document.getElementById("waitlist-form");
  if (heroForm) {
    heroForm.addEventListener("submit", function (e) {
      e.preventDefault();
      submitForm(heroForm, document.getElementById("form-msg"), document.getElementById("join-btn"), {
        survey: true,
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
      });
    });
  }
})();
