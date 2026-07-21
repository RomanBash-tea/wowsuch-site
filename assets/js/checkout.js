/* ============================================================
   WowSuch — checkout.js
   Two-step order reservation flow. Requires core.js.

   Page config:
     window.WOW_CHECKOUT = { mode: "own" | "rent" }

   Flow: 1) package + details → 2) review + payment preference
   → confirmation. submitOrder() is the single backend
   integration point (currently persists the order locally and
   renders the confirmation screen).
   ============================================================ */
(function () {
  "use strict";
  var form = document.getElementById("coForm");
  if (!form || !window.WOW) return;

  var W = window.WOW;
  var CFG = window.WOW_CHECKOUT || { mode: "own" };
  var RENT = CFG.mode === "rent";

  /* ---------- pricing constants ---------- */
  var PRICE = 4995, DEPOSIT = 100, GH_FULL = 16;
  var CHIPS = 288, WHOLE_RENT = 6000, RENT_TERM = 18;
  var PER_CHIP = WHOLE_RENT / CHIPS, PER_CHIP_MO = PER_CHIP / RENT_TERM;

  var QMAP = RENT ? { q1: 12, q25: 72, q50: 144, q250: 288 } : { q1: 1, q25: 25, q50: 50, q250: 250, q500: 500 };
  var TITLES = RENT
    ? { q1: "12 chips", q25: "1 hashboard (72)", q50: "Half L9 (144)", q250: "Whole L9 (288)", qcustom: "Custom chips" }
    : { q1: "1 machine", q25: "25 machines", q50: "50 machines", q250: "250 machines", q500: "500 machines", qcustom: "Custom qty" };
  var MIN = RENT ? 12 : 1, MAX = RENT ? 288 : 500;

  var state = { qty: QMAP.q1, view: 1 };

  /* ---------- helpers ---------- */
  function byId(id) { return document.getElementById(id); }
  function setText(id, v) { var el = byId(id); if (el) el.textContent = v; }
  function setHtml(id, v) { var el = byId(id); if (el) el.innerHTML = v; }
  function ghFor(q) { return RENT ? (GH_FULL / CHIPS * q) : (GH_FULL * q); }
  function dueAmount() { return RENT ? PER_CHIP_MO * state.qty : DEPOSIT; }
  function totalAmount() { return RENT ? PER_CHIP * state.qty : PRICE * state.qty; }
  function qtyLabel() { return RENT ? state.qty + " chip" + (state.qty > 1 ? "s" : "") : state.qty + " rig" + (state.qty > 1 ? "s" : ""); }

  var coView1 = byId("coView1"), coView2 = byId("coView2"), coView3 = byId("coView3");
  var coAction = byId("coAction"), coBack = byId("coBack"), coV1Status = byId("coV1Status"), coStatus = byId("coStatus");
  var customWrap = byId("customWrap"), coQty = byId("coQty");

  /* ---------- package cards ---------- */
  document.querySelectorAll("input[name=qtypkg]").forEach(function (inp) {
    var v = inp.value, lab = inp.closest(".opt");
    if (!lab) return;
    if (RENT && v === "q500") { lab.style.display = "none"; return; }
    var t = lab.querySelector(".opt-title"), m = lab.querySelector(".opt-meta");
    if (t) t.textContent = TITLES[v] || v;
    if (m) {
      if (v === "qcustom") m.textContent = RENT ? "12 to 288 chips" : "1 to 500 units";
      else {
        var q = QMAP[v] || 1;
        m.textContent = W.hashStr(ghFor(q)) + " · " + (RENT ? W.money(PER_CHIP_MO * q) + "/mo" : W.whole(PRICE * q));
      }
    }
    inp.addEventListener("change", function () {
      document.querySelectorAll("input[name=qtypkg]").forEach(function (i) {
        i.closest(".opt").classList.toggle("sel", i.checked);
      });
      if (v === "qcustom") {
        if (customWrap) customWrap.classList.remove("hide");
        state.qty = Math.max(MIN, Math.min(MAX, parseInt(coQty && coQty.value, 10) || MIN));
      } else {
        if (customWrap) customWrap.classList.add("hide");
        state.qty = QMAP[v];
      }
      updateSummary();
    });
  });
  if (coQty) {
    function setQty(n) {
      n = Math.max(MIN, Math.min(MAX, (n | 0) || MIN));
      state.qty = n; coQty.value = n; updateSummary();
    }
    var plus = byId("coPlus"), minus = byId("coMinus");
    if (plus) plus.addEventListener("click", function () { setQty(state.qty + 1); });
    if (minus) minus.addEventListener("click", function () { setQty(state.qty - 1); });
    coQty.addEventListener("input", function () {
      var v = parseInt(coQty.value.replace(/[^0-9]/g, ""), 10);
      if (!isNaN(v)) { state.qty = Math.max(1, Math.min(MAX, v)); updateSummary(); }
    });
    coQty.addEventListener("blur", function () { setQty(state.qty); });
  }

  /* ---------- summary ---------- */
  function updateSummary() {
    var q = state.qty;
    if (RENT) {
      setText("sumPkg", "Rent to own · chips");
      setText("sumGh", q + " chips · " + W.hashStr(ghFor(q)));
      setText("sumPayLabel", "Monthly rent");
      setText("sumPay", W.money(PER_CHIP_MO * q) + "/mo");
      setText("sumExtraLabel", "Own these chips");
      setText("sumExtra", W.money(PER_CHIP * q) + " · 18 mo · 0%");
      setHtml("dueLabel", "Due on invoice <small>first month</small>");
    } else {
      setText("sumPkg", "Buy outright");
      setText("sumGh", q + " × 16 GH/s");
      setText("sumPayLabel", "Total price");
      setText("sumPay", W.whole(PRICE * q));
      setText("sumExtraLabel", "Balance in 30 days");
      setText("sumExtra", W.whole(PRICE * q - DEPOSIT));
      setHtml("dueLabel", "Due on invoice <small>reservation deposit</small>");
    }
    setText("dueAmt", W.money(dueAmount()));
    var fine = byId("dueFine");
    if (fine) fine.textContent = RENT
      ? "Your first month starts the term; then about $1.16 per chip per month for 18 months at 0% to own these chips. Repairs included for the full term."
      : "Your $100 deposit holds your machine and price for 30 days. Pay the balance any time in that window to go live; if you don't, the reservation simply lapses — only the $100 deposit is forfeited, nothing else is ever charged.";
    if (coAction) coAction.innerHTML = state.view === 1
      ? 'Review order <span class="arrow">→</span>'
      : "Reserve · " + W.money(dueAmount()) + ' invoice <span class="arrow">→</span>';
  }

  /* ---------- validation ---------- */
  function val(id) { var el = byId(id); return el ? (el.value || "").trim() : ""; }
  function fullName() { return (val("coFirst") + " " + val("coLast")).trim(); }
  function fail(msg) { if (coV1Status) { coV1Status.className = "form-status err"; coV1Status.textContent = msg; } return false; }
  function validateDetails() {
    if (!val("coFirst")) return fail("Add your first name.");
    if (!val("coLast")) return fail("Add your last name.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(val("coEmail"))) return fail("Add a valid email — your invoice goes there.");
    var consent = byId("coConsent");
    if (consent && !consent.checked) return fail("Please accept the Terms to continue.");
    if (coV1Status) { coV1Status.className = "form-status"; coV1Status.textContent = ""; }
    return true;
  }

  /* ---------- step 2: review ---------- */
  function payPref() {
    var sel = document.querySelector("input[name=paypref]:checked");
    return sel ? sel.value : "crypto";
  }
  function buildRecap() {
    var rows = RENT
      ? '<div class="rc-row"><span>Plan</span><b>Rent to own · chips</b></div>' +
        '<div class="rc-row"><span>Chips</span><b>' + state.qty + " of 288 · " + W.hashStr(ghFor(state.qty)) + "</b></div>" +
        '<div class="rc-row"><span>Monthly rent</span><b>' + W.money(PER_CHIP_MO * state.qty) + "/mo</b></div>" +
        '<div class="rc-row"><span>Own these chips</span><b>' + W.money(PER_CHIP * state.qty) + " · 18 mo · 0%</b></div>" +
        '<div class="rc-row"><span>Repairs</span><b>included · 18 mo</b></div>'
      : '<div class="rc-row"><span>Plan</span><b>Buy outright</b></div>' +
        '<div class="rc-row"><span>Machines</span><b>' + state.qty + " × 16 GH/s</b></div>" +
        '<div class="rc-row"><span>Total price</span><b>' + W.whole(PRICE * state.qty) + "</b></div>" +
        '<div class="rc-row"><span>Deposit on invoice</span><b>' + W.whole(DEPOSIT) + "</b></div>" +
        '<div class="rc-row"><span>Balance in 30 days</span><b>' + W.whole(PRICE * state.qty - DEPOSIT) + "</b></div>";
    rows += '<div class="rc-row"><span>Name</span><b>' + W.esc(fullName() || "—") + "</b></div>" +
            '<div class="rc-row"><span>Email</span><b>' + W.esc(val("coEmail") || "—") + "</b></div>";
    setHtml("coRecap", rows);
  }
  function gotoView(n) {
    state.view = n;
    if (coView1) coView1.classList.toggle("hide", n !== 1);
    if (coView2) coView2.classList.toggle("hide", n !== 2);
    if (coView3) coView3.classList.toggle("hide", n !== 3);
    var aside = document.querySelector(".checkout .summary");
    if (aside) aside.classList.toggle("hide", n === 3);
    if (n === 2) buildRecap();
    updateSummary();
    var sec = document.getElementById("checkout");
    if (sec && sec.scrollIntoView) sec.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  if (coBack) coBack.addEventListener("click", function () { gotoView(1); });

  /* ---------- order submission (backend integration point) ---------- */
  function makeOrderNo() {
    var s = "", chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    for (var i = 0; i < 6; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
    return "WS-" + s;
  }
  function submitOrder(order) {
    /* Wire to backend here: POST /api/orders. For now: persist locally + confirm. */
    W.saveLead({
      source: "checkout", name: order.name, email: order.email, plan: order.plan,
      qty: order.qty, total: order.total, dueNow: order.dueNow, pay: order.pay, order: order.no
    });
    return Promise.resolve({ ok: true, no: order.no });
  }
  function renderConfirmation(order) {
    setText("cfOrd", order.no);
    setText("cfEmail", order.email);
    setText("cfDue", order.dueNow);
    gotoView(3);
    W.showToast("Order " + order.no + " reserved — invoice on its way to " + order.email + ". Wow.");
  }

  /* ---------- submit handler ---------- */
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (state.view === 1) { if (validateDetails()) gotoView(2); return; }
    if (state.view !== 2) return;
    var order = {
      no: makeOrderNo(),
      name: fullName(),
      email: val("coEmail"),
      plan: RENT ? "Rent to own (chips)" : "Buy outright",
      qty: qtyLabel(),
      total: RENT ? W.money(totalAmount()) : W.whole(totalAmount()),
      dueNow: W.money(dueAmount()),
      pay: payPref()
    };
    if (coStatus) { coStatus.className = "form-status"; coStatus.textContent = "Reserving your order…"; }
    if (coAction) coAction.setAttribute("disabled", "disabled");
    submitOrder(order).then(function (res) {
      if (coAction) coAction.removeAttribute("disabled");
      if (coStatus) coStatus.textContent = "";
      if (res && res.ok) renderConfirmation(order);
      else if (coStatus) { coStatus.className = "form-status err"; coStatus.textContent = "Something went wrong — please try again or contact support."; }
    });
  });

  /* ---------- external API: pre-select a quantity (e.g. from the profit calc) ---------- */
  function selectPackage(value) {
    var inp = document.querySelector("input[name=qtypkg][value=" + value + "]");
    if (!inp) return;
    inp.checked = true;
    inp.dispatchEvent(new Event("change"));
  }
  W.checkoutSetQty = function (n) {
    n = Math.max(MIN, Math.min(MAX, (n | 0) || MIN));
    var exact = Object.keys(QMAP).filter(function (k) { return QMAP[k] === n; })[0];
    if (exact) { selectPackage(exact); return; }
    selectPackage("qcustom");
    if (coQty) coQty.value = n;
    state.qty = n;
    updateSummary();
  };

  /* ---------- init ---------- */
  var first = document.querySelector("input[name=qtypkg][value=q1]");
  if (first) { first.checked = true; first.closest(".opt").classList.add("sel"); }
  var firstPay = document.querySelector("input[name=paypref][value=crypto]");
  if (firstPay) { firstPay.checked = true; firstPay.closest(".opt").classList.add("sel"); }
  document.querySelectorAll("input[name=paypref]").forEach(function (inp) {
    inp.addEventListener("change", function () {
      document.querySelectorAll("input[name=paypref]").forEach(function (i) {
        i.closest(".opt").classList.toggle("sel", i.checked);
      });
    });
  });
  updateSummary();
})();
