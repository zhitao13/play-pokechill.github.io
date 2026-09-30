// Language switch. The game itself is English-only; other languages are the
// translation scripts in i18n/<lang>/ (from the g1tyx Chinese port), which
// rewrite page text as it appears. Switching reloads the page.
//
// Loaded from <head>, before the game's own scripts.
(function () {
  "use strict";

  var LANG_KEY = "pokechill-language";
  var LANGUAGES = [
    { id: "en", name: "English", scripts: [] },
    {
      id: "zh-CN", name: "简体中文",
      scripts: ["i18n/zh-CN/en-cn.js", "i18n/zh-CN/cnsearch.js"],
      css: "#pokedex-list div span { font-size: 12px !important; }"
    }
  ];

  function findLanguage(id) {
    for (var i = 0; i < LANGUAGES.length; i++) {
      if (LANGUAGES[i].id === id) return LANGUAGES[i];
    }
    return null;
  }

  var language = null;
  try { language = findLanguage(localStorage.getItem(LANG_KEY)); } catch (e) {}
  if (!language) {
    // First visit: follow the browser language.
    language = /^zh/i.test(navigator.language || "") ? findLanguage("zh-CN") : LANGUAGES[0];
  }

  window.PokeChillLang = { id: language.id, zh: language.id === "zh-CN" };
  document.documentElement.lang = language.id;

  // The in-game "Wipe Data" clears localStorage; it should wipe the save, not
  // the language choice.
  try {
    var clear = Storage.prototype.clear;
    Storage.prototype.clear = function () {
      var local = this === window.localStorage;
      var lang = local ? this.getItem(LANG_KEY) : null;
      clear.apply(this, arguments);
      if (lang) this.setItem(LANG_KEY, lang);
    };
  } catch (e) {}

  // Hide the page until the translation has run, so English doesn't flash.
  var hideStyle = null;
  if (language.scripts.length) {
    hideStyle = document.createElement("style");
    hideStyle.textContent = "body { visibility: hidden !important; }";
    document.documentElement.appendChild(hideStyle);
    setTimeout(showPage, 3000);
  }
  function showPage() {
    if (hideStyle && hideStyle.parentNode) hideStyle.parentNode.removeChild(hideStyle);
  }

  // Runs after the game scripts, like the <script> tags at the end of <body>
  // on the Chinese site.
  document.addEventListener("DOMContentLoaded", function () {
    addLanguageSetting();
    if (language.css) {
      var style = document.createElement("style");
      style.textContent = language.css;
      document.head.appendChild(style);
    }
    language.scripts.forEach(function (src, i) {
      var script = document.createElement("script");
      script.src = src;
      script.async = false;
      if (i === 0) script.onload = script.onerror = showPage;
      document.body.appendChild(script);
    });
  });

  // Adds a "Language / 语言" row under Theme in the game's Settings menu.
  function addLanguageSetting() {
    var theme = document.getElementById("settings-theme");
    var row = theme && theme.parentNode;
    if (!row || !row.parentNode) return;
    var select = document.createElement("select");
    select.id = "settings-language";
    LANGUAGES.forEach(function (lang) {
      var option = document.createElement("option");
      option.value = lang.id;
      option.textContent = lang.name;
      select.appendChild(option);
    });
    select.value = language.id;
    select.addEventListener("change", function () {
      try { localStorage.setItem(LANG_KEY, select.value); } catch (e) {}
      if (typeof window.saveGame === "function") window.saveGame();
      location.reload();
    });
    var newRow = document.createElement("div");
    newRow.appendChild(document.createTextNode("Language / 语言: "));
    newRow.appendChild(select);
    row.parentNode.insertBefore(newRow, row.nextSibling);
  }
})();
