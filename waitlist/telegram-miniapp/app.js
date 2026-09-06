/* Matriq Telegram Mini App — client logic.
 *
 * Auth: Telegram hands us `initData`; we swap it for a scoped session token
 * at POST /telegram/miniapp/auth, then call gated endpoints with Bearer.
 * No Matriq credentials ever live in the Mini App.
 */
(function () {
  "use strict";

  var API = "https://api.matriq.com.ng/v1";
  var tg = window.Telegram && window.Telegram.WebApp;

  // ── State ───────────────────────────────────────────────────────
  var token = null;
  var me = null; // { linkedAccount, communityMember, canUpload, communityUrl, botUsername }

  // ── Tiny helpers ────────────────────────────────────────────────
  function $(sel) { return document.querySelector(sel); }
  function $all(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  function showToast(msg) {
    var toast = $("#toast");
    toast.textContent = msg;
    toast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () { toast.hidden = true; }, 3200);
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
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          var msg = (body && (body.message || body.error)) || "Request failed (" + res.status + ")";
          throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
        });
      }
      return res.json();
    });
  }

  // ── Telegram chrome ─────────────────────────────────────────────
  if (tg) {
    tg.ready();
    tg.expand();
    try { tg.setHeaderColor("#0a0a0a"); tg.setBackgroundColor("#0a0a0a"); } catch (e) { /* older clients */ }
  }

  function openInChat(path) {
    // Send the user back to the bot chat for flows that live there
    // (/link, community gate re-check). Telegram supports close(); we use a
    // bot command deep-link via the bot username.
    if (tg && tg.close) {
      showToast("Continue in the bot chat…");
      setTimeout(function () { tg.close(); }, 600);
    }
  }

  // ── Boot ────────────────────────────────────────────────────────
  function boot() {
    var initData = tg ? tg.initData : "";
    if (!initData) {
      $("#boot-line").textContent = "Open Matriq from the bot — send /start to @MatriqBot.";
      return;
    }
    fetch(API + "/telegram/miniapp/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData: initData }),
    })
      .then(function (res) {
        if (!res.ok) throw new Error("auth failed");
        return res.json();
      })
      .then(function (body) {
        token = body.token;
        return api("/telegram/miniapp/me");
      })
      .then(function (body) {
        me = body;
        renderHome();
        showView("home");
      })
      .catch(function () {
        $("#boot-line").textContent = "Matriq couldn't verify this session. Close and reopen from the bot.";
      });
  }

  // ── View switching ──────────────────────────────────────────────
  function showView(name) {
    $all(".view").forEach(function (v) { v.hidden = true; });
    var el = $("#view-" + name);
    if (el) {
      el.hidden = false;
      // Re-trigger the rise animation.
      el.style.animation = "none";
      void el.offsetHeight;
      el.style.animation = "";
    }
    if (tg && tg.BackButton) {
      if (name === "home") { tg.BackButton.hide(); }
      else { tg.BackButton.show(); tg.BackButton.onClick(function () { showView("home"); }); }
    }
  }

  document.addEventListener("click", function (ev) {
    var t = ev.target.closest("[data-nav]");
    if (t) {
      ev.preventDefault();
      showView(t.getAttribute("data-nav"));
    }
  });

  // ── Home ────────────────────────────────────────────────────────
  function renderHome() {
    var gate = $("#gate-card");
    if (!me.canUpload) {
      gate.hidden = false;
      var missing = [];
      if (!me.linkedAccount) missing.push("Link your Matriq account");
      if (!me.communityMember) missing.push("Join the community");
      $("#gate-title").textContent = missing.length === 2 ? "Two steps to contribute" : missing[0];
      $("#gate-body").textContent =
        missing.length === 2
          ? "Link your account and join the community — then every upload enters the audit queue."
          : missing[0] === "Join the community" ? "The library is built by students who show up. Join, then contribute." : "Linking confirms you're a real student — it takes a minute in the bot chat.";
      $("#gate-community").href = me.communityUrl;
      $("#gate-link").addEventListener("click", function () {
        openInChat("/link");
      });
    } else {
      gate.hidden = true;
    }
    $("#tile-community").href = me.communityUrl;
  }

  // ── Library ─────────────────────────────────────────────────────
  var searchTimer = null;
  $("#library-q").addEventListener("input", function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadLibrary, 250);
  });

  function loadLibrary() {
    var q = $("#library-q").value.trim();
    var list = $("#library-list");
    list.innerHTML = '<p class="empty">Searching…</p>';
    api("/telegram/miniapp/library" + (q ? "?q=" + encodeURIComponent(q) : ""))
      .then(function (body) {
        if (!body.items.length) {
          list.innerHTML = '<p class="empty">Nothing matches that yet.<br/>Every contribution widens the archive — /upload in the bot.</p>';
          return;
        }
        list.innerHTML = body.items
          .map(function (it) {
            var kind = it.type === "past_question" ? "Past question" : "Material";
            var meta = [kind, it.level ? "Level " + it.level : null, it.session].filter(Boolean).join(" · ");
            return (
              '<article class="item">' +
              '<div class="item-top"><h3 class="item-title">' + escapeHtml(it.title || it.courseTitle || it.courseCode) + "</h3>" +
              '<span class="item-code">' + escapeHtml(it.courseCode) + "</span></div>" +
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

  // ── Submit ──────────────────────────────────────────────────────
  $("#submit-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    if (!me.canUpload) {
      showToast(me.linkedAccount ? "Join the community first — the link is on the home screen." : "Link your account first — send /link to the bot.");
      return;
    }
    var form = ev.target;
    var file = $("#submit-file").files[0];
    if (!file) {
      showToast("Choose a file first.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      showToast("That file is over 20 MB.");
      return;
    }
    if (!$("#submit-rights").checked) {
      showToast("The rights declaration is required.");
      return;
    }
    var btn = $("#submit-btn");
    btn.disabled = true;
    btn.textContent = "Submitting…";
    var data = new FormData();
    data.append("file", file);
    data.append("courseCode", form.courseCode.value.trim());
    data.append("materialType", form.materialType.value);
    var session = form.academicSession.value.trim();
    if (session) data.append("academicSession", session);
    data.append("rightsDeclared", "true");
    api("/telegram/miniapp/submissions", { method: "POST", body: data })
      .then(function (body) {
        $("#submit-ref").textContent = body.id;
        form.reset();
        form.hidden = true;
        $("#submit-success").hidden = false;
      })
      .catch(function (err) {
        showToast(err.message);
      })
      .then(function () {
        btn.disabled = false;
        btn.textContent = "Submit for audit";
      });
  });

  // ── Status ──────────────────────────────────────────────────────
  function loadStatus() {
    var list = $("#status-list");
    list.innerHTML = '<p class="empty">Loading…</p>';
    api("/telegram/miniapp/submissions")
      .then(function (body) {
        if (!body.submissions.length) {
          list.innerHTML = '<p class="empty">Nothing submitted yet.<br/>The library grows because students feed it — /upload in the bot.</p>';
          return;
        }
        list.innerHTML = body.submissions
          .map(function (s) {
            var cls = badgeClass(s.auditStatus);
            var note = s.failureReason ? '<p class="item-note">' + escapeHtml(s.failureReason) + "</p>" : "";
            return (
              '<article class="item">' +
              '<div class="item-top"><h3 class="item-title">' + escapeHtml(s.fileName) + "</h3>" +
              '<span class="item-code">' + escapeHtml(s.courseCode) + "</span></div>" +
              '<p class="item-sub">' + escapeHtml(new Date(s.submittedAt).toISOString().slice(0, 16).replace("T", " ") + " UTC") + "</p>" +
              '<span class="badge ' + cls + '">' + escapeHtml(label(s.auditStatus)) + "</span>" +
              note +
              "</article>"
            );
          })
          .join("");
      })
      .catch(function (err) {
        list.innerHTML = '<p class="empty">Could not load. ' + escapeHtml(err.message) + "</p>";
      });
  }

  function badgeClass(status) {
    if (status === "published" || status === "approved" || status === "reward_eligible") return "ok";
    if (status === "rejected" || status === "failed" || status === "reward_ineligible") return "bad";
    if (status === "needs_information") return "warn";
    return "";
  }

  function label(status) {
    var labels = {
      received: "Received",
      validating: "Validating",
      duplicate_check: "Duplicate check",
      extracting: "Extracting",
      ocr_processing: "OCR",
      auditing: "AI audit",
      pending_human_review: "Human review",
      approved: "Approved",
      rejected: "Rejected",
      needs_information: "Needs info",
      reward_pending: "Reward pending",
      reward_eligible: "Reward eligible",
      reward_ineligible: "Reward ineligible",
      processing_library: "Publishing",
      published: "Live in library",
      failed: "Failed",
    };
    return labels[status] || status;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // Refresh status each time its view opens.
  var origShowView = showView;
  showView = function (name) {
    origShowView(name);
    if (name === "status") loadStatus();
    if (name === "library") loadLibrary();
  };

  boot();
})();
