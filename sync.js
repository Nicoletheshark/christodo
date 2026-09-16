/* Chris Todo - cloud sync.
   Keeps one shared workbook in Supabase, keyed by a sync code.
   Everything still works offline; this just carries changes between devices. */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://oulbptryvpwoazygdwzu.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_CI4GpaH4cgzbZDbyCqN8GA_EMJWvRka';
  var TABLE = 'workbooks';
  var CODE_KEY = 'christodo.synccode';
  var PULL_MS = 8000;

  var api = {
    code: '',
    online: navigator.onLine,
    busy: false,
    lastPulled: '',
    pendingPush: false,
    timer: null,
    debounce: null,
    onRemote: null,
    onStatus: null
  };

  function headers() {
    return {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json'
    };
  }

  function endpoint() {
    return SUPABASE_URL + '/rest/v1/' + TABLE;
  }

  function status(text, kind) {
    if (api.onStatus) api.onStatus(text, kind || 'info');
  }

  function getCode() {
    if (api.code) return api.code;
    try { api.code = localStorage.getItem(CODE_KEY) || ''; } catch (e) { api.code = ''; }
    return api.code;
  }

  function setCode(code) {
    api.code = (code || '').trim();
    try {
      if (api.code) localStorage.setItem(CODE_KEY, api.code);
      else localStorage.removeItem(CODE_KEY);
    } catch (e) { /* ignore */ }
    api.lastPulled = '';
  }

  function enabled() { return !!getCode(); }

  /* ---------- merging ----------
     Tasks are matched on id. Whichever copy was edited most recently wins.
     Deletions are remembered as tombstones so a delete on one phone does not
     come back from the other. */

  function newerOf(a, b) {
    var at = a.updatedAt || a.createdAt || '';
    var bt = b.updatedAt || b.createdAt || '';
    return bt > at ? b : a;
  }

  function mergeTasks(mine, theirs) {
    var byId = {};
    (mine || []).forEach(function (t) { if (t && t.id) byId[t.id] = t; });
    (theirs || []).forEach(function (t) {
      if (!t || !t.id) return;
      byId[t.id] = byId[t.id] ? newerOf(byId[t.id], t) : t;
    });
    return Object.keys(byId).map(function (k) { return byId[k]; });
  }

  function mergeTombstones(mine, theirs) {
    var byId = {};
    (mine || []).concat(theirs || []).forEach(function (d) {
      if (!d || !d.id) return;
      if (!byId[d.id] || (d.at || '') > (byId[d.id].at || '')) byId[d.id] = d;
    });
    return Object.keys(byId).map(function (k) { return byId[k]; });
  }

  function applyTombstones(tasks, tombs) {
    if (!tombs || !tombs.length) return tasks;
    var map = {};
    tombs.forEach(function (d) { map[d.id] = d.at || ''; });
    return tasks.filter(function (t) {
      var killedAt = map[t.id];
      if (!killedAt) return true;
      // a later edit resurrects the task; otherwise it stays deleted
      return (t.updatedAt || t.createdAt || '') > killedAt;
    });
  }

  function mergeById(mine, theirs, keyFn) {
    var seen = {};
    var out = [];
    (mine || []).concat(theirs || []).forEach(function (item) {
      if (!item) return;
      var k = keyFn(item);
      if (!k || seen[k]) return;
      seen[k] = true;
      out.push(item);
    });
    return out;
  }

  function mergeState(local, remote) {
    if (!remote || typeof remote !== 'object') return local;

    var tombs = mergeTombstones(local.deleted, remote.deleted);
    var tasks = applyTombstones(mergeTasks(local.tasks, remote.tasks), tombs);

    local.tasks = tasks;
    local.deleted = tombs;
    local.teams = mergeById(local.teams, remote.teams, function (t) { return t.id || t.name; });
    local.types = mergeById(local.types, remote.types, function (t) { return t; });
    local.contacts = mergeById(local.contacts, remote.contacts, function (c) {
      return (c.name || '') + '|' + (c.email || '');
    });
    return local;
  }

  /* ---------- network ---------- */

  function pull(localState, cb) {
    if (!enabled() || !navigator.onLine) { if (cb) cb(false); return; }
    var url = endpoint() + '?code=eq.' + encodeURIComponent(getCode()) + '&select=data,updated_at';

    fetch(url, { headers: headers() })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (rows) {
        if (!rows || !rows.length) { if (cb) cb(false); return; }
        var row = rows[0];
        if (row.updated_at && row.updated_at === api.lastPulled) { if (cb) cb(false); return; }
        api.lastPulled = row.updated_at || '';
        mergeState(localState, row.data || {});
        if (cb) cb(true);
      })
      .catch(function (e) {
        status('Sync paused - ' + friendly(e), 'warn');
        if (cb) cb(false);
      });
  }

  function pushNow(localState, cb) {
    if (!enabled() || !navigator.onLine) { api.pendingPush = true; if (cb) cb(false); return; }
    api.busy = true;

    var body = JSON.stringify([{
      code: getCode(),
      data: {
        version: localState.version,
        tasks: localState.tasks,
        teams: localState.teams,
        types: localState.types,
        contacts: localState.contacts,
        deleted: localState.deleted || []
      },
      updated_at: new Date().toISOString()
    }]);

    fetch(endpoint() + '?on_conflict=code', {
      method: 'POST',
      headers: Object.assign(headers(), { 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
      body: body
    })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        api.pendingPush = false;
        api.lastPulled = '';
        status('Saved to cloud', 'ok');
        if (cb) cb(true);
      })
      .catch(function (e) {
        api.pendingPush = true;
        status('Will retry - ' + friendly(e), 'warn');
        if (cb) cb(false);
      })
      .then(function () { api.busy = false; });
  }

  function friendly(e) {
    var m = String(e && e.message || e);
    if (m.indexOf('404') !== -1) return 'sync table missing';
    if (m.indexOf('401') !== -1 || m.indexOf('403') !== -1) return 'sync key rejected';
    if (m.indexOf('Failed to fetch') !== -1) return 'no connection';
    return m;
  }

  function push(localState) {
    clearTimeout(api.debounce);
    api.debounce = setTimeout(function () { pushNow(localState); }, 900);
  }

  function start(localState, onRemote, onStatus) {
    api.onRemote = onRemote;
    api.onStatus = onStatus;
    if (!enabled()) return;

    pull(localState, function (changed) {
      if (changed && api.onRemote) api.onRemote();
      pushNow(localState);
    });

    clearTimeout(api.timer);
    api.timer = setInterval(function () {
      if (api.busy) return;
      if (api.pendingPush) { pushNow(localState); return; }
      pull(localState, function (changed) {
        if (changed && api.onRemote) api.onRemote();
      });
    }, PULL_MS);

    window.addEventListener('online', function () {
      status('Back online', 'ok');
      if (api.pendingPush) pushNow(localState);
    });
    window.addEventListener('offline', function () { status('Offline - saved on this device', 'warn'); });
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && enabled()) {
        pull(localState, function (changed) { if (changed && api.onRemote) api.onRemote(); });
      }
    });
  }

  function stop() {
    clearTimeout(api.timer);
    clearInterval(api.timer);
    api.timer = null;
  }

  function makeCode() {
    var words = ['red', 'blue', 'gold', 'ivy', 'oak', 'fox', 'wren', 'jet', 'sky', 'reef'];
    return words[Math.floor(Math.random() * words.length)] + '-' +
      words[Math.floor(Math.random() * words.length)] + '-' +
      Math.floor(1000 + Math.random() * 9000);
  }

  window.ChrisSync = {
    enabled: enabled,
    getCode: getCode,
    setCode: setCode,
    makeCode: makeCode,
    start: start,
    stop: stop,
    push: push,
    pushNow: pushNow,
    pull: pull
  };
})();
