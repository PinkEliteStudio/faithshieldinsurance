/* Wellstead 🌐 Website signals (Nov 3, Rhina). Built in-house, nothing paid.
   Watches what a visitor reads on the page (which page, how far they scroll, how long they stay, when they start a form)
   and reports it to Wellstead. When the visitor is a known lead (they came from one of Rhina's emails, or they just sent
   a form), Wellstead puts it on their lead page and, for strong reading, tells Rhina right away so she can call.
   No cookies, no outside company: one random visit code saved in this browser, nothing else.
   Use on any page:  <script src="/ws.js" defer></script>
   Other websites:   <script src="/ws.js" data-endpoint="https://dreamteam-faithshield.netlify.app/.netlify/functions/site-signal" data-site="faithshield" defer></script> */
(function () {
  if (window.__ws) return; window.__ws = 1;
  if (/bot|crawl|spider|preview|headless/i.test(navigator.userAgent || "")) return;
  var S = document.currentScript || {}, D = (S && S.dataset) || {};
  var EP = D.endpoint || "/.netlify/functions/site-signal", SITE = D.site || location.hostname;
  var OWN = (D.hosts || "dreamteam-faithshield.netlify.app,faithshieldlife.com,www.faithshieldlife.com,faithshieldinsurance.netlify.app").split(",");
  function st(k, v) { try { if (v === undefined) return localStorage.getItem("ws_" + k) || ""; localStorage.setItem("ws_" + k, v); } catch (e) { return ""; } }
  var q = new URLSearchParams(location.search), ok = function (s) { return /^[a-z0-9]{12,40}$/i.test(s || ""); };
  var sid = q.get("ws"); if (ok(sid)) st("sid", sid); else sid = st("sid");
  if (!ok(sid)) { sid = (Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + Date.now().toString(36)).slice(0, 24); st("sid", sid); }
  var wl = q.get("wl"), wk = q.get("wlk");
  if (wl && wk) { st("wl", wl); st("wlk", wk); } else { wl = st("wl"); wk = st("wlk"); }
  // Clean the address bar so a forwarded link doesn't carry their code
  try { if (q.has("wl") || q.has("ws")) { q.delete("wl"); q.delete("wlk"); q.delete("ws"); var qs = q.toString(); history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash); } } catch (e) {}
  var src = q.get("src") || q.get("utm_source") || "";
  var depth = 0, secs = 0, started = 0, sentDone = 0, pinged = {};
  function send(ev, extra) {
    var b = { sid: sid, wl: wl || "", wlk: wk || "", site: SITE, page: location.pathname, title: (document.title || "").slice(0, 120), ev: ev, depth: depth, secs: secs, ref: document.referrer || "", src: src };
    if (extra) for (var k in extra) b[k] = extra[k];
    var body = JSON.stringify(b);
    try { if (navigator.sendBeacon && navigator.sendBeacon(EP, new Blob([body], { type: "text/plain" }))) return; } catch (e) {}
    try { fetch(EP, { method: "POST", body: body, keepalive: true, headers: { "Content-Type": "text/plain" } }); } catch (e) {}
  }
  function measure() {
    var h = Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0) - window.innerHeight;
    var p = h <= 0 ? 100 : Math.round((window.scrollY / h) * 100);
    if (p > depth) depth = Math.min(100, p);
  }
  window.addEventListener("scroll", measure, { passive: true });
  setInterval(function () {
    if (document.visibilityState !== "visible") return;
    secs++; measure();
    [30, 90, 180].forEach(function (t) { if (secs === t && !pinged[t]) { pinged[t] = 1; send("read"); } });
  }, 1000);
  var lastLeave = 0;
  function leave() { if (secs < 3 || Date.now() - lastLeave < 5000) return; lastLeave = Date.now(); send("leave"); }
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") leave(); });
  window.addEventListener("pagehide", leave);
  // A form or quiz started (typing, picking, or tapping an answer)
  function start(e) {
    if (started) return;
    var t = e.target; if (!t || !t.closest) return;
    if (t.closest("[data-ws-ignore]")) return;
    if (e.type === "click" && !t.closest("form,[data-ws-form],.opt,.choice,.answer,[role=radio],[data-step],.step button,.quiz button")) return;
    started = 1; send("form_start");
  }
  ["input", "change", "click"].forEach(function (n) { document.addEventListener(n, start, true); });
  document.addEventListener("submit", function () { if (!sentDone) { sentDone = 1; send("form_done"); } }, true);
  // Form pages call this with the new lead's id right after it's saved, so this visit joins their lead page
  window.wsIdentify = function (id) { if (!id) return; sentDone = 1; send("form_done", { lid: String(id) }); };
  // Links to Rhina's other pages keep the same visit (and who they are) going
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest ? e.target.closest("a[href]") : null; if (!a) return;
    try {
      var u = new URL(a.href, location.href);
      if (u.host === location.host || OWN.indexOf(u.host) < 0) return;
      u.searchParams.set("ws", sid); if (wl && wk) { u.searchParams.set("wl", wl); u.searchParams.set("wlk", wk); }
      a.href = u.toString();
    } catch (err) {}
  }, true);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { send("view"); }); else send("view");
})();
