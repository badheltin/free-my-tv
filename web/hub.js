/*
 * Smart Hub: Samsung's home layout, without the ads. The rail on the left, the banner (local news and the weather),
 * the apps bar, live TV with the TV's own picture (tizen.tvwindow) and the region's news from Google News.
 * ES5, for the Chromium of older TVs.
 */
(function () {
  'use strict';

  var stage = document.getElementById('stage'), body = document.body;
  var K = TV.keys;
  var NEWS_QUERY = CONFIG.newsQuery || Place.city || '';
  var NEWS_KEY = 'fmtv.news';

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
  var scale = 1;
  function fit() {
    scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    stage.style.webkitTransform = stage.style.transform = scale === 1 ? '' : 'scale(' + scale + ')';
    placeLive();
  }

  // MARK: - Apps

  /** The apps bar, in this order when installed: shelf_apps, by name or id (part of it), exact names first. */
  var WANTED = (CONFIG.shelfApps || []).map(function (s) { return s.toLowerCase(); });
  var HIDE = (CONFIG.hideApps || []).map(function (s) { return s.toLowerCase(); });

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

  var apps = [], bar = [];

  function pickBar() {
    var out = [], i, j;
    for (i = 0; i < WANTED.length; i++) {
      var hit = null;
      for (j = 0; j < apps.length && !hit; j++) if (apps[j].title.toLowerCase() === WANTED[i] && out.indexOf(apps[j]) < 0) hit = apps[j];
      for (j = 0; j < apps.length && !hit; j++) {
        var a = apps[j];
        if ((a.title.toLowerCase().indexOf(WANTED[i]) >= 0 || a.id.toLowerCase().indexOf(WANTED[i]) >= 0) && out.indexOf(a) < 0) hit = a;
      }
      if (hit) out.push(hit);
    }
    for (j = 0; j < apps.length; j++) if (out.indexOf(apps[j]) < 0) out.push(apps[j]);
    bar = out;
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

  function appTile(app, parent) {
    var t = el('div', 'app', parent);
    face(app, t);
    el('div', 'name', t, app.title);
    return t;
  }

  function toolTile(symbol, label, parent) {
    var t = el('div', 'app tool', parent);
    sym(symbol, t);
    el('div', 'word', t, label);
    return t;
  }

  // MARK: - Rows

  // Each row: its cards (DOM), what OK does with each, and how far down #main slides when it has the focus.
  var rows = [];
  var st = {rail: false, railAt: 0, row: 1, col: [0, 0, 0, 0], all: false, allAt: 0};
  var SLIDE = [0, 0, 230, 560];

  function layStrip(strip, nodes, gap) {
    var x = 0;
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].style.left = x + 'px';
      x += nodes[i].offsetWidth + gap;
    }
  }

  function renderApps() {
    var strip = $('apps').querySelector('.strip');
    strip.innerHTML = '';
    var items = [];
    var allTile = toolTile('apps', 'Apps', strip);
    items.push({node: allTile, ok: openAll});
    var live = toolTile('live_tv', 'TV ao vivo', strip);
    items.push({node: live, ok: function () { launch('source:TV:1'); }});
    for (var i = 0; i < bar.length; i++) {
      (function (app) {
        items.push({node: appTile(app, strip), ok: function () { launch(app.id); }});
      })(bar[i]);
    }
    layStrip(strip, items.map(function (x) { return x.node; }), 10);
    rows[1] = items;
  }

  var sources = [];
  function renderLive() {
    var strip = $('live').querySelector('.strip');
    strip.innerHTML = '';
    var items = [];
    var screen = el('div', 'screen', strip);
    var art = el('div', 'art', screen);
    sym('live_tv', art);
    el('div', 'badge', screen, 'Ao vivo');
    el('div', 'caption', screen, 'TV aberta');
    items.push({node: screen, ok: function () { launch('source:TV:1'); }});
    var shown = {};
    for (var r = 0; r < recent.length; r++) {
      var app = null, src = null;
      for (var a = 0; a < apps.length; a++) if (apps[a].id === recent[r].id) app = apps[a];
      for (var b = 0; b < sources.length; b++) if (sources[b].id === recent[r].id) src = sources[b];
      if (!app && !src) continue;
      shown[recent[r].id] = true;
      (function (it, at) {
        var c = el('div', 'recent', strip);
        var art = el('div', 'face', c);
        if (it.title) face(it, art);
        else { art.style.backgroundColor = '#1A1E27'; sym(it.symbol || 'hdmi', art); }
        el('div', 'caption', c, it.title || it.label || it.key);
        el('div', 'when', c, ago(at));
        items.push({node: c, ok: function () { launch(it.id); }});
      })(app || src, recent[r].at);
    }
    for (var i = 0; i < sources.length; i++) {
      if (shown[sources[i].id]) continue;
      var s = sources[i];
      if (s.key === 'live' || !s.connected) continue;
      (function (src) {
        var c = el('div', 'source', strip);
        sym(src.symbol || 'hdmi', el('div', 'ring', c));
        el('div', 'caption', c, src.label || src.key);
        items.push({node: c, ok: function () { launch(src.id); }});
      })(s);
    }
    var tvPlus = null;
    for (var j = 0; j < apps.length; j++) if (/tv ?plus/i.test(apps[j].title)) tvPlus = apps[j];
    if (tvPlus && !shown[tvPlus.id]) {
      var p = el('div', 'source', strip);
      var pr = el('div', 'ring', p);
      pr.style.backgroundColor = '#101828';
      pr.style.backgroundImage = 'url("icons/tvplus.svg")';
      pr.style.backgroundSize = 'auto 46%';
      pr.style.backgroundPosition = 'center';
      pr.style.backgroundRepeat = 'no-repeat';
      el('div', 'caption', p, 'TV grátis');
      items.push({node: p, ok: function () { launch(tvPlus.id); }});
    }
    layStrip(strip, items.map(function (x) { return x.node; }), 20);
    rows[2] = items;
    placeLive();
  }

  // MARK: - News

  var news = [];
  try { news = JSON.parse(localStorage.getItem(NEWS_KEY)) || []; } catch (e) {}

  function ago(at) {
    var m = Math.max(1, Math.round((Date.now() - at) / 60000));
    if (m < 60) return 'há ' + m + ' min';
    var h = Math.round(m / 60);
    if (h < 24) return 'há ' + h + ' h';
    var d = Math.round(h / 24);
    return d === 1 ? 'ontem' : 'há ' + d + ' dias';
  }

  function tagText(it) {
    return function (tag) { var n = it.getElementsByTagName(tag)[0]; return n ? n.textContent : ''; };
  }

  /** An RSS feed's stories: Google News (the source in <source>, no photo) or G1 (a photo in media:content). */
  function parseNews(xml, fallbackSource) {
    var doc = new DOMParser().parseFromString(xml, 'text/xml');
    var items = doc.getElementsByTagName('item'), out = [];
    for (var i = 0; i < items.length && out.length < 20; i++) {
      var it = items[i];
      var text = tagText(it);
      var source = text('source') || fallbackSource, title = text('title').replace(/^\s+|\s+$/g, '');
      if (source && title.slice(-source.length - 3) === ' - ' + source) title = title.slice(0, -source.length - 3);
      if (/ao vivo: assista/i.test(title)) continue;
      var media = it.getElementsByTagName('media:content')[0];
      out.push({title: title, source: source, link: text('link'), at: Date.parse(text('pubDate')) || 0,
        photo: media ? media.getAttribute('url') : ''});
    }
    return out;
  }

  // The city's own news (Google News) and the region's TV news with photos (G1 Triângulo e Alto Paranaíba).
  var FEEDS = [
    {url: 'https://news.google.com/rss/search?q=' + encodeURIComponent(NEWS_QUERY) + '&hl=pt-BR&gl=BR&ceid=BR:pt-419',
      sample: 'news-sample.xml', source: ''},
    {url: 'https://g1.globo.com/rss/g1/mg/triangulo-mineiro/', sample: 'g1-sample.xml', source: 'g1 Triângulo e Alto Paranaíba'}
  ];

  function key(title) { return title.toLowerCase().replace(/[^a-z0-9à-ú]+/g, ' ').slice(0, 48); }

  function fetchNews() {
    if (!NEWS_QUERY) return;
    var got = [], left = FEEDS.length;
    FEEDS.forEach(function (f) {
      var x = new XMLHttpRequest();
      x.open('GET', TV.name === 'browser' ? f.sample : f.url);
      x.timeout = 15000;
      function done() {
        if (x.status === 200) got = got.concat(parseNews(x.responseText, f.source));
        if (--left) return;
        var seen = {}, list = [];
        got.sort(function (a, b) { return b.at - a.at; });
        for (var i = 0; i < got.length && list.length < 16; i++) {
          var k = key(got[i].title);
          if (seen[k]) continue;
          seen[k] = true;
          list.push(got[i]);
        }
        if (!list.length) return;
        news = list;
        try { localStorage.setItem(NEWS_KEY, JSON.stringify(news)); } catch (e) {}
        renderNews();
        showStory(0);
      }
      x.onload = done;
      x.onerror = x.ontimeout = function () { x = {status: 0}; done(); };
      x.send();
    });
  }

  function openLink(url) {
    try {
      var c = new window.tizen.ApplicationControl('http://tizen.org/appcontrol/operation/view', url, null, null, null);
      window.tizen.application.launchAppControl(c, null, null, function () { toast('Não deu para abrir o navegador'); });
    } catch (e) {
      if (TV.name === 'browser') window.open(url, '_blank');
    }
  }

  function renderNews() {
    var part = $('news'), strip = part.querySelector('.strip');
    part.querySelector('.title').textContent = 'Notícias de ' + (Place.city || 'sua região') + ' e região';
    strip.innerHTML = '';
    var old = part.querySelector('.empty');
    if (old) part.removeChild(old);
    var items = [];
    for (var i = 0; i < news.length; i++) {
      (function (n) {
        var c = el('div', 'story-card' + (n.photo ? '' : ' text'), strip);
        if (n.photo) el('div', 'pic', c).style.backgroundImage = 'url("' + n.photo + '")';
        el('div', 'from', c, n.source + (n.at ? '  ' + ago(n.at) : ''));
        el('div', 'headline', c, n.title);
        items.push({node: c, ok: function () { openLink(n.link); }});
      })(news[i]);
    }
    if (!items.length) el('div', 'empty', part, 'As notícias aparecem aqui assim que a TV se conectar à internet.');
    layStrip(strip, items.map(function (x) { return x.node; }), 20);
    rows[3] = items;
    if (st.row === 3 && !items.length) st.row = 2;
    focus();
  }

  // MARK: - Banner

  var storyAt = 0, storyTimer = null;
  var hero = $('hero');

  function heroStories() {
    var local = new RegExp(NEWS_QUERY.slice(0, 5), 'i');
    var withPhoto = news.filter(function (n) { return n.photo; });
    withPhoto.sort(function (a, b) { return (local.test(b.title) ? 1 : 0) - (local.test(a.title) ? 1 : 0); });
    return (withPhoto.length >= 3 ? withPhoto : news).slice(0, 5);
  }

  function showStory(i) {
    var list = heroStories(), count = list.length;
    var box = hero.querySelector('.story'), dots = hero.querySelector('.dots');
    if (!count) {
      box.querySelector('.kicker').textContent = Place.city || '';
      box.querySelector('.headline').textContent = 'Bem-vindo';
      box.querySelector('.when').textContent = '';
      dots.innerHTML = '';
      return;
    }
    storyAt = (i + count) % count;
    setClass(box, 'out', true);
    setTimeout(function () {
      var n = list[storyAt];
      box.querySelector('.kicker').textContent = n.source;
      box.querySelector('.headline').textContent = n.title;
      box.querySelector('.when').textContent = n.at ? ago(n.at) : '';
      var photo = hero.querySelector('.photo');
      photo.style.backgroundImage = n.photo ? 'url("' + n.photo + '")' : '';
      setClass(hero, 'has-photo', !!n.photo);
      dots.innerHTML = '';
      for (var d = 0; d < count; d++) el('span', 'dot' + (d === storyAt ? ' on' : ''), dots);
      setClass(box, 'out', false);
    }, 220);
    clearTimeout(storyTimer);
    storyTimer = setTimeout(function () { showStory(storyAt + 1); }, 9000);
  }

  function renderWeather() {
    var w = Data.weather, box = hero.querySelector('.weather');
    box.querySelector('.clock').textContent = formatDate('format|h:mm', Date.now()) + '   ' + formatDate('format|EEE, d MMM', Date.now());
    var temp = box.querySelector('.temp');
    temp.innerHTML = '';
    if (!w) { box.querySelector('.cond').textContent = Place.city || ''; return; }
    sym(Data.symbol(w.code, w.isDay), temp);
    el('span', '', temp, Data.degrees(w.temp));
    box.querySelector('.cond').textContent = Place.city + ', ' + Data.condition(w.code, w.isDay).toLowerCase();
    box.querySelector('.range').textContent = Data.degrees(w.max) + ' / ' + Data.degrees(w.min);
  }

  // MARK: - Live picture

  var liveShown = false;

  /** The TV's picture under the first live card: the page leaves #hole clear, the video plane shows through. */
  function placeLive() {
    var card = rows[2] && rows[2][0] && rows[2][0].node;
    var hole = $('hole');
    if (!card) return;
    var strip = card.parentNode;
    var x = 96 + 72 + card.offsetLeft + stripShift(strip);
    var y = 664 + 44 - SLIDE[st.row];
    hole.style.left = (x - 96) + 'px';
    hole.style.top = (y + SLIDE[st.row]) + 'px';
    hole.style.width = '400px';
    hole.style.height = '225px';
    var visible = !document.hidden && !st.all && y > -100 && y + 225 < 1180;
    if (!window.tizen || !window.tizen.tvwindow) return;
    try {
      if (!visible) {
        if (liveShown) window.tizen.tvwindow.hide(function () {}, function () {}, 'MAIN');
        liveShown = false;
        setClass(body, 'playing', false);
        return;
      }
      var r = [Math.round(x * scale) + 'px', Math.round(y * scale) + 'px', Math.round(400 * scale) + 'px', Math.round(225 * scale) + 'px'];
      window.tizen.tvwindow.show(function () { liveShown = true; setClass(body, 'playing', true); },
        function () { setClass(body, 'playing', false); }, r, 'MAIN');
    } catch (e) {
      setClass(body, 'playing', false);
    }
  }

  function stripShift(strip) {
    var m = /translateX\((-?[\d.]+)px\)/.exec(strip.style.transform || strip.style.webkitTransform || '');
    return m ? +m[1] : 0;
  }

  // MARK: - Focus and keys

  var RAIL = [
    {symbol: 'home', label: 'Início', ok: function () { st.rail = false; st.row = 1; st.col[1] = 0; }},
    {symbol: 'live_tv', label: 'TV ao vivo', ok: function () { launch('source:TV:1'); }},
    {symbol: 'apps', label: 'Apps', ok: function () { openAll(); }},
    {symbol: 'settings', label: 'Configurações', ok: function () { TV.settings(); }}
  ];

  function renderRail() {
    var rail = $('rail');
    for (var i = 0; i < RAIL.length; i++) {
      var it = el('div', 'item' + (i === 0 ? ' here' : ''), rail);
      it.style.top = (330 + i * 92) + 'px';
      sym(RAIL[i].symbol, it);
      el('div', 'tip', it, RAIL[i].label);
    }
  }

  function scrollStrip(row) {
    var items = rows[row];
    if (!items || !items.length) return;
    var node = items[st.col[row]].node, strip = node.parentNode;
    var shift = stripShift(strip), room = 1816 - 80 - 80;
    var left = node.offsetLeft + shift, right = left + node.offsetWidth;
    if (right > room) shift -= right - room;
    if (left < 0) shift -= left;
    strip.style.webkitTransform = strip.style.transform = 'translateX(' + shift + 'px)';
  }

  function focus() {
    var r, i;
    var railItems = $('rail').children;
    for (i = 0; i < railItems.length; i++) setClass(railItems[i], 'focus', st.rail && st.railAt === i && !st.all);
    setClass(hero, 'focus', !st.rail && st.row === 0 && !st.all);
    for (r = 1; r < rows.length; r++) {
      var items = rows[r] || [];
      st.col[r] = Math.max(0, Math.min(st.col[r], items.length - 1));
      for (i = 0; i < items.length; i++) setClass(items[i].node, 'focus', !st.rail && !st.all && st.row === r && st.col[r] === i);
      scrollStrip(r);
    }
    var main = $('main');
    main.style.webkitTransform = main.style.transform = 'translateY(' + (-SLIDE[st.row]) + 'px)';
    if (st.all) focusAll();
    placeLive();
  }

  function rowHasItems(r) { return r === 0 ? true : rows[r] && rows[r].length > 0; }

  function move(dx, dy) {
    if (st.all) { moveAll(dx, dy); return; }
    if (st.rail) {
      if (dy) st.railAt = Math.max(0, Math.min(RAIL.length - 1, st.railAt + dy));
      if (dx > 0) st.rail = false;
      focus();
      return;
    }
    if (dx) {
      if (st.row === 0) { if (dx < 0) st.rail = true; else showStory(storyAt + 1); }
      else if (st.col[st.row] + dx < 0) st.rail = true;
      else st.col[st.row] = Math.min(rows[st.row].length - 1, st.col[st.row] + dx);
    }
    if (dy) {
      var next = st.row + dy;
      while (next >= 0 && next < 4 && !rowHasItems(next)) next += dy;
      if (next >= 0 && next < 4) st.row = next;
    }
    focus();
  }

  function activate() {
    if (st.all) { var a = allApps[st.allAt]; if (a) launch(a.id); return; }
    if (st.rail) { RAIL[st.railAt].ok(); focus(); return; }
    if (st.row === 0) { var h = heroStories()[storyAt]; if (h) openLink(h.link); return; }
    var it = rows[st.row][st.col[st.row]];
    if (it) it.ok();
  }

  function back() {
    if (st.all) { closeAll(); return; }
    if (st.rail || st.row !== 1 || st.col[1] !== 0) { st.rail = false; st.row = 1; st.col[1] = 0; focus(); }
  }

  function launch(id) {
    remember(id);
    TV.launch(id, null, function (ok) { if (!ok) toast('Não deu para abrir'); });
  }

  // MARK: - Recently watched: what was opened from here, newest first

  var RECENT_KEY = 'fmtv.recent', recent = [];
  try { recent = JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch (e) {}

  function remember(id) {
    if (id === 'source:TV:1') return;
    recent = recent.filter(function (r) { return r.id !== id; });
    recent.unshift({id: id, at: Date.now()});
    recent = recent.slice(0, 10);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(recent)); } catch (e) {}
  }

  // MARK: - All apps

  var allApps = [], COLS = 6;

  function openAll() {
    allApps = apps.slice();
    var grid = $('all').querySelector('.grid');
    grid.innerHTML = '';
    for (var i = 0; i < allApps.length; i++) {
      var t = appTile(allApps[i], grid);
      t.style.left = (i % COLS) * 260 + 'px';
      t.style.top = Math.floor(i / COLS) * 180 + 'px';
      t.style.position = 'absolute';
    }
    st.all = true;
    st.allAt = 0;
    setClass($('all'), 'open', true);
    focus();
  }

  function closeAll() {
    st.all = false;
    setClass($('all'), 'open', false);
    focus();
  }

  function focusAll() {
    var tiles = $('all').querySelector('.grid').children;
    for (var i = 0; i < tiles.length; i++) setClass(tiles[i], 'focus', i === st.allAt);
    var row = Math.floor(st.allAt / COLS);
    var grid = $('all').querySelector('.grid');
    grid.style.webkitTransform = grid.style.transform = 'translateY(' + (-Math.max(0, row - 3) * 180) + 'px)';
  }

  function moveAll(dx, dy) {
    var n = allApps.length, i = st.allAt + dx + dy * COLS;
    if (i >= 0 && i < n) st.allAt = i;
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

  function loadApps(done) {
    TV.apps(function (list) {
      apps = list.filter(function (a) {
        var id = (a.id || '').toLowerCase(), title = (a.title || '').toLowerCase();
        for (var i = 0; i < HIDE.length; i++) if (id.indexOf(HIDE[i]) >= 0 || title.indexOf(HIDE[i]) >= 0) return false;
        return true;
      });
      Data.setApps(apps);
      pickBar();
      TV.inputs(function (list2) {
        sources = list2;
        renderApps();
        renderLive();
        focus();
        if (done) done();
      });
    });
  }

  if (TV.name === 'tizen') {
    setClass(body, 'tv', true);
    document.documentElement.style.background = 'transparent';
  }
  I18N.set(Prefs.language());
  renderRail();
  rows[3] = [];
  renderNews();
  showStory(0);
  renderWeather();
  fit();
  loadApps(function () { Data.refresh(); fetchNews(); });
  Data.onChange(renderWeather);

  window.addEventListener('resize', fit);
  window.addEventListener('appcontrol', function () { closeAll(); back(); loadApps(); });
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) loadApps(function () { Data.refresh(); });
    placeLive();
  });
  setInterval(function () { renderWeather(); Data.refresh(); }, 30000);
  setInterval(fetchNews, 15 * 60000);

  window.Hub = {state: st, move: move, activate: activate, back: back};
})();
