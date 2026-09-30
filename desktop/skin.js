// Desktop skin for PokeChill: a persistent sidebar, a top bar, toasts and
// keyboard shortcuts layered over the game's own DOM. The game's scripts are
// not changed; this file only calls their functions and reads their state.
//
// Active above 1000px wide (below that the game's own mobile layout applies).
// Loaded at the end of <body>, after the game's scripts.
(function () {
  "use strict";

  if (window.PokeChillDesktop) return;

  var ZH = !!(window.PokeChillLang && window.PokeChillLang.zh);
  var PIN_KEY = "pokechill-desktop-sidebar";
  var root = document.documentElement;
  var wide = window.matchMedia("(min-width: 1001px)");
  var roomy = window.matchMedia("(min-width: 1280px)");

  function t(en, zh) { return ZH ? zh : en; }
  function $(id) { return document.getElementById(id); }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function shown(id) {
    var node = $(id);
    return !!node && getComputedStyle(node).display !== "none";
  }

  // The game keeps its state in top-level `let` / `const` bindings, which are
  // visible here by name. `read` guards against a binding that isn't there yet.
  function read(fn, fallback) {
    try {
      var value = fn();
      return value === undefined ? fallback : value;
    } catch (e) { return fallback; }
  }

  function attempt(fn) {
    try { fn(); } catch (e) { console.error("desktop skin:", e); }
  }

  // --- Navigation model ------------------------------------------------------

  // key: sidebar row id · menu: the id switchMenu() takes · page: the game's
  // container for that page · icon: the game's own menu icon.
  var ROWS = {
    travel: { menu: "travel", page: "explore-menu", icon: "oldMap", kbd: "1", label: t("Travel", "探索") },
    vs: { menu: "vs", page: "vs-menu", icon: "vs", kbd: "2", label: t("VS", "对战") },
    battle: { menu: "travel", page: "content-explore", icon: "battlePass", kbd: "3", label: t("Battle", "战斗") },
    team: { menu: "team", page: "team-menu", icon: "pokeball", kbd: "4", label: t("Team", "队伍") },
    bag: { menu: "items", page: "item-menu", icon: "items", kbd: "5", label: t("Items", "背包") },
    dex: { menu: "dex", page: "pokedex-menu", icon: "dex", kbd: "6", label: t("Pokédex", "图鉴") },
    mart: { menu: "shop", page: "shop-menu", icon: "maxPotion", label: t("Poké-Mart", "商店") },
    training: { menu: "training", page: "training-menu", icon: "blackBelt", label: t("Training", "训练") },
    genetics: { menu: "genetics", page: "genetics-menu", icon: "dnaSplicer", label: t("Genetics", "遗传") },
    gift: { icon: "gift", label: t("Mystery Gift", "神秘礼物") },
    export: { icon: "parcel", label: t("Export Reward", "导出奖励") },
    wonder: { icon: "beastball", label: t("Wonder Trade", "奇迹交换") },
    dict: { menu: "dictionary", page: "dictionary-menu", icon: "journal", label: t("Dictionary", "百科") },
    guide: { menu: "guide", page: "guide-menu", icon: "tv", label: t("Guide", "指南") },
    settings: { menu: "settings", page: "settings-menu", icon: "key", label: t("Settings", "设置") }
  };

  var GROUPS = [
    { title: t("PLAY", "游玩"), keys: ["travel", "vs", "battle", "team", "bag", "dex"] },
    { title: t("FACILITIES", "设施"), keys: ["mart", "training", "genetics"] },
    { title: t("REWARDS", "奖励"), keys: ["gift", "export", "wonder"], rewards: true },
    { title: t("INFO", "资料"), keys: ["dict", "guide", "settings"] }
  ];

  // Pages in the order the game stacks them; Mega Dimension lives under VS.
  var PAGES = [
    ["explore-menu", "travel"], ["vs-menu", "vs"], ["dimension-menu", "vs"], ["team-menu", "team"],
    ["item-menu", "bag"], ["pokedex-menu", "dex"], ["shop-menu", "mart"], ["training-menu", "training"],
    ["genetics-menu", "genetics"], ["settings-menu", "settings"], ["guide-menu", "guide"],
    ["dictionary-menu", "dict"], ["content-explore", "battle"]
  ];

  // Overlays that own the screen until they are dismissed.
  var BLOCKERS = ["pkmn-editor", "area-end", "afk-overlay", "decor-menu", "wonder-menu"];

  var UNLOCK = {
    brock: "Defeat Gym Leader Brock in VS mode to unlock",
    misty: "Defeat Gym Leader Misty in VS mode to unlock",
    lance: "Defeat Elite Four Lance in VS mode to unlock",
    geeta: "Defeat Master Trainer Geeta in VS mode to unlock",
    brendan: "Defeat Legend Trainer Brendan in VS mode to unlock",
    tutorial: "Complete the tutorial first"
  };

  function beaten(area) {
    return read(function () { return areas[area].defeated !== false; }, true);
  }
  function inArea() { return read(function () { return saved.currentArea !== undefined; }, false); }
  function inTraining() {
    return read(function () { return saved.currentArea !== undefined && saved.currentArea === areas.training.id; }, false);
  }
  function inTutorial() {
    var step = read(function () { return saved.tutorialStep; });
    return step !== undefined && step !== "none";
  }

  // Why a row can't be opened right now, or null.
  //   kind "progress": needs an unlock, explained inline under the row
  //   kind "busy":     blocked by the running battle, explained in a toast
  function lockOf(key) {
    if (inTutorial() && /^(vs|bag|team|dex|guide|dict)$/.test(key)) {
      return { kind: "progress", text: UNLOCK.tutorial, vs: false };
    }
    var battle = inArea(), training = inTraining();
    switch (key) {
      case "travel":
        if (training) return { kind: "busy", text: t("Finish the training first", "训练中，先结束训练再去探索") };
        break;
      case "vs":
        if (battle) return { kind: "busy", text: t("Leave the battle first", "先离开战斗，再去对战") };
        break;
      case "dimension":
        if (!beaten("vsLegendTrainerBrendan")) return { kind: "progress", text: UNLOCK.brendan, vs: true };
        if (battle) return { kind: "busy", text: t("Leave the battle first", "先离开战斗") };
        break;
      case "battle":
        if (!battle) return { kind: "idle", text: t("Pick an area in Travel or VS first", "还没有进行中的战斗，先去探索或对战选一个区域") };
        break;
      case "team":
        if (battle) return { kind: "busy", text: t("Leave the battle first", "先离开战斗，再编队") };
        break;
      case "mart":
        if (!beaten("vsGymLeaderBrock")) return { kind: "progress", text: UNLOCK.brock, vs: true };
        break;
      case "training":
        if (!beaten("vsGymLeaderMisty")) return { kind: "progress", text: UNLOCK.misty, vs: true };
        if (battle && !training) return { kind: "busy", text: t("Leave the battle first", "先离开战斗，再去训练") };
        break;
      case "genetics":
        if (!beaten("vsEliteFourLance")) return { kind: "progress", text: UNLOCK.lance, vs: true };
        break;
      case "gift":
      case "export":
        if (!beaten("vsGymLeaderBrock")) return { kind: "progress", text: UNLOCK.brock, vs: true };
        break;
      case "wonder":
        if (!beaten("vsMasterTrainerGeeta")) return { kind: "progress", text: UNLOCK.geeta, vs: true };
        break;
    }
    return null;
  }

  // Rewards only have a row while there is something to claim.
  function rewardWaiting(key) {
    if (key === "gift") {
      return read(function () {
        return saved.mysteryGiftClaimed !== true && !(new Date() > mysteryGift.duration);
      }, false);
    }
    if (key === "export") return read(function () { return !saved.claimedExportReward; }, false);
    if (key === "wonder") return read(function () { return !saved.wonderTradeClaimed; }, false);
    return false;
  }

  // The game's menu functions end by toggling its menu grid, which they expect
  // to be open. The grid is hidden in this skin: mark it open for the call and
  // closed again afterwards.
  function withMenu(fn) {
    var button = $("menu-button");
    if (button) button.classList.add("menu-button-open");
    try { fn(); } finally {
      if (button) button.classList.remove("menu-button-open");
    }
  }

  // The game hides its menu button while a flow must be finished first (picking
  // a Pokémon, the pre-battle team…); the sidebar follows.
  function flowRunning() {
    var parent = $("menu-button-parent");
    return (!!parent && parent.style.display === "none") || BLOCKERS.some(shown);
  }

  // A popup the game wants answered can't be skipped by navigating away.
  function popupPinned() {
    return shown("tooltipBackground") && !!$("prevent-tooltip-exit");
  }

  function go(key) {
    if (typeof switchMenu !== "function") return;
    if (flowRunning() || popupPinned()) { shake(key); return; }
    var lock = lockOf(key);
    if (lock) {
      shake(key);
      if (lock.kind === "progress") showHint(key, lock);
      else toast(lock.text, lock.kind === "idle" ? "plain" : "warn");
      return;
    }
    closeHint();
    if (shown("tooltipBackground") && typeof closeTooltip === "function") closeTooltip();

    if (key === "gift") withMenu(function () { claimMysteryGift(); });
    else if (key === "export") withMenu(function () { claimExportReward(); });
    else if (key === "wonder") withMenu(function () { claimWonderTrade(); });
    else if (key === "dimension") withMenu(function () { switchMenu("dimension"); });
    else if (key === "battle") withMenu(function () { switchMenu(inTraining() ? "training" : "travel"); });
    else withMenu(function () { switchMenu(ROWS[key].menu); });
    sync();
  }

  // The idle home: no page open. The running battle, if any, keeps going.
  function goHome() {
    if (typeof switchMenu !== "function" || flowRunning() || popupPinned()) return;
    closeHint();
    withMenu(function () { switchMenu("home"); });
    // switchMenu() never hides the dictionary itself.
    var dictionary = $("dictionary-menu");
    if (dictionary) dictionary.style.display = "none";
    sync();
  }

  // --- State -------------------------------------------------------------------

  function activePage() {
    var top = null, topZ = -1;
    PAGES.forEach(function (pair) {
      var node = $(pair[0]);
      if (!node || getComputedStyle(node).display === "none") return;
      var z = parseInt(node.style.zIndex, 10) || 0;
      if (z >= topZ) { top = pair; topZ = z; }
    });
    return top;
  }

  function battleInfo() {
    if (!inArea()) return null;
    var id = read(function () { return saved.currentArea; });
    var name = inTraining() ? ROWS.training.label
      : read(function () { return format(id); }, String(id));
    var hp = read(function () {
      return wildPkmnHpMax > 0 ? Math.max(0, Math.min(1, wildPkmnHp / wildPkmnHpMax)) : null;
    }, null);
    var members = read(function () {
      var list = [];
      for (var slot in team) {
        var member = team[slot];
        if (!member || member.pkmn === undefined) continue;
        var data = pkmn[member.pkmn.id];
        list.push(!!data && data.playerHp > 0);
      }
      return list;
    }, []);
    return { name: name, hp: typeof hp === "number" && isFinite(hp) ? hp : null, members: members };
  }

  function count(id) {
    return read(function () { return item[id].got; }, 0) || 0;
  }

  function curryText() {
    return read(function () {
      return saved.curry && saved.curry.time > 0 ? returnHMS(saved.curry.time).replace("0h", "").trim() : "";
    }, "");
  }

  // --- Building blocks -----------------------------------------------------------

  var LOCK_SVG = '<svg class="dk-lock" width="10" height="11" viewBox="0 0 9 10" aria-hidden="true">' +
    '<rect x="0.5" y="4" width="8" height="5.5" rx="1.2" fill="currentColor"/>' +
    '<path d="M2.3 4V2.8a2.2 2.2 0 0 1 4.4 0V4" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>';

  function icon(paths) {
    return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"' +
      ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + "</svg>";
  }
  var ICON_FULL = icon('<path d="M8 3H4a1 1 0 0 0-1 1v4M16 3h4a1 1 0 0 1 1 1v4M8 21H4a1 1 0 0 1-1-1v-4M16 21h4a1 1 0 0 0 1-1v-4"/>');
  var ICON_FOLD = icon('<path d="M11 6l-6 6 6 6M19 6l-6 6 6 6"/>');
  var ICON_KEYS = icon('<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M7 10h.01M11 10h.01M15 10h.01M8 14h8"/>');

  var side, top, toasts, rowNodes = {}, groupNodes = [], hintNode = null, hintKey = null, tip = null;

  function buildRow(key) {
    var row = ROWS[key];
    var node = el("button", "dk-row");
    node.type = "button";
    node.dataset.key = key;
    var img = el("img", "dk-ico");
    img.src = "img/items/" + row.icon + ".png";
    img.alt = "";
    node.appendChild(img);
    node.appendChild(el("span", "dk-label", row.label));
    if (key === "battle") node.appendChild(el("span", "dk-idle", t("idle", "空闲")));
    if (row.kbd) node.appendChild(el("kbd", "dk-kbd", row.kbd));
    if (key === "gift" || key === "export" || key === "wonder") node.appendChild(el("span", "dk-dot"));
    node.insertAdjacentHTML("beforeend", LOCK_SVG);
    node.addEventListener("click", function () { go(key); });
    node.addEventListener("mouseenter", function () { showTip(node, key); });
    node.addEventListener("mouseleave", hideTip);
    rowNodes[key] = node;
    return node;
  }

  function footButton(id, html, label, run) {
    var node = el("button", "dk-foot-btn");
    node.type = "button";
    node.id = id;
    node.innerHTML = html;
    node.title = label;
    node.setAttribute("aria-label", label);
    node.addEventListener("click", run);
    return node;
  }

  function buildSidebar() {
    side = el("nav");
    side.id = "dk-side";
    side.setAttribute("aria-label", t("Main menu", "主菜单"));

    var brand = el("button", "dk-brand");
    brand.type = "button";
    brand.title = t("Home", "主页");
    brand.innerHTML = '<span class="dk-ball" aria-hidden="true"><i></i><b></b><u></u></span>';
    brand.appendChild(el("span", "dk-brand-name", "PokeChill"));
    brand.addEventListener("click", goHome);
    side.appendChild(brand);

    var card = el("button", "dk-battle");
    card.type = "button";
    card.id = "dk-battle";
    card.innerHTML =
      '<span class="dk-battle-tag"><i></i><span></span></span>' +
      '<span class="dk-battle-area"></span>' +
      '<span class="dk-battle-hp"><i></i></span>' +
      '<span class="dk-battle-team"></span>';
    card.querySelector(".dk-battle-tag span").textContent = t("IN BATTLE", "战斗中");
    card.addEventListener("click", function () { go("battle"); });
    side.appendChild(card);

    var groups = el("div", "dk-groups");
    GROUPS.forEach(function (group) {
      var box = el("div", "dk-group");
      box.appendChild(el("div", "dk-group-title", group.title));
      group.keys.forEach(function (key) { box.appendChild(buildRow(key)); });
      groups.appendChild(box);
      groupNodes.push({ node: box, group: group });
    });
    side.appendChild(groups);

    var foot = el("div", "dk-foot");
    var money = el("div", "dk-money");
    [["bottleCap", "dk-caps"], ["goldenBottleCap", "dk-gold"]].forEach(function (pair) {
      var pill = el("span", "dk-pill");
      pill.id = pair[1];
      pill.dataset.item = pair[0]; // right-click shows the item, as anywhere in the game
      var img = el("img");
      img.src = "img/items/" + pair[0] + ".png";
      img.alt = "";
      pill.appendChild(img);
      pill.appendChild(el("span", null, "0"));
      money.appendChild(pill);
    });
    foot.appendChild(money);

    var actions = el("div", "dk-foot-actions");
    actions.appendChild(footButton("dk-full", ICON_FULL, t("Full screen", "全屏"), toggleFullscreen));
    actions.appendChild(footButton("dk-keys", ICON_KEYS, t("Keyboard shortcuts (?)", "快捷键 (?)"), openShortcuts));
    actions.appendChild(footButton("dk-fold", ICON_FOLD, t("Collapse sidebar", "收起侧栏"), togglePin));
    foot.appendChild(actions);
    foot.appendChild(el("div", "dk-version"));
    side.appendChild(foot);

    document.body.appendChild(side);
  }

  function buildTopBar() {
    top = el("header");
    top.id = "dk-top";
    top.appendChild(el("div", "dk-top-title"));
    var slot = el("div", "dk-top-slot");
    slot.id = "dk-top-slot";
    top.appendChild(slot);

    var curry = el("button", "dk-top-pill");
    curry.type = "button";
    curry.id = "dk-curry";
    curry.innerHTML = "<i></i><span></span><b></b>";
    curry.querySelector("span").textContent = t("Curry active", "咖喱生效中");
    curry.addEventListener("click", function () {
      var timer = $("curry-timer");
      if (timer) timer.click();
    });
    top.appendChild(curry);

    var help = el("button", "dk-top-help", "?");
    help.type = "button";
    help.id = "dk-help";
    help.title = t("About this page", "本页说明");
    help.addEventListener("click", function () {
      if (help.dataset.help && typeof tooltipData === "function") tooltipData("help", help.dataset.help);
    });
    top.appendChild(help);
    document.body.appendChild(top);
  }

  // --- Hints, tips, toasts ---------------------------------------------------------

  function shake(key) {
    var node = key === "dimension" ? $("dk-dimension-tab") : rowNodes[key];
    if (!node) return;
    node.classList.remove("dk-shake");
    void node.offsetWidth;
    node.classList.add("dk-shake");
  }

  function closeHint() {
    if (hintNode && hintNode.parentNode) hintNode.parentNode.removeChild(hintNode);
    hintNode = null;
    hintKey = null;
  }

  // The unlock condition, inline under the row that was clicked.
  function showHint(key, lock) {
    var row = rowNodes[key];
    if (!row || root.classList.contains("dk-collapsed")) { toast(lock.text, "warn"); return; }
    if (hintKey === key) { closeHint(); return; }
    closeHint();
    hintNode = el("div", "dk-hint");
    hintNode.appendChild(el("span", null, lock.text));
    if (lock.vs && !lockOf("vs")) {
      var link = el("button", "dk-hint-link", t("Go to VS →", "前往对战 →"));
      link.type = "button";
      link.addEventListener("click", function () { go("vs"); });
      hintNode.appendChild(link);
    }
    row.parentNode.insertBefore(hintNode, row.nextSibling);
    hintKey = key;
  }

  function showTip(node, key) {
    if (!root.classList.contains("dk-collapsed")) return;
    if (!tip) {
      tip = el("div");
      tip.id = "dk-tip";
      document.body.appendChild(tip);
    }
    tip.textContent = "";
    tip.appendChild(el("span", null, ROWS[key].label));
    var lock = lockOf(key);
    if (ROWS[key].kbd && !lock) tip.appendChild(el("kbd", "dk-kbd", ROWS[key].kbd));
    if (lock && lock.kind !== "idle") tip.insertAdjacentHTML("beforeend", LOCK_SVG);
    var box = node.getBoundingClientRect();
    tip.style.top = Math.round(box.top + box.height / 2) + "px";
    tip.style.left = Math.round(box.right + 10) + "px";
    tip.classList.add("dk-tip-on");
  }
  function hideTip() { if (tip) tip.classList.remove("dk-tip-on"); }

  // kind: "plain" | "ok" | "warn" | "shiny"
  function toast(text, kind) {
    if (!toasts) return;
    var last = toasts.lastElementChild;
    if (last && last.dataset.text === text) return;
    while (toasts.children.length >= 3) toasts.removeChild(toasts.firstElementChild);
    var node = el("div", "dk-toast dk-toast-" + (kind || "plain"));
    node.dataset.text = text;
    node.appendChild(el("i"));
    node.appendChild(el("span", null, text));
    toasts.appendChild(node);
    setTimeout(function () {
      node.classList.add("dk-toast-out");
      setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 220);
    }, 3000);
  }

  // --- Shortcuts -----------------------------------------------------------------------

  var SHORTCUTS = [
    [["1–6"], t("Travel · VS · Battle · Team · Items · Pokédex", "探索 · 对战 · 战斗 · 队伍 · 背包 · 图鉴")],
    [["S"], t("Save game", "保存游戏")],
    [["Esc"], t("Close a popup", "关闭弹窗")],
    [["Space"], t("Close a popup", "关闭弹窗")],
    [["/"], t("Focus search (Pokédex, Dictionary)", "聚焦搜索（图鉴、百科）")],
    [["?"], t("Show this list", "显示本列表")]
  ];

  function closeShortcuts() {
    var modal = $("dk-modal");
    if (modal) modal.parentNode.removeChild(modal);
  }

  function openShortcuts() {
    if ($("dk-modal")) { closeShortcuts(); return; }
    var modal = el("div");
    modal.id = "dk-modal";
    var card = el("div", "dk-card");
    var head = el("div", "dk-card-head");
    head.appendChild(el("span", null, t("Keyboard shortcuts", "快捷键")));
    var close = el("button", "dk-card-close", "✕");
    close.type = "button";
    close.addEventListener("click", closeShortcuts);
    head.appendChild(close);
    card.appendChild(head);
    SHORTCUTS.forEach(function (entry) {
      var line = el("div", "dk-key-line");
      var keys = el("span", "dk-key-keys");
      entry[0].forEach(function (key) { keys.appendChild(el("kbd", "dk-kbd", key)); });
      line.appendChild(keys);
      line.appendChild(el("span", null, entry[1]));
      card.appendChild(line);
    });
    modal.appendChild(card);
    modal.addEventListener("click", function (e) { if (e.target === modal) closeShortcuts(); });
    document.body.appendChild(modal);
  }

  function typing(target) {
    if (!target || !target.tagName) return false;
    return /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable;
  }

  function onKey(e) {
    if (!root.classList.contains("dk")) return;
    if (e.key === "Escape") { closeShortcuts(); closeHint(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
    if (root.classList.contains("dk-intro")) return;
    if (e.key === "?") { e.preventDefault(); openShortcuts(); return; }
    if (e.key === "/") {
      var search = shown("pokedex-menu") ? $("pokedex-search") : shown("dictionary-menu") ? $("dictionary-search") : null;
      if (search && search.offsetParent !== null) { e.preventDefault(); search.focus(); }
      return;
    }
    var order = GROUPS[0].keys;
    var index = "123456".indexOf(e.key);
    if (e.key.length === 1 && index >= 0) { e.preventDefault(); go(order[index]); }
  }

  // --- Window -------------------------------------------------------------------------

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (root.requestFullscreen) root.requestFullscreen();
  }

  // "1" = always collapsed, "0" = always expanded, unset = follow the width.
  function pinned() {
    try { return localStorage.getItem(PIN_KEY); } catch (e) { return null; }
  }
  function togglePin() {
    var collapsed = root.classList.contains("dk-collapsed");
    try { localStorage.setItem(PIN_KEY, collapsed ? "0" : "1"); } catch (e) {}
    applyLayout();
  }

  function applyLayout() {
    var on = wide.matches;
    root.classList.toggle("dk", on);
    var pin = pinned();
    var collapsed = on && (pin === "1" || (pin !== "0" && !roomy.matches));
    root.classList.toggle("dk-collapsed", collapsed);
    var fold = $("dk-fold");
    if (fold) {
      var label = collapsed ? t("Expand sidebar", "展开侧栏") : t("Collapse sidebar", "收起侧栏");
      fold.title = label;
      fold.setAttribute("aria-label", label);
    }
    if (collapsed) closeHint();
    hideTip();
  }

  // --- Mega Dimension as a VS tab ----------------------------------------------------

  function dimensionTab(current) {
    var tab = el("div", "dk-dimension-tab");
    tab.appendChild(document.createTextNode(t("Mega Dimension", "超级次元")));
    if (current) tab.classList.add("dk-tab-on");
    return tab;
  }

  function syncVsTabs() {
    // The game rewrites #vs-selector whenever the VS page changes tab.
    var selector = $("vs-selector");
    if (selector && !$("dk-dimension-tab")) {
      var tab = dimensionTab(false);
      tab.id = "dk-dimension-tab";
      tab.addEventListener("click", function () { go("dimension"); });
      selector.appendChild(tab);
    }
    var mine = $("dk-dimension-tab");
    if (mine) {
      var locked = !beaten("vsLegendTrainerBrendan");
      if (mine.classList.contains("dk-tab-locked") !== locked) {
        mine.classList.toggle("dk-tab-locked", locked);
        var old = mine.querySelector(".dk-lock");
        if (old) mine.removeChild(old);
        if (locked) mine.insertAdjacentHTML("beforeend", LOCK_SVG);
      }
    }

    var dimension = $("dimension-menu");
    var header = $("dimension-menu-header");
    if (dimension && header && !$("dk-dimension-selector")) {
      var row = el("div", "explore-menu-selector");
      row.id = "dk-dimension-selector";
      var trainers = el("div", null, t("Trainers", "训练家"));
      trainers.addEventListener("click", function () {
        go("vs");
        if (shown("vs-menu") && typeof updateVS === "function") updateVS();
      });
      var frontier = el("div", null, t("Battle Frontier", "对战开拓区"));
      frontier.addEventListener("click", function () {
        go("vs");
        if (shown("vs-menu") && typeof updateFrontier === "function") updateFrontier();
      });
      row.appendChild(trainers);
      row.appendChild(frontier);
      row.appendChild(dimensionTab(true));
      header.parentNode.insertBefore(row, header.nextSibling);
    }
  }

  // --- Tutorial -----------------------------------------------------------------------

  // The first tutorial line points at the game's corner menu, which the
  // sidebar replaces. In Chinese the line is rewritten after it is translated.
  var TUTORIAL_FIX = ZH
    ? ['在左上角菜单中选择"旅行"', "在左侧栏选择「探索」（或按 1）"]
    : ['Select "Travel" on the top left menu', 'Select "Travel" in the sidebar (or press 1)'];

  function relabelTutorial() {
    var box = $("tutorial-text");
    if (!box || box.textContent.indexOf(TUTORIAL_FIX[0]) < 0) return;
    var walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue.indexOf(TUTORIAL_FIX[0]) >= 0) {
        node.nodeValue = node.nodeValue.replace(TUTORIAL_FIX[0], TUTORIAL_FIX[1]);
      }
    }
  }

  // --- Sync ----------------------------------------------------------------------------

  var lastTitle = null, lastTeam = "";

  function setText(node, text) {
    if (node && node.textContent !== text) node.textContent = text;
  }

  function sync() {
    if (!side || !root.classList.contains("dk")) return;

    var intro = shown("disclaimer-menu") || shown("starter-menu");
    root.classList.toggle("dk-intro", intro);

    var page = activePage();
    var active = page ? page[1] : "home";
    var flow = flowRunning();
    var battle = battleInfo();
    root.classList.toggle("dk-home", active === "home");
    root.classList.toggle("dk-flow", flow);
    root.dataset.dkPage = page ? page[0] : "home";

    // Rows
    Object.keys(rowNodes).forEach(function (key) {
      var node = rowNodes[key];
      var lock = lockOf(key);
      node.classList.toggle("dk-on", key === active);
      node.classList.toggle("dk-locked", !!lock && lock.kind !== "idle");
      node.classList.toggle("dk-is-idle", !!lock && lock.kind === "idle");
      node.setAttribute("aria-current", key === active ? "page" : "false");
      if (key === "gift" || key === "export" || key === "wonder") {
        node.hidden = !rewardWaiting(key);
      }
    });
    groupNodes.forEach(function (entry) {
      if (!entry.group.rewards) return;
      entry.node.hidden = !entry.group.keys.some(function (key) { return !rowNodes[key].hidden; });
    });
    if (hintKey && (!lockOf(hintKey) || rowNodes[hintKey].hidden)) closeHint();

    // Battle card: enemy HP and who is still standing
    var card = $("dk-battle");
    card.hidden = !battle;
    if (battle) {
      setText(card.querySelector(".dk-battle-area"), battle.name);
      var percent = battle.hp === null ? 0 : Math.round(battle.hp * 100);
      var bar = card.querySelector(".dk-battle-hp i");
      bar.style.width = percent + "%";
      card.style.setProperty("--dk-hp", percent + "%");
      card.dataset.level = percent > 60 ? "high" : percent > 30 ? "mid" : "low";
      var teamKey = battle.members.join(",");
      if (teamKey !== lastTeam) {
        lastTeam = teamKey;
        var balls = card.querySelector(".dk-battle-team");
        balls.textContent = "";
        battle.members.forEach(function (up) { balls.appendChild(el("i", up ? "" : "dk-out")); });
      }
      card.title = battle.name + (battle.hp === null ? "" : " · " + percent + "%");
    }

    // Footer
    setText($("dk-caps").lastElementChild, count("bottleCap").toLocaleString("en-US"));
    setText($("dk-gold").lastElementChild, count("goldenBottleCap").toLocaleString("en-US"));
    var version = $("game-version");
    setText(side.querySelector(".dk-version"), version ? version.textContent.trim() : "");

    // Top bar
    var title = active === "home" ? "" : active === "battle" && battle ? battle.name : ROWS[active].label;
    if (page && page[0] === "dimension-menu") title = ROWS.vs.label;
    if (title !== lastTitle) {
      lastTitle = title;
      setText(top.querySelector(".dk-top-title"), title);
    }
    var curry = curryText();
    $("dk-curry").hidden = !curry;
    if (curry) setText($("dk-curry").querySelector("b"), curry);
    var helpKey = "";
    if (page) {
      // Only where the page's own help button went away with its title.
      var source = $(page[0]).querySelector('[id$="-header"] [data-help]');
      if (source && source.offsetParent === null) helpKey = source.dataset.help;
    }
    var help = $("dk-help");
    help.hidden = !helpKey;
    help.dataset.help = helpKey;

    attempt(syncVsTabs);
    attempt(relabelTutorial);
  }

  // --- Start ------------------------------------------------------------------------------

  function start() {
    buildSidebar();
    buildTopBar();
    toasts = el("div");
    toasts.id = "dk-toasts";
    toasts.setAttribute("aria-live", "polite");
    document.body.appendChild(toasts);

    applyLayout();
    [wide, roomy].forEach(function (query) {
      if (query.addEventListener) query.addEventListener("change", function () { applyLayout(); sync(); });
      else query.addListener(function () { applyLayout(); sync(); });
    });
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", function (e) {
      if (hintNode && !side.contains(e.target)) closeHint();
      // The game changes pages from its own click handlers; catch up right after.
      requestAnimationFrame(function () { attempt(sync); });
    }, true);
    setInterval(function () { attempt(sync); }, 300);
    attempt(sync);
  }

  window.PokeChillDesktop = { go: go, home: goHome, toast: toast, sync: sync };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
