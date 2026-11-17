/* Miiverse Archive — modern viewer
 * Reads the original archive data files (assets/user/js/*) and renders them.
 * No libraries, no build step. Works from file:// and any static host.
 */
(function () {
  'use strict';

  var DATA = './assets/user/js/';
  var IMG = './assets/user/img/';
  var PAGE_SIZE = 30;

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var MONTHS_SHORT = MONTHS.map(function (m) { return m.slice(0, 3); });

  var TYPES = [
    { id: 'all', label: 'All', test: function () { return true; } },
    { id: 'journal', label: 'Play journal', test: function (p) { return p.subtype === 'Play Journal Entries'; } },
    { id: 'ingame', label: 'In-game', test: function (p) { return p.subtype === 'In-Game'; } },
    { id: 'discussion', label: 'Discussions', test: function (p) { return p.subtype === 'Discussions'; } },
    { id: 'drawing', label: 'Drawings', test: function (p) { return !!p.pa; } },
    { id: 'video', label: 'Videos', test: function (p) { return !!p.yt; } },
    { id: 'shot', label: 'Screenshots', test: function (p) { return !!p.ss; } }
  ];

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    list: $('list'), more: $('more'), moreBtn: $('more-btn'),
    title: $('result-title'), count: $('result-count'),
    q: $('q'), game: $('game'), sort: $('sort'),
    typeChips: $('type-chips'), yearChips: $('year-chips'),
    rail: $('rail'), railToggle: $('rail-toggle'), filterCount: $('filter-count'),
    content: $('feed'), reset: $('reset')
  };

  var state = { view: 'posts', q: '', type: 'all', year: '', month: '', game: '', sort: 'new', shown: PAGE_SIZE };
  var user, titles, communities, albums;
  var posts = [];
  var filtered = [];
  var lb = { items: [], i: 0, opener: null };

  /* ---------- Helpers ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function num(n) { return Number(n) || 0; }
  function fmt(n) { return num(n).toLocaleString('en-US'); }
  function plural(n, one, many) { return fmt(n) + ' ' + (n === 1 ? one : many); }

  // "11/07/2017 6:41 PM" (optionally prefixed, e.g. "Save to ...") -> Date
  function parseDate(s) {
    var m = /(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(s || '');
    if (!m) return new Date(0);
    var h = (+m[4]) % 12 + (m[6].toUpperCase() === 'PM' ? 12 : 0);
    return new Date(+m[3], +m[1] - 1, +m[2], h, +m[5]);
  }
  function niceDate(d) {
    return MONTHS_SHORT[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear() + ' at ' +
      ((d.getHours() % 12) || 12) + ':' + ('0' + d.getMinutes()).slice(-2) + ' ' + (d.getHours() >= 12 ? 'PM' : 'AM');
  }
  function ymKey(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2); }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('Could not load ' + src)); };
      document.head.appendChild(s);
    });
  }
  // The archive files declare globals with `var`, so read them off window.
  function global(name) { return window[name]; }

  var ICON = {
    yeah: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.3C.9 8.3 2.8 5 6 5c2 0 3.4 1 4.3 2.4.4.6 1.1.6 1.4 0C12.6 6 14 5 16 5c3.2 0 5.1 3.3 3.6 6.7C19.5 16.4 12 21 12 21z"/></svg>',
    reply: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.7 7.1L3 20.5l1.5-4.9A8 8 0 1 1 21 12z"/></svg>',
    played: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="7" width="20" height="11" rx="5"/><path d="M7 10v5M4.5 12.5h5M16 11h.01M18 14h.01"/></svg>',
    zoom: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>',
    play: '<svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>'
  };

  /* ---------- Data ---------- */
  function gameOf(p) {
    if (p.title && titles[p.title]) return { key: 't' + p.title, name: titles[p.title].name, icon: p.title };
    if (p.community && communities[p.community]) {
      var c = communities[p.community];
      return { key: 'c' + p.community, name: c.name.replace(/\s+Community$/, ''), icon: c.icon || p.community };
    }
    return null;
  }

  function prepare(list, yearTag) {
    list.forEach(function (p, i) {
      p._date = parseDate(p.created_at);
      p._game = gameOf(p);
      p._yeah = num(p.empathy_count);
      p._reply = num(p.reply_count);
      p._uid = yearTag + '-' + i;
      var hay = [p.body, p.topic_post_title, p.topic_post_body, p.topic_tag, p.topic_category, p._game && p._game.name, p.spoiler];
      p._hay = hay.filter(Boolean).join(' ').toLowerCase();
      posts.push(p);
    });
  }

  function init() {
    user = global('userContent');
    titles = global('titles');
    communities = global('communities');
    albums = global('albumImages') || [];
    var index = global('post_index') || [];

    return index.reduce(function (chain, entry) {
      return chain.then(function () {
        var file = entry.file_name.replace('./assets/user/js/', DATA);
        return loadScript(file).then(function () {
          prepare(global(entry.var_name) || [], entry.var_name);
        });
      });
    }, Promise.resolve());
  }

  /* ---------- Hero ---------- */
  function renderHero() {
    $('hero-name').textContent = user.screen_name;
    $('hero-handle').textContent = '@' + user.user_id;
    $('hero-bio').textContent = user.profile_comment || '';
    if (user.cover_img) $('hero-cover').style.backgroundImage = 'url("' + IMG + user.cover_img + '")';

    var facts = [];
    if (user.country) facts.push('<li>' + esc(user.country_label) + ' <b>' + esc(user.country) + '</b></li>');
    if (user.birthday) facts.push('<li>' + esc(user.birthday_label) + ' <b>' + esc(user.birthday) + '</b></li>');
    if (user.skill) facts.push('<li>' + esc(user.game_skill_label) + ' <b>' + esc(user.skill) + '</b></li>');
    var dev = '';
    if (user.is_active_in_wiiu) dev += '<img src="./assets/common/img/wiiu.png" alt="Wii U">';
    if (user.is_active_in_n3ds) dev += '<img src="./assets/common/img/n3ds.png" alt="Nintendo 3DS">';
    if (dev) facts.push('<li>' + esc(user.owned_game_device_label) + ' ' + dev + '</li>');
    (user.favorite_game_genres || []).forEach(function (g) { facts.push('<li><b>' + esc(g.genre) + '</b></li>'); });
    $('hero-facts').innerHTML = facts.join('');

    var years = posts.map(function (p) { return p._date.getFullYear(); });
    var first = Math.min.apply(null, years), last = Math.max.apply(null, years);
    var yeahs = posts.reduce(function (a, p) { return a + p._yeah; }, 0);
    var shots = albums.reduce(function (a, g) { return a + g.album.length; }, 0);
    var stats = [
      ['Posts', fmt(posts.length), ''],
      ['Yeahs received', fmt(yeahs), 'yeah'],
      ['Saved screenshots', fmt(shots || user.album_images_count), ''],
      ['Active from', first + ' to 2017', '']
    ];
    // The 2022 post is a one-off, so the active range ends with the service itself.
    if (last <= 2017) stats[3][1] = first + ' to ' + last;
    $('stats').innerHTML = stats.map(function (s) {
      return '<div class="stat ' + s[2] + '"><dt>' + s[0] + '</dt><dd>' + s[1] + '</dd></div>';
    }).join('');
  }

  /* ---------- Activity ribbon ---------- */
  function renderRibbon() {
    var counts = {}, max = 1, years = {};
    posts.forEach(function (p) {
      var k = ymKey(p._date);
      counts[k] = (counts[k] || 0) + 1;
      years[p._date.getFullYear()] = (years[p._date.getFullYear()] || 0) + 1;
    });
    Object.keys(counts).forEach(function (k) { max = Math.max(max, counts[k]); });
    var ys = Object.keys(years).map(Number).sort();
    var out = '';
    ys.forEach(function (y) {
      var bars = '';
      for (var m = 0; m < 12; m++) {
        var k = y + '-' + ('0' + (m + 1)).slice(-2), n = counts[k] || 0;
        var h = n ? Math.max(8, Math.round(n / max * 100)) : 0;
        var label = MONTHS[m] + ' ' + y + ': ' + plural(n, 'post', 'posts');
        bars += '<button class="bar" type="button" data-n="' + n + '" data-ym="' + k + '" aria-pressed="false" aria-label="' + label + '" title="' + label + '"' +
          (n ? '' : ' tabindex="-1" aria-disabled="true"') + '><i style="height:' + (n ? h + '%' : '') + '"></i></button>';
      }
      out += '<div class="ribbon-year"><div class="ribbon-bars">' + bars + '</div>' +
        '<div class="ribbon-label"><button type="button" data-year="' + y + '" aria-pressed="false">' + y + '</button><span>' + fmt(years[y]) + '</span></div></div>';
    });
    $('ribbon-grid').innerHTML = out;
  }

  function syncRibbon() {
    document.querySelectorAll('.bar').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.ym === state.month));
    });
    document.querySelectorAll('.ribbon-label button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.year === state.year && !state.month));
    });
  }

  /* ---------- Filters ---------- */
  function renderFilters() {
    var typeCounts = {};
    TYPES.forEach(function (t) { typeCounts[t.id] = posts.filter(t.test).length; });
    el.typeChips.innerHTML = TYPES.map(function (t) {
      return '<button class="chip" type="button" data-type="' + t.id + '" aria-pressed="false">' + t.label + ' <small>' + fmt(typeCounts[t.id]) + '</small></button>';
    }).join('');

    var years = {};
    posts.forEach(function (p) { var y = p._date.getFullYear(); years[y] = (years[y] || 0) + 1; });
    var yh = '<button class="chip" type="button" data-yearchip="" aria-pressed="false">All years</button>';
    Object.keys(years).sort().reverse().forEach(function (y) {
      yh += '<button class="chip" type="button" data-yearchip="' + y + '" aria-pressed="false">' + y + ' <small>' + fmt(years[y]) + '</small></button>';
    });
    el.yearChips.innerHTML = yh;

    var games = {};
    posts.forEach(function (p) {
      if (!p._game) return;
      var g = games[p._game.key] || (games[p._game.key] = { name: p._game.name, n: 0 });
      g.n++;
    });
    var opts = '<option value="">All games and communities</option>';
    Object.keys(games).sort(function (a, b) { return games[b].n - games[a].n || games[a].name.localeCompare(games[b].name); })
      .forEach(function (k) { opts += '<option value="' + esc(k) + '">' + esc(games[k].name) + ' (' + games[k].n + ')</option>'; });
    el.game.innerHTML = opts;
  }

  function syncControls() {
    el.q.value = state.q;
    el.sort.value = state.sort;
    el.game.value = state.game;
    document.querySelectorAll('[data-type]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.type === state.type)); });
    document.querySelectorAll('[data-yearchip]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.yearchip === state.year)); });
    document.querySelectorAll('[data-view]').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.view === state.view)); });
    el.rail.dataset.view = state.view;
    el.content.dataset.view = state.view;
    syncRibbon();
    // The album only uses the search box, so the post filters don't count there.
    var inPosts = state.view === 'posts';
    var active = (state.q ? 1 : 0) +
      (inPosts ? (state.type !== 'all' ? 1 : 0) + (state.year ? 1 : 0) + (state.month ? 1 : 0) + (state.game ? 1 : 0) : 0);
    el.filterCount.hidden = !active;
    el.filterCount.textContent = active;
    el.reset.hidden = !active;
  }

  function apply() {
    var typeTest = TYPES.filter(function (t) { return t.id === state.type; })[0].test;
    var q = state.q.trim().toLowerCase();
    var terms = q ? q.split(/\s+/) : [];
    filtered = posts.filter(function (p) {
      if (!typeTest(p)) return false;
      if (state.month && ymKey(p._date) !== state.month) return false;
      if (state.year && String(p._date.getFullYear()) !== state.year) return false;
      if (state.game && (!p._game || p._game.key !== state.game)) return false;
      for (var i = 0; i < terms.length; i++) if (p._hay.indexOf(terms[i]) === -1) return false;
      return true;
    });
    var s = state.sort;
    filtered.sort(function (a, b) {
      if (s === 'old') return a._date - b._date;
      if (s === 'yeah') return b._yeah - a._yeah || b._date - a._date;
      if (s === 'reply') return b._reply - a._reply || b._date - a._date;
      return b._date - a._date;
    });
  }

  /* ---------- Posts ---------- */
  function tagsFor(p) {
    var t = [];
    if (p.subtype === 'Play Journal Entries') t.push('<span class="tag journal">Play journal</span>');
    else if (p.subtype === 'Discussions') t.push('<span class="tag discussion">Discussion</span>');
    else if (p.subtype === 'In-Game') t.push('<span class="tag">In-game</span>');
    if (p.pa) t.push('<span class="tag">Drawing</span>');
    if (p.topic_category) t.push('<span class="tag">' + esc(p.topic_category) + '</span>');
    if (p.topic_tag) t.push('<span class="tag">' + esc(p.topic_tag) + '</span>');
    if (p.spoiler) t.push('<span class="tag spoiler">Spoilers</span>');
    return t.join('');
  }

  function ssName(p) { return p.aid || (p.karaoke ? 'karaoke' : p.id); }

  function postHtml(p, mediaIdx) {
    var g = p._game;
    var game = g
      ? '<div class="post-game"><img src="' + IMG + 'icon/' + esc(g.icon) + '.png" alt="" loading="lazy" onerror="this.style.display=\'none\'">' +
        '<button type="button" data-game="' + esc(g.key) + '" title="Show only posts from ' + esc(g.name) + '">' + esc(g.name) + '</button></div>'
      : '<div class="post-game"><button type="button" disabled>' + esc(user.screen_name) + '</button></div>';

    var inner = '';
    if (p.topic_category) {
      inner += '<h3 class="post-title">' + esc(p.topic_post_title) + '</h3><p class="post-body">' + esc(p.topic_post_body) + '</p>';
    } else if (p.body) {
      inner += '<p class="post-body">' + esc(p.body) + '</p>';
    }
    if (p.ss) {
      inner += '<button class="media" type="button" data-lb="' + mediaIdx + '" aria-label="View screenshot full size">' +
        '<img src="' + IMG + 'ss/' + esc(ssName(p)) + '.jpg" alt="Screenshot attached to this post" loading="lazy"><span class="zoom">' + ICON.zoom + '</span></button>';
    }
    if (p.pa) {
      inner += '<button class="media drawing" type="button" data-lb="' + mediaIdx + '" aria-label="View drawing full size">' +
        '<img src="' + IMG + 'pa/' + esc(p.id) + '.png" alt="Hand-drawn picture attached to this post" loading="lazy"><span class="zoom">' + ICON.zoom + '</span></button>';
    }
    if (p.yt) {
      inner += '<a class="media video" href="https://www.youtube.com/watch?v=' + esc(p.yt) + '" target="_blank" rel="noopener noreferrer" aria-label="Watch on YouTube (opens in a new tab)">' +
        '<img src="https://i.ytimg.com/vi/' + esc(p.yt) + '/hqdefault.jpg" alt="" loading="lazy" onerror="this.closest(\'.video\').classList.add(\'gone\');this.style.display=\'none\'">' +
        '<span class="play"><span>' + ICON.play + '</span></span><span class="out">Watch on YouTube</span></a>';
    }

    var body = p.spoiler
      ? '<div class="spoiler-wrap covered">' + inner + '<div class="spoiler-cover"><button type="button" data-reveal>Show spoiler</button></div></div>'
      : inner;

    return '<article class="post">' +
      '<header class="post-head"><img class="mii" src="' + IMG + 'mii/' + esc(p.mii || 'normal') + '.png" alt="" width="44" height="44">' +
      '<div class="post-who">' + game + '<div class="post-date">' + niceDate(p._date) + '</div></div>' +
      '<div class="tags">' + tagsFor(p) + '</div></header>' + body +
      '<footer class="post-foot">' +
      '<span class="count yeah" title="Yeahs">' + ICON.yeah + '<span>' + fmt(p._yeah) + '<span class="sr"> Yeahs</span></span></span>' +
      '<span class="count" title="Replies">' + ICON.reply + '<span>' + fmt(p._reply) + '</span></span>' +
      (p.is_played ? '<span class="count" title="Played the game">' + ICON.played + '<span>Played</span></span>' : '') +
      '</footer></article>';
  }

  function buildLightboxItems() {
    lb.items = [];
    filtered.forEach(function (p) {
      var cap = '<b>' + esc(p._game ? p._game.name : user.screen_name) + '</b> · ' + niceDate(p._date) + (p.body ? '<br>' + esc(p.body) : '');
      if (p.ss) { p._media = lb.items.length; lb.items.push({ src: IMG + 'ss/' + ssName(p) + '.jpg', cap: cap }); }
      else if (p.pa) { p._media = lb.items.length; lb.items.push({ src: IMG + 'pa/' + p.id + '.png', cap: cap }); }
      else p._media = -1;
    });
  }

  function titleText() {
    var bits = [];
    var t = TYPES.filter(function (x) { return x.id === state.type; })[0];
    bits.push(state.type === 'all' ? 'All posts' : t.label);
    if (state.month) { var parts = state.month.split('-'); bits.push(MONTHS[+parts[1] - 1] + ' ' + parts[0]); }
    else if (state.year) bits.push(state.year);
    if (state.game) { var g = posts.filter(function (p) { return p._game && p._game.key === state.game; })[0]; if (g) bits.push(g._game.name); }
    return bits.join(' · ');
  }

  function renderPosts() {
    apply();
    buildLightboxItems();
    el.title.textContent = titleText();
    el.count.textContent = plural(filtered.length, 'post', 'posts') + (state.q ? ' matching “' + state.q.trim() + '”' : '');

    if (!filtered.length) {
      el.list.innerHTML = '<div class="empty"><h3>No posts match these filters</h3><p>Try a different word, or clear the filters to see everything.</p><button type="button" data-clear>Clear filters</button></div>';
      el.more.hidden = true;
      return;
    }

    var html = '', lastKey = '', byDate = state.sort === 'new' || state.sort === 'old';
    filtered.slice(0, state.shown).forEach(function (p) {
      if (byDate) {
        var key = ymKey(p._date);
        if (key !== lastKey) { html += '<h3 class="month">' + MONTHS[p._date.getMonth()] + ' ' + p._date.getFullYear() + '</h3>'; lastKey = key; }
      }
      html += postHtml(p, p._media);
    });
    el.list.innerHTML = html;
    el.more.hidden = filtered.length <= state.shown;
    el.moreBtn.textContent = 'Show ' + Math.min(PAGE_SIZE, filtered.length - state.shown) + ' more posts';
  }

  /* ---------- Album ---------- */
  function renderAlbum() {
    var q = state.q.trim().toLowerCase();
    lb.items = [];
    var total = 0, html = '';
    albums.forEach(function (g) {
      if (q && g.name.toLowerCase().indexOf(q) === -1) return;
      var shots = g.album.slice().sort(function (a, b) { return parseDate(b.created_at) - parseDate(a.created_at); });
      total += shots.length;
      html += '<section class="album-group"><div class="album-title"><img src="' + IMG + 'icon/' + esc(g.id) + '.png" alt="" onerror="this.style.display=\'none\'">' +
        '<div><h3>' + esc(g.name) + '</h3><p>' + plural(shots.length, 'screenshot', 'screenshots') + '</p></div></div><div class="shots">';
      shots.forEach(function (s) {
        var d = parseDate(s.created_at), idx = lb.items.length;
        lb.items.push({ src: IMG + 'ss/' + s.ss + '.jpg', cap: '<b>' + esc(g.name) + '</b> · ' + niceDate(d) });
        html += '<button class="shot" type="button" data-lb="' + idx + '" aria-label="' + esc(g.name) + ', ' + niceDate(d) + '">' +
          '<img src="' + IMG + 'ss/' + s.ss + '.jpg" alt="" loading="lazy"><span>' + MONTHS_SHORT[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear() + '</span></button>';
      });
      html += '</div></section>';
    });
    el.title.textContent = 'Screenshot album';
    el.count.textContent = plural(total, 'screenshot', 'screenshots') + ' across ' + plural(albums.length, 'game', 'games');
    el.list.innerHTML = html || '<div class="empty"><h3>No screenshots match</h3><p>Try a game title like “Zelda” or clear the search box.</p><button type="button" data-clear>Clear search</button></div>';
    el.more.hidden = true;
  }

  /* ---------- Render + URL state ---------- */
  function render(keepScroll) {
    syncControls();
    if (state.view === 'album') renderAlbum(); else renderPosts();
    writeHash();
    if (!keepScroll) window.scrollTo({ top: Math.max(0, document.querySelector('.layout').offsetTop - 70), behavior: 'auto' });
  }

  function writeHash() {
    var p = new URLSearchParams();
    if (state.view !== 'posts') p.set('view', state.view);
    if (state.q) p.set('q', state.q);
    if (state.type !== 'all') p.set('type', state.type);
    if (state.year) p.set('year', state.year);
    if (state.month) p.set('month', state.month);
    if (state.game) p.set('game', state.game);
    if (state.sort !== 'new') p.set('sort', state.sort);
    var h = p.toString();
    history.replaceState(null, '', h ? '#' + h : location.pathname + location.search);
  }

  function readHash() {
    var p = new URLSearchParams(location.hash.replace(/^#/, ''));
    state.view = p.get('view') === 'album' ? 'album' : 'posts';
    state.q = p.get('q') || '';
    state.type = TYPES.some(function (t) { return t.id === p.get('type'); }) ? p.get('type') : 'all';
    state.year = /^\d{4}$/.test(p.get('year') || '') ? p.get('year') : '';
    state.month = /^\d{4}-\d{2}$/.test(p.get('month') || '') ? p.get('month') : '';
    state.game = p.get('game') || '';
    state.sort = ['new', 'old', 'yeah', 'reply'].indexOf(p.get('sort')) > -1 ? p.get('sort') : 'new';
    state.shown = PAGE_SIZE;
  }

  function change(patch, opts) {
    Object.keys(patch).forEach(function (k) { state[k] = patch[k]; });
    state.shown = PAGE_SIZE;
    render(opts && opts.keepScroll);
  }

  function clearAll() {
    change({ q: '', type: 'all', year: '', month: '', game: '' }, { keepScroll: true });
  }

  /* ---------- Lightbox ---------- */
  function lbShow(i) {
    if (!lb.items.length) return;
    lb.i = (i + lb.items.length) % lb.items.length;
    var it = lb.items[lb.i];
    $('lb-img').src = it.src;
    $('lb-img').alt = it.cap.replace(/<[^>]+>/g, ' ');
    $('lb-cap').innerHTML = it.cap + '<br><small>' + (lb.i + 1) + ' of ' + lb.items.length + '</small>';
    var one = lb.items.length < 2;
    $('lb-prev').hidden = one;
    $('lb-next').hidden = one;
  }
  function lbOpen(i, opener) {
    lb.opener = opener || null;
    $('lightbox').hidden = false;
    document.body.style.overflow = 'hidden';
    lbShow(i);
    $('lb-close').focus();
  }
  function lbClose() {
    $('lightbox').hidden = true;
    document.body.style.overflow = '';
    $('lb-img').removeAttribute('src');
    if (lb.opener && document.contains(lb.opener)) lb.opener.focus();
  }

  /* ---------- Events ---------- */
  function bind() {
    var timer;
    el.q.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () { change({ q: el.q.value }, { keepScroll: true }); }, 180);
    });
    el.sort.addEventListener('change', function () { change({ sort: el.sort.value }, { keepScroll: true }); });
    el.game.addEventListener('change', function () { change({ game: el.game.value }, { keepScroll: true }); });
    el.reset.addEventListener('click', clearAll);
    el.moreBtn.addEventListener('click', function () { state.shown += PAGE_SIZE; renderPosts(); });

    el.railToggle.addEventListener('click', function () {
      var open = !el.rail.classList.contains('open');
      el.rail.classList.toggle('open', open);
      el.railToggle.setAttribute('aria-expanded', String(open));
    });

    el.rail.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.view) change({ view: b.dataset.view });
      else if (b.dataset.type) change({ type: b.dataset.type }, { keepScroll: true });
      else if (b.hasAttribute('data-yearchip')) change({ year: b.dataset.yearchip, month: '' }, { keepScroll: true });
    });

    $('ribbon').addEventListener('click', function (e) {
      var bar = e.target.closest('.bar'), yr = e.target.closest('[data-year]');
      if (bar && bar.dataset.n !== '0') {
        var on = state.month === bar.dataset.ym;
        change({ view: 'posts', month: on ? '' : bar.dataset.ym, year: on ? '' : bar.dataset.ym.slice(0, 4) });
      } else if (yr) {
        var same = state.year === yr.dataset.year && !state.month;
        change({ view: 'posts', year: same ? '' : yr.dataset.year, month: '' });
      }
    });

    el.content.addEventListener('click', function (e) {
      var t = e.target.closest('button, a');
      if (!t) return;
      if (t.dataset.lb != null) lbOpen(+t.dataset.lb, t);
      else if (t.dataset.game) change({ game: t.dataset.game }, { keepScroll: true });
      else if (t.hasAttribute('data-reveal')) t.closest('.spoiler-wrap').classList.remove('covered');
      else if (t.hasAttribute('data-clear')) clearAll();
    });

    $('lb-close').addEventListener('click', lbClose);
    $('lb-prev').addEventListener('click', function () { lbShow(lb.i - 1); });
    $('lb-next').addEventListener('click', function () { lbShow(lb.i + 1); });
    $('lightbox').addEventListener('click', function (e) { if (e.target === this || e.target.classList.contains('lb-figure')) lbClose(); });
    document.addEventListener('keydown', function (e) {
      if ($('lightbox').hidden) return;
      if (e.key === 'Escape') lbClose();
      else if (e.key === 'ArrowLeft') lbShow(lb.i - 1);
      else if (e.key === 'ArrowRight') lbShow(lb.i + 1);
    });

    $('theme-toggle').addEventListener('click', function () {
      var root = document.documentElement;
      var dark = root.getAttribute('data-theme') === 'dark' ||
        (!root.getAttribute('data-theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
      var next = dark ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('mv-theme', next); } catch (err) {}
    });

    window.addEventListener('hashchange', function () { readHash(); render(true); });
  }

  /* ---------- Start ---------- */
  var base = ['user.js', 'title.js', 'community.js', 'album_images.js', 'post_index.js'];
  base.reduce(function (chain, f) {
    return chain.then(function () { return loadScript(DATA + f); });
  }, Promise.resolve())
    .then(init)
    .then(function () {
      renderHero();
      renderRibbon();
      renderFilters();
      readHash();
      bind();
      render(true);
    })
    .catch(function (err) {
      el.list.innerHTML = '<div class="empty"><h3>The archive could not be loaded</h3><p>' + esc(err.message) +
        '. Check that the assets folder sits next to index.html, then reload the page.</p></div>';
    });
})();
