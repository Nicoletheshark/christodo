/* Chris Todo - a simple task workbook. No server, no login. */
(function () {
  'use strict';

  var KEY = 'christodo.v1';
  var state = {
    version: 1,
    tasks: [],
    teams: [],
    types: [],
    contacts: [],
    deleted: [],
    settings: { chaseAfterDays: 7 }
  };

  var ui = {
    tab: 'active',
    editingId: null,
    pendingParentId: null,
    assignTargetId: null,
    recog: null
  };

  /* ---------- helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function uid() { return 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function todayISO() { return new Date().toISOString().slice(0, 10); }

  function addDays(iso, n) {
    var d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function daysUntil(iso) {
    if (!iso) return null;
    var a = new Date(todayISO() + 'T00:00:00').getTime();
    var b = new Date(iso + 'T00:00:00').getTime();
    return Math.round((b - a) / 86400000);
  }

  function prettyDate(iso) {
    if (!iso) return '';
    var d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return '';
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
  }

  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.hidden = true; }, 2600);
  }

  function teamName(id) {
    for (var i = 0; i < state.teams.length; i++) {
      if (state.teams[i].id === id) return state.teams[i].name;
    }
    return '';
  }

  /* ---------- alarms ---------- */
  var ALARM_LEADS = [0, 1, 7, 30, 90, 180, 365];

  function remindersOf(t) {
    if (!t) return [];
    if (Array.isArray(t.reminders)) return t.reminders.slice().sort(function (a, b) { return a - b; });
    if (t.reminder != null && t.reminder !== '') return [parseInt(t.reminder, 10)];
    return [];
  }

  function readAlarmBoxes() {
    var out = [];
    document.querySelectorAll('.alarm-box').forEach(function (b) {
      if (b.checked) out.push(parseInt(b.value, 10));
    });
    return out.sort(function (a, b) { return a - b; });
  }

  function setAlarmBoxes(list) {
    var on = {};
    (list || []).forEach(function (n) { on[n] = true; });
    document.querySelectorAll('.alarm-box').forEach(function (b) {
      b.checked = !!on[parseInt(b.value, 10)];
    });
  }

  function alarmLabel(n) {
    if (n === 0) return 'on the day';
    if (n === 1) return '1 day before';
    if (n === 7) return '1 week before';
    if (n === 30) return '1 month before';
    if (n === 90) return '3 months before';
    if (n === 180) return '6 months before';
    if (n === 365) return '1 year before';
    return n + ' days before';
  }

  /* ---------- storage ---------- */
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      toast('Could not save. Storage may be full.');
    }
    if (window.ChrisSync && ChrisSync.enabled()) ChrisSync.push(state);
  }

  function stamp(t) {
    if (t) t.updatedAt = new Date().toISOString();
    return t;
  }

  function tombstone(id) {
    state.deleted = state.deleted || [];
    state.deleted.push({ id: id, at: new Date().toISOString() });
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return false;
      var parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.tasks)) return false;
      state.tasks = parsed.tasks;
      state.teams = Array.isArray(parsed.teams) ? parsed.teams : [];
      state.types = Array.isArray(parsed.types) ? parsed.types : [];
      state.contacts = Array.isArray(parsed.contacts) ? parsed.contacts : [];
      state.deleted = Array.isArray(parsed.deleted) ? parsed.deleted : [];
      state.settings = parsed.settings || { chaseAfterDays: 7 };
      if (!state.settings.chaseAfterDays) state.settings.chaseAfterDays = 7;
      return state.teams.length > 0;
    } catch (e) {
      return false;
    }
  }

  function seedTeams() {
    return fetch('teams.json')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!state.teams.length) state.teams = data.teams || [];
        if (!state.types.length) state.types = data.types || [];
        save();
      })
      .catch(function () {
        if (!state.teams.length) state.teams = [{ id: 'other', name: 'Other', people: [] }];
        if (!state.types.length) state.types = ['Project', 'Review', 'Meeting', 'Admin', 'Other'];
      });
  }

  /* ---------- people & contacts ---------- */
  function allPeople() {
    var names = {};
    state.teams.forEach(function (t) {
      (t.people || []).forEach(function (p) { if (p && p.name) names[p.name] = true; });
      if (t.leadName) names[t.leadName] = true;
    });
    state.tasks.forEach(function (t) {
      if (t.ownerName) names[t.ownerName] = true;
      if (t.assignedTo) names[t.assignedTo] = true;
    });
    state.contacts.forEach(function (c) { if (c.name) names[c.name] = true; });
    return Object.keys(names).sort();
  }

  function emailsForTeam(teamId) {
    var out = [];
    state.teams.forEach(function (t) {
      if (teamId && t.id !== teamId) return;
      if (t.leadEmail) out.push(t.leadEmail);
      (t.people || []).forEach(function (p) { if (p.email) out.push(p.email); });
    });
    state.contacts.forEach(function (c) { if (c.email) out.push(c.email); });
    state.tasks.forEach(function (t) { if (t.contactEmail) out.push(t.contactEmail); });
    return out.filter(function (v, i, a) { return v && a.indexOf(v) === i; }).sort();
  }

  function rememberContact(name, email) {
    if (!name && !email) return;
    var found = state.contacts.some(function (c) {
      return c.name === name && c.email === email;
    });
    if (!found) state.contacts.push({ name: name || '', email: email || '' });
  }

  function isKnownPerson(name) {
    if (!name) return true;
    return allPeople().indexOf(name) !== -1;
  }

  /* ---------- rendering ---------- */
  function statusOf(t) { return t.status || 'active'; }

  function matchesSearch(t, q) {
    if (!q) return true;
    var hay = [t.title, t.notes, t.ownerName, t.contactEmail, t.type, teamName(t.teamId), t.assignedTo]
      .join(' ').toLowerCase();
    return hay.indexOf(q) !== -1;
  }

  function passesFilters(t) {
    var q = $('search').value.trim().toLowerCase();
    var ft = $('filterTeam').value;
    var fp = $('filterPerson').value;
    if (ft && t.teamId !== ft) return false;
    if (fp && t.ownerName !== fp && t.assignedTo !== fp) return false;
    return matchesSearch(t, q);
  }

  function sortTasks(list) {
    var by = $('sortBy').value;
    var far = '9999-12-31';
    return list.slice().sort(function (a, b) {
      if (by === 'deadline') return (a.deadline || far).localeCompare(b.deadline || far);
      if (by === 'team') return teamName(a.teamId).localeCompare(teamName(b.teamId));
      if (by === 'person') return (a.ownerName || a.assignedTo || '~').localeCompare(b.ownerName || b.assignedTo || '~');
      if (by === 'type') return (a.type || '~').localeCompare(b.type || '~');
      if (by === 'created') return (b.createdAt || '').localeCompare(a.createdAt || '');
      return (a.title || '').localeCompare(b.title || '');
    });
  }

  function childrenOf(id) {
    return state.tasks.filter(function (t) { return t.parentId === id; });
  }

  function makeCell(cls, text) {
    var s = document.createElement('span');
    s.className = cls;
    s.textContent = text || '';
    return s;
  }

  function buildRow(t, isSub) {
    var row = document.createElement('div');
    row.className = 'row' + (isSub ? ' is-sub' : '');
    row.setAttribute('data-id', t.id);

    var d = daysUntil(t.deadline);
    var live = statusOf(t) === 'active' || statusOf(t) === 'assigned';
    if (live && d !== null) {
      if (d < 0) row.classList.add('overdue');
      else if (d <= 3) row.classList.add('due-soon');
    }
    if (statusOf(t) === 'done') row.classList.add('is-done');

    var title = document.createElement('span');
    title.className = 'r-title';
    title.textContent = t.title;

    var kids = childrenOf(t.id);
    var bits = [];
    if (kids.length) {
      var doneKids = kids.filter(function (k) { return statusOf(k) === 'done'; }).length;
      bits.push(doneKids + ' of ' + kids.length + ' steps done');
    }
    if (statusOf(t) === 'assigned' && t.assignedTo) {
      bits.push('Assigned to ' + t.assignedTo + ' on ' + prettyDate(t.assignedDate));
    }
    if (t.notes) bits.push(t.notes.slice(0, 70));
    if (bits.length) {
      var sub = document.createElement('span');
      sub.className = 'r-sub';
      sub.textContent = bits.join('  ·  ');
      title.appendChild(sub);
    }
    row.appendChild(title);

    row.appendChild(makeCell('r-cell', teamName(t.teamId)));
    row.appendChild(makeCell('r-cell', t.ownerName || t.assignedTo || ''));
    row.appendChild(makeCell('r-cell', t.type || ''));

    var date = makeCell('r-date', t.deadline ? prettyDate(t.deadline) : '');
    if (live && d !== null) {
      if (d < 0) date.classList.add('overdue');
      else if (d <= 3) date.classList.add('due-soon');
    }
    row.appendChild(date);

    if (statusOf(t) !== 'done' && statusOf(t) !== 'cancelled') {
      var cal = document.createElement('button');
      cal.type = 'button';
      cal.className = 'cal-btn';
      cal.textContent = '\u23F0';
      cal.title = 'Add alarm to calendar';
      cal.setAttribute('aria-label', 'Add alarm to calendar for ' + t.title);
      cal.addEventListener('click', function (e) {
        e.stopPropagation();
        if (!t.deadline) { toast('Add a deadline to this task first, then tap the alarm.'); openTask(t.id); return; }
        downloadIcs(t);
        toast('Calendar alarm saved. Open the file to add it.');
      });
      row.appendChild(cal);
    }

    var tick = document.createElement('button');
    tick.type = 'button';
    tick.className = 'tick';
    tick.textContent = statusOf(t) === 'done' ? '↩' : '✓';
    tick.setAttribute('aria-label', statusOf(t) === 'done' ? 'Move back to active' : 'Mark done');
    tick.addEventListener('click', function (e) {
      e.stopPropagation();
      t.status = statusOf(t) === 'done' ? 'active' : 'done';
      t.updatedAt = new Date().toISOString();
      save();
      render();
    });
    row.appendChild(tick);

    row.addEventListener('click', function () { openTask(t.id); });

    if (statusOf(t) === 'assigned' && needsChase(t)) row.appendChild(buildChase(t));

    return row;
  }

  function needsChase(t) {
    var base = t.lastChasedDate || t.assignedDate;
    if (!base) return false;
    return todayISO() >= addDays(base, state.settings.chaseAfterDays);
  }

  function buildChase(t) {
    var box = document.createElement('div');
    box.className = 'chase';
    var label = document.createElement('span');
    label.textContent = 'Check in with ' + (t.assignedTo || 'them') + ' on this?';
    box.appendChild(label);

    function mk(text, fn) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn';
      b.textContent = text;
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        fn();
        t.updatedAt = new Date().toISOString();
        save();
        render();
      });
      box.appendChild(b);
    }

    mk('Yes, chased', function () { t.lastChasedDate = todayISO(); });
    mk('Not yet', function () { t.lastChasedDate = addDays(todayISO(), 3 - state.settings.chaseAfterDays); });
    mk('It is done', function () { t.status = 'done'; });
    return box;
  }

  function render() {
    var counts = { active: 0, assigned: 0, done: 0, cancelled: 0 };
    state.tasks.forEach(function (t) {
      var s = statusOf(t);
      if (counts[s] !== undefined) counts[s]++;
    });
    Object.keys(counts).forEach(function (k) {
      var el = document.querySelector('[data-count="' + k + '"]');
      if (el) el.textContent = counts[k];
    });

    var inTab = state.tasks.filter(function (t) { return statusOf(t) === ui.tab; });
    var visible = inTab.filter(passesFilters);

    // include parents whose children match, so nesting still reads well
    var shownIds = {};
    visible.forEach(function (t) { shownIds[t.id] = true; });

    var parents = sortTasks(visible.filter(function (t) {
      return !t.parentId || !shownIds[t.parentId];
    }));

    var sheet = $('sheet');
    sheet.textContent = '';

    parents.forEach(function (p) {
      sheet.appendChild(buildRow(p, !!p.parentId));
      sortTasks(visible.filter(function (c) { return c.parentId === p.id; })).forEach(function (c) {
        sheet.appendChild(buildRow(c, true));
      });
    });

    $('emptyState').hidden = parents.length > 0;
    refreshFilterOptions();
  }

  function refreshFilterOptions() {
    var ft = $('filterTeam');
    var keepT = ft.value;
    ft.textContent = '';
    ft.appendChild(new Option('All teams', ''));
    state.teams.forEach(function (t) { ft.appendChild(new Option(t.name, t.id)); });
    ft.value = keepT;

    var fp = $('filterPerson');
    var keepP = fp.value;
    fp.textContent = '';
    fp.appendChild(new Option('All people', ''));
    allPeople().forEach(function (n) { fp.appendChild(new Option(n, n)); });
    fp.value = keepP;
  }

  function fillDatalists(teamId) {
    var pl = $('peopleList');
    pl.textContent = '';
    allPeople().forEach(function (n) { pl.appendChild(new Option(n)); });

    var el = $('emailList');
    el.textContent = '';
    emailsForTeam(teamId).forEach(function (e) { el.appendChild(new Option(e)); });
  }

  /* ---------- task modal ---------- */
  function fillSelects() {
    var ts = $('fTeam');
    ts.textContent = '';
    ts.appendChild(new Option('No team', ''));
    state.teams.forEach(function (t) { ts.appendChild(new Option(t.name, t.id)); });

    var ty = $('fType');
    ty.textContent = '';
    ty.appendChild(new Option('No type', ''));
    state.types.forEach(function (t) { ty.appendChild(new Option(t, t)); });
  }

  function findTask(id) {
    for (var i = 0; i < state.tasks.length; i++) {
      if (state.tasks[i].id === id) return state.tasks[i];
    }
    return null;
  }

  function openTask(id, parentId) {
    ui.editingId = id || null;
    ui.pendingParentId = parentId || null;
    fillSelects();

    var t = id ? findTask(id) : null;
    $('modalTitle').textContent = t ? 'Edit task' : (parentId ? 'Add sub-task' : 'Add task');

    var note = $('parentNote');
    var parent = parentId ? findTask(parentId) : (t && t.parentId ? findTask(t.parentId) : null);
    if (parent) {
      note.textContent = 'Step under: ' + parent.title;
      note.hidden = false;
    } else {
      note.hidden = true;
    }

    $('fTitle').value = t ? t.title : '';
    $('fTeam').value = t ? (t.teamId || '') : (parent ? (parent.teamId || '') : '');
    $('fType').value = t ? (t.type || '') : '';
    $('fOwner').value = t ? (t.ownerName || '') : '';
    $('fContact').value = t ? (t.contactEmail || '') : '';
    $('fDeadline').value = t ? (t.deadline || '') : '';
    setAlarmBoxes(t ? remindersOf(t) : []);
    $('fNotes').value = t ? (t.notes || '') : '';
    fillDatalists($('fTeam').value);

    var s = t ? statusOf(t) : 'new';
    $('subTaskBtn').hidden = !t || !!(t && t.parentId);
    $('assignBtn').hidden = !t || s === 'done' || s === 'cancelled';
    $('icsBtn').hidden = !t;
    $('icsBtn').textContent = (t && t.deadline) ? 'Add alarm to calendar' : 'Add a deadline to set an alarm';
    $('icsBtn').disabled = !(t && t.deadline);
    $('doneBtn').hidden = !t || s === 'done';
    $('cancelTaskBtn').hidden = !t || s === 'cancelled';
    $('restoreBtn').hidden = !t || (s !== 'done' && s !== 'cancelled');
    $('deleteBtn').hidden = !t;

    $('taskModal').hidden = false;
    $('fTitle').focus();
  }

  function closeTask() {
    stopMic();
    $('taskModal').hidden = true;
    ui.editingId = null;
    ui.pendingParentId = null;
  }

  function collectForm() {
    return {
      title: $('fTitle').value.trim(),
      teamId: $('fTeam').value,
      type: $('fType').value,
      ownerName: $('fOwner').value.trim(),
      contactEmail: $('fContact').value.trim(),
      deadline: $('fDeadline').value,
      reminders: readAlarmBoxes(),
      notes: $('fNotes').value.trim()
    };
  }

  function saveTask(thenFn) {
    var f = collectForm();
    if (!f.title) { toast('Give the task a name first.'); return; }

    var newPerson = f.ownerName && !isKnownPerson(f.ownerName);
    var t = ui.editingId ? findTask(ui.editingId) : null;
    var now = new Date().toISOString();

    if (!t) {
      t = {
        id: uid(),
        status: 'active',
        parentId: ui.pendingParentId || null,
        createdAt: now
      };
      state.tasks.push(t);
    }
    t.title = f.title;
    t.teamId = f.teamId;
    t.type = f.type;
    t.ownerName = f.ownerName;
    t.contactEmail = f.contactEmail;
    t.deadline = f.deadline;
    var reminderChanged = remindersOf(t).join(',') !== f.reminders.join(',');
    t.reminders = f.reminders.slice();
    t.reminder = f.reminders.length ? f.reminders[0] : null;
    t.notes = f.notes;
    t.updatedAt = now;

    if (t.reminders.length && reminderChanged) {
      if (!t.deadline) {
        toast('Add a deadline so the alarm knows when to go off.');
      } else {
        downloadIcs(t);
      }
    }

    rememberContact(f.ownerName, f.contactEmail);
    save();
    render();

    var savedId = t.id;
    if (newPerson && f.teamId) {
      askAboutPerson(f.ownerName, f.contactEmail, f.teamId, function () {
        if (thenFn) thenFn(savedId); else closeTask();
      });
    } else if (thenFn) {
      thenFn(savedId);
    } else {
      closeTask();
      toast('Saved.');
    }
  }

  function askAboutPerson(name, email, teamId, done) {
    $('personQuestion').textContent =
      'Add ' + name + ' to ' + teamName(teamId) + ', or keep them just for this task?';
    $('personModal').hidden = false;

    function finish(addToTeam) {
      if (addToTeam) {
        state.teams.forEach(function (t) {
          if (t.id === teamId) {
            t.people = t.people || [];
            t.people.push({ name: name, email: email || '' });
          }
        });
        save();
        toast(name + ' added to ' + teamName(teamId) + '.');
      }
      $('personModal').hidden = true;
      $('personToTeam').onclick = null;
      $('personJustTask').onclick = null;
      render();
      if (done) done();
    }

    $('personToTeam').onclick = function () { finish(true); };
    $('personJustTask').onclick = function () { finish(false); };
  }

  function setStatus(id, status) {
    var t = findTask(id);
    if (!t) return;
    t.status = status;
    t.updatedAt = new Date().toISOString();
    save();
    render();
  }

  /* ---------- assign ---------- */
  function openAssign(id) {
    ui.assignTargetId = id;
    $('fAssignTo').value = '';
    fillDatalists($('fTeam').value);
    $('assignModal').hidden = false;
    $('fAssignTo').focus();
  }

  function confirmAssign() {
    var name = $('fAssignTo').value.trim();
    if (!name) { toast('Who is it going to?'); return; }
    var t = findTask(ui.assignTargetId);
    if (t) {
      t.status = 'assigned';
      t.assignedTo = name;
      t.assignedDate = todayISO();
      t.lastChasedDate = '';
      t.updatedAt = new Date().toISOString();
      rememberContact(name, '');
      save();
      render();
      toast('Assigned to ' + name + '.');
    }
    $('assignModal').hidden = true;
    closeTask();
  }

  /* ---------- calendar (.ics) ---------- */
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function downloadIcs(t) {
    if (!t.deadline) { toast('Add a deadline first.'); return; }
    var leads = remindersOf(t);
    if (!leads.length) leads = [1];
    var start = t.deadline.replace(/-/g, '');
    var end = addDays(t.deadline, 1).replace(/-/g, '');
    var now = new Date();
    var stamp = now.getUTCFullYear() + pad(now.getUTCMonth() + 1) + pad(now.getUTCDate()) + 'T' +
      pad(now.getUTCHours()) + pad(now.getUTCMinutes()) + pad(now.getUTCSeconds()) + 'Z';

    function esc(s) { return String(s || '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n'); }

    var lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Chris Todo//EN', 'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      'UID:' + t.id + '@christodo',
      'DTSTAMP:' + stamp,
      'DTSTART;VALUE=DATE:' + start,
      'DTEND;VALUE=DATE:' + end,
      'SUMMARY:' + esc(t.title),
      'DESCRIPTION:' + esc([teamName(t.teamId), t.ownerName, t.notes].filter(Boolean).join(' - ')),
      'END:VEVENT', 'END:VCALENDAR'
    ];

    var alarmLines = [];
    leads.forEach(function (lead) {
      alarmLines.push(
        'BEGIN:VALARM',
        'TRIGGER:' + (lead === 0 ? '-PT9H' : '-P' + lead + 'D'),
        'ACTION:DISPLAY',
        'DESCRIPTION:' + esc((lead === 0 ? 'Due today: ' : 'Coming up: ') + t.title),
        'END:VALARM'
      );
    });
    lines.splice(lines.length - 2, 0, ...alarmLines);

    var blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = t.title.replace(/[^a-z0-9]+/gi, '-').slice(0, 40) + '.ics';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* ---------- notifications ---------- */
  function notificationsSupported() {
    return typeof window.Notification !== 'undefined';
  }

  function dueSummary() {
    var soon = state.tasks.filter(function (t) {
      var s = statusOf(t);
      if (s !== 'active' && s !== 'assigned') return false;
      var d = daysUntil(t.deadline);
      return d !== null && d <= 3;
    });
    return soon;
  }

  /* Alarms that are due today, based on the boxes ticked on each task. */
  function alarmsDueToday() {
    var hits = [];
    state.tasks.forEach(function (t) {
      var s = statusOf(t);
      if (s !== 'active' && s !== 'assigned') return;
      if (!t.deadline) return;
      var d = daysUntil(t.deadline);
      remindersOf(t).forEach(function (lead) {
        if (d === lead) hits.push({ task: t, lead: lead });
      });
    });
    return hits;
  }

  function firedKey() { return 'christodo.fired.' + todayISO(); }

  function maybeNotify() {
    var hits = alarmsDueToday();

    if (hits.length) {
      var fired = '';
      try { fired = localStorage.getItem(firedKey()) || ''; } catch (e) { fired = ''; }
      var fresh = hits.filter(function (h) { return fired.indexOf(h.task.id + ':' + h.lead) === -1; });

      if (fresh.length) {
        showAlarmBanner(fresh);
        if (notificationsSupported() && Notification.permission === 'granted') {
          fresh.forEach(function (h) {
            try {
              new Notification('Alarm: ' + h.task.title, {
                body: (h.lead === 0 ? 'Due today' : 'Due ' + prettyDate(h.task.deadline) + ' (' + alarmLabel(h.lead) + ')'),
                tag: h.task.id + ':' + h.lead
              });
            } catch (e) { /* ignore */ }
          });
        }
        try {
          localStorage.setItem(firedKey(), fired + fresh.map(function (h) {
            return h.task.id + ':' + h.lead;
          }).join('|') + '|');
        } catch (e) { /* ignore */ }
      }
    }

    if (!notificationsSupported() || Notification.permission !== 'granted') return;
    var soon = dueSummary();
    if (!soon.length) return;
    var last = '';
    try { last = localStorage.getItem('christodo.notified') || ''; } catch (e) { last = ''; }
    if (last === todayISO()) return;
    try {
      new Notification(soon.length + ' task' + (soon.length > 1 ? 's' : '') + ' due soon', {
        body: soon.slice(0, 4).map(function (t) { return t.title; }).join('\n')
      });
      localStorage.setItem('christodo.notified', todayISO());
    } catch (e) { /* ignore */ }
  }

  function showAlarmBanner(hits) {
    var bar = $('alarmBar');
    if (!bar) return;
    bar.textContent = '';

    var head = document.createElement('strong');
    head.textContent = hits.length === 1 ? 'Alarm' : hits.length + ' alarms';
    bar.appendChild(head);

    hits.slice(0, 5).forEach(function (h) {
      var line = document.createElement('span');
      line.textContent = h.task.title + ' \u2014 due ' + prettyDate(h.task.deadline) +
        ' (' + alarmLabel(h.lead) + ')';
      bar.appendChild(line);
    });

    var x = document.createElement('button');
    x.type = 'button';
    x.className = 'btn';
    x.textContent = 'Got it';
    x.addEventListener('click', function () { bar.hidden = true; });
    bar.appendChild(x);

    bar.hidden = false;
  }

  /* ---------- voice ---------- */
  function setupMic() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    var btn = $('micBtn');
    if (!SR) { btn.hidden = true; return; }
    btn.hidden = false;

    btn.addEventListener('click', function () {
      if (ui.recog) { stopMic(); return; }
      var r = new SR();
      r.lang = 'en-AU';
      r.interimResults = true;
      r.continuous = false;
      r.onresult = function (ev) {
        var text = '';
        for (var i = 0; i < ev.results.length; i++) text += ev.results[i][0].transcript;
        $('fTitle').value = text.trim();
      };
      r.onerror = function (ev) {
        if (ev.error === 'not-allowed') toast('Allow microphone access to dictate.');
        else toast('Could not hear that. Try typing instead.');
        stopMic();
      };
      r.onend = function () { stopMic(); };
      ui.recog = r;
      btn.classList.add('listening');
      btn.textContent = 'Listening';
      try { r.start(); } catch (e) { stopMic(); }
    });
  }

  function stopMic() {
    var btn = $('micBtn');
    if (ui.recog) {
      try { ui.recog.stop(); } catch (e) { /* ignore */ }
      ui.recog = null;
    }
    btn.classList.remove('listening');
    btn.textContent = 'Speak';
  }

  /* ---------- settings ---------- */
  function syncStatus(text, kind) {
    var el = $('syncState');
    if (!el) return;
    el.textContent = text;
    el.className = 'hint' + (kind === 'warn' ? ' warn' : '');
  }

  function refreshSyncUi() {
    var on = window.ChrisSync && ChrisSync.enabled();
    $('fSyncCode').value = on ? ChrisSync.getCode() : '';
    $('syncOnBtn').textContent = on ? 'Update code' : 'Turn sync on';
    $('syncOffBtn').hidden = !on;
    syncStatus(on
      ? 'Syncing with code ' + ChrisSync.getCode() + '. Use the same code on Chris\'s phone.'
      : 'Not syncing yet. This device keeps its own list.');
  }

  function startSync() {
    if (!window.ChrisSync || !ChrisSync.enabled()) return;
    ChrisSync.start(state, function () {
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
      fillSelects();
      render();
    }, syncStatus);
  }

  function openSettings() {
    refreshSyncUi();
    $('fChaseDays').value = String(state.settings.chaseAfterDays);
    $('notifyBtn').hidden = !notificationsSupported() ||
      (notificationsSupported() && Notification.permission === 'granted');
    renderTeamChips();
    $('settingsModal').hidden = false;
  }

  function renderTeamChips() {
    var box = $('teamChips');
    box.textContent = '';
    state.teams.forEach(function (t) {
      var chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = t.name;
      var x = document.createElement('button');
      x.type = 'button';
      x.textContent = '×';
      x.setAttribute('aria-label', 'Remove ' + t.name);
      x.addEventListener('click', function () {
        state.teams = state.teams.filter(function (o) { return o.id !== t.id; });
        save();
        renderTeamChips();
        render();
      });
      chip.appendChild(x);
      box.appendChild(chip);
    });
  }

  function exportBackup() {
    var blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'chris-todo-backup-' + todayISO() + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function importBackup(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        if (!data || !Array.isArray(data.tasks)) throw new Error('bad');
        state.tasks = data.tasks;
        state.teams = data.teams || state.teams;
        state.types = data.types || state.types;
        state.contacts = data.contacts || [];
        state.deleted = data.deleted || [];
        state.settings = data.settings || state.settings;
        save();
        render();
        renderTeamChips();
        toast('Backup restored.');
      } catch (e) {
        toast('That file did not look like a backup.');
      }
    };
    reader.readAsText(file);
  }

  /* ---------- wiring ---------- */
  function wire() {
    $('tabs').addEventListener('click', function (e) {
      var btn = e.target.closest('.tab');
      if (!btn) return;
      ui.tab = btn.getAttribute('data-tab');
      document.querySelectorAll('.tab').forEach(function (b) { b.classList.remove('is-active'); });
      btn.classList.add('is-active');
      render();
    });

    ['search', 'sortBy', 'filterTeam', 'filterPerson'].forEach(function (id) {
      $(id).addEventListener('input', render);
      $(id).addEventListener('change', render);
    });

    $('addBtn').addEventListener('click', function () { openTask(null, null); });
    $('closeTask').addEventListener('click', closeTask);
    $('saveTask').addEventListener('click', function () { saveTask(null); });

    $('fTeam').addEventListener('change', function () { fillDatalists($('fTeam').value); });

    $('subTaskBtn').addEventListener('click', function () {
      saveTask(function (parentId) { openTask(null, parentId); });
    });

    $('assignBtn').addEventListener('click', function () {
      saveTask(function (id) { openAssign(id); });
    });

    $('icsBtn').addEventListener('click', function () {
      saveTask(function (id) {
        var t = findTask(id);
        if (t) downloadIcs(t);
        closeTask();
      });
    });

    $('doneBtn').addEventListener('click', function () {
      saveTask(function (id) { setStatus(id, 'done'); closeTask(); });
    });
    $('cancelTaskBtn').addEventListener('click', function () {
      saveTask(function (id) { setStatus(id, 'cancelled'); closeTask(); });
    });
    $('restoreBtn').addEventListener('click', function () {
      saveTask(function (id) { setStatus(id, 'active'); closeTask(); });
    });

    $('deleteBtn').addEventListener('click', function () {
      var id = ui.editingId;
      if (!id) return;
      if (!window.confirm('Delete this task and any steps under it?')) return;
      state.tasks.forEach(function (t) {
        if (t.id === id || t.parentId === id) tombstone(t.id);
      });
      state.tasks = state.tasks.filter(function (t) { return t.id !== id && t.parentId !== id; });
      save();
      render();
      closeTask();
      toast('Deleted.');
    });

    $('closeAssign').addEventListener('click', function () { $('assignModal').hidden = true; });
    $('confirmAssign').addEventListener('click', confirmAssign);

    $('settingsBtn').addEventListener('click', openSettings);
    $('closeSettings').addEventListener('click', function () { $('settingsModal').hidden = true; });
    $('saveSettings').addEventListener('click', function () {
      state.settings.chaseAfterDays = parseInt($('fChaseDays').value, 10) || 7;
      save();
      render();
      $('settingsModal').hidden = true;
    });

    $('addTeamBtn').addEventListener('click', function () {
      var name = $('fNewTeam').value.trim();
      if (!name) return;
      state.teams.push({ id: uid(), name: name, leadName: '', leadEmail: '', people: [] });
      $('fNewTeam').value = '';
      save();
      renderTeamChips();
      render();
    });

    $('notifyBtn').addEventListener('click', function () {
      if (!notificationsSupported()) return;
      Notification.requestPermission().then(function (p) {
        if (p === 'granted') { toast('Reminders on.'); $('notifyBtn').hidden = true; maybeNotify(); }
        else toast('Reminders stayed off.');
      });
    });

    $('newCodeBtn').addEventListener('click', function () {
      $('fSyncCode').value = ChrisSync.makeCode();
    });

    $('syncOnBtn').addEventListener('click', function () {
      var code = $('fSyncCode').value.trim();
      if (!code) { toast('Enter or generate a code first.'); return; }
      ChrisSync.stop();
      ChrisSync.setCode(code);
      startSync();
      refreshSyncUi();
      toast('Sync on. Use ' + code + ' on the other phone.');
    });

    $('syncOffBtn').addEventListener('click', function () {
      ChrisSync.stop();
      ChrisSync.setCode('');
      refreshSyncUi();
      toast('Sync off. This device keeps its own list.');
    });

    $('exportBtn').addEventListener('click', exportBackup);
    $('importBtn').addEventListener('click', function () { $('importFile').click(); });
    $('importFile').addEventListener('change', function (e) {
      if (e.target.files && e.target.files[0]) importBackup(e.target.files[0]);
      e.target.value = '';
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (!$('taskModal').hidden) closeTask();
        $('assignModal').hidden = true;
        $('settingsModal').hidden = true;
      }
    });

    [['taskModal', closeTask], ['assignModal', null], ['settingsModal', null]].forEach(function (pair) {
      $(pair[0]).addEventListener('click', function (e) {
        if (e.target !== this) return;
        if (pair[1]) pair[1](); else this.hidden = true;
      });
    });
  }

  /* ---------- boot ---------- */
  function boot() {
    var ready = load();
    wire();
    setupMic();

    var next = ready ? Promise.resolve() : seedTeams();
    next.then(function () {
      fillSelects();
      render();
      maybeNotify();
      startSync();
    });

    /* Re-check alarms every 5 minutes and whenever the app comes back to the front. */
    setInterval(function () { try { maybeNotify(); } catch (e) { /* ignore */ } }, 300000);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) { try { maybeNotify(); } catch (e) { /* ignore */ } }
    });

    if ('serviceWorker' in navigator) {
      try {
        navigator.serviceWorker.register('service-worker.js').catch(function () { /* offline later */ });
      } catch (e) { /* ignore */ }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
