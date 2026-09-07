/* Matriq Telegram Mini App — client logic.
 *
 * Auth: Telegram hands us `initData`; we swap it for a scoped session token
 * at POST /telegram/miniapp/auth, then call gated endpoints with Bearer.
 * The campaign has no Matriq-account linking: participants are Telegram
 * users, verified by real community membership (POST miniapp/verify).
 *
 * Design notes: the points ledger is the signature — a serif numeral with a
 * lime progress rule toward the next reward tier. Confetti (hand-rolled,
 * brand palette) fires on submission. Motion is feedback only.
 */
(function () {
  "use strict";

  var API = "https://api.matriq.com.ng/v1";
  var tg = window.Telegram && window.Telegram.WebApp;
  var reducedMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ── State ───────────────────────────────────────────────────────
  var token = null;
  var me = null; // /miniapp/me payload
  var current = "boot";
  var libraryType = "";
  // True when opened outside Telegram (no initData): the interface renders
  // as an honest preview — real structure, zero state, no fake data.
  var previewMode = false;

  // ── Option data — mirrors the bot wizard's button lists exactly ──
  var DELTA_UNIVERSITIES = [
    "Federal University of Petroleum Resources, Effurun",
    "Delta State University, Abraka",
    "Delta State University of Science and Technology, Ozoro",
    "Dennis Osadebay University, Asaba",
    "University of Delta, Agbor",
    "Nigerian Maritime University, Okerenkoko",
    "Novena University, Ogume",
    "Western Delta University, Oghara",
    "Edwin Clark University, Kiagbodo",
    "Admiralty University of Nigeria, Ibusa",
  ];
  var MORE_UNIVERSITIES = [
    "University of Benin",
    "University of Lagos",
    "University of Ibadan",
    "Ahmadu Bello University",
    "University of Ilorin",
    "Obafemi Awolowo University",
    "University of Nigeria, Nsukka",
    "Covenant University",
  ];
  var FACULTIES = [
    "Agriculture", "Arts", "Education", "Engineering", "Environmental Studies",
    "Law", "Management Sciences", "Medical Sciences", "Pharmacy", "Science",
    "Social Sciences",
  ];
  var DEPARTMENTS_BY_FACULTY = {
    "Agriculture": ["Agricultural Economics", "Agricultural Extension", "Agronomy", "Animal Science", "Fisheries", "Forestry and Wildlife", "Soil Science"],
    "Arts": ["English and Literary Studies", "History", "Linguistics", "Philosophy", "Religious Studies", "Theatre Arts"],
    "Education": ["Arts Education", "Science Education", "Educational Foundations", "Guidance and Counselling", "Physical and Health Education", "Vocational Education"],
    "Engineering": ["Chemical Engineering", "Civil Engineering", "Electrical Engineering", "Mechanical Engineering", "Petroleum Engineering", "Computer Engineering"],
    "Environmental Studies": ["Architecture", "Building", "Estate Management", "Quantity Surveying", "Urban and Regional Planning"],
    "Law": ["Law"],
    "Management Sciences": ["Accounting", "Banking and Finance", "Business Administration", "Marketing", "Public Administration"],
    "Medical Sciences": ["Anatomy", "Medicine and Surgery", "Nursing Science", "Physiology", "Radiography"],
    "Pharmacy": ["Pharmacy"],
    "Science": ["Biochemistry", "Biology", "Chemistry", "Computer Science", "Geology", "Mathematics", "Microbiology", "Physics", "Statistics"],
    "Social Sciences": ["Economics", "Geography", "Mass Communication", "Political Science", "Psychology", "Sociology"],
  };
  var MATERIAL_TYPES = [
    { value: "past_question", label: "Past question" },
    { value: "lecture_note", label: "Lecture note" },
    { value: "handout", label: "Handout" },
    { value: "slide_deck", label: "Slide deck" },
    { value: "textbook_summary", label: "Textbook summary" },
  ];
  var LEVELS = ["100", "200", "300", "400", "500"];
  var SESSIONS = ["2023/2024", "2024/2025", "2025/2026"];
  var OTHER = "__other";

  // The campaign's course-code rule — identical to the engine's regex.
  var COURSE_CODE_RE = /^[A-Z]{1,6}(?:\/[A-Z]{1,6})?\s?\d{3,4}[A-Z]?$/;

  // Audit pipeline, five visual stages (structure = the real sequence).
  var STAGE_NAMES = ["Received", "Reading", "AI audit", "Review", "Library"];
  var STAGE_GROUPS = [
    ["received", "validating", "duplicate_check"],
    ["extracting", "ocr_processing"],
    ["auditing"],
    ["pending_human_review", "needs_information"],
    ["approved", "reward_pending", "reward_eligible", "reward_ineligible", "processing_library"],
    ["published"],
  ];

  // ── Tiny helpers ────────────────────────────────────────────────
  function $(sel) { return document.querySelector(sel); }
  function $all(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function showToast(msg) {
    var toast = $("#toast");
    toast.textContent = msg;
    toast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () { toast.hidden = true; }, 3400);
  }

  function haptic(kind) {
    try {
      if (!tg || !tg.HapticFeedback) return;
      if (kind === "success" || kind === "error" || kind === "warning") {
        tg.HapticFeedback.notificationOccurred(kind);
      } else {
        tg.HapticFeedback.impactOccurred(kind || "light");
      }
    } catch (e) { /* older clients */ }
  }

  function api(path, options) {
    options = options || {};
    options.headers = Object.assign({}, options.headers, {
      Authorization: "Bearer " + token,
    });
    if (options.body && !(options.body instanceof FormData)) {
      options.headers["Content-Type"] = "application/json";
    }
    return fetch(API + path, options).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) {
        if (!res.ok) {
          var msg =
            (body && (body.reason || body.message)) ||
            (body && body.error === "duplicate_submission" ? body.reason : null) ||
            "Something went wrong (" + res.status + "). Try again.";
          throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
        }
        return body;
      });
    });
  }

  // ── Telegram chrome ─────────────────────────────────────────────
  if (tg) {
    tg.ready();
    tg.expand();
    try { tg.setHeaderColor("#0a0a0a"); tg.setBackgroundColor("#0a0a0a"); } catch (e) { /* older clients */ }
    if (tg.BackButton) {
      // One handler for the lifetime of the app — never stacked per view.
      tg.BackButton.onClick(function () { showView("home"); });
    }
  }

  function openCommunity() {
    var url = me && me.communityUrl;
    if (!url) return;
    try {
      if (tg && tg.openTelegramLink) { tg.openTelegramLink(url); return; }
    } catch (e) { /* fall through */ }
    window.open(url, "_blank");
  }

  // ── Boot ────────────────────────────────────────────────────────
  function bootErrorText(code) {
    return (
      "Session check failed" + (code ? " (" + code + ")" : "") +
      ". Close this window and reopen it from the Matriq bot's menu button."
    );
  }

  function tryAuth(initData) {
    return fetch(API + "/telegram/miniapp/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData: initData }),
    }).then(function (res) {
      if (!res.ok) {
        var err = new Error("auth failed");
        err.code = res.status; // surfaces in the boot message — pinpoints CORS vs validation
        throw err;
      }
      return res.json();
    }).then(function (body) { token = body.token; });
  }

  function bootAuth() {
    var initData = tg ? (tg.initDataRaw || tg.initData || "") : "";
    if (!initData) {
      // No Telegram session — show the interface with a clear banner instead
      // of a dead boot screen, so the link is checkable before it's wired up
      // in BotFather.
      previewMode = true;
      buildForm();
      renderHome();
      showView("home");
      return;
    }
    $("#boot-line").textContent = "Opening Matriq…";
    tryAuth(initData)
      .catch(function (err) {
        // Some older Telegram clients hand out a re-encoded initData — one
        // retry with the raw form before giving up.
        var raw = tg && tg.initDataRaw ? tg.initDataRaw : null;
        if (raw && raw !== initData) return tryAuth(raw);
        throw err;
      })
      .then(function () { return refreshMe(); })
      .then(function () {
        buildForm();
        showView("home");
      })
      .catch(function (err) {
        var code = err && typeof err.code === "number" ? err.code : null;
        $("#boot-line").textContent = code
          ? bootErrorText(code)
          : (err && err.message) || bootErrorText(null);
        $("#boot-retry").hidden = false;
      });
  }

  function boot() {
    // Static wiring — registered exactly once for the app's lifetime.
    $("#tile-community").addEventListener("click", openCommunity);
    $("#boot-retry").addEventListener("click", function () {
      this.hidden = true;
      bootAuth();
    });
    bootAuth();
  }

  function refreshMe() {
    return api("/telegram/miniapp/me").then(function (body) {
      me = body;
      renderHome();
      return me;
    });
  }

  // ── View switching ──────────────────────────────────────────────
  function showView(name) {
    $all(".view").forEach(function (v) { v.hidden = true; });
    var el = $("#view-" + name);
    if (el) {
      el.hidden = false;
      el.style.animation = "none";
      void el.offsetHeight; // re-trigger the rise
      el.style.animation = "";
    }
    current = name;
    if (tg && tg.BackButton) {
      if (name === "home" || name === "boot") tg.BackButton.hide();
      else tg.BackButton.show();
    }
    if (name === "home") { if (!previewMode) refreshMe().catch(function () { /* keep last state */ }); }
    if (name === "status") loadStatus();
    if (name === "library") loadLibrary();
    if (name === "board") loadBoard();
  }

  document.addEventListener("click", function (ev) {
    var t = ev.target.closest("[data-nav]");
    if (t) {
      ev.preventDefault();
      haptic("light");
      showView(t.getAttribute("data-nav"));
    }
  });

  // ── Home: gate or ledger ────────────────────────────────────────
  function renderHome() {
    if (previewMode) {
      $("#gate-card").hidden = true;
      $("#ledger").hidden = false;
      $("#ledger-points").textContent = "0";
      $("#ledger-approved").textContent = "0";
      $("#preview-note").hidden = false;
      return;
    }
    if (!me) return;
    var gate = $("#gate-card");
    var ledger = $("#ledger");
    if (me.canUpload) {
      gate.hidden = true;
      ledger.hidden = false;
      renderLedger(me);
      return;
    }
    ledger.hidden = true;
    gate.hidden = false;
    if (!me.communityMember) {
      $("#gate-title").textContent = "Join the community first";
      $("#gate-body").textContent =
        "The Resource Hunt runs inside the Matriq Telegram community. Join, come back, and verify.";
      $("#gate-join").textContent = "Join the community";
      $("#gate-join").dataset.action = "join";
      $("#gate-check").hidden = false;
    } else {
      $("#gate-title").textContent = "One tap to verify";
      $("#gate-body").textContent =
        "You're in the community. Verify so your uploads enter the audit queue.";
      $("#gate-join").textContent = "Verify membership";
      $("#gate-join").dataset.action = "verify";
      $("#gate-check").hidden = true;
    }
  }

  function renderLedger(data) {
    countUp($("#ledger-points"), data.points);
    $("#ledger-approved").textContent = data.approvedCount;
    var camp = data.campaign;
    var tiers = (camp && camp.tiers) || [];
    var next = null;
    for (var i = 0; i < tiers.length; i++) {
      if (data.points < tiers[i].requiredPoints) { next = tiers[i]; break; }
    }
    if (camp && camp.active && next) {
      $("#ledger-rule").hidden = false;
      var pct = Math.min(100, Math.round((data.points / next.requiredPoints) * 100));
      requestAnimationFrame(function () { $("#ledger-fill").style.width = pct + "%"; });
      $("#ledger-tier").hidden = false;
      var remaining = next.requiredPoints - data.points;
      $("#ledger-tier").innerHTML =
        "<b>" + remaining + "</b> more to the " + escapeHtml(next.id) +
        " tier · " + escapeHtml(next.valueDescription);
    } else if (camp && camp.active && tiers.length) {
      $("#ledger-rule").hidden = false;
      $("#ledger-fill").style.width = "100%";
      $("#ledger-tier").hidden = false;
      $("#ledger-tier").textContent = "Top tier reached — every approval still counts.";
    } else {
      $("#ledger-rule").hidden = true;
      $("#ledger-tier").hidden = true;
    }
  }

  function countUp(el, target) {
    target = target || 0;
    // Re-animating on every home visit would read as a gimmick — animate
    // only when the number actually moved, and from where it was.
    var from = Number(el.dataset.shown || 0);
    if (from === target) { el.textContent = target; return; }
    el.dataset.shown = String(target);
    if (reducedMotion || from === 0 || target === 0) { el.textContent = target; return; }
    var start = null;
    var dur = 700;
    function tick(ts) {
      if (start === null) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(from + (target - from) * eased);
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  $("#gate-join").addEventListener("click", function () {
    if (this.dataset.action === "verify") {
      var btn = this;
      btn.disabled = true;
      api("/telegram/miniapp/verify", { method: "POST" })
        .then(function (res) {
          if (res.verified) {
            haptic("success");
            showToast("Verified — welcome in.");
            return refreshMe();
          }
          haptic("warning");
          showToast("Membership not confirmed yet — join, then verify.");
        })
        .catch(function (err) { showToast(err.message); })
        .then(function () { btn.disabled = false; });
    } else {
      openCommunity();
    }
  });

  $("#gate-check").addEventListener("click", function () {
    refreshMe()
      .then(function () {
        if (me.canUpload) { haptic("success"); showToast("You're in."); }
        else showToast("Telegram hasn't confirmed your membership yet — wait a few seconds, then check again.");
      })
      .catch(function (err) { showToast(err.message); });
  });

  // ── Library ─────────────────────────────────────────────────────
  var searchTimer = null;
  $("#library-q").addEventListener("input", function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadLibrary, 250);
  });

  $all(".chip[data-type]").forEach(function (chip) {
    chip.addEventListener("click", function () {
      $all(".chip[data-type]").forEach(function (c) { c.classList.remove("is-on"); });
      chip.classList.add("is-on");
      libraryType = chip.getAttribute("data-type");
      haptic("light");
      loadLibrary();
    });
  });

  function loadLibrary() {
    var q = $("#library-q").value.trim();
    var list = $("#library-list");
    if (previewMode) {
      list.innerHTML = '<p class="empty">Preview only — open this app inside Telegram to browse the live library.</p>';
      return;
    }
    list.innerHTML = '<p class="empty">Searching…</p>';
    var params = [];
    if (q) params.push("q=" + encodeURIComponent(q));
    if (libraryType) params.push("type=" + encodeURIComponent(libraryType));
    api("/telegram/miniapp/library" + (params.length ? "?" + params.join("&") : ""))
      .then(function (body) {
        if (!body.items.length) {
          list.innerHTML =
            '<p class="empty">Nothing here yet.<br/>Every contribution widens the archive — be the first from your department.</p>';
          return;
        }
        list.innerHTML = body.items
          .map(function (it) {
            var kind = it.type === "past_question" ? "Past question" : "Material";
            var meta = [kind, it.level ? "Level " + it.level : null, it.session]
              .filter(Boolean).join(" · ");
            var title = it.title || it.courseTitle || it.courseCode;
            return (
              '<article class="item">' +
              '<div class="item-top"><h3 class="item-title">' + escapeHtml(title) + "</h3>" +
              (it.courseCode ? '<span class="item-code">' + escapeHtml(it.courseCode) + "</span>" : "") +
              "</div>" +
              '<p class="item-sub">' + escapeHtml(meta) + "</p>" +
              "</article>"
            );
          })
          .join("");
      })
      .catch(function (err) {
        list.innerHTML = '<p class="empty">Search failed. ' + escapeHtml(err.message) + "</p>";
      });
  }

  // ── Submit form ─────────────────────────────────────────────────
  function fillSelect(sel, placeholder, values) {
    sel.innerHTML =
      '<option value="" disabled selected>' + escapeHtml(placeholder) + "</option>" +
      values.map(function (v) {
        return '<option value="' + escapeHtml(v.value || v) + '">' + escapeHtml(v.label || v) + "</option>";
      }).join("");
  }

  function buildForm() {
    var uni = $("#f-university");
    uni.innerHTML =
      '<option value="" disabled selected>Choose your university</option>' +
      '<optgroup label="Delta State">' +
      DELTA_UNIVERSITIES.map(function (u) { return '<option value="' + escapeHtml(u) + '">' + escapeHtml(u) + "</option>"; }).join("") +
      "</optgroup>" +
      '<optgroup label="Elsewhere in Nigeria">' +
      MORE_UNIVERSITIES.map(function (u) { return '<option value="' + escapeHtml(u) + '">' + escapeHtml(u) + "</option>"; }).join("") +
      "</optgroup>" +
      '<option value="' + OTHER + '">Other…</option>';

    fillSelect($("#f-faculty"), "Choose your faculty", FACULTIES.concat([OTHER]).map(function (f) {
      return f === OTHER ? { value: OTHER, label: "Other…" } : f;
    }));

    fillSelect($("#f-level"), "Level (optional)", LEVELS);
    fillSelect($("#f-session"), "Session (optional)", SESSIONS);
    fillSelect($("#f-type"), "Choose type", MATERIAL_TYPES);

    rebuildDepartments("");
    prefillContext();

    uni.addEventListener("change", function () {
      $("#f-university-other").hidden = uni.value !== OTHER;
    });
    $("#f-faculty").addEventListener("change", function () {
      $("#f-faculty-other").hidden = $("#f-faculty").value !== OTHER;
      rebuildDepartments($("#f-faculty").value);
    });
    $("#f-department").addEventListener("change", function () {
      $("#f-department-other").hidden = $("#f-department").value !== OTHER;
    });
    $("#f-course").addEventListener("input", onCourseInput);
    $("#f-file").addEventListener("change", onFileChosen);
    $("#submit-form").addEventListener("submit", onSubmit);
    $("#submit-again").addEventListener("click", resetForNext);
  }

  function rebuildDepartments(faculty) {
    var sel = $("#f-department");
    var depts = DEPARTMENTS_BY_FACULTY[faculty] || [];
    sel.innerHTML =
      '<option value="" disabled selected>Choose your department</option>' +
      depts.map(function (d) { return '<option value="' + escapeHtml(d) + '">' + escapeHtml(d) + "</option>"; }).join("") +
      '<option value="' + OTHER + '">Other…</option>';
    $("#f-department-other").hidden = true;
    $("#f-department-other").value = "";
  }

  function prefillSelect(sel, value, otherInput) {
    if (!value) return;
    for (var i = 0; i < sel.options.length; i++) {
      if (sel.options[i].value === value) { sel.value = value; return; }
    }
    sel.value = OTHER;
    if (otherInput) { otherInput.hidden = false; otherInput.value = value; }
  }

  function prefillContext() {
    if (!me) return;
    prefillSelect($("#f-university"), me.university, $("#f-university-other"));
    if (me.university) $("#f-university-other").hidden = $("#f-university").value !== OTHER;
    prefillSelect($("#f-faculty"), me.faculty, $("#f-faculty-other"));
    if (me.faculty) {
      $("#f-faculty-other").hidden = $("#f-faculty").value !== OTHER;
      rebuildDepartments($("#f-faculty").value);
      prefillSelect($("#f-department"), me.department, $("#f-department-other"));
      if (me.department) $("#f-department-other").hidden = $("#f-department").value !== OTHER;
    }
  }

  function onCourseInput() {
    var input = $("#f-course");
    var v = input.value.toUpperCase().replace(/\s+/g, " ");
    if (v !== input.value) input.value = v;
    var state = $("#code-state");
    var trimmed = v.trim();
    if (!trimmed) { state.hidden = true; return; }
    state.hidden = false;
    if (COURSE_CODE_RE.test(trimmed)) {
      state.textContent = "Looks right.";
      state.className = "code-state ok";
    } else {
      state.textContent = "Not the right shape yet — letters first, then the number.";
      state.className = "code-state no";
    }
  }

  function onFileChosen() {
    var file = $("#f-file").files[0];
    var zone = $("#file-zone");
    if (!file) { zone.classList.remove("has"); return; }
    zone.classList.add("has");
    $("#file-name").textContent = file.name;
    $("#file-size").textContent = formatSize(file.size) + " — tap to replace";
  }

  function formatSize(bytes) {
    if (bytes > 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    return Math.max(1, Math.round(bytes / 1024)) + " KB";
  }

  function resolveField(sel, otherInput, label) {
    if (sel.value === OTHER) {
      var v = otherInput.value.trim();
      if (!v) { showToast("Type your " + label + " — or pick it from the list."); otherInput.focus(); return null; }
      return v;
    }
    if (!sel.value) { showToast("Choose your " + label + "."); sel.focus(); return null; }
    return sel.value;
  }

  function onSubmit(ev) {
    ev.preventDefault();
    if (previewMode) {
      showToast("Preview only — open this app inside Telegram to submit.");
      return;
    }
    if (!me.canUpload) {
      showToast(me.communityMember ? "Verify your membership first — it's on the home screen." : "Join the community first — the link is on the home screen.");
      return;
    }
    var university = resolveField($("#f-university"), $("#f-university-other"), "university");
    if (university === null) return;
    var faculty = resolveField($("#f-faculty"), $("#f-faculty-other"), "faculty");
    if (faculty === null) return;
    var department = resolveField($("#f-department"), $("#f-department-other"), "department");
    if (department === null) return;

    var course = $("#f-course").value.trim().toUpperCase().replace(/\s+/g, " ");
    if (!COURSE_CODE_RE.test(course)) {
      showToast("Course code isn't the right shape — letters first, then the 3–4 digit number (CHM 101, D/AGE 217).");
      $("#f-course").focus();
      return;
    }
    if (!$("#f-type").value) { showToast("Choose the material type."); $("#f-type").focus(); return; }
    var file = $("#f-file").files[0];
    if (!file) { showToast("Choose a file first."); return; }
    if (file.size > 20 * 1024 * 1024) { showToast("That file is over 20 MB."); return; }
    if (!$("#f-rights").checked) { showToast("The rights declaration is required."); return; }

    var btn = $("#submit-btn");
    btn.disabled = true;
    btn.textContent = "Submitting…";
    var data = new FormData();
    data.append("file", file);
    data.append("courseCode", course);
    data.append("materialType", $("#f-type").value);
    data.append("universityName", university);
    data.append("faculty", faculty);
    data.append("department", department);
    if ($("#f-level").value) data.append("level", $("#f-level").value);
    if ($("#f-session").value) data.append("academicSession", $("#f-session").value);
    data.append("rightsDeclared", "true");

    api("/telegram/miniapp/submissions", { method: "POST", body: data })
      .then(function (body) {
        $("#submit-ref").textContent = body.id;
        $("#submit-form").hidden = true;
        $("#submit-success").hidden = false;
        celebrate();
        haptic("success");
        refreshMe().catch(function () { /* points update on approval */ });
      })
      .catch(function (err) {
        haptic("error");
        showToast(err.message);
      })
      .then(function () {
        btn.disabled = false;
        btn.textContent = "Submit for audit";
      });
  }

  function resetForNext() {
    $("#submit-success").hidden = true;
    var form = $("#submit-form");
    form.hidden = false;
    ["#f-course", "#f-file", "#f-rights"].forEach(function (sel) {
      var el = $(sel);
      if (el.type === "checkbox") el.checked = false;
      else el.value = "";
    });
    var zone = $("#file-zone");
    zone.classList.remove("has");
    $("#file-name").textContent = "Choose a file";
    $("#file-size").textContent = "PDF, JPG, PNG or WEBP · up to 20 MB";
    $("#code-state").hidden = true;
    form.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
  }

  // ── Status ──────────────────────────────────────────────────────
  function stageIndex(status) {
    for (var i = 0; i < STAGE_GROUPS.length; i++) {
      if (STAGE_GROUPS[i].indexOf(status) >= 0) return i;
    }
    return -1;
  }

  function badgeClass(status) {
    if (status === "published" || status === "approved" || status === "reward_eligible") return "ok";
    if (status === "rejected" || status === "failed" || status === "reward_ineligible") return "bad";
    if (status === "needs_information") return "warn";
    return "";
  }

  var STATUS_LABELS = {
    received: "Received", validating: "Validating", duplicate_check: "Duplicate check",
    extracting: "Reading", ocr_processing: "Reading (OCR)", auditing: "AI audit",
    pending_human_review: "Human review", approved: "Approved", rejected: "Rejected",
    needs_information: "Needs info", reward_pending: "Reward pending",
    reward_eligible: "Reward eligible", reward_ineligible: "Reward ineligible",
    processing_library: "Publishing", published: "Live in library", failed: "Failed",
  };

  var MATERIAL_LABELS = {
    past_question: "Past question", lecture_note: "Lecture note", handout: "Handout",
    slide_deck: "Slide deck", textbook_summary: "Textbook summary", other: "Material",
  };

  function loadStatus() {
    var list = $("#status-list");
    if (previewMode) {
      list.innerHTML = '<p class="empty">Preview only — submissions live inside Telegram.</p>';
      return;
    }
    list.innerHTML = '<p class="empty">Loading…</p>';
    api("/telegram/miniapp/submissions")
      .then(function (body) {
        if (!body.submissions.length) {
          list.innerHTML =
            '<p class="empty">Nothing submitted yet.<br/>Your first upload starts the count.</p>';
          return;
        }
        list.innerHTML = body.submissions
          .map(function (s) {
            var stage = stageIndex(s.auditStatus);
            var dots = "";
            if (stage >= 0) {
              dots =
                '<div class="pipe" aria-hidden="true">' +
                STAGE_NAMES.map(function (n, i) {
                  var cls = "";
                  if (stage > i) cls = "done";
                  else if (stage === i && s.auditStatus !== "published") cls = "now";
                  return '<i class="' + cls + '" title="' + escapeHtml(n) + '"></i>';
                }).join("") +
                "</div>";
            }
            var when = new Date(s.submittedAt);
            var whenText =
              when.getDate() + " " +
              ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][when.getMonth()] +
              ", " + String(when.getHours()).padStart(2, "0") + ":" + String(when.getMinutes()).padStart(2, "0");
            var meta = [
              MATERIAL_LABELS[s.materialType] || null,
              whenText,
            ].filter(Boolean).join(" · ");
            return (
              '<article class="item">' +
              '<div class="item-top"><h3 class="item-title">' + escapeHtml(s.fileName) + "</h3>" +
              '<span class="badge ' + badgeClass(s.auditStatus) + '">' + escapeHtml(STATUS_LABELS[s.auditStatus] || s.auditStatus) + "</span></div>" +
              (s.courseCode ? '<p class="item-sub"><span class="item-code">' + escapeHtml(s.courseCode) + "</span></p>" : "") +
              '<p class="item-sub">' + escapeHtml(meta) + "</p>" +
              dots +
              "</article>"
            );
          })
          .join("");
      })
      .catch(function (err) {
        list.innerHTML = '<p class="empty">Couldn\'t load. ' + escapeHtml(err.message) + "</p>";
      });
  }

  // ── Leaderboard ─────────────────────────────────────────────────
  function loadBoard() {
    var list = $("#board-list");
    if (previewMode) {
      list.innerHTML = '<p class="empty">Preview only — open this app inside Telegram to see the hunt.</p>';
      return;
    }
    list.innerHTML = '<p class="empty">Loading…</p>';
    api("/telegram/miniapp/leaderboard")
      .then(function (body) {
        if (!body.items.length) {
          list.innerHTML =
            '<p class="empty">The board is waiting for its first entry.<br/>Contribute to claim the top spot.</p>';
          return;
        }
        list.innerHTML = body.items
          .map(function (r) {
            var isYou = body.you && body.you.rank === r.rank;
            return (
              '<div class="row' + (isYou ? " you" : "") + '">' +
              '<span class="rank' + (r.rank <= 3 ? " top" : "") + '">' + r.rank + "</span>" +
              '<div class="who"><p class="who-name">' + escapeHtml(r.name) + "</p>" +
              (r.username ? '<p class="who-sub">@' + escapeHtml(r.username) + "</p>" : "") +
              "</div>" +
              (isYou ? '<span class="youchip">You</span>' : "") +
              '<div class="pts"><p class="pts-num">' + r.points + "<small>pts</small></p>" +
              '<p class="pts-sub">' + r.approvedCount + " approved</p></div>" +
              "</div>"
            );
          })
          .join("");
      })
      .catch(function (err) {
        list.innerHTML = '<p class="empty">Couldn\'t load. ' + escapeHtml(err.message) + "</p>";
      });
  }

  // ── Confetti — hand-rolled, brand palette, no dependencies ──────
  function celebrate() {
    if (reducedMotion) return;
    var canvas = $("#confetti");
    var ctx = canvas.getContext("2d");
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = window.innerWidth;
    var H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    var colors = ["#c6ff3d", "#f5f4f1", "#8fb32e", "#e4ff9e"];
    var pieces = [];
    for (var i = 0; i < 120; i++) {
      var fromLeft = i % 2 === 0;
      pieces.push({
        x: fromLeft ? -12 : W + 12,
        y: H * 0.72,
        vx: (fromLeft ? 1 : -1) * (5 + Math.random() * 6),
        vy: -(9 + Math.random() * 7),
        w: 4 + Math.random() * 3,
        h: 8 + Math.random() * 7,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        color: colors[i % colors.length],
        born: performance.now(),
        life: 1900 + Math.random() * 700,
      });
    }

    canvas.hidden = false;
    var started = performance.now();
    function frame(now) {
      ctx.clearRect(0, 0, W, H);
      var alive = 0;
      for (var j = 0; j < pieces.length; j++) {
        var p = pieces[j];
        var age = now - p.born;
        if (age > p.life) continue;
        alive++;
        p.vy += 0.28; // gravity
        p.vx *= 0.985; // drag
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        var alpha = age > p.life - 500 ? (p.life - age) / 500 : 1;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (alive > 0 && now - started < 3400) {
        requestAnimationFrame(frame);
      } else {
        ctx.clearRect(0, 0, W, H);
        canvas.hidden = true;
      }
    }
    requestAnimationFrame(frame);
  }

  boot();
})();
