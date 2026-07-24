/* ============================================================
   WowSuch — core.js
   Shared behaviors: nav, reveal, counters, accordion, toast,
   live prices, lead capture, lead form, chat assistant.
   Exposes window.WOW for page scripts.
   ============================================================ */
(function () {
  "use strict";

  /* ---------- feed config (Tea backend, dashboard.html "Fleet & earnings") ---------- */
  var FEED_BASE_URL = "https://zs-mining-dashboards.onrender.com";
  var FEED_ACCOUNT  = "teaSub221";   // demo account (confirmed live on the backend allowlist)
  var WOWSUCH_FEED_TOKEN = "";   // dedicated feed token — INJECTED AT DEPLOY; keep this empty-string placeholder in git, never commit the real value

  /* ---------- utilities ---------- */
  function money(n) {
    var abs = Math.abs(n);
    return "$" + abs.toLocaleString(undefined, {
      minimumFractionDigits: abs < 1000 ? 2 : 0,
      maximumFractionDigits: abs < 1000 ? 2 : 0
    });
  }
  function whole(n) { return "$" + Math.round(n).toLocaleString(); }
  function hashStr(gh) {
    return gh >= 1
      ? ((gh < 10 ? gh.toFixed(2) : Math.round(gh).toLocaleString()) + " GH/s")
      : (Math.round(gh * 1000).toLocaleString() + " MH/s");
  }
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function byId(id) { return document.getElementById(id); }
  function fetchJSON(url, opts) {
    return fetch(url, opts).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }

  /* ---------- footer year ---------- */
  var yr = byId("yr");
  if (yr) yr.textContent = new Date().getFullYear();

  /* ---------- nav ---------- */
  var burger = byId("burger"), navlinks = byId("navlinks");
  if (burger && navlinks) {
    burger.addEventListener("click", function () { navlinks.classList.toggle("open"); });
    navlinks.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () {
        if (!a.classList.contains("drop-toggle")) navlinks.classList.remove("open");
      });
    });
  }
  document.querySelectorAll(".has-drop").forEach(function (d) {
    var t = d.querySelector(".drop-toggle");
    if (!t) return;
    t.setAttribute("role", "button");
    t.setAttribute("tabindex", "0");
    t.setAttribute("aria-expanded", "false");
    function toggle(e) {
      e.preventDefault(); e.stopPropagation();
      var willOpen = !d.classList.contains("open");
      document.querySelectorAll(".has-drop").forEach(function (o) {
        o.classList.remove("open");
        var ot = o.querySelector(".drop-toggle");
        if (ot) ot.setAttribute("aria-expanded", "false");
      });
      if (willOpen) { d.classList.add("open"); t.setAttribute("aria-expanded", "true"); }
    }
    t.addEventListener("click", toggle);
    t.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") toggle(e); });
  });
  document.addEventListener("click", function (e) {
    if (!e.target.closest(".has-drop")) {
      document.querySelectorAll(".has-drop.open").forEach(function (o) {
        o.classList.remove("open");
        var ot = o.querySelector(".drop-toggle");
        if (ot) ot.setAttribute("aria-expanded", "false");
      });
    }
  });

  /* ---------- scroll reveal ---------- */
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    });
  }, { threshold: 0.12 });
  document.querySelectorAll(".reveal").forEach(function (el) { io.observe(el); });

  /* ---------- animated counters ---------- */
  function animateCount(el) {
    var target = parseFloat(el.getAttribute("data-target"));
    var dec = parseInt(el.getAttribute("data-dec") || "0", 10);
    var t0 = null;
    function step(ts) {
      if (!t0) t0 = ts;
      var p = Math.min((ts - t0) / 1400, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      var val = target * eased;
      el.textContent = dec ? val.toFixed(dec) : Math.round(val).toLocaleString();
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = dec ? target.toFixed(dec) : Math.round(target).toLocaleString();
    }
    requestAnimationFrame(step);
  }
  var sIO = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (e.isIntersecting) { animateCount(e.target); sIO.unobserve(e.target); }
    });
  }, { threshold: 0.5 });
  document.querySelectorAll(".count").forEach(function (el) { sIO.observe(el); });

  /* ---------- FAQ accordion ---------- */
  document.querySelectorAll(".q > button").forEach(function (btn) {
    btn.setAttribute("aria-expanded", "false");
    btn.addEventListener("click", function () {
      var q = btn.parentElement, ans = q.querySelector(".ans");
      var open = q.classList.toggle("open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      ans.style.maxHeight = open ? (ans.scrollHeight + 80) + "px" : "0";
    });
  });

  /* ---------- toast ---------- */
  var toast = byId("toast"), toastTimer;
  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove("show"); }, 5200);
  }

  /* ---------- live prices (CoinGecko, cached 10 min) ---------- */
  var prices = { doge: 0.089, ltc: 47, live: false };
  function broadcastPrices() {
    var el = byId("livePx");
    if (el) {
      el.innerHTML = "⛓ Live prices: <b>DOGE $" + prices.doge.toFixed(4) +
        "</b> · <b>LTC $" + prices.ltc.toFixed(2) + "</b>" +
        "<small>" + (prices.live ? "live market data" : "reference prices") + "</small>";
    }
    document.dispatchEvent(new CustomEvent("wow:prices", { detail: prices }));
  }
  function setPrices(d, l, live) {
    if (d && isFinite(d)) prices.doge = d;
    if (l && isFinite(l)) prices.ltc = l;
    prices.live = !!live;
    broadcastPrices();
  }
  (function fetchPrices() {
    try {
      var cached = sessionStorage.getItem("wowsuch_px");
      if (cached) {
        var c = JSON.parse(cached);
        if (c && Date.now() - c.t < 10 * 60 * 1000) { setPrices(c.d, c.l, true); return; }
      }
    } catch (e) { /* storage unavailable — fall through to fetch */ }
    broadcastPrices();
    try {
      fetch("https://api.coingecko.com/api/v3/simple/price?ids=dogecoin,litecoin&vs_currencies=usd")
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (j && j.dogecoin && j.litecoin) {
            var d = parseFloat(j.dogecoin.usd), l = parseFloat(j.litecoin.usd);
            setPrices(d, l, true);
            try { sessionStorage.setItem("wowsuch_px", JSON.stringify({ d: d, l: l, t: Date.now() })); } catch (e) {}
          }
        })
        .catch(function () { /* keep reference prices */ });
    } catch (e) { /* fetch unsupported — keep reference prices */ }
  })();

  /* ---------- live feed (Tea mining backend, cached 10 min) ---------- */
  function broadcastFeed(status, data) {
    document.dispatchEvent(new CustomEvent("wow:feed", { detail: { status: status, data: data || null } }));
  }
  function fetchFeed() {
    var cacheKey = "wowsuch_feed_" + FEED_ACCOUNT;
    try {
      var cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        var c = JSON.parse(cached);
        if (c && Date.now() - c.t < 10 * 60 * 1000) { broadcastFeed("success", c.d); return; }
      }
    } catch (e) { /* storage unavailable — fall through to fetch */ }
    var url = FEED_BASE_URL + "/mdi/feed/account-summary?account=" + encodeURIComponent(FEED_ACCOUNT) + "&token=" + encodeURIComponent(WOWSUCH_FEED_TOKEN);
    fetchJSON(url).then(function (j) {
      broadcastFeed("success", j);
      try { sessionStorage.setItem(cacheKey, JSON.stringify({ d: j, t: Date.now() })); } catch (e) {}
    }).catch(function () { broadcastFeed("error", null); });
  }

  /* ---------- lead capture ---------- */
  function saveLead(o) {
    try {
      o.ts = new Date().toISOString();
      o.page = (location.pathname.split("/").pop() || "index.html");
      var a = JSON.parse(localStorage.getItem("wowsuch_leads") || "[]");
      a.push(o);
      localStorage.setItem("wowsuch_leads", JSON.stringify(a));
    } catch (e) { /* private mode — lead not persisted locally */ }
  }

  /* ---------- quote / contact form ---------- */
  var lead = byId("leadForm");
  if (lead) {
    lead.addEventListener("submit", function (e) {
      e.preventDefault();
      function gv(id) { var el = byId(id); return el ? (el.value || "").trim() : ""; }
      saveLead({
        source: "contact", name: gv("nm"), email: gv("em"), interest: gv("opt"),
        qty: gv("howmany"), country: gv("cty"), message: gv("msg")
      });
      showToast("Request received — our team will reply by email within one business day. Wow.");
      lead.reset();
    });
  }

  /* ---------- chat assistant ---------- */
  var BASE_KB = [
    { k: ["price", "cost", "how much", "expensive", "$"], a: "A whole Antminer L9 is $4,995. Or rent to own by the chip: one L9 is 288 chips, about $20.83 per chip over 18 months at 0% (min. 12 chips ≈ $13.89/mo). Hosting is a flat $0.079/kWh all-in." },
    { k: ["host", "electric", "power", "kwh", "where", "located", "location", "facility"], a: "Machines run in our United States facility — 24/7 monitored with the repair team on the same floor. Hosting is a flat $0.079/kWh all-in on a 1-year term." },
    { k: ["paid", "payout", "pay me", "earn", "income", "coins", "daily"], a: "You're paid daily in LTC + DOGE — the coins you actually mine — to your own WowSuch MPC self-custody wallet. Pool fee (3%) and hosting are withheld automatically before payout." },
    { k: ["deposit", "security deposit", "setup fee", "fee waived"], a: "No security deposit and no setup fee if WowSuch Pool withholds and forwards your hosting from your daily LTC + DOGE. Prefer to pay hosting yourself? Then a 2-month deposit and a one-time setup fee apply." },
    { k: ["rent", "own", "financing", "finance", "monthly", "18", "interest", "chip", "chips", "payoff", "term", "allowance"], a: "Rent to own is by the chip: an L9 is 288 chips. Rent from 12 chips (≈$13.89/mo), pay them off over 18 months at 0% while they mine, repairs included. At month 18: pay the difference to own the whole L9, walk away, or have your chip shipped as a keepsake." },
    { k: ["buyback", "sell", "resell", "tired", "exit", "get out"], a: "Done mining? Give 90 days notice and we'll broker a sale of your equipment at fair market value, or ship the hardware to you. Your call." },
    { k: ["warranty", "repair", "repairs", "broken", "break", "breaks", "fix", "rma", "offline", "down"], a: "Every L9 carries a 90-day warranty plus 90 more days of free repairs — six months of coverage with original parts and turnaround typically under 14 business days. On rent to own, repairs are included for the full 18-month term." },
    { k: ["serial", "inspect", "inspection", "visit", "tour", "video"], a: "Inspect your machine by video recording any time; proof of serial number comes with every full machine purchase. On-site visits are available to owners of 50+ machines." },
    { k: ["stock", "ship", "shipping", "wait", "delivery", "when"], a: "L9s are in stock and already racked — nothing ships by default. After payment clears, your machine points at your account and is hashing within 1 business day." },
    { k: ["mpc", "wallet", "custody", "keys", "secure", "security"], a: "Rewards land in a WowSuch MPC self-custody wallet — only you can unlock it; we never hold your coins. Withdraw to any wallet, any time." },
    { k: ["merge", "merged", "both coins", "two coins", "scrypt"], a: "Litecoin and Dogecoin share the Scrypt algorithm, so one L9 merge-mines both at once: same machine, same watts, two reward streams." },
    { k: ["enterprise", "colocation", "colo", "fleet", "bulk"], a: "Bringing 50+ machines or your own fleet? Our enterprise team handles hosting, colocation, repairs, and management — see the Enterprise page or request a quote." },
    { k: ["lease"], a: "Already own miners? Lease them to us: we host, run, and repair them, and you get paid daily in USDC. See the Lease page for the math." },
    { k: ["software", "whitelabel", "white label", "license", "pool software"], a: "You can license the WowSuch stack — run your own LTC+DOGE mining pool and issue MPC wallets under your brand, deployed in your cloud. See the Whitelabel page." },
    { k: ["human", "support", "ticket", "agent", "talk"], a: "Open a support ticket from any form on the site and a human follows up by email — usually within one business day." }
  ];
  var KB = (window.WOW_KB || []).concat(BASE_KB);
  var fab = byId("chatFab"), panel = byId("chatPanel"), chatBody = byId("chatBody"),
      chatChips = byId("chatChips"), chatForm = byId("chatForm"), chatText = byId("chatText"),
      chatClose = byId("chatClose");
  function answer(qtext) {
    var t = qtext.toLowerCase(), best = null, bestScore = 0;
    KB.forEach(function (item) {
      var s = 0;
      item.k.forEach(function (kw) { if (t.indexOf(kw) >= 0) s += kw.length; });
      if (s > bestScore) { bestScore = s; best = item; }
    });
    return best ? best.a : "Good question — I don't have that one memorized. Send it through the quote form and a human will follow up by email. Wow.";
  }
  function addMsg(target, who, text) {
    var m = document.createElement("div");
    m.className = "msg " + who;
    var b = document.createElement("div");
    b.className = "bub";
    b.textContent = text;
    m.appendChild(b);
    target.appendChild(m);
    target.scrollTop = target.scrollHeight;
  }
  var CHIP_QS = ["Price?", "How does rent to own work?", "What if my machine breaks?", "How am I paid?", "Deposit or setup fee?"];
  function wireChat(bodyEl, chipsEl, formEl, inputEl) {
    if (!bodyEl || !formEl) return;
    if (chipsEl && !chipsEl.children.length) {
      CHIP_QS.forEach(function (q) {
        var b = document.createElement("button");
        b.type = "button"; b.textContent = q;
        b.addEventListener("click", function () { ask(q); });
        chipsEl.appendChild(b);
      });
    }
    function ask(q) {
      addMsg(bodyEl, "user", q);
      setTimeout(function () { addMsg(bodyEl, "bot", answer(q)); }, 350);
    }
    formEl.addEventListener("submit", function (e) {
      e.preventDefault();
      var v = (inputEl.value || "").trim();
      if (!v) return;
      inputEl.value = "";
      ask(v);
    });
    addMsg(bodyEl, "bot", "Wow, hi! Ask me about pricing, rent to own, payouts, repairs, hosting — anything. Or tap a chip below.");
  }
  if (fab && panel) {
    function closeChat() {
      panel.classList.remove("open");
      panel.setAttribute("aria-hidden", "true");
      fab.focus();
    }
    fab.addEventListener("click", function () {
      var open = panel.classList.toggle("open");
      panel.setAttribute("aria-hidden", open ? "false" : "true");
      if (open) {
        if (!chatBody.children.length) wireChat(chatBody, chatChips, chatForm, chatText);
        if (chatText) chatText.focus();
      }
    });
    panel.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeChat();
    });
    if (chatClose) chatClose.addEventListener("click", closeChat);
  }
  /* inline FAQ chat (if present on page) */
  wireChat(byId("fcBody"), byId("fcChips"), byId("fcForm"), byId("fcText"));

  /* ---------- charts ---------- */
  function renderChart(svg, data, color, fill) {
    if (!svg) return;
    var W = 520, H = 240, pl = 44, pr = 14, pt = 18, pb = 30;
    var min = Math.min.apply(null, data), max = Math.max.apply(null, data);
    var range = (max - min) || 1;
    min -= range * 0.12; max += range * 0.12; range = max - min;
    var iw = W - pl - pr, ih = H - pt - pb;
    function X(i) { return pl + i * iw / (data.length - 1); }
    function Y(v) { return pt + (1 - (v - min) / range) * ih; }
    var g = "";
    for (var k = 0; k <= 4; k++) {
      var gy = pt + ih * k / 4, gv = max - range * k / 4;
      g += '<line x1="' + pl + '" y1="' + gy + '" x2="' + (W - pr) + '" y2="' + gy + '" stroke="#2B1D05" stroke-width="1" opacity="0.12"/>';
      g += '<text x="' + (pl - 6) + '" y="' + (gy + 4) + '" text-anchor="end" font-family="IBM Plex Mono,monospace" font-weight="600" font-size="10" fill="#6A5224" opacity="0.75">' + Math.round(gv) + "</text>";
    }
    var pts = data.map(function (v, i) { return X(i).toFixed(1) + "," + Y(v).toFixed(1); });
    var area = "M" + X(0).toFixed(1) + "," + Y(data[0]).toFixed(1) + " L" + pts.join(" L") +
      " L" + X(data.length - 1).toFixed(1) + "," + (pt + ih) + " L" + pl + "," + (pt + ih) + " Z";
    var lx = X(data.length - 1), ly = Y(data[data.length - 1]);
    svg.innerHTML = g +
      '<path d="' + area + '" fill="' + fill + '"/>' +
      '<polyline points="' + pts.join(" ") + '" fill="none" stroke="' + color + '" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>' +
      '<circle cx="' + lx.toFixed(1) + '" cy="' + ly.toFixed(1) + '" r="5.5" fill="' + color + '" stroke="#2B1D05" stroke-width="2.5"/>' +
      '<text x="' + pl + '" y="' + (H - 8) + '" font-family="Nunito,sans-serif" font-weight="700" font-size="11" fill="#6A5224">12 mo ago</text>' +
      '<text x="' + (W - pr) + '" y="' + (H - 8) + '" text-anchor="end" font-family="Nunito,sans-serif" font-weight="700" font-size="11" fill="#6A5224">now</text>';
  }

  /* ---------- public API ---------- */
  window.WOW = {
    money: money, whole: whole, hashStr: hashStr, esc: esc,
    saveLead: saveLead, showToast: showToast, renderChart: renderChart,
    prices: prices, fetchJSON: fetchJSON, fetchFeed: fetchFeed
  };
})();
