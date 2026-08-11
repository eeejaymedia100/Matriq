/* Matriq waitlist — form logic */
(function () {
  "use strict";

  var form = document.getElementById("waitlist-form");
  var emailInput = document.getElementById("email");
  var joinBtn = document.getElementById("join-btn");
  var msg = document.getElementById("form-msg");
  var countEl = document.getElementById("count");
  document.getElementById("year").textContent = new Date().getFullYear();

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function show(type, text) {
    msg.className = "form-msg " + type;
    msg.textContent = text;
  }

  // Live signup counter
  function loadCount() {
    fetch("/v1/waitlist/count", { headers: { Accept: "application/json" } })
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

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var email = emailInput.value.trim();

    if (!EMAIL_RE.test(email)) {
      show("err", "Please enter a valid email address.");
      emailInput.focus();
      return;
    }

    joinBtn.disabled = true;
    joinBtn.classList.add("loading");
    show("", "Joining…");

    var payload = { email: email };
    var website = document.getElementById("website");
    if (website && website.value) payload.website = website.value; // honeypot

    fetch("/v1/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (data) {
        if (data && data.position && typeof data.position === "number") {
          show("ok", "You're on the list! 🎉 You're #" + data.position.toLocaleString("en-NG") + " in line.");
          emailInput.value = "";
          countEl.textContent = data.position.toLocaleString("en-NG");
        } else if (data && data.error && data.error.message) {
          show("err", data.error.message);
        } else {
          show("ok", "You're on the list! We'll email you at launch. 🎉");
          emailInput.value = "";
        }
      })
      .catch(function () {
        show("err", "Something went wrong. Please try again in a moment.");
      })
      .finally(function () {
        joinBtn.disabled = false;
        joinBtn.classList.remove("loading");
      });
  });
})();
