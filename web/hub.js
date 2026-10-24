/*
 * Smart Hub: Samsung's home layout, without the ads. The rail on the left, the banner (the city's weather over a
 * photo of it), one row of big tiles with the main apps, and below it a row of what's popular on each of them.
 * Apps opens every app, to open one or to add it to the home row. ES5, for the Chromium of older TVs.
 */
(function () {
  'use strict';

  var stage = document.getElementById('stage'), body = document.body;
  var K = TV.keys;

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, parent, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function sym(name, parent) {
    var s = el('span', 'sym', parent);
    s.style.webkitMaskImage = s.style.maskImage = 'url(symbols/' + name + '.png)';
    return s;
  }
  function setClass(e, c, on) {
    var has = (' ' + e.className + ' ').indexOf(' ' + c + ' ') >= 0;
    if (on && !has) e.className += ' ' + c;
    if (!on && has) e.className = (' ' + e.className + ' ').replace(' ' + c + ' ', ' ').replace(/^\s+|\s+$/g, '');
  }
  function fit() {
    var scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    stage.style.webkitTransform = stage.style.transform = scale === 1 ? '' : 'scale(' + scale + ')';
  }
  function save(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {} }
  function load(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } }

  // MARK: - Apps

  var HIDE = (CONFIG.hideApps || []).map(function (s) { return s.toLowerCase(); });
  var WANTED = (CONFIG.shelfApps || []).map(function (s) { return s.toLowerCase(); });

  // The streaming apps' own logos, on their brand color, as on Samsung's apps bar: [match, logo, color, logo size].
  var BRAND = [
    [/netflix/i, 'icons/netflix.svg', '#000000', 'h58'],
    [/prime|amazon/i, 'icons/prime.png', '#1A98FF', 'w66'],
    [/youtube kids/i, 'icons/youtubekids.svg', '#FF0033', 'w62'],
    [/youtube/i, 'icons/youtube.png', '#0F0F0F', 'w66'],
    [/hbo|^max$/i, 'icons/hbomax.svg', '#5A2BD6', 'h72'],
    [/spotify/i, 'icons/spotify-green.svg', '#000000', 'h52'],
    [/disney/i, 'icons/disneyplus.svg', '#0B1E5B', 'w56'],
    [/tv ?plus/i, 'icons/tvplus.svg', '#101828', 'h62'],
    [/apple ?tv/i, 'icons/appletv.svg', '#000000', 'h58'],
    [/globoplay/i, '', '#FF4A1C', ''],
    [/deezer/i, 'icons/deezer.svg', '#000000', 'w60']
  ];
  function brandOf(app) {
    for (var i = 0; i < BRAND.length; i++) if (BRAND[i][0].test(app.title) || BRAND[i][0].test(app.id)) return BRAND[i];
    return null;
  }

  var apps = [], home = [];

  /** The home row's apps: the ones picked in Apps, else shelf_apps in its order (exact names first). */
  function pickHome() {
    var ids = load('fmtv.home'), out = [], i, j;
    if (ids) {
      for (i = 0; i < ids.length; i++) for (j = 0; j < apps.length; j++) if (apps[j].id === ids[i]) out.push(apps[j]);
      home = out;
      return;
    }
    for (i = 0; i < WANTED.length; i++) {
      var hit = null;
      for (j = 0; j < apps.length && !hit; j++) if (apps[j].title.toLowerCase() === WANTED[i] && out.indexOf(apps[j]) < 0) hit = apps[j];
      for (j = 0; j < apps.length && !hit; j++) {
        var a = apps[j];
        if ((a.title.toLowerCase().indexOf(WANTED[i]) >= 0 || a.id.toLowerCase().indexOf(WANTED[i]) >= 0) && out.indexOf(a) < 0) hit = a;
      }
      if (hit) out.push(hit);
    }
    home = out;
  }

  function onHome(app) { return home.indexOf(app) >= 0; }

  function setHome(app, on) {
    if (on && !onHome(app)) home.push(app);
    if (!on) home = home.filter(function (a) { return a !== app; });
    save('fmtv.home', home.map(function (a) { return a.id; }));
    renderHome();
    renderLists();
    refreshTips();
  }

  /** An app's face: its brand logo on its color, else the TV's own icon, else its name. */
  function face(app, t) {
    var b = brandOf(app);
    t.style.backgroundColor = b ? b[2] : app.color || '#262A33';
    var word = el('div', 'word', t, app.title);
    var src = b && b[1] ? b[1] : app.icon && app.icon.indexOf('icons/') !== 0 ? app.icon : '';
    if (!src) return;
    var art = el('div', 'art' + (b && b[1] ? ' logo ' + b[3] : ''), t);
    var img = new Image();
    img.onload = function () { art.style.backgroundImage = 'url("' + src + '")'; word.style.display = 'none'; };
    img.src = src;
  }

  // MARK: - Rows

  // rows[0]: the home row; then one row of tips per app that has them. Each item: its node and what OK does.
  var rows = [[]];
  var st = {rail: false, railAt: 0, row: 0, col: [], sheet: false, sheetAt: 0, menu: false, menuAt: 0};
  var ROW_TOP = 444, LIST_TOP = 724, LIST_STEP = 300;

  function layStrip(strip, nodes, gap) {
    var x = 0;
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].style.left = x + 'px';
      x += nodes[i].offsetWidth + gap;
    }
  }

  function renderHome() {
    var strip = $('home').querySelector('.strip');
    strip.innerHTML = '';
    var items = [];
    var all = el('div', 'big tool', strip);
    sym('apps', el('div', 'face', all));
    el('div', 'caption', all, 'Apps');
    items.push({node: all, ok: openSheet});
    for (var i = 0; i < home.length; i++) {
      (function (app) {
        var c = el('div', 'big', strip);
        face(app, el('div', 'face', c));
        el('div', 'caption', c, app.title);
        items.push({node: c, ok: function () { launch(app.id); }});
      })(home[i]);
    }
    layStrip(strip, items.map(function (x) { return x.node; }), 20);
    rows[0] = items;
  }

  // MARK: - Tips: what's popular on each home app, one row each

  var TIPS_KEY = 'fmtv.tips', TIPS_FOR = 6 * 3600000, tips = load(TIPS_KEY) || {};
  var PACKAGES = {netflix: 'nfx', disney: 'dnp', prime: 'prv'};
  var TIPS_TITLE = {youtube: 'Novos no YouTube', netflix: 'Em alta na Netflix', disney: 'Em alta no Disney+', prime: 'Em alta no Prime Video'};

  function tipsKind(app) {
    if (/netflix/i.test(app.title)) return 'netflix';
    if (/disney/i.test(app.title)) return 'disney';
    if (/prime video/i.test(app.title)) return 'prime';
    if (/^youtube$/i.test(app.title)) return 'youtube';
    return '';
  }

  function request(method, url, data, done) {
    var x = new XMLHttpRequest();
    x.open(method, url);
    if (data) x.setRequestHeader('Content-Type', 'application/json');
    x.timeout = 15000;
    x.onload = function () { done(x.status === 200 ? x.responseText : ''); };
    x.onerror = x.ontimeout = function () { done(''); };
    x.send(data || null);
  }

  function saveTips(kind, list) {
    tips[kind] = {at: Date.now(), list: list};
    save(TIPS_KEY, tips);
    renderLists();
  }

  var POPULAR = 'query($c:Country!,$l:Language!,$f:TitleFilter){popularTitles(country:$c,first:14,filter:$f){edges{node{'
    + 'objectType content(country:$c,language:$l){title backdrops{backdropUrl}}}}}}';

  /**
   * Netflix, Disney+ and Prime Video: what's popular on them in this country (JustWatch, no key). YouTube: the newest
   * videos of youtube_channels (YouTube's own feeds, no key).
   */
  function fetchTips(kind) {
    if (tips[kind] && Date.now() - tips[kind].at < TIPS_FOR) return;
    if (kind === 'youtube') { fetchVideos(); return; }
    var data = JSON.stringify({query: POPULAR, variables: {c: Place.country, l: 'pt', f: {packages: [PACKAGES[kind]]}}});
    request('POST', 'https://apis.justwatch.com/graphql', data, function (text) {
      var edges = [];
      try { edges = JSON.parse(text).data.popularTitles.edges; } catch (e) { return; }
      var out = [];
      for (var i = 0; i < edges.length && out.length < 12; i++) {
        var n = edges[i].node, c = n.content, b = c && c.backdrops && c.backdrops[0];
        if (!b) continue;
        out.push({title: c.title, sub: n.objectType === 'MOVIE' ? 'Filme' : 'Série',
          img: 'https://images.justwatch.com' + b.backdropUrl.replace('{profile}', 's640').replace('{format}', 'jpg')});
      }
      if (out.length) saveTips(kind, out);
    });
  }

  var CHANNELS = CONFIG.youtubeChannels && CONFIG.youtubeChannels.length ? CONFIG.youtubeChannels
    : ['UCKHhA5hN2UohhFDfNXB_cvQ', 'UCV306eHqgo0LvBf3Mh36AHg', 'UCEWHPFNilsT0IfQfutVzsag'];

  function tagText(node) {
    return function (tag) { var n = node.getElementsByTagName(tag)[0]; return n ? n.textContent : ''; };
  }

  function fetchVideos() {
    var all = [], left = CHANNELS.length;
    CHANNELS.forEach(function (id) {
      request('GET', 'https://www.youtube.com/feeds/videos.xml?channel_id=' + id, null, function (xml) {
        if (xml) {
          var doc = new DOMParser().parseFromString(xml, 'text/xml'), entries = doc.getElementsByTagName('entry');
          for (var i = 0; i < entries.length && i < 6; i++) {
            var text = tagText(entries[i]), video = text('yt:videoId');
            all.push({title: text('title'), sub: text('name'), video: video, at: Date.parse(text('published')) || 0,
              img: 'https://i.ytimg.com/vi/' + video + '/hqdefault.jpg'});
          }
        }
        if (--left) return;
        all.sort(function (a, b) { return b.at - a.at; });
        if (all.length) saveTips('youtube', all.slice(0, 12));
      });
    });
  }

  function renderLists() {
    var box = $('lists');
    box.innerHTML = '';
    rows.length = 1;
    for (var i = 0; i < home.length; i++) {
      var kind = tipsKind(home[i]), list = kind && tips[kind] ? tips[kind].list : [];
      if (!list.length) continue;
      var part = el('div', 'list', box);
      part.style.top = (rows.length - 1) * LIST_STEP + 'px';
      el('div', 'title', part, TIPS_TITLE[kind]);
      var strip = el('div', 'strip', part), items = [];
      for (var j = 0; j < list.length; j++) {
        (function (t, app) {
          var c = el('div', 'tip', strip);
          el('div', 'pic', c).style.backgroundImage = 'url("' + t.img + '")';
          el('div', 'caption', c, t.title);
          el('div', 'when', c, t.sub);
          items.push({node: c, ok: function () { openTip(t, app); }});
        })(list[j], home[i]);
      }
      layStrip(strip, items.map(function (x) { return x.node; }), 20);
      rows.push(items);
    }
    if (st.row >= rows.length) st.row = rows.length - 1;
    focus();
  }

  /** A YouTube tip opens its video (the payload Samsung's own previews use); the others open their app. */
  function openTip(t, app) {
    if (t.video && window.tizen) {
      try {
        var data = [new window.tizen.ApplicationControlData('PAYLOAD', ['{"values": "v=' + t.video + '"}'])];
        var c = new window.tizen.ApplicationControl('http://tizen.org/appcontrol/operation/view', null, null, null, data);
        window.tizen.application.launchAppControl(c, app.id, null, function () { launch(app.id); });
        return;
      } catch (e) {}
    }
    launch(app.id);
  }

  // MARK: - Banner

  var hero = $('hero');

  /** The city's weather: now, the next hours and the next days. */
  function renderWeather() {
    var w = Data.weather, now = Date.now();
    hero.querySelector('.clock').textContent = formatDate('format|h:mm', now) + '   ' + formatDate('format|EEEE, d MMM', now);
    hero.querySelector('.city').textContent = Place.city || '';
    var temp = hero.querySelector('.temp'), hours = hero.querySelector('.hours'), days = hero.querySelector('.days');
    temp.innerHTML = '';
    hours.innerHTML = '';
    days.innerHTML = '';
    if (!w) { hero.querySelector('.cond').textContent = ''; return; }
    sym(Data.symbol(w.code, w.isDay), temp);
    el('span', '', temp, Data.degrees(w.temp));
    hero.querySelector('.cond').textContent = Data.condition(w.code, w.isDay) + '   ' + Data.degrees(w.max) + ' / ' + Data.degrees(w.min);
    for (var i = 0; i < w.hours.length; i++) {
      var h = el('div', 'slot', hours);
      el('div', 'at', h, Data.hour(w.hours[i].at));
      sym(Data.symbol(w.hours[i].code, w.hours[i].day), h);
      el('div', 'deg', h, Data.degrees(w.hours[i].temp));
    }
    for (var j = 0; j < w.days.length; j++) {
      var d = el('div', 'slot', days);
      el('div', 'at', d, Data.weekday(w.days[j].at));
      sym(Data.symbol(w.days[j].code, true), d);
      el('div', 'deg', d, Data.degrees(w.days[j].max) + '  ' + Data.degrees(w.days[j].min));
    }
  }

  // MARK: - Focus and keys

  var RAIL = [
    {symbol: 'home', label: 'Início', ok: function () { st.rail = false; st.row = 0; st.col[0] = 0; }},
    {symbol: 'apps', label: 'Apps', ok: function () { openSheet(); }},
    {symbol: 'settings', label: 'Configurações', ok: function () { TV.settings(); }}
  ];

  function renderRail() {
    var rail = $('rail');
    for (var i = 0; i < RAIL.length; i++) {
      var it = el('div', 'item' + (i === 0 ? ' here' : ''), rail);
      it.style.top = (380 + i * 92) + 'px';
      sym(RAIL[i].symbol, it);
      el('div', 'tip', it, RAIL[i].label);
    }
  }

  function shiftOf(strip) {
    var m = /translateX\((-?[\d.]+)px\)/.exec(strip.style.transform || strip.style.webkitTransform || '');
    return m ? +m[1] : 0;
  }

  function scrollStrip(r) {
    var items = rows[r];
    if (!items || !items.length) return;
    var node = items[st.col[r]].node, strip = node.parentNode;
    var shift = shiftOf(strip), room = 1824 - 72 - 72;
    var left = node.offsetLeft + shift, right = left + node.offsetWidth;
    if (right > room) shift -= right - room;
    if (left < 0) shift -= left;
    strip.style.webkitTransform = strip.style.transform = 'translateX(' + shift + 'px)';
  }

  function focus() {
    var r, i;
    var railItems = $('rail').children;
    for (i = 0; i < railItems.length; i++) setClass(railItems[i], 'focus', st.rail && st.railAt === i && !st.sheet);
    for (r = 0; r < rows.length; r++) {
      var items = rows[r];
      st.col[r] = Math.max(0, Math.min(st.col[r] || 0, items.length - 1));
      for (i = 0; i < items.length; i++) setClass(items[i].node, 'focus', !st.rail && !st.sheet && st.row === r && st.col[r] === i);
      scrollStrip(r);
    }
    // The focused list goes where the home row was, with the row above it still in sight.
    var lift = st.row < 1 ? 0 : LIST_TOP + (st.row - 1) * LIST_STEP - ROW_TOP;
    var main = $('main');
    main.style.webkitTransform = main.style.transform = lift ? 'translateY(' + (-lift) + 'px)' : '';
    if (st.sheet) focusSheet();
  }

  function move(dx, dy) {
    if (st.sheet) { moveSheet(dx, dy); return; }
    if (st.rail) {
      if (dy) st.railAt = Math.max(0, Math.min(RAIL.length - 1, st.railAt + dy));
      if (dx > 0) st.rail = false;
    } else if (dx) {
      if ((st.col[st.row] || 0) + dx < 0) st.rail = true;
      else st.col[st.row] = Math.min(rows[st.row].length - 1, st.col[st.row] + dx);
    } else if (dy) {
      st.row = Math.max(0, Math.min(rows.length - 1, st.row + dy));
    }
    focus();
  }

  function activate() {
    if (st.sheet) { activateSheet(); return; }
    if (st.rail) { RAIL[st.railAt].ok(); focus(); return; }
    var it = rows[st.row][st.col[st.row]];
    if (it) it.ok();
  }

  function back() {
    if (st.menu) { closeMenu(); return; }
    if (st.sheet) { closeSheet(); return; }
    st.rail = false;
    st.row = 0;
    st.col[0] = 0;
    focus();
  }

  function launch(id) {
    TV.launch(id, null, function (ok) { if (!ok) toast('Não deu para abrir'); });
  }

  // MARK: - Apps sheet: every app; OK offers to open it or to put it on (or take it off) the home row

  var COLS = 6;

  function openSheet() {
    var grid = $('sheet').querySelector('.grid');
    grid.innerHTML = '';
    for (var i = 0; i < apps.length; i++) {
      var t = el('div', 'app', grid);
      face(apps[i], t);
      el('div', 'name', t, apps[i].title);
      t.style.left = (i % COLS) * 260 + 'px';
      t.style.top = Math.floor(i / COLS) * 180 + 'px';
    }
    st.sheet = true;
    st.sheetAt = 0;
    setClass($('sheet'), 'open', true);
    focus();
  }

  function closeSheet() {
    st.menu = false;
    setClass($('menu'), 'open', false);
    st.sheet = false;
    setClass($('sheet'), 'open', false);
    focus();
  }

  function focusSheet() {
    var grid = $('sheet').querySelector('.grid'), tiles = grid.children;
    for (var i = 0; i < tiles.length; i++) setClass(tiles[i], 'focus', i === st.sheetAt && !st.menu);
    var row = Math.floor(st.sheetAt / COLS);
    grid.style.webkitTransform = grid.style.transform = 'translateY(' + (-Math.max(0, row - 3) * 180) + 'px)';
    var opts = $('menu').children;
    for (var j = 0; j < opts.length; j++) setClass(opts[j], 'focus', st.menu && st.menuAt === j);
  }

  function moveSheet(dx, dy) {
    if (st.menu) { if (dy) st.menuAt = Math.max(0, Math.min(1, st.menuAt + dy)); focus(); return; }
    var i = st.sheetAt + dx + dy * COLS;
    if (i >= 0 && i < apps.length) st.sheetAt = i;
    focus();
  }

  function activateSheet() {
    var app = apps[st.sheetAt];
    if (!app) return;
    if (!st.menu) { openMenu(app); return; }
    var add = !onHome(app), open = st.menuAt === 0;
    closeMenu();
    if (open) { launch(app.id); return; }
    setHome(app, add);
    toast(add ? app.title + ' está na tela inicial' : app.title + ' saiu da tela inicial');
  }

  /** A small menu under the focused app: open it, or put it on (take it off) the home row. */
  function openMenu(app) {
    var menu = $('menu'), row = Math.floor(st.sheetAt / COLS);
    menu.innerHTML = '';
    el('div', 'opt', menu, 'Abrir');
    el('div', 'opt', menu, onHome(app) ? 'Tirar da tela inicial' : 'Pôr na tela inicial');
    menu.style.left = (168 + (st.sheetAt % COLS) * 260) + 'px';
    menu.style.top = (170 + (row - Math.max(0, row - 3)) * 180 + 116) + 'px';
    st.menu = true;
    st.menuAt = 0;
    setClass(menu, 'open', true);
    focus();
  }

  function closeMenu() {
    st.menu = false;
    setClass($('menu'), 'open', false);
    focus();
  }

  var toastTimer = null;
  function toast(text) {
    var t = $('toast');
    t.innerHTML = '';
    el('span', '', t, text);
    setClass(t, 'on', true);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { setClass(t, 'on', false); }, 2600);
  }

  document.addEventListener('keydown', function (e) {
    var k = e.keyCode;
    if (k === K.left) move(-1, 0);
    else if (k === K.right) move(1, 0);
    else if (k === K.up) move(0, -1);
    else if (k === K.down) move(0, 1);
    else if (k === K.ok) activate();
    else if (k === K.back || k === 8 || k === 27) back();
    else return;
    e.preventDefault();
  });

  // MARK: - Start

  function refreshTips() {
    for (var i = 0; i < home.length; i++) if (tipsKind(home[i])) fetchTips(tipsKind(home[i]));
  }

  function loadApps(done) {
    TV.apps(function (list) {
      apps = list.filter(function (a) {
        var id = (a.id || '').toLowerCase(), title = (a.title || '').toLowerCase();
        for (var i = 0; i < HIDE.length; i++) if (id.indexOf(HIDE[i]) >= 0 || title.indexOf(HIDE[i]) >= 0) return false;
        return true;
      });
      pickHome();
      renderHome();
      renderLists();
      if (done) done();
    });
  }

  if (TV.name === 'tizen') setClass(body, 'tv', true);
  I18N.set(Prefs.language());
  renderRail();
  renderWeather();
  fit();
  loadApps(function () { Data.refreshWeather(); refreshTips(); });
  Data.onChange(renderWeather);

  window.addEventListener('resize', fit);
  window.addEventListener('appcontrol', function () { closeSheet(); back(); loadApps(); });
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) loadApps(function () { Data.refreshWeather(); refreshTips(); });
  });
  setInterval(function () { renderWeather(); Data.refreshWeather(); }, 30000);

  window.Hub = {state: st, move: move, activate: activate, back: back};
})();
