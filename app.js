"use strict";

/* ================================================================ constants */

const LS_KEY = "stardewHelper.v1";
const TYPES = ["Crops", "Fruit", "Forage", "Fish", "Animal Products", "Artisan Goods",
  "Minerals", "Artifacts", "Cooking", "Monster Loot", "Resources", "Other"];
const QUALITY_TYPES = new Set(["Crops", "Fruit", "Forage", "Fish", "Animal Products", "Artisan Goods"]);
const SHIP_TYPES = new Set(["Crops", "Fruit", "Forage", "Animal Products", "Artisan Goods", "Monster Loot", "Resources"]);
const SOURCES = [
  { id: "vanilla", label: "Vanilla" },
  { id: "sve", label: "SVE" },
  { id: "rsv", label: "Ridgeside" },
  { id: "custom", label: "Custom" },
];
const SRC_TAG = { vanilla: "", sve: "SVE", rsv: "RSV", custom: "", save: "MOD", child: "CHILD" };
const QUALITY_NAMES = ["Missing", "Normal", "Silver", "Gold", "Iridium"];
const STATUSES = ["Friendly", "Dating", "Engaged", "Married", "Roommate", "Divorced"];
const SKILLS = ["farming", "fishing", "foraging", "mining", "combat", "luck"];
const PLACEHOLDER = "data:image/svg+xml;utf8," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect x="2" y="2" width="12" height="12" rx="2" fill="#b89a6a"/><text x="8" y="12" font-size="10" text-anchor="middle" fill="#fff" font-family="sans-serif">?</text></svg>');

/* ================================================================ state */

function newFarm() {
  return {
    items: {},             // item key -> quality level (0 missing, 1 normal .. 4 iridium; 1 = obtained for no-quality items)
    custom: [],            // user-added items
    mods: { vanilla: true, sve: true, rsv: true, custom: true },
    bundles: { layout: null, donated: {} },
    npcs: {},              // name -> { h, st, met }
    extraNpcs: [],         // NPCs found in a save but not in the catalog
    perf: {
      shipped: [], obelisks: [], goldClock: false, monsters: {}, stardrops: [], walnuts: 0,
      skills: {}, cooked: 0, crafted: 0, totals: {},
    },
    planting: { fert: 0, agri: false, paddy: true }, // growth speed options for the Planting calendar
    today: null,           // { season, day } from the last loaded save
    savedFrom: null,
  };
}

function loadStore() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.farms && Object.keys(s.farms).length) return s;
    }
  } catch (e) { console.warn("Could not read saved data", e); }
  return { current: "My Farm", farms: { "My Farm": newFarm() }, theme: null };
}

let store = loadStore();
let saveTimer = null;

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(store)); }
    catch (e) { toast("Couldn't save to browser storage — use Export to back up.\n" + e.message); }
  }, 150);
}

function farm() {
  const f = store.farms[store.current];
  // Fill in fields added after the profile was created.
  const d = newFarm();
  for (const k in d) if (f[k] === undefined) f[k] = d[k];
  for (const k in d.perf) if (f.perf[k] === undefined) f.perf[k] = d.perf[k];
  return f;
}

const ui = {
  view: "items",
  items: { type: "all", q: "", missing: false },
  npcs: { filter: "all", q: "" },
  planting: { season: null },
  openCats: new Set(),
};
try { ui.view = localStorage.getItem(LS_KEY + ".view") || "items"; } catch { /* ignore */ }

/* ================================================================ catalog */

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n) => Number(n).toLocaleString();

let catalog = [], byKey = {}, byId = {}, byNorm = {};

function rebuildCatalog() {
  catalog = window.ITEMS.concat(farm().custom);
  byKey = {}; byId = {}; byNorm = {};
  for (const it of catalog) {
    byKey[it.k] = it;
    if (it.id) byId[it.id] = it;
    const n = norm(it.n);
    if (!byNorm[n] || it.s === "vanilla") byNorm[n] = it;
  }
}

const enabled = (src) => farm().mods[src === "save" ? "custom" : src] !== false;
const activeItems = () => catalog.filter((it) => enabled(it.s));
const qOf = (it) => farm().items[it.k] || 0;
const iconOf = (it) => it.i || PLACEHOLDER;

/** Maps a save-file item ID (e.g. "24", "(O)131", "FlashShifter.StardewValleyExpandedCP_Bearberry") to a catalog item. */
function resolveId(raw) {
  const id = String(raw).replace(/^\([A-Z]+\)/, "");
  if (byId[id]) return byId[id];
  if (byNorm[norm(id)]) return byNorm[norm(id)];
  const parts = id.split(/[_]/);
  for (let i = 1; i < parts.length; i++) {
    const hit = byNorm[norm(parts.slice(i).join(" "))];
    if (hit) return hit;
  }
  return null;
}

function objectIcon(id) {
  const clean = String(id).replace(/^\([A-Z]+\)/, "");
  return window.OBJECT_NAMES && window.OBJECT_NAMES[clean] ? `icons/objects/${slug(clean)}.png` : PLACEHOLDER;
}

function setQuality(it, q) {
  const max = it.q ? 4 : 1;
  q = Math.max(0, Math.min(max, q));
  if (q) farm().items[it.k] = q; else delete farm().items[it.k];
  persist();
}

/* ================================================================ helpers */

const $ = (sel, el = document) => el.querySelector(sel);
const main = $("#main");

// Wiki "?" links just open the page: keep the click (and right-click) away from the tile handlers below.
for (const type of ["click", "contextmenu"]) {
  main.addEventListener(type, (e) => { if (e.target.closest("a.wiki")) e.stopPropagation(); }, true);
}

function toast(msg, ms = 3500) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove("show"), ms);
}

function meter(done, total) {
  const pct = total ? Math.min(100, (done / total) * 100) : 0;
  return `<div class="meter"><div style="width:${pct.toFixed(1)}%"></div></div>`;
}

/** Small "?" link to the item's wiki page; nothing at all when the item has no known page. */
function wikiLink(it) {
  return it && it.w
    ? `<a class="wiki" href="${esc(it.w)}" target="_blank" rel="noopener" title="Open ${esc(it.n)} on the wiki">?</a>`
    : "";
}

function starHtml(q, cls = "") {
  return q >= 2 ? `<span class="star q${q} ${cls}" title="${QUALITY_NAMES[q]}">★</span>` : "";
}

function download(name, text) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ================================================================ header */

function renderHeader() {
  const sel = $("#farmSelect");
  sel.innerHTML = Object.keys(store.farms).map((n) =>
    `<option ${n === store.current ? "selected" : ""}>${esc(n)}</option>`).join("");
  for (const b of document.querySelectorAll("#tabs button")) b.classList.toggle("on", b.dataset.view === ui.view);
  if (store.theme) document.documentElement.dataset.theme = store.theme;
  else delete document.documentElement.dataset.theme;
}

$("#tabs").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.view === "npcs") ui.npcs.open = null; // the tab always leads back to the villager list
  ui.view = b.dataset.view;
  try { localStorage.setItem(LS_KEY + ".view", ui.view); } catch { /* ignore */ }
  render();
  window.scrollTo(0, 0);
});

$("#farmSelect").addEventListener("change", (e) => {
  store.current = e.target.value;
  persist();
  rebuildCatalog();
  render();
});

$("#newFarm").addEventListener("click", () => {
  const name = (prompt("Name for the new farm profile:") || "").trim();
  if (!name) return;
  if (!store.farms[name]) store.farms[name] = newFarm();
  store.current = name;
  persist(); rebuildCatalog(); render();
});

$("#deleteFarm").addEventListener("click", () => {
  const name = store.current;
  const others = Object.keys(store.farms).filter((n) => n !== name);
  const msg = `Delete the farm "${name}" and all of its tracked progress?\n\n` +
    "Gift tastes and villager notes are shared by all farms, so they're kept.\nThis can't be undone (unless you have an Export backup).";
  if (!confirm(msg)) return;
  delete store.farms[name];
  if (!others.length) store.farms["My Farm"] = newFarm(); // always keep at least one profile
  store.current = others[0] || "My Farm";
  ui.npcs.open = null;
  persist(); rebuildCatalog(); render();
  toast(`Deleted ${name}.`);
});

$("#themeBtn").addEventListener("click", () => {
  const dark = store.theme ? store.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  store.theme = dark ? "light" : "dark";
  persist(); renderHeader();
});

$("#exportBtn").addEventListener("click", () => {
  const d = new Date().toISOString().slice(0, 10);
  download(`stardew-helper-backup-${d}.json`, JSON.stringify(store, null, 1));
});

$("#importBtn").addEventListener("click", () => $("#jsonFile").click());
$("#jsonFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const s = JSON.parse(await file.text());
    if (!s.farms || !s.current) throw new Error("Not a Stardew Helper backup file");
    store = s;
    persist(); rebuildCatalog(); render();
    toast("Backup imported.");
  } catch (err) { toast("Import failed: " + err.message); }
});

$("#loadSave").addEventListener("click", () => $("#saveFile").click());
$("#saveFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try { importSave(await file.text(), file.name); }
  catch (err) { console.error(err); toast("Couldn't read that save: " + err.message, 6000); }
});

/* ================================================================ render dispatch */

function render() {
  renderHeader();
  ({ items: renderItems, bundles: renderBundles, npcs: renderNpcs, perfection: renderPerfection, planting: renderPlanting })[ui.view]();
}

function sourceChips() {
  const f = farm();
  return `<div class="chips" title="Which content is in this farm's game">${SOURCES.map((s) =>
    `<button class="chip ${f.mods[s.id] !== false ? "on" : ""}" data-src="${s.id}">${s.label}</button>`).join("")}</div>`;
}

main.addEventListener("click", (e) => {
  const chip = e.target.closest("[data-src]");
  if (chip) {
    const f = farm();
    f.mods[chip.dataset.src] = f.mods[chip.dataset.src] === false;
    persist(); render();
  }
});

/* ================================================================ items view */

function tileHtml(it, extraCls = "") {
  const q = qOf(it);
  const badge = it.q ? starHtml(q) : (q ? '<span class="tick">✓</span>' : "");
  const tag = it.s === "custom" ? (it.tag || "") : SRC_TAG[it.s];
  return `<div class="tile ${q ? "have" : "miss"} ${extraCls}" data-k="${esc(it.k)}" title="${esc(it.n)} — ${it.q ? QUALITY_NAMES[q] : (q ? "Obtained" : "Missing")}">
    ${tag ? `<span class="src">${esc(tag.slice(0, 4))}</span>` : ""}${badge}
    <img class="ic px" src="${esc(iconOf(it))}" alt="" onerror="this.src='${PLACEHOLDER}'">
    <div class="nm">${esc(it.n)}</div>
    ${it.s === "custom" ? '<button class="del" title="Delete custom item">✕</button>' : ""}${wikiLink(it)}
  </div>`;
}

function renderItems() {
  const f = ui.items;
  const all = activeItems();
  const q = norm(f.q);
  const list = all.filter((it) =>
    (f.type === "all" || it.t === f.type) &&
    (!q || norm(it.n).includes(q)) &&
    (!f.missing || !qOf(it)));
  const have = all.filter((it) => qOf(it)).length;
  const iridium = all.filter((it) => it.q && qOf(it) === 4).length;
  const presentTypes = TYPES.filter((t) => all.some((it) => it.t === t));

  let body = "";
  const groups = f.type === "all" ? presentTypes : [f.type];
  for (const t of groups) {
    const g = list.filter((it) => it.t === t);
    if (!g.length) continue;
    const gAll = all.filter((it) => it.t === t);
    body += `<div class="group"><h2>${esc(t)}</h2><span class="muted small">${gAll.filter((it) => qOf(it)).length} / ${gAll.length}</span></div>
      <div class="grid">${g.map((it) => tileHtml(it)).join("")}</div>`;
  }

  main.innerHTML = `
    <div class="toolbar">
      ${sourceChips()}
      <div class="progress"><span><b>${have}</b> / ${all.length}</span>${meter(have, all.length)}<span class="muted small">${iridium} iridium ★</span></div>
    </div>
    <div class="toolbar">
      <div class="chips" id="typeChips">
        <button class="chip ${f.type === "all" ? "on" : ""}" data-type="all">All</button>
        ${presentTypes.map((t) => `<button class="chip ${f.type === t ? "on" : ""}" data-type="${esc(t)}">${esc(t)}</button>`).join("")}
      </div>
    </div>
    <div class="toolbar">
      <input class="search" id="itemSearch" placeholder="Search items…" value="${esc(f.q)}">
      <label class="check"><input type="checkbox" id="missingOnly" ${f.missing ? "checked" : ""}> Missing only</label>
      <button class="btn" id="addCustom">+ Custom item</button>
      <span class="muted small">Click: raise quality · Right-click: lower</span>
    </div>
    <div id="itemGrid">${body || '<div class="empty">No items match.</div>'}</div>`;

  $("#typeChips").onclick = (e) => {
    const b = e.target.closest("[data-type]");
    if (b) { f.type = b.dataset.type; renderItems(); }
  };
  const s = $("#itemSearch");
  s.oninput = () => {
    f.q = s.value;
    const pos = s.selectionStart;
    renderItems();
    const s2 = $("#itemSearch"); s2.focus(); s2.setSelectionRange(pos, pos);
  };
  $("#missingOnly").onchange = (e) => { f.missing = e.target.checked; renderItems(); };
  $("#addCustom").onclick = openCustomDialog;
}

function tileQualityClick(e, dir) {
  const tile = e.target.closest(".tile[data-k]");
  if (!tile) return false;
  const it = byKey[tile.dataset.k];
  if (!it) return false;
  if (e.target.closest(".del")) {
    if (confirm(`Delete custom item "${it.n}"?`)) {
      const f = farm();
      f.custom = f.custom.filter((c) => c.k !== it.k);
      delete f.items[it.k];
      persist(); rebuildCatalog(); render();
    }
    return true;
  }
  const max = it.q ? 4 : 1;
  let q = qOf(it) + dir;
  if (q > max) q = 0;
  if (q < 0) q = 0;
  setQuality(it, q);
  if (ui.view === "items" && !ui.items.missing) {
    tile.outerHTML = tileHtml(it);
    refreshItemCounts();
  } else render();
  return true;
}

function refreshItemCounts() {
  const all = activeItems();
  const have = all.filter((it) => qOf(it)).length;
  const iridium = all.filter((it) => it.q && qOf(it) === 4).length;
  const p = $(".progress");
  if (p) p.innerHTML = `<span><b>${have}</b> / ${all.length}</span>${meter(have, all.length)}<span class="muted small">${iridium} iridium ★</span>`;
  for (const g of document.querySelectorAll(".group")) {
    const t = $("h2", g).textContent;
    const gAll = all.filter((it) => it.t === t);
    $(".muted", g).textContent = `${gAll.filter((it) => qOf(it)).length} / ${gAll.length}`;
  }
}

main.addEventListener("click", (e) => {
  if (ui.view === "items") tileQualityClick(e, +1);
});
main.addEventListener("contextmenu", (e) => {
  if (ui.view === "items" && e.target.closest(".tile[data-k]")) {
    e.preventDefault();
    tileQualityClick(e, -1);
  }
});

/* ---------- custom items ---------- */

function openCustomDialog() {
  const dlg = $("#customDlg");
  const form = $("#customForm");
  form.reset();
  form.type.innerHTML = TYPES.map((t) => `<option>${esc(t)}</option>`).join("");
  dlg.showModal();
}

$("#customDlg").addEventListener("close", async () => {
  const dlg = $("#customDlg");
  if (dlg.returnValue !== "ok") return;
  const form = $("#customForm");
  const name = form.name.value.trim();
  if (!name) return;
  let icon = form.url.value.trim() || null;
  const file = form.file.files[0];
  if (file) icon = await shrinkImage(file);
  const t = form.type.value;
  const f = farm();
  f.custom.push({
    k: `custom:${slug(name)}-${Date.now().toString(36)}`, id: "", n: name, t, s: "custom",
    tag: form.src.value.trim(), i: icon, q: form.q.checked ? 1 : 0, ship: SHIP_TYPES.has(t) ? 1 : 0,
  });
  persist(); rebuildCatalog(); render();
  toast(`Added ${name}.`);
});

/** Reads an image file as a small PNG data URL (max 64px) so it fits in localStorage. */
function shrinkImage(file) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 64 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.width * scale));
      c.height = Math.max(1, Math.round(img.height * scale));
      const ctx = c.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/png"));
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => resolve(null);
    img.src = URL.createObjectURL(file);
  });
}

/* ================================================================ bundles view */

function parseBundles(layout) {
  const rooms = [];
  const byRoom = {};
  for (const [key, value] of Object.entries(layout)) {
    const [room, idx] = key.split("/");
    const p = value.split("/");
    const nums = (p[2] || "").trim().split(/\s+/).filter(Boolean);
    const ings = [];
    for (let i = 0; i + 2 < nums.length; i += 3) ings.push({ id: nums[i], count: +nums[i + 1], q: +nums[i + 2] });
    const bundle = {
      idx, room, name: p[6] || p[0], ings,
      required: p[4] ? +p[4] : ings.length,
    };
    if (!byRoom[room]) { byRoom[room] = { name: room, bundles: [] }; rooms.push(byRoom[room]); }
    byRoom[room].bundles.push(bundle);
  }
  return rooms;
}

function ingredientInfo(ing) {
  if (ing.id === "-1") return { gold: true, name: `${fmt(ing.count)}g` };
  const it = resolveId(ing.id);
  const name = it ? it.n : (window.OBJECT_NAMES[ing.id] || ing.id);
  const icon = it ? iconOf(it) : objectIcon(ing.id);
  const need = Math.min(4, ing.q + 1); // game quality 0/1/2/4 -> tracker level 1/2/3/4
  const have = it ? (it.q ? qOf(it) >= need : qOf(it) > 0) : false;
  return { it, name, icon, have };
}

function bundleDonated(idx) {
  return farm().bundles.donated[idx] || [];
}

function renderBundles() {
  const f = farm();
  const layout = f.bundles.layout || window.DEFAULT_BUNDLES;
  const rooms = parseBundles(layout);
  let totalDone = 0, total = 0;
  let html = "";
  for (const room of rooms) {
    let roomDone = 0;
    const cards = room.bundles.map((b) => {
      const don = bundleDonated(b.idx);
      const doneCount = b.ings.filter((_, i) => don[i]).length;
      const complete = doneCount >= b.required;
      if (complete) roomDone++;
      const ings = b.ings.map((ing, i) => {
        const info = ingredientInfo(ing);
        const cls = don[i] ? "donated" : (info.have ? "have" : "");
        const qBadge = ing.q > 0 ? `<span class="star q${Math.min(4, ing.q + 1)}">★</span>` : "";
        const title = `${info.name}${ing.count > 1 && !info.gold ? " ×" + ing.count : ""}${ing.q ? " (" + QUALITY_NAMES[Math.min(4, ing.q + 1)] + "+)" : ""}` +
          (don[i] ? " — donated" : info.have ? " — you have this" : "");
        const inner = info.gold
          ? `<span class="gold">${esc(info.name)}</span>`
          : `<img class="px ${don[i] || info.have ? "" : "miss"}" src="${esc(info.icon)}" alt="" onerror="this.src='${PLACEHOLDER}'">`;
        return `<div class="ing ${cls}" data-b="${esc(b.idx)}" data-i="${i}" title="${esc(title)}">${inner}${qBadge}${ing.count > 1 && !info.gold ? `<span class="cnt">${ing.count}</span>` : ""}${wikiLink(info.it)}</div>`;
      }).join("");
      return `<div class="bundle ${complete ? "complete" : ""}">
        <div class="bundle-h"><b>${esc(b.name)} Bundle</b><span class="muted small">${Math.min(doneCount, b.required)} / ${b.required}${complete ? " ✓" : ""}</span></div>
        <div class="ings">${ings}</div></div>`;
    }).join("");
    totalDone += roomDone; total += room.bundles.length;
    html += `<section class="room"><div class="room-h"><h2>${esc(room.name)}</h2><span class="muted">${roomDone} / ${room.bundles.length}</span>${meter(roomDone, room.bundles.length)}</div>
      <div class="bundles">${cards}</div></section>`;
  }
  main.innerHTML = `
    <div class="toolbar">
      <div class="progress"><span><b>${totalDone}</b> / ${total} bundles</span>${meter(totalDone, total)}</div>
      <span class="muted small">${f.bundles.layout ? `Layout from save${f.savedFrom ? " (" + esc(f.savedFrom) + ")" : ""}` : "Standard layout — Load Save to use your farm's exact bundles"}</span>
      <span class="muted small">Click an ingredient to mark it donated · dashed gold = you have it</span>
    </div>${html}`;
}

main.addEventListener("click", (e) => {
  if (ui.view !== "bundles") return;
  const ing = e.target.closest(".ing[data-b]");
  if (!ing) return;
  const f = farm();
  const arr = f.bundles.donated[ing.dataset.b] = f.bundles.donated[ing.dataset.b] || [];
  const i = +ing.dataset.i;
  arr[i] = !arr[i];
  persist();
  const y = window.scrollY;
  renderBundles();
  window.scrollTo(0, y);
});

/* ================================================================ relationships view */

function allNpcs() {
  return window.NPCS.concat(farm().extraNpcs).filter((n) => enabled(n.s));
}

/** Everyone who counts toward perfection's "Great Friends" (i.e. not your kids). */
function villagers() {
  return allNpcs().filter((n) => n.s !== "child");
}

function npcState(name) {
  return farm().npcs[name] || { h: 0, st: "Friendly", met: false };
}

function heartCap(npc, st) {
  if (st === "Married" || st === "Roommate") return 14;
  if (npc.m && st !== "Dating" && st !== "Engaged") return 8;
  return 10;
}

/** Hearts needed for the perfection "Great Friends" check. */
function isMaxed(npc) {
  const s = npcState(npc.n);
  return s.h >= Math.min(10, heartCap(npc, s.st));
}

function heartsHtml(npc, s) {
  const cap = heartCap(npc, s.st);
  const shown = cap > 10 || s.st === "Married" || s.st === "Roommate" ? 14 : 10;
  let hearts = "";
  for (let i = 1; i <= shown; i++) {
    hearts += `<span class="${i <= s.h ? "on" : ""} ${i > cap ? "lock" : ""}" data-h="${i}">${i > cap ? "♡" : "♥"}</span>`;
  }
  return hearts;
}

function statusSelect(npc, s) {
  if (!npc.m && npc.n !== "Krobus") return "";
  return `<select data-st="${esc(npc.n)}">${STATUSES.map((x) => `<option ${x === s.st ? "selected" : ""}>${x}</option>`).join("")}</select>`;
}

function npcTags(npc) {
  const tag = SRC_TAG[npc.s];
  return `${tag ? `<span class="tag">${tag}</span> ` : ""}${npc.m ? '<span class="tag" title="Marriage candidate">💍</span> ' : ""}`;
}

/* ---------- gift tastes (shared by every farm profile: tastes don't change between saves) ---------- */

const TASTES = [
  { id: "love", label: "Loves", icon: "💖" },
  { id: "like", label: "Likes", icon: "🙂" },
  { id: "neutral", label: "Neutral", icon: "😐" },
  { id: "dislike", label: "Dislikes", icon: "🙁" },
  { id: "hate", label: "Hates", icon: "😠" },
];

function giftsOf(name, create = false) {
  if (!store.gifts) store.gifts = {};
  if (!store.gifts[name] && create) {
    store.gifts[name] = { love: [], like: [], neutral: [], dislike: [], hate: [], notes: "" };
  }
  return store.gifts[name] || null;
}

/** A gift reference is "item:<catalog key>", "obj:<vanilla object id>" or "text:<free text>". */
function giftInfo(ref) {
  const i = ref.indexOf(":");
  const kind = ref.slice(0, i), v = ref.slice(i + 1);
  if (kind === "item" && byKey[v]) return { name: byKey[v].n, icon: iconOf(byKey[v]) };
  if (kind === "obj") return { name: window.OBJECT_NAMES[v] || v, icon: objectIcon(v) };
  return { name: v, icon: null };
}

function giftCandidates(query) {
  const q = norm(query);
  if (!q) return [];
  const out = [], names = new Set();
  for (const it of catalog) {
    if (enabled(it.s) && norm(it.n).includes(q)) {
      out.push({ ref: "item:" + it.k, name: it.n, icon: iconOf(it) });
      names.add(norm(it.n));
    }
  }
  // Any other vanilla object (Coffee, Wood, Bouquet…) by name.
  for (const [id, n] of Object.entries(window.OBJECT_NAMES)) {
    if (byId[id] || names.has(norm(n)) || !norm(n).includes(q)) continue;
    out.push({ ref: "obj:" + id, name: n, icon: objectIcon(id) });
    names.add(norm(n));
  }
  const rank = (c) => (norm(c.name).startsWith(q) ? 0 : 1);
  out.sort((a, b) => rank(a) - rank(b) || a.name.length - b.name.length || a.name.localeCompare(b.name));
  return out.slice(0, 12);
}

function setGift(name, taste, ref) {
  const g = giftsOf(name, true);
  for (const t of TASTES) g[t.id] = g[t.id].filter((r) => r !== ref);
  if (taste) g[taste].push(ref);
  persist();
}

function giftIcon(info, cls = "") {
  return info.icon
    ? `<img class="px ${cls}" src="${esc(info.icon)}" alt="" onerror="this.src='${PLACEHOLDER}'">`
    : `<span class="gift-txt ${cls}">✎</span>`;
}

/* ---------- villager page ---------- */

function renderNpcPage(npc) {
  const s = npcState(npc.n);
  const g = giftsOf(npc.n) || {};
  const known = TASTES.reduce((a, t) => a + (g[t.id] || []).length, 0);
  const cols = TASTES.map((t) => {
    const refs = g[t.id] || [];
    const chips = refs.map((ref) => {
      const info = giftInfo(ref);
      return `<span class="gift" title="${esc(info.name)}">${giftIcon(info)}<span>${esc(info.name)}</span>
        <button data-rm="${esc(ref)}" title="Remove">×</button></span>`;
    }).join("");
    return `<div class="taste t-${t.id}"><h3>${t.icon} ${t.label} <span class="muted small">${refs.length}</span></h3>
      <div class="gifts">${chips || '<span class="muted small">Nothing yet</span>'}</div></div>`;
  }).join("");

  main.innerHTML = `
    <div class="toolbar"><button class="btn" data-act="back">← All villagers</button></div>
    <div class="npc-page" data-npc="${esc(npc.n)}">
      <div class="npc-head">
        <img class="big-pic px ${s.met ? "" : "miss"}" src="${esc(npc.i || PLACEHOLDER)}" alt="" onerror="this.src='${PLACEHOLDER}'">
        <div class="npc-head-info">
          <div class="row1"><h2>${esc(npc.n)}</h2><span>${npcTags(npc)}</span></div>
          <div class="hearts big">${heartsHtml(npc, s)}</div>
          <div class="fields">
            ${statusSelect(npc, s)}
            <label><input type="checkbox" data-met ${s.met ? "checked" : ""}> Met</label>
            <span class="muted small">${s.h} ♥ · ${known} gift reaction${known === 1 ? "" : "s"} recorded</span>
          </div>
        </div>
      </div>
      <div class="gift-add">
        <input class="search" id="giftSearch" autocomplete="off" placeholder="Record a gift reaction — type an item name…">
        <div class="gift-results" id="giftResults"></div>
      </div>
      <div class="tastes">${cols}</div>
      <label class="notes"><b>Notes</b>
        <textarea id="npcNotes" rows="4" placeholder="Birthday, schedule, where to find them, anything you've noticed…">${esc(g.notes || "")}</textarea>
      </label>
    </div>`;

  const search = $("#giftSearch");
  search.oninput = () => renderGiftResults(npc.n, search.value);
  $("#npcNotes").oninput = (e) => { giftsOf(npc.n, true).notes = e.target.value; persist(); };
}

function renderGiftResults(name, query) {
  const box = $("#giftResults");
  if (!box) return;
  const g = giftsOf(name) || {};
  const tasteOf = (ref) => TASTES.find((t) => (g[t.id] || []).includes(ref));
  const cands = giftCandidates(query);
  const text = query.trim();
  if (text && !cands.some((c) => norm(c.name) === norm(text))) cands.push({ ref: "text:" + text, name: `“${text}” (as typed)`, icon: null });
  box.innerHTML = cands.map((c) => {
    const cur = tasteOf(c.ref);
    return `<div class="gift-row">${giftIcon(c)}<span class="gname">${esc(c.name)}</span>
      <span class="taste-btns">${TASTES.map((t) =>
        `<button class="${cur && cur.id === t.id ? "on" : ""}" data-add="${t.id}" data-ref="${esc(c.ref)}" title="${t.label}">${t.icon}</button>`).join("")}</span></div>`;
  }).join("");
}

/* ---------- villager list ---------- */

function renderNpcs() {
  const f = ui.npcs;
  if (f.open) {
    const npc = allNpcs().find((n) => n.n === f.open);
    if (npc) return renderNpcPage(npc);
    f.open = null;
  }
  const q = norm(f.q);
  const all = allNpcs();
  const list = all.filter((n) => {
    const s = npcState(n.n);
    if (q && !norm(n.n).includes(q)) return false;
    if (f.filter === "marry") return n.m;
    if (f.filter === "notmax") return !isMaxed(n);
    if (f.filter === "unmet") return !s.met;
    return true;
  });
  const counted = villagers();
  const maxed = counted.filter(isMaxed).length;
  const cards = list.map((n) => {
    const s = npcState(n.n);
    const loves = ((giftsOf(n.n) || {}).love || []).map(giftInfo);
    const lovesHtml = loves.length
      ? `<span class="loves" title="Loves: ${esc(loves.map((l) => l.name).join(", "))}">💖${loves.slice(0, 5).map((l) => giftIcon(l)).join("")}${loves.length > 5 ? `<span class="muted small">+${loves.length - 5}</span>` : ""}</span>`
      : "";
    return `<div class="npc ${isMaxed(n) ? "maxed" : ""}" data-npc="${esc(n.n)}" title="Open ${esc(n.n)}'s page">
      <img class="pic px ${s.met ? "" : "miss"}" src="${esc(n.i || PLACEHOLDER)}" alt="" onerror="this.src='${PLACEHOLDER}'">
      <div class="info">
        <div class="row1"><b>${esc(n.n)}</b><span>${npcTags(n)}${statusSelect(n, s)}</span></div>
        <div class="hearts">${heartsHtml(n, s)}</div>
        <div class="row1"><span class="muted small">${s.h} ♥${isMaxed(n) ? " · best friends" : ""}</span>${lovesHtml}</div>
      </div></div>`;
  }).join("");
  main.innerHTML = `
    <div class="toolbar">
      ${sourceChips()}
      <div class="progress"><span><b>${maxed}</b> / ${counted.length} maxed</span>${meter(maxed, counted.length)}</div>
    </div>
    <div class="toolbar">
      <div class="chips" id="npcFilter">
        ${[["all", "All"], ["marry", "Marriage candidates"], ["notmax", "Not maxed"], ["unmet", "Not met"]].map(([k, l]) =>
          `<button class="chip ${f.filter === k ? "on" : ""}" data-f="${k}">${l}</button>`).join("")}
      </div>
      <input class="search" id="npcSearch" placeholder="Search villagers…" value="${esc(f.q)}">
      <span class="muted small">Click a villager to open their gift page · click a heart to set the level</span>
    </div>
    <div class="npcs">${cards || '<div class="empty">Nobody matches.</div>'}</div>`;

  $("#npcFilter").onclick = (e) => {
    const b = e.target.closest("[data-f]");
    if (b) { f.filter = b.dataset.f; renderNpcs(); }
  };
  const s = $("#npcSearch");
  s.oninput = () => {
    f.q = s.value;
    const pos = s.selectionStart;
    renderNpcs();
    const s2 = $("#npcSearch"); s2.focus(); s2.setSelectionRange(pos, pos);
  };
}

function updateNpc(name, patch) {
  const f = farm();
  f.npcs[name] = Object.assign({}, npcState(name), patch);
  persist();
  const y = window.scrollY;
  renderNpcs();
  window.scrollTo(0, y);
}

main.addEventListener("click", (e) => {
  if (ui.view !== "npcs") return;
  if (e.target.closest('[data-act="back"]')) {
    ui.npcs.open = null;
    renderNpcs();
    return window.scrollTo(0, 0);
  }
  const card = e.target.closest("[data-npc]");
  if (!card) return;
  const name = card.dataset.npc;
  const s = npcState(name);
  const heart = e.target.closest("[data-h]");
  const add = e.target.closest("[data-add]");
  const rm = e.target.closest("[data-rm]");
  if (heart) {
    const h = +heart.dataset.h;
    updateNpc(name, { h: s.h === h ? h - 1 : h, met: true });
  } else if (add) {
    setGift(name, add.dataset.add, add.dataset.ref);
    updateNpc(name, {});
    $("#giftSearch").focus();
  } else if (rm) {
    setGift(name, null, rm.dataset.rm);
    updateNpc(name, {});
  } else if (card.classList.contains("npc") && !e.target.closest("select")) {
    ui.npcs.open = name;
    renderNpcs();
    window.scrollTo(0, 0);
  }
});
main.addEventListener("change", (e) => {
  if (ui.view !== "npcs") return;
  const page = e.target.closest("[data-npc]");
  if (e.target.matches("select[data-st]")) {
    const name = e.target.dataset.st;
    const npc = allNpcs().find((n) => n.n === name);
    const st = e.target.value;
    const s = npcState(name);
    updateNpc(name, { st, h: Math.min(s.h, heartCap(npc, st)), met: true });
  } else if (e.target.matches("input[data-met]") && page) {
    updateNpc(page.dataset.npc, { met: e.target.checked });
  }
});

/* ================================================================ perfection view */

function perfTotals() {
  const f = farm();
  return Object.assign({}, window.PERFECTION.totals, f.perf.totals);
}

function perfectionParts() {
  const P = window.PERFECTION, f = farm(), p = f.perf, tot = perfTotals();
  const items = activeItems();
  const shipItems = items.filter((it) => it.ship);
  const shippedSet = new Set(p.shipped);
  const fishItems = items.filter((it) => it.t === "Fish");
  const npcs = villagers();
  const lvl = Math.floor(SKILLS.reduce((a, k) => a + (+p.skills[k] || 0), 0) / 2);
  const goalsDone = P.monsterGoals.filter((g) => (+p.monsters[g.name] || 0) >= g.goal).length;
  const part = (id, label, done, total, extra = {}) =>
    ({ id, label, done, total, weight: P.weights[id], pts: P.weights[id] * Math.min(1, total ? done / total : 0), ...extra });
  return [
    part("shipped", "Produce & forage shipped", shipItems.filter((it) => shippedSet.has(it.k)).length, shipItems.length, { approx: true, shipItems }),
    part("obelisks", "Obelisks on farm", p.obelisks.length, 4),
    part("goldClock", "Golden Clock on farm", p.goldClock ? 1 : 0, 1),
    part("monsters", "Monster Slayer hero", goalsDone, P.monsterGoals.length),
    part("friends", "Great friends", npcs.filter(isMaxed).length, npcs.length, { approx: f.mods.sve || f.mods.rsv }),
    part("level", "Farmer level", Math.min(lvl, tot.level), tot.level),
    part("stardrops", "Found all stardrops", p.stardrops.length, P.stardrops.length),
    part("cooking", "Cooking recipes made", +p.cooked || 0, tot.cooking),
    part("crafting", "Crafting recipes made", +p.crafted || 0, tot.crafting),
    part("fish", "Fish caught", fishItems.filter((it) => qOf(it)).length, fishItems.length, { approx: true, fishItems }),
    part("walnuts", "Golden Walnuts found", +p.walnuts || 0, tot.walnuts),
  ];
}

function catBody(part) {
  const P = window.PERFECTION, p = farm().perf, tot = perfTotals();
  const num = (key, val, attrs = "") => `<input type="number" min="0" data-perf="${key}" value="${val}" ${attrs}>`;
  switch (part.id) {
    case "shipped": {
      const set = new Set(p.shipped);
      return `<div class="fields" style="margin-bottom:10px">
          <button class="btn" data-act="shipTracked">Mark every tracked item as shipped</button>
          <span class="muted small">Click an item to toggle shipped.</span></div>
        <div class="grid">${part.shipItems.map((it) => `<div class="tile ${set.has(it.k) ? "have" : "miss"}" data-ship="${esc(it.k)}" title="${esc(it.n)}">
          <img class="ic px" src="${esc(iconOf(it))}" alt="" onerror="this.src='${PLACEHOLDER}'"><div class="nm">${esc(it.n)}</div>${wikiLink(it)}</div>`).join("")}</div>
        <div class="note">The total counts every shippable crop, fruit, forage, animal product, artisan good, monster loot and resource in the enabled sources, so it's an estimate. The game's own list is a little different.</div>`;
    }
    case "obelisks":
      return `<div class="fields">${P.obelisks.map((o) =>
        `<label><input type="checkbox" data-obelisk="${esc(o)}" ${p.obelisks.includes(o) ? "checked" : ""}> ${esc(o)}</label>`).join("")}</div>`;
    case "goldClock":
      return `<div class="fields"><label><input type="checkbox" data-perf-bool="goldClock" ${p.goldClock ? "checked" : ""}> Gold Clock built</label></div>`;
    case "monsters":
      return `<div class="monsters">${P.monsterGoals.map((g) => {
        const v = +p.monsters[g.name] || 0;
        return `<label title="${esc(g.monsters.join(", "))}"><span>${v >= g.goal ? "✅" : "⬜"} ${esc(g.name)} <span class="muted small">/ ${fmt(g.goal)}</span></span>
          <input type="number" min="0" data-monster="${esc(g.name)}" value="${v}" style="width:80px"></label>`;
      }).join("")}</div>`;
    case "friends": {
      const missing = villagers().filter((n) => !isMaxed(n));
      return `<div class="muted small" style="margin-bottom:6px">Needs 10 hearts (8 for marriage candidates you aren't dating). Edit hearts in the Relationships tab.</div>
        <div class="chips">${missing.map((n) => `<span class="chip">${esc(n.n)} · ${npcState(n.n).h}♥</span>`).join("") || "Everyone is maxed! 🎉"}</div>`;
    }
    case "level":
      return `<div class="fields">${SKILLS.map((k) =>
        `<label>${k[0].toUpperCase() + k.slice(1)} ${num("skills." + k, +p.skills[k] || 0, 'max="10"')}</label>`).join("")}</div>
        <div class="note">Farmer level = (sum of all skills incl. luck) ÷ 2, max 25.</div>`;
    case "stardrops":
      return `<div class="fields" style="flex-direction:column;align-items:flex-start">${P.stardrops.map((s) =>
        `<label><input type="checkbox" data-stardrop="${s.flag}" ${p.stardrops.includes(s.flag) ? "checked" : ""}> ${esc(s.label)}</label>`).join("")}</div>`;
    case "cooking":
      return `<div class="fields"><label>Recipes cooked ${num("cooked", p.cooked || 0)}</label><label>of ${num("totals.cooking", tot.cooking)}</label></div>
        <div class="note">81 in vanilla 1.6. Mods add recipes, so raise the total to match your game.</div>`;
    case "crafting":
      return `<div class="fields"><label>Recipes crafted ${num("crafted", p.crafted || 0)}</label><label>of ${num("totals.crafting", tot.crafting)}</label></div>
        <div class="note">149 in vanilla 1.6. Mods add recipes, so raise the total to match your game.</div>`;
    case "fish":
      return `<div class="muted small" style="margin-bottom:8px">Taken from the Items tracker. Click to toggle caught.</div>
        <div class="grid">${part.fishItems.map((it) => `<div class="tile ${qOf(it) ? "have" : "miss"}" data-fish="${esc(it.k)}" title="${esc(it.n)}">
          <img class="ic px" src="${esc(iconOf(it))}" alt="" onerror="this.src='${PLACEHOLDER}'"><div class="nm">${esc(it.n)}</div>${wikiLink(it)}</div>`).join("")}</div>`;
    case "walnuts":
      return `<div class="fields"><label>Golden Walnuts found ${num("walnuts", p.walnuts || 0, 'max="130"')}</label><span class="muted">/ 130</span></div>`;
  }
  return "";
}

function renderPerfection() {
  const parts = perfectionParts();
  const total = parts.reduce((a, x) => a + x.pts, 0);
  const rows = parts.map((x) => `
    <div class="cat ${x.pts >= x.weight - 1e-9 ? "done" : ""} ${ui.openCats.has(x.id) ? "open" : ""}" data-cat="${x.id}">
      <div class="cat-h">
        <span><b>${esc(x.label)}</b>${x.approx ? ' <span class="muted small" title="Total is estimated for modded content">≈</span>' : ""}</span>
        ${meter(x.done, x.total)}
        <span class="val muted">${fmt(x.done)} / ${fmt(x.total)}</span>
        <span class="pts">${x.pts.toFixed(1)}%<span class="muted small"> /${x.weight}</span></span>
        <span class="caret">▶</span>
      </div>
      <div class="cat-b">${ui.openCats.has(x.id) ? catBody(x) : ""}</div>
    </div>`).join("");
  main.innerHTML = `
    <div class="perf-total"><div class="big">${total.toFixed(1)}%</div><div style="flex:1">
      <div><b>Perfection</b> <span class="muted small">— ${farm().savedFrom ? "last loaded from " + esc(farm().savedFrom) : "Load Save to fill this in automatically"}</span></div>
      ${meter(total, 100)}</div></div>
    <div class="toolbar">${sourceChips()}<span class="muted small">Click a category to see details and edit it.</span></div>
    <div class="cats">${rows}</div>`;
}

function rerenderPerf() {
  const y = window.scrollY;
  renderPerfection();
  window.scrollTo(0, y);
}

main.addEventListener("click", (e) => {
  if (ui.view !== "perfection") return;
  const p = farm().perf;
  const head = e.target.closest(".cat-h");
  if (head) {
    const id = head.parentElement.dataset.cat;
    if (ui.openCats.has(id)) ui.openCats.delete(id); else ui.openCats.add(id);
    return rerenderPerf();
  }
  const ship = e.target.closest("[data-ship]");
  if (ship) {
    const k = ship.dataset.ship;
    p.shipped = p.shipped.includes(k) ? p.shipped.filter((x) => x !== k) : p.shipped.concat(k);
    persist(); return rerenderPerf();
  }
  const fish = e.target.closest("[data-fish]");
  if (fish) {
    const it = byKey[fish.dataset.fish];
    setQuality(it, qOf(it) ? 0 : 1);
    return rerenderPerf();
  }
  if (e.target.closest('[data-act="shipTracked"]')) {
    const set = new Set(p.shipped);
    for (const it of activeItems()) if (it.ship && qOf(it)) set.add(it.k);
    p.shipped = [...set];
    persist(); return rerenderPerf();
  }
});

main.addEventListener("change", (e) => {
  if (ui.view !== "perfection") return;
  const p = farm().perf, t = e.target;
  if (t.dataset.perf) {
    const [a, b] = t.dataset.perf.split(".");
    const v = Math.max(0, +t.value || 0);
    if (b) { p[a] = p[a] || {}; p[a][b] = v; } else p[a] = v;
  } else if (t.dataset.perfBool) p[t.dataset.perfBool] = t.checked;
  else if (t.dataset.obelisk) p.obelisks = toggleIn(p.obelisks, t.dataset.obelisk, t.checked);
  else if (t.dataset.stardrop) p.stardrops = toggleIn(p.stardrops, t.dataset.stardrop, t.checked);
  else if (t.dataset.monster) p.monsters[t.dataset.monster] = Math.max(0, +t.value || 0);
  else return;
  persist();
  rerenderPerf();
});

function toggleIn(arr, v, on) {
  const s = new Set(arr);
  if (on) s.add(v); else s.delete(v);
  return [...s];
}

/* ================================================================ planting view */

const SEASONS = ["spring", "summer", "fall", "winter"];
const FERTILIZERS = [
  { v: 0, label: "No fertilizer" },
  { v: 0.1, label: "Speed-Gro (10%)" },
  { v: 0.25, label: "Deluxe Speed-Gro (25%)" },
  { v: 0.33, label: "Hyper Speed-Gro (33%)" },
];
const cap = (s) => s[0].toUpperCase() + s.slice(1);

/** Days from planting to first harvest, using the game's phase-shortening rules (Crop.updateDrawMath / HoeDirt.applySpeedIncreases). */
function growDays(crop, opt) {
  const phases = crop.p.slice();
  let speed = Math.fround(+opt.fert || 0);
  if (crop.paddy && opt.paddy) speed = Math.fround(speed + Math.fround(0.25));
  if (opt.agri) speed = Math.fround(speed + Math.fround(0.1));
  let remove = Math.ceil(Math.fround(phases.reduce((a, d) => a + d, 0) * speed));
  for (let tries = 0; remove > 0 && tries < 3; tries++) {
    for (let i = 0; i < phases.length && remove > 0; i++) {
      if (i > 0 || phases[i] > 1) { phases[i]--; remove--; }
    }
  }
  return phases.reduce((a, d) => a + d, 0);
}

/**
 * The last day a crop can be planted and still be harvested before it dies at the change of season.
 * A crop that also grows next season isn't killed, so its deadline is counted from the end of its last season.
 */
function plantingDeadlines(crop, days) {
  const out = [];
  for (const end of crop.s) {
    const ei = SEASONS.indexOf(end);
    if (ei < 3 && crop.s.includes(SEASONS[ei + 1])) continue;
    let si = ei;
    while (si > 0 && crop.s.includes(SEASONS[si - 1])) si--;
    const last = (ei - si + 1) * 28 - days; // day index within the run of seasons, 1-based
    if (last < 1) out.push({ crop, days, tooSlow: true, season: SEASONS[si], end });
    else out.push({ crop, days, season: SEASONS[si + Math.floor((last - 1) / 28)], day: (last - 1) % 28 + 1, end });
  }
  return out;
}

function cropItem(crop) {
  return byNorm[norm(crop.n)] || { n: crop.n, i: null, w: "https://stardewvalleywiki.com/" + crop.n.replace(/ /g, "_") };
}

function cropTip(d) {
  const c = d.crop;
  return `${c.n}: ${d.days} days to grow${c.r ? `, regrows every ${c.r}` : ""}` +
    (d.end !== d.season ? `. Keeps growing until the end of ${cap(d.end)}` : "") +
    (c.paddy ? ". Paddy crop: faster next to water" : "");
}

function renderPlanting() {
  const f = farm(), opt = f.planting;
  const season = ui.planting.season || (f.today && f.today.season) || "spring";
  const today = f.today && f.today.season === season ? f.today.day : 0;
  const all = window.CROPS.flatMap((c) => plantingDeadlines(c, growDays(c, opt)));
  const here = all.filter((d) => d.season === season && !d.tooSlow).sort((a, b) => a.day - b.day || a.crop.n.localeCompare(b.crop.n));
  const slow = all.filter((d) => d.season === season && d.tooSlow);
  const byDay = {};
  for (const d of here) (byDay[d.day] = byDay[d.day] || []).push(d);

  const icon = (d) => {
    const it = cropItem(d.crop);
    return `<img class="px" src="${esc(iconOf(it))}" alt="${esc(d.crop.n)}" title="${esc(cropTip(d))}" onerror="this.src='${PLACEHOLDER}'">`;
  };
  const cells = [];
  for (let day = 1; day <= 28; day++) {
    const list = byDay[day] || [];
    cells.push(`<div class="day ${day === today ? "today" : ""} ${today && day < today ? "past" : ""} ${list.length ? "has" : ""}">
      <span class="dn">${day}</span><div class="crops">${list.map(icon).join("")}</div></div>`);
  }
  const rows = here.map((d) => {
    const it = cropItem(d.crop);
    const gone = today && d.day < today;
    return `<tr class="${gone ? "past" : ""}">
      <td><img class="px" src="${esc(iconOf(it))}" alt="" onerror="this.src='${PLACEHOLDER}'"> <a href="${esc(it.w || "#")}" target="_blank" rel="noopener">${esc(d.crop.n)}</a>${d.crop.paddy ? ' <span class="muted small">paddy</span>' : ""}</td>
      <td><b>${cap(d.season)} ${d.day}</b>${d.end !== d.season ? ` <span class="muted small">(lives through ${cap(d.end)})</span>` : ""}</td>
      <td>${d.days} d</td>
      <td>${d.crop.r ? `every ${d.crop.r} d` : '<span class="muted">—</span>'}</td>
    </tr>`;
  }).join("");

  main.innerHTML = `
    <div class="toolbar">
      <div class="chips">${SEASONS.map((s) => `<button class="chip ${s === season ? "on" : ""}" data-season="${s}">${cap(s)}</button>`).join("")}</div>
      <select class="search" data-plant="fert" style="min-width:0">${FERTILIZERS.map((x) =>
        `<option value="${x.v}" ${+opt.fert === x.v ? "selected" : ""}>${x.label}</option>`).join("")}</select>
      <label class="check"><input type="checkbox" data-plant="agri" ${opt.agri ? "checked" : ""}> Agriculturist</label>
      <label class="check" title="Rice and Taro grow 25% faster when planted next to water"><input type="checkbox" data-plant="paddy" ${opt.paddy ? "checked" : ""}> Paddy crops by water</label>
    </div>
    <div class="muted small" style="margin-bottom:8px">Each day shows the crops whose <b>last planting day</b> it is: plant them that day or earlier to harvest before ${cap(season)} ends.
      ${f.today ? `Today in your save: ${cap(f.today.season)} ${f.today.day}.` : "Load Save to highlight today's date."}</div>
    <div class="cal">${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => `<div class="dh">${d}</div>`).join("")}${cells.join("")}</div>
    ${here.length ? `<table class="deadlines"><thead><tr><th>Crop</th><th>Plant by</th><th>Grows in</th><th>Regrows</th></tr></thead><tbody>${rows}</tbody></table>`
      : `<div class="empty">No crops have their last planting day in ${cap(season)}.</div>`}
    ${slow.length ? `<div class="note">Too slow to finish at these settings: ${slow.map((d) => esc(d.crop.n)).join(", ")}.</div>` : ""}
    <div class="note">Vanilla crops only. Crops that also grow next season (Corn, Wheat, Sunflower, Coffee, Ancient Fruit) are listed in their last season. The greenhouse and Ginger Island ignore seasons.</div>`;
}

main.addEventListener("click", (e) => {
  if (ui.view !== "planting") return;
  const chip = e.target.closest("[data-season]");
  if (chip) { ui.planting.season = chip.dataset.season; renderPlanting(); }
});

main.addEventListener("change", (e) => {
  if (ui.view !== "planting") return;
  const key = e.target.dataset.plant;
  if (!key) return;
  farm().planting[key] = e.target.type === "checkbox" ? e.target.checked : +e.target.value;
  persist();
  renderPlanting();
});

/* ================================================================ save import */

const kids = (el, tag) => el ? [...el.children].filter((c) => c.tagName === tag) : [];
const kid = (el, tag) => kids(el, tag)[0] || null;
const txt = (el, tag) => { const c = kid(el, tag); return c ? c.textContent : ""; };

/** Entries of a serialized SerializableDictionary: <item><key><T>k</T></key><value><T>v</T></value></item> */
function dict(el) {
  return kids(el, "item").map((item) => {
    const k = kid(item, "key"), v = kid(item, "value");
    return { key: k && k.firstElementChild ? k.firstElementChild.textContent : "", value: v ? v.firstElementChild : null };
  });
}

function importSave(text, fileName) {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("not a valid save file (pick the file named like Farm_123456789, without extension)");
  const root = doc.documentElement;
  const player = kid(root, "player");
  if (!player) throw new Error("no <player> found — is this a SaveGameInfo file? Pick the other one.");

  const farmName = (txt(player, "farmName") || fileName.split("_")[0] || "Farm").trim();
  if (!store.farms[farmName]) store.farms[farmName] = newFarm();
  store.current = farmName;
  const f = farm();
  f.mods.sve = /FlashShifter/.test(text);
  f.mods.rsv = /Rafseazz|RidgesideVillage/.test(text);
  rebuildCatalog();

  const raise = (it, q) => { if (it && qOf(it) < q) setQuality(it, q); };
  let matched = 0, unmatched = 0;
  const collect = (tag) => {
    const keys = [];
    for (const { key } of dict(kid(player, tag))) {
      const it = resolveId(key);
      if (it) { raise(it, 1); keys.push(it.k); matched++; } else unmatched++;
    }
    return keys;
  };
  const shipped = collect("basicShipped");
  collect("fishCaught");
  collect("mineralsFound");
  collect("archaeologyFound");
  const cooked = dict(kid(player, "recipesCooked"));
  for (const { key } of cooked) raise(resolveId(key), 1);

  // Bundles
  const bd = kid(root, "bundleData");
  if (bd) {
    f.bundles.layout = {};
    for (const { key, value } of dict(bd)) if (value) f.bundles.layout[key] = value.textContent;
  }
  const bEl = [...doc.getElementsByTagName("bundles")].find((b) => {
    const first = kid(b, "item");
    return first && kid(kid(first, "key"), "int");
  });
  if (bEl) {
    f.bundles.donated = {};
    for (const { key, value } of dict(bEl)) f.bundles.donated[key] = value ? [...value.children].map((b) => b.textContent === "true") : [];
    // Donated ingredients were obtained at (at least) the required quality.
    for (const room of parseBundles(f.bundles.layout || window.DEFAULT_BUNDLES)) {
      for (const b of room.bundles) {
        const don = f.bundles.donated[b.idx] || [];
        b.ings.forEach((ing, i) => {
          const it = don[i] && ing.id !== "-1" ? resolveId(ing.id) : null;
          if (it) raise(it, it.q ? Math.min(4, ing.q + 1) : 1);
        });
      }
    }
  }

  // Relationships. Children share friendshipData with villagers; they're listed but don't count for perfection.
  const children = new Set([...doc.getElementsByTagName("NPC")]
    .filter((n) => n.getAttribute("xsi:type") === "Child")
    .map((n) => txt(n, "name")));
  const known = new Set(window.NPCS.map((n) => n.n));
  const extras = new Map();
  f.npcs = {};
  for (const { key, value } of dict(kid(player, "friendshipData"))) {
    if (!value) continue;
    const pts = +txt(value, "Points") || 0;
    const st = txt(value, "Status") || "Friendly";
    f.npcs[key] = { h: Math.min(14, Math.floor(pts / 250)), st, met: true };
    if (children.has(key)) extras.set(key, { n: key, s: "child", i: null, m: 0 });
    else if (!known.has(key) && !extras.has(key)) extras.set(key, { n: key, s: "save", i: null, m: st !== "Friendly" ? 1 : 0 });
  }
  f.extraNpcs = [...extras.values()];

  // Perfection
  const P = window.PERFECTION;
  const mail = new Set(kids(kid(player, "mailReceived"), "string").map((s) => s.textContent));
  const buildings = new Set([...doc.getElementsByTagName("buildingType")].map((b) => b.textContent));
  const crafting = dict(kid(player, "craftingRecipes"));
  const cookingKnown = dict(kid(player, "cookingRecipes"));
  const monsters = {};
  for (const { key, value } of dict(kid(kid(player, "stats"), "specificMonstersKilled"))) monsters[key] = +(value && value.textContent) || 0;
  f.perf = {
    shipped,
    obelisks: P.obelisks.filter((o) => buildings.has(o)),
    goldClock: buildings.has("Gold Clock"),
    monsters: Object.fromEntries(P.monsterGoals.map((g) => [g.name, g.monsters.reduce((a, m) => a + (monsters[m] || 0), 0)])),
    stardrops: P.stardrops.filter((s) => mail.has(s.flag)).map((s) => s.flag),
    walnuts: +txt(root, "goldenWalnutsFound") || 0,
    skills: Object.fromEntries(SKILLS.map((k) => [k, +txt(player, k + "Level") || 0])),
    cooked: cooked.length,
    crafted: crafting.filter(({ value }) => value && +value.textContent > 0).length,
    totals: {
      cooking: Math.max(P.totals.cooking, cookingKnown.length),
      crafting: Math.max(P.totals.crafting, crafting.length),
    },
  };
  const season = txt(root, "currentSeason").toLowerCase();
  if (SEASONS.includes(season)) f.today = { season, day: +txt(root, "dayOfMonth") || 1 };
  f.planting.agri = kids(kid(player, "professions"), "int").some((p) => p.textContent === "5"); // 5 = Agriculturist
  ui.planting.season = null;
  f.savedFrom = `${txt(player, "name") || "farmer"}, ${new Date().toLocaleDateString()}`;

  persist();
  render();
  toast(`Loaded ${farmName} Farm.\n${matched} collection entries matched${unmatched ? `, ${unmatched} from other mods skipped` : ""}.` +
    `${f.mods.sve ? "\nSVE detected." : ""}${f.mods.rsv ? "\nRidgeside detected." : ""}`, 6000);
}

/* ================================================================ boot */

rebuildCatalog();
render();
