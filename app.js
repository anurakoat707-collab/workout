/* Workout Log v2 - runs fully in the browser, data in localStorage.
 *
 *  S (KEY)          = { v: 2, workouts: [...], routines: [...], body: [...], exercises: [...], settings: { rest } }
 *    workout        = { id, date: 'YYYY-MM-DD', start: ms|null, end: ms|null, name, routineId, note,
 *                       exercises: [{ name, sets: [{ kg, r }] }] }
 *    routine        = { id, name, exercises: [{ name, sets, reps, rest }] }
 *    body           = { date, kg }
 *  A (KEY_ACTIVE)   = the workout in progress (saved on every change, so it survives closing the app)
 *                     { id, name, routineId, start, date, note, restEnd, restTotal,
 *                       exercises: [{ name, rest, target, sets: [{ kg: '', r: '', done: false }] }] }
 */
(function () {
  'use strict';

  const KEY = 'workoutlog.v2', KEY_ACTIVE = 'workoutlog.v2.active', KEY_V1 = 'workoutlog.v1', KEY_EXPORTED = 'workoutlog.v2.exported';

  /* ===================================================================== exercise library */
  const LIBRARY = {
    'อก': ['Bench Press', 'Incline Bench Press', 'Incline Dumbbell Press', 'Dumbbell Bench Press', 'Chest Fly', 'Cable Crossover', 'Push Up', 'Dips'],
    'หลัง': ['Deadlift', 'Pull Up', 'Chin Up', 'Lat Pulldown', 'Barbell Row', 'Dumbbell Row', 'Seated Cable Row', 'T-Bar Row', 'Face Pull'],
    'ขา': ['Squat', 'Front Squat', 'Leg Press', 'Romanian Deadlift', 'Bulgarian Split Squat', 'Lunge', 'Leg Curl', 'Leg Extension', 'Hip Thrust', 'Calf Raise'],
    'ไหล่': ['Overhead Press', 'Dumbbell Shoulder Press', 'Lateral Raise', 'Rear Delt Fly', 'Arnold Press', 'Upright Row', 'Shrug'],
    'แขน': ['Barbell Curl', 'Dumbbell Curl', 'Hammer Curl', 'Preacher Curl', 'Triceps Pushdown', 'Skull Crusher', 'Overhead Triceps Extension', 'Close Grip Bench Press'],
    'แกนกลาง': ['Plank', 'Crunch', 'Hanging Leg Raise', 'Cable Crunch', 'Russian Twist', 'Ab Wheel'],
  };
  const GROUP_OF = {};
  Object.keys(LIBRARY).forEach(g => LIBRARY[g].forEach(n => { GROUP_OF[n.toLowerCase()] = g; }));
  const DEFAULT_ROUTINES = [
    { name: 'Push — อก ไหล่ หลังแขน', exercises: [['Bench Press', 4, 8, 120], ['Overhead Press', 3, 10, 90], ['Incline Dumbbell Press', 3, 10, 90], ['Lateral Raise', 3, 15, 60], ['Triceps Pushdown', 3, 12, 60]] },
    { name: 'Pull — หลัง หน้าแขน', exercises: [['Deadlift', 3, 5, 180], ['Pull Up', 3, 8, 120], ['Barbell Row', 3, 10, 90], ['Lat Pulldown', 3, 12, 90], ['Dumbbell Curl', 3, 12, 60]] },
    { name: 'Legs — ขา', exercises: [['Squat', 4, 6, 150], ['Romanian Deadlift', 3, 10, 120], ['Leg Press', 3, 12, 90], ['Leg Curl', 3, 12, 60], ['Calf Raise', 3, 15, 60]] },
  ];

  /* ===================================================================== small helpers */
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = v => { const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : 0; };
  const fmt = (n, d = 1) => (Math.round(n * 10 ** d) / 10 ** d).toLocaleString('en-US', { maximumFractionDigits: d });
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const clone = o => JSON.parse(JSON.stringify(o));
  const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

  const TH_M = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const TH_MF = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  const TH_D = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
  const TH_DS = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'];
  const pad = n => String(n).padStart(2, '0');
  const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const today = () => iso(new Date());
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
  const weekStart = s => addDays(s, -((parse(s).getDay() + 6) % 7));
  const thShort = s => { const d = parse(s); return d.getDate() + ' ' + TH_M[d.getMonth()] + ' ' + String(d.getFullYear() + 543).slice(2); };
  const thLong = s => { const d = parse(s); return 'วัน' + TH_D[d.getDay()] + 'ที่ ' + d.getDate() + ' ' + TH_MF[d.getMonth()] + ' ' + (d.getFullYear() + 543); };
  const hhmm = ms => { const d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const clock = sec => { sec = Math.max(0, Math.round(sec)); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60; return (h ? h + ':' + pad(m) : m) + ':' + pad(s); };
  const durText = min => (min == null ? '—' : min >= 60 ? Math.floor(min / 60) + ' ชม. ' + (min % 60) + ' น.' : min + ' นาที');

  /* ===================================================================== workout maths */
  const e1rm = (kg, r) => (r <= 1 ? kg : kg * (1 + r / 30));                       // Epley
  const setsVol = sets => sets.reduce((a, s) => a + num(s.kg) * num(s.r), 0);
  const bestSet = sets => sets.reduce((b, s) => (!b || num(s.kg) > num(b.kg) || (num(s.kg) === num(b.kg) && num(s.r) > num(b.r)) ? s : b), null);
  const best1rm = sets => sets.reduce((m, s) => Math.max(m, e1rm(num(s.kg), num(s.r))), 0);
  const wVolume = w => w.exercises.reduce((a, e) => a + setsVol(e.sets), 0);
  const wSets = w => w.exercises.reduce((a, e) => a + e.sets.length, 0);
  const wMinutes = w => (w.start && w.end ? Math.max(1, Math.round((w.end - w.start) / 60000)) : null);
  const setText = s => fmt(num(s.kg), 2) + ' × ' + num(s.r);
  const byTime = (a, b) => (a.date === b.date ? (a.start || 0) - (b.start || 0) : a.date < b.date ? -1 : 1);

  /* ===================================================================== storage */
  let S = load();
  let A = loadActive();
  /* settings.goalKg = target body weight (null = none), goalDir = 'lose' | 'gain' | 'keep' | 'none' */
  function blank() { return { v: 2, workouts: [], routines: [], body: [], exercises: [], settings: { rest: 90, goalKg: null, goalDir: 'none' } }; }
  function seedRoutines(st) {
    st.routines = DEFAULT_ROUTINES.map(r => ({ id: uid(), name: r.name, exercises: r.exercises.map(([name, sets, reps, rest]) => ({ name, sets, reps, rest })) }));
  }
  function fromV1(v1) {
    const st = blank();
    const byDate = {};
    (v1.entries || []).forEach(e => { (byDate[e.date] = byDate[e.date] || []).push(e); });
    Object.keys(byDate).sort().forEach(d => {
      const ex = [];
      byDate[d].forEach(e => {
        let x = ex.find(y => same(y.name, e.ex));
        if (!x) { x = { name: e.ex, sets: [] }; ex.push(x); }
        e.sets.forEach(s => x.sets.push({ kg: num(s.kg), r: num(s.r) }));
      });
      st.workouts.push({ id: 'v1-' + d, date: d, start: null, end: null, name: 'Workout', routineId: null,
        note: byDate[d].map(e => e.note).filter(Boolean).join(' · '), exercises: ex });
    });
    st.body = (v1.body || []).map(b => ({ date: b.date, kg: num(b.kg) }));
    st.exercises = (v1.exercises || []).slice();
    return st;
  }
  function load() {
    try {
      const st = JSON.parse(localStorage.getItem(KEY));
      if (st && Array.isArray(st.workouts)) {
        const b = blank();
        return { ...b, ...st, settings: { ...b.settings, ...(st.settings || {}) } };
      }
    } catch (e) { /* broken data: start from v1 or empty */ }
    let st = blank();
    try {
      const v1 = JSON.parse(localStorage.getItem(KEY_V1));
      if (v1 && Array.isArray(v1.entries)) { st = fromV1(v1); }       // the old version's data moves over (v1 key is kept)
    } catch (e) { /* ignore */ }
    seedRoutines(st);
    try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* ignore */ }
    return st;
  }
  function loadActive() { try { return JSON.parse(localStorage.getItem(KEY_ACTIVE)) || null; } catch (e) { return null; } }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); }
    catch (e) { toast('บันทึกไม่สำเร็จ: พื้นที่เต็ม — Export แล้วลบข้อมูลเก่า'); }
  }
  function saveActive() {
    try { A ? localStorage.setItem(KEY_ACTIVE, JSON.stringify(A)) : localStorage.removeItem(KEY_ACTIVE); } catch (e) { /* ignore */ }
    $('live-dot').hidden = !A;
  }
  if (navigator.storage && navigator.storage.persist) { navigator.storage.persist().catch(() => {}); }

  /* ===================================================================== queries */
  const workouts = () => S.workouts.slice().sort(byTime).reverse();          // newest first
  const exNames = () => {
    const used = workouts().flatMap(w => w.exercises.map(e => e.name));
    const out = [];
    [...used, ...S.exercises].forEach(n => { if (!out.some(o => same(o, n))) { out.push(n); } });
    return out;
  };
  /** Every workout that has the exercise, oldest first: [{ w, sets }] */
  function exHistory(name) {
    return S.workouts.slice().sort(byTime).map(w => ({ w, ex: w.exercises.find(e => same(e.name, name)) }))
      .filter(x => x.ex && x.ex.sets.length).map(x => ({ w: x.w, sets: x.ex.sets }));
  }
  /** The last time an exercise was done before workout `ref` (or ever, when ref is null). */
  function previous(name, ref) {
    const h = exHistory(name).filter(x => !ref || (x.w.id !== ref.id && byTime(x.w, ref) < 0));
    return h.length ? h[h.length - 1] : null;
  }
  /** Records a finished workout set: [{ name, kinds: ['น้ำหนัก', '1RM', 'Volume'], set }] */
  function prsOf(w) {
    const out = [];
    w.exercises.forEach(e => {
      const before = exHistory(e.name).filter(x => x.w.id !== w.id && byTime(x.w, w) < 0);
      if (!before.length || !e.sets.length) { return; }
      const kinds = [];
      const bs = bestSet(e.sets);
      if (num(bs.kg) > Math.max(...before.map(x => num(bestSet(x.sets).kg)))) { kinds.push('น้ำหนัก'); }
      if (best1rm(e.sets) > Math.max(...before.map(x => best1rm(x.sets))) + 0.01) { kinds.push('1RM'); }
      if (setsVol(e.sets) > Math.max(...before.map(x => setsVol(x.sets)))) { kinds.push('Volume'); }
      if (kinds.length) { out.push({ name: e.name, kinds, set: bs }); }
    });
    return out;
  }

  /* ===================================================================== toast + sheet + dialogs */
  let toastT = 0;
  function toast(msg, pr) {
    const t = $('toast');
    t.textContent = msg; t.className = 'toast' + (pr ? ' pr' : ''); t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, pr ? 4200 : 2400);
  }
  let sheetClose = null;
  function openSheet(html, onMount, onClose) {
    const old = $('sheet'), fresh = old.cloneNode(false);      // a new element = no listeners left from the previous sheet
    old.replaceWith(fresh);
    fresh.innerHTML = html;
    $('sheet-wrap').hidden = false;
    document.body.style.overflow = 'hidden';
    sheetClose = onClose || null;
    if (onMount) { onMount($('sheet')); }
  }
  function closeSheet() {
    $('sheet-wrap').hidden = true; $('sheet').innerHTML = '';
    document.body.style.overflow = '';
    const f = sheetClose; sheetClose = null; if (f) { f(); }
  }
  $('sheet-wrap').addEventListener('click', e => { if (e.target.hasAttribute('data-close') || e.target.closest('[data-close]')) { closeSheet(); } });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('sheet-wrap').hidden) { closeSheet(); } });

  /** Nice confirm dialog -> Promise<boolean> */
  function ask(title, text, okText, danger) {
    return new Promise(res => {
      let answered = false;
      openSheet('<div class="center"><div class="dialog-ic' + (danger ? '' : ' ok') + '">' + (danger ? '!' : '?') + '</div>'
        + '<h2>' + esc(title) + '</h2>' + (text ? '<p class="lead" style="margin-top:6px">' + esc(text) + '</p>' : '') + '</div>'
        + '<div class="btn-row" style="margin-top:18px"><button type="button" class="btn soft" data-close>ยกเลิก</button>'
        + '<button type="button" class="btn ' + (danger ? 'danger' : 'primary') + '" id="ask-ok">' + esc(okText || 'ตกลง') + '</button></div>',
        sh => { sh.querySelector('#ask-ok').onclick = () => { answered = true; closeSheet(); }; },
        () => res(answered));
    });
  }

  /* ===================================================================== beep (end of rest) */
  let audio = null;
  document.addEventListener('pointerdown', () => { if (!audio && window.AudioContext) { try { audio = new AudioContext(); } catch (e) { /* no sound */ } } }, { once: true });
  function beep() {
    if (navigator.vibrate) { navigator.vibrate([200, 100, 200]); }
    if (!audio) { return; }
    [0, .22, .44].forEach((t, i) => {
      const o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = i === 2 ? 1046 : 784; o.connect(g); g.connect(audio.destination);
      const at = audio.currentTime + t;
      g.gain.setValueAtTime(.0001, at); g.gain.exponentialRampToValueAtTime(.3, at + .02); g.gain.exponentialRampToValueAtTime(.0001, at + .18);
      o.start(at); o.stop(at + .2);
    });
  }

  /* ===================================================================== navigation */
  const TITLES = { home: 'ภาพรวม', workout: 'Workout', routines: 'ตารางฝึก', history: 'ประวัติ', progress: 'พัฒนาการ' };
  let tab = 'home';
  let histId = null;          // History: open workout detail
  let E = null;               // History: editing a saved workout (same shape as A)
  let R = null;               // Routines: routine being edited (draft)
  function go(t, keepScroll) {
    tab = t;
    document.querySelectorAll('.tab').forEach(s => { s.hidden = s.id !== 'tab-' + t; });
    document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('is-on', b.dataset.tab === t));
    $('page-title').textContent = TITLES[t];
    if (!keepScroll) { window.scrollTo(0, 0); }
    render();
  }
  document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.tab === 'history' && tab === 'history' && !E) { histId = null; }
    if (b.dataset.tab === 'routines' && tab === 'routines') { R = null; }
    go(b.dataset.tab);
  }));
  function render() {
    ({ home: renderHome, workout: renderWorkoutTab, routines: renderRoutines, history: renderHistory, progress: renderProgress })[tab]();
    tick();
  }

  /* ===================================================================== timers (elapsed + rest) */
  function tick() {
    document.querySelectorAll('[data-elapsed]').forEach(el => { el.textContent = A ? clock((Date.now() - A.start) / 1000) : ''; });
    const bar = $('restbar');
    if (A && A.restEnd) {
      const left = (A.restEnd - Date.now()) / 1000;
      if (left <= 0) {
        A.restEnd = null; saveActive(); beep();
        toast('หมดเวลาพัก — ลุยเซ็ตต่อไป');
      } else {
        bar.hidden = false; document.body.classList.add('has-rest');
        $('rest-time').textContent = clock(left);
        $('rest-ring').style.strokeDashoffset = String(119.4 * (1 - left / (A.restTotal || 1)));
        return;
      }
    }
    bar.hidden = true; document.body.classList.remove('has-rest');
  }
  setInterval(tick, 250);
  function startRest(sec) {
    if (!A || !sec) { return; }
    A.restEnd = Date.now() + sec * 1000; A.restTotal = sec; saveActive(); tick();
  }
  $('restbar').addEventListener('click', e => {
    const b = e.target.closest('[data-rest]');
    if (!b || !A || !A.restEnd) { return; }
    if (b.dataset.rest === 'skip') { A.restEnd = null; }
    else { A.restEnd += num(b.dataset.rest) * 1000; A.restTotal = Math.max(A.restTotal + num(b.dataset.rest), 1); }
    saveActive(); tick();
  });

  /* ===================================================================== exercise picker */
  function pickExercise(onPick, title) {
    const recent = exNames().slice(0, 8);
    const build = q => {
      q = q.trim().toLowerCase();
      const match = n => !q || n.toLowerCase().includes(q);
      let h = '';
      const rec = recent.filter(match);
      if (rec.length && !q) { h += '<div class="pick-h">ใช้ล่าสุด</div>' + rec.map(n => pickRow(n)).join(''); }
      const groups = { ...LIBRARY };
      const custom = exNames().filter(n => !GROUP_OF[n.toLowerCase()]);
      if (custom.length) { groups['ท่าของฉัน'] = custom; }
      Object.keys(groups).forEach(g => {
        const list = groups[g].filter(match);
        if (list.length) { h += '<div class="pick-h">' + esc(g) + '</div>' + list.map(n => pickRow(n, g)).join(''); }
      });
      if (q && !exNames().concat(...Object.values(LIBRARY)).some(n => n.toLowerCase() === q)) {
        h = '<button type="button" class="pick" data-pick="' + esc(q.replace(/\b\w/g, c => c.toUpperCase())) + '"><span>+ เพิ่มท่าใหม่ “' + esc(q) + '”</span></button>' + h;
      }
      return h || '<div class="empty">ไม่พบท่านี้</div>';
    };
    const pickRow = (n, g) => {
      const last = previous(n, null);
      return '<button type="button" class="pick" data-pick="' + esc(n) + '"><span>' + esc(n) + '</span><small>'
        + (last ? 'ล่าสุด ' + setText(bestSet(last.sets)) : esc(g || GROUP_OF[n.toLowerCase()] || '')) + '</small></button>';
    };
    openSheet('<h2>' + esc(title || 'เลือกท่า') + '</h2>'
      + '<div class="search" style="margin-top:10px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>'
      + '<input type="search" id="pick-q" placeholder="ค้นหาท่า เช่น bench, squat, curl" autocomplete="off"></div>'
      + '<div class="pick-list" id="pick-list">' + build('') + '</div>',
      sh => {
        const q = sh.querySelector('#pick-q');
        q.addEventListener('input', () => { sh.querySelector('#pick-list').innerHTML = build(q.value); });
        sh.addEventListener('click', e => {
          const b = e.target.closest('[data-pick]');
          if (!b) { return; }
          const name = b.dataset.pick;
          if (!exNames().some(n => same(n, name)) && !GROUP_OF[name.toLowerCase()]) { S.exercises.push(name); save(); }
          closeSheet(); onPick(canonical(name));
        });
        if (window.matchMedia('(min-width: 700px)').matches) { q.focus(); }
      });
  }
  /** Keep one spelling per exercise ("bench press" -> "Bench Press") */
  function canonical(name) {
    return exNames().concat(...Object.values(LIBRARY)).find(n => same(n, name)) || name;
  }

  /* ===================================================================== 1. DASHBOARD */
  function renderHome() {
    const el = $('tab-home');
    const t = today(), ws = weekStart(t), hr = new Date().getHours();
    const ws7 = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
    const days = new Set(S.workouts.map(w => w.date));
    const weekCount = ws7.filter(d => days.has(d)).length;
    const month = S.workouts.filter(w => w.date.slice(0, 7) === t.slice(0, 7));
    const body = S.body.slice().sort(byTime);
    const lastBody = body[body.length - 1];
    const ref30 = body.filter(b => b.date <= addDays(t, -28)).pop();
    const last = workouts()[0];

    let h = '<div class="hello"><small>' + thLong(t) + '</small><h2>' + (hr < 12 ? 'สวัสดีตอนเช้า' : hr < 17 ? 'สวัสดีตอนบ่าย' : 'สวัสดีตอนเย็น') + ' 👋</h2></div>';
    if (A) {
      const done = A.exercises.reduce((a, e) => a + e.sets.filter(s => s.done).length, 0);
      h += '<div class="card resume"><div class="card-head" style="margin:0"><div><span class="badge live">● กำลังฝึก</span>'
        + '<h3 style="margin-top:8px">' + esc(A.name) + '</h3><p class="muted small">' + A.exercises.length + ' ท่า · ทำแล้ว ' + done + ' เซ็ต</p></div>'
        + '<div class="timer" data-elapsed></div></div><button type="button" class="btn success block" style="margin-top:12px" data-act="resume">ทำต่อ</button></div>';
    } else {
      h += '<div class="card hero"><h3>พร้อมฝึกวันนี้ไหม?</h3><p>เริ่มแบบว่าง หรือเลือกจากตารางฝึกที่เตรียมไว้</p>'
        + '<div class="btn-row"><button type="button" class="btn" data-act="start-blank">+ เริ่ม Workout</button>'
        + '<button type="button" class="btn alt" data-act="start-routine">จากตารางฝึก</button></div></div>';
    }
    h += '<div class="grid2">'
      + '<div class="stat" style="grid-column:1/-1"><div class="k">สัปดาห์นี้</div><div class="v">' + weekCount + '<small>/ 7 วัน</small></div>'
      + '<div class="week">' + ws7.map((d, i) => '<span><i class="' + (days.has(d) ? 'on' : '') + (d === t ? ' today' : '') + '">' + (days.has(d) ? '✓' : '') + '</i>' + TH_DS[i] + '</span>').join('') + '</div></div>'
      + '<div class="stat"><div class="k">เดือนนี้</div><div class="v">' + month.length + '<small>ครั้ง</small></div><div class="s">' + month.reduce((a, w) => a + wSets(w), 0) + ' เซ็ต · ' + fmt(month.reduce((a, w) => a + wVolume(w), 0) / 1000) + ' ตัน</div></div>'
      + '<div class="stat tap" data-act="body"><div class="k">น้ำหนักตัว</div>'
      + (lastBody ? '<div class="v">' + fmt(lastBody.kg) + '<small>kg</small></div><div class="s">' + (ref30 ? bodyDelta(lastBody.kg - ref30.kg, 'kg') + ' ใน 4 สัปดาห์' : thShort(lastBody.date)) + '</div>'
        + sparkline(body) + (S.settings.goalKg ? '<div class="s goal-s">🎯 ' + esc(goalLeft(bodyAvg(body).pop().y)) + '</div>' : '')
        : '<div class="v" style="font-size:20px;margin-top:8px">+ บันทึก</div><div class="s">แตะเพื่อเพิ่ม</div>') + '</div></div>';

    h += '<div class="section-title"><h2>Workout ล่าสุด</h2>' + (last ? '<button type="button" class="link" data-act="all-history">ดูทั้งหมด</button>' : '') + '</div>';
    h += last ? historyItem(last) : '<div class="card flat empty"><b>ยังไม่มี Workout</b>กด "เริ่ม Workout" แล้วบันทึกครั้งแรกได้เลย</div>';

    const ups = improvements();
    h += '<div class="section-title"><h2>พัฒนาขึ้น / สถิติใหม่</h2></div><div class="card"><div class="mini-list">'
      + (ups.length ? ups.map(u => '<div class="mini"><div class="ic' + (u.pr ? '' : ' blue') + '">' + (u.pr ? '★' : '↑') + '</div><div class="t"><b>' + esc(u.name) + '</b><small>' + esc(u.sub) + '</small></div>'
        + '<div class="r">' + esc(u.val) + '<small class="up">' + esc(u.delta) + '</small></div></div>').join('')
        : '<div class="empty" style="padding:8px"><b>ยังไม่มีข้อมูลพอ</b>ฝึกท่าเดิมอย่างน้อย 2 ครั้ง แล้วจะเห็นพัฒนาการที่นี่</div>') + '</div></div>';
    el.innerHTML = h;
  }
  /** PRs of the last 30 days, else exercises whose best 1RM of the last 4 weeks beats the 4 weeks before */
  function improvements() {
    const t = today(), out = [];
    workouts().filter(w => w.date > addDays(t, -30)).forEach(w => prsOf(w).forEach(p => {
      if (out.some(o => same(o.name, p.name))) { return; }
      const before = exHistory(p.name).filter(x => byTime(x.w, w) < 0);
      const prevBest = Math.max(...before.map(x => num(bestSet(x.sets).kg)));
      out.push({ pr: true, name: p.name, sub: 'PR ' + p.kinds.join(' · ') + ' · ' + thShort(w.date), val: setText(p.set) + ' kg',
        delta: num(p.set.kg) > prevBest ? '+' + fmt(num(p.set.kg) - prevBest) + ' kg' : '' });
    }));
    if (out.length < 5) {
      exNames().forEach(n => {
        if (out.length >= 5 || out.some(o => same(o.name, n))) { return; }
        const h = exHistory(n);
        const cur = h.filter(x => x.w.date > addDays(t, -28)), old = h.filter(x => x.w.date <= addDays(t, -28) && x.w.date > addDays(t, -56));
        if (!cur.length || !old.length) { return; }
        const a = Math.max(...old.map(x => best1rm(x.sets))), b = Math.max(...cur.map(x => best1rm(x.sets)));
        if (b > a + 0.5) { out.push({ name: n, sub: '1RM ประมาณ 4 สัปดาห์ล่าสุด', val: fmt(b) + ' kg', delta: '+' + fmt((b - a) / a * 100) + '%' }); }
      });
    }
    return out.slice(0, 5);
  }
  function deltaHtml(d, unit, lowerIsGood) {
    if (Math.abs(d) < 0.05) { return '<span class="same">±0 ' + unit + '</span>'; }
    const good = lowerIsGood ? d < 0 : d > 0;
    return '<span class="' + (good ? 'up' : 'down') + '">' + (d > 0 ? '+' : '') + fmt(d) + ' ' + unit + '</span>';
  }

  /* ----------------------------------------------------------- body weight trend */
  /** Body weight change, coloured by the goal: lose -> down is green, gain -> up is green, otherwise neutral. */
  function bodyDelta(d, unit) {
    if (Math.abs(d) < 0.05) { return '<span class="same">±0 ' + unit + '</span>'; }
    const dir = S.settings.goalDir;
    const cls = dir === 'lose' ? (d < 0 ? 'up' : 'down') : dir === 'gain' ? (d > 0 ? 'up' : 'down') : dir === 'keep' ? 'down' : 'same';
    return '<span class="' + cls + '">' + (d > 0 ? '+' : '') + fmt(d) + ' ' + unit + '</span>';
  }
  /** 7-day average for every weigh-in (mean of the weigh-ins of that day and the 6 days before). list = sorted by date */
  function bodyAvg(list) {
    return list.map(b => {
      const from = addDays(b.date, -6), win = list.filter(x => x.date >= from && x.date <= b.date);
      return { d: b.date, y: win.reduce((a, x) => a + x.kg, 0) / win.length };
    });
  }
  /** kg per week from a straight line through the weigh-ins (null when they cover less than 7 days). */
  function bodyRate(list) {
    if (list.length < 2 || diffDays(list[0].date, list[list.length - 1].date) < 7) { return null; }
    const t0 = parse(list[0].date).getTime();
    const xs = list.map(b => (parse(b.date).getTime() - t0) / (7 * 864e5)), ys = list.map(b => b.kg);
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
    let sxx = 0, sxy = 0;
    xs.forEach((x, i) => { sxx += (x - mx) ** 2; sxy += (x - mx) * (ys[i] - my); });
    return sxx ? sxy / sxx : null;
  }
  /** "เหลืออีก 3.2 kg" / "ถึงเป้าแล้ว" ('' without a goal). */
  function goalLeft(kg) {
    const g = S.settings.goalKg, dir = S.settings.goalDir;
    if (!g) { return ''; }
    if (Math.abs(g - kg) < 0.1 || (dir === 'lose' && kg <= g) || (dir === 'gain' && kg >= g)) { return dir === 'keep' ? 'อยู่ที่เป้า' : 'ถึงเป้าแล้ว 🎉'; }
    return 'เหลืออีก ' + fmt(Math.abs(g - kg)) + ' kg';
  }
  /** Estimated date the goal is reached at the current rate ('' when moving away from it or no goal). */
  function goalEta(kg, rate) {
    const g = S.settings.goalKg;
    if (!g || rate == null || Math.abs(rate) < 0.05 || S.settings.goalDir === 'keep') { return ''; }
    const weeks = (g - kg) / rate;
    if (weeks <= 0 || weeks > 260) { return ''; }
    return 'ถึงเป้าประมาณ ' + thShort(addDays(today(), Math.round(weeks * 7)));
  }
  /** Tiny trend line (7-day average of the last 30 days) for the dashboard. */
  function sparkline(list) {
    const pts = bodyAvg(list).filter(p => p.d > addDays(today(), -30));
    if (pts.length < 2) { return ''; }
    const W = 160, H = 34, ys = pts.map(p => p.y), xs = pts.map(p => parse(p.d).getTime());
    const goal = S.settings.goalKg;
    let y0 = Math.min(...ys), y1 = Math.max(...ys);
    if (goal && Math.abs(goal - (y0 + y1) / 2) < 6) { y0 = Math.min(y0, goal); y1 = Math.max(y1, goal); }
    if (y1 - y0 < 0.5) { y0 -= 0.25; y1 += 0.25; }
    const X = t => (t - xs[0]) / ((xs[xs.length - 1] - xs[0]) || 1) * (W - 6) + 3, Y = v => H - 3 - (v - y0) / (y1 - y0) * (H - 6);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + X(xs[i]).toFixed(1) + ' ' + Y(p.y).toFixed(1)).join(' ');
    return '<svg class="spark" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true">'
      + (goal && goal >= y0 && goal <= y1 ? '<line x1="0" x2="' + W + '" y1="' + Y(goal).toFixed(1) + '" y2="' + Y(goal).toFixed(1) + '" class="spark-goal"/>' : '')
      + '<path d="' + d + '" class="spark-line"/><circle cx="' + X(xs[xs.length - 1]).toFixed(1) + '" cy="' + Y(ys[ys.length - 1]).toFixed(1) + '" r="3" class="spark-dot"/></svg>';
  }
  $('tab-home').addEventListener('click', e => {
    const a = e.target.closest('[data-act]');
    if (a) {
      ({ resume: () => go('workout'), 'start-blank': () => startWorkout(null), 'start-routine': chooseRoutine, body: () => bodySheet(),
        'all-history': () => { histId = null; go('history'); } })[a.dataset.act]();
      return;
    }
    const item = e.target.closest('[data-wid]');
    if (item) { histId = item.dataset.wid; E = null; go('history'); }
  });
  function chooseRoutine() {
    if (!S.routines.length) { toast('ยังไม่มีตารางฝึก — สร้างในเมนู "ตารางฝึก"'); go('routines'); return; }
    openSheet('<h2>เริ่มจากตารางฝึก</h2><p class="lead">เลือกตารางที่จะเล่นวันนี้</p><div class="pick-list">'
      + S.routines.map(r => '<button type="button" class="pick" data-rid="' + r.id + '"><span>' + esc(r.name) + '</span><small>' + r.exercises.length + ' ท่า · ~'
        + routineMinutes(r) + ' นาที</small></button>').join('') + '</div>',
      sh => sh.addEventListener('click', e => {
        const b = e.target.closest('[data-rid]');
        if (b) { closeSheet(); startWorkout(S.routines.find(r => r.id === b.dataset.rid)); }
      }));
  }

  /* ===================================================================== 2. WORKOUT */
  async function startWorkout(routine, fromWorkout) {
    if (A) {
      const ok = await ask('มี Workout ที่ยังไม่จบ', '"' + A.name + '" — เริ่มอันใหม่จะยกเลิกอันเดิม', 'เริ่มใหม่', true);
      if (!ok) { go('workout'); return; }
    }
    const h = new Date().getHours();
    const src = routine ? routine.exercises.map(e => ({ name: e.name, n: e.sets, target: e.reps, rest: e.rest }))
      : fromWorkout ? fromWorkout.exercises.map(e => ({ name: e.name, n: e.sets.length, target: null, rest: S.settings.rest, sets: e.sets })) : [];
    A = {
      id: uid(), routineId: routine ? routine.id : null, start: Date.now(), date: today(), note: '', restEnd: null, restTotal: 0,
      name: routine ? routine.name : fromWorkout ? fromWorkout.name : (h < 11 ? 'Workout ช่วงเช้า' : h < 16 ? 'Workout ช่วงบ่าย' : 'Workout ช่วงเย็น'),
      exercises: src.map(x => newExercise(x.name, x.n, x.target, x.rest)),
    };
    saveActive();
    go('workout');
  }
  /** Exercise of a live workout, kg pre-filled from the last time (reps are left for the user). */
  function newExercise(name, n, target, rest) {
    const prev = previous(name, null);
    const sets = Array.from({ length: Math.max(1, n || 1) }, (_, j) => {
      const p = prev ? prev.sets[Math.min(j, prev.sets.length - 1)] : null;
      return { kg: p ? String(num(p.kg)) : '', r: '', done: false };
    });
    return { name, rest: rest || S.settings.rest, target: target || null, sets };
  }

  function renderWorkoutTab() {
    const el = $('tab-workout');
    if (!A) {
      const recent = workouts().slice(0, 3);
      el.innerHTML = '<div class="card hero" style="margin-top:14px"><h3>เริ่ม Workout ใหม่</h3><p>ระบบจะบันทึกระหว่างฝึกให้อัตโนมัติ ปิดแอปแล้วกลับมาทำต่อได้</p>'
        + '<div class="btn-row"><button type="button" class="btn" data-act="start-blank">+ เริ่มแบบว่าง</button></div></div>'
        + '<div class="section-title"><h2>ตารางฝึกของฉัน</h2><button type="button" class="link" data-act="routines">จัดการ</button></div>'
        + (S.routines.length ? S.routines.map(r => '<div class="card routine"><div class="card-head" style="margin:0"><div style="min-width:0"><div class="r-name">' + esc(r.name) + '</div>'
          + '<div class="r-meta">' + r.exercises.length + ' ท่า · ' + r.exercises.reduce((a, x) => a + num(x.sets), 0) + ' เซ็ต · ~' + routineMinutes(r) + ' นาที</div></div>'
          + '<button type="button" class="btn primary sm" data-start="' + r.id + '">เริ่ม</button></div></div>').join('')
          : '<div class="card flat empty"><b>ยังไม่มีตารางฝึก</b>สร้างได้ในเมนู "ตารางฝึก"</div>')
        + (recent.length ? '<div class="section-title"><h2>ทำซ้ำ Workout ล่าสุด</h2></div>'
          + recent.map(w => '<div class="card routine"><div class="card-head" style="margin:0"><div style="min-width:0"><div class="r-name">' + esc(w.name) + '</div>'
            + '<div class="r-meta">' + thShort(w.date) + ' · ' + w.exercises.map(x => esc(x.name)).join(', ') + '</div></div>'
            + '<button type="button" class="btn soft sm" data-repeat="' + w.id + '">ทำซ้ำ</button></div></div>').join('') : '');
      return;
    }
    el.innerHTML = sessionHtml(A, 'live');
  }

  /** The workout editor - live workout (A) or a saved one being corrected (E). */
  function sessionHtml(s, mode) {
    const live = mode === 'live';
    const done = s.exercises.reduce((a, e) => a + e.sets.filter(x => x.done).length, 0);
    const total = s.exercises.reduce((a, e) => a + e.sets.length, 0);
    let h = '<div class="card"><div class="wo-head"><div class="grow"><input class="wo-name" data-f="name" value="' + esc(s.name) + '" aria-label="ชื่อ Workout">'
      + '<div class="wo-meta">' + (live ? '<span>⏱ <b data-elapsed></b></span>' : '<span>แก้ไขข้อมูลที่บันทึกไว้</span>')
      + '<span>เซ็ต <b data-done>' + done + '/' + total + '</b></span><span>Volume <b data-vol>' + fmt(liveVolume(s), 0) + '</b> kg</span></div></div></div>'
      + (live ? '' : '<div class="row2"><label class="field"><span>วันที่</span><input type="date" data-f="date" value="' + esc(s.date) + '"></label>'
        + '<label class="field"><span>เวลาฝึก (นาที)</span><input type="number" min="0" max="600" inputmode="numeric" data-f="minutes" value="' + (s.minutes == null ? '' : s.minutes) + '"></label></div>')
      + '</div>';

    s.exercises.forEach((ex, i) => {
      const prev = previous(ex.name, live ? null : { id: s.editId, date: s.date, start: s.start });
      h += '<div class="card ex-card"><div class="ex-top"><div class="grow"><div class="ex-title">' + esc(ex.name) + '</div><div class="ex-sub">'
        + (live ? 'พัก ' + clock(ex.rest || S.settings.rest) + (ex.target ? ' · เป้า ' + ex.target + ' ครั้ง' : '') + ' · ' : '')
        + (prev ? 'ครั้งก่อน ' + thShort(prev.w.date) + ': ' + prev.sets.map(setText).join(', ') : 'ท่าใหม่ — ยังไม่มีข้อมูลครั้งก่อน') + '</div></div>'
        + '<div class="ex-menu"><button type="button" class="icon-btn" data-act="exmenu" data-i="' + i + '" aria-label="ตัวเลือกท่า">⋯</button></div></div>'
        + '<div class="sets"><div class="set-h"><span>เซ็ต</span><span>ครั้งก่อน</span><span>kg</span><span>ครั้ง</span><span></span></div>'
        + ex.sets.map((st, j) => {
          const p = prev ? prev.sets[j] : null;
          return '<div class="set' + (st.done ? ' done' : '') + '" data-i="' + i + '" data-j="' + j + '">'
            + '<button type="button" class="no" data-act="setmenu" aria-label="ตัวเลือกเซ็ต ' + (j + 1) + '">' + (j + 1) + '</button>'
            + '<button type="button" class="prev" data-act="useprev" ' + (p ? '' : 'disabled') + '>' + (p ? setText(p) : '—') + '</button>'
            + '<input type="number" inputmode="decimal" step="0.5" min="0" data-f="kg" value="' + esc(st.kg) + '" placeholder="' + (p ? fmt(num(p.kg)) : 'kg') + '" aria-label="น้ำหนัก เซ็ต ' + (j + 1) + '">'
            + '<div><input type="number" inputmode="numeric" step="1" min="0" data-f="r" value="' + esc(st.r) + '" placeholder="' + (ex.target || (p ? num(p.r) : 'ครั้ง')) + '" aria-label="จำนวนครั้ง เซ็ต ' + (j + 1) + '"></div>'
            + '<button type="button" class="tick" data-act="tick" aria-label="จบเซ็ต ' + (j + 1) + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 10 17 19 7"/></svg></button></div>';
        }).join('') + '</div>'
        + '<div class="ex-actions"><button type="button" class="btn soft sm" data-act="addset" data-i="' + i + '">+ เพิ่มเซ็ต</button></div></div>';
    });

    h += '<button type="button" class="btn ghost block" data-act="addex" style="margin-top:4px">+ เพิ่มท่า</button>'
      + '<label class="field"><span>โน้ต</span><textarea rows="2" data-f="note" placeholder="เช่น วันนี้แรงดี, ไหล่ตึงนิดหน่อย">' + esc(s.note || '') + '</textarea></label>'
      + '<div class="sticky-finish">' + (live
        ? '<button type="button" class="btn success block" data-act="finish">✓ จบการฝึก</button>'
        : '<div class="btn-row" style="margin:0"><button type="button" class="btn soft" data-act="cancel-edit">ยกเลิก</button><button type="button" class="btn primary" data-act="save-edit">บันทึกการแก้ไข</button></div>')
      + '</div>' + (live ? '<div class="center" style="margin-top:8px"><button type="button" class="link danger" data-act="discard">ยกเลิก Workout นี้</button></div>' : '');
    return h;
  }
  const liveVolume = s => s.exercises.reduce((a, e) => a + e.sets.filter(x => x.done || s.editId).reduce((b, x) => b + num(x.kg) * num(x.r), 0), 0);

  /* --- events of the workout editor (both tabs use the same code) */
  const sessionOf = el => (el.closest('#tab-workout') ? A : E);
  let saveT = 0;
  function persist(s) {
    if (s === A) { clearTimeout(saveT); saveT = setTimeout(saveActive, 250); }
  }
  function refreshMeta(root, s) {
    const done = s.exercises.reduce((a, e) => a + e.sets.filter(x => x.done).length, 0);
    const total = s.exercises.reduce((a, e) => a + e.sets.length, 0);
    const d = root.querySelector('[data-done]'); if (d) { d.textContent = done + '/' + total; }
    const v = root.querySelector('[data-vol]'); if (v) { v.textContent = fmt(liveVolume(s), 0); }
  }
  function onSessionInput(e) {
    const s = sessionOf(e.target), f = e.target.dataset.f;
    if (!s || !f) { return; }
    const row = e.target.closest('.set');
    if (row) { s.exercises[row.dataset.i].sets[row.dataset.j][f] = e.target.value; }
    else if (f === 'minutes') { s.minutes = e.target.value === '' ? null : Math.round(num(e.target.value)); }
    else { s[f] = e.target.value; }
    refreshMeta(e.currentTarget, s);
    persist(s);
  }
  function rerender(s) { s === A ? renderWorkoutTab() : renderHistory(); }
  async function onSessionClick(e) {
    const s = sessionOf(e.target);
    const a = e.target.closest('[data-act]');
    if (!a) {
      const st = e.target.closest('[data-start]'), rp = e.target.closest('[data-repeat]');
      if (st) { startWorkout(S.routines.find(r => r.id === st.dataset.start)); }
      if (rp) { startWorkout(null, S.workouts.find(w => w.id === rp.dataset.repeat)); }
      return;
    }
    const act = a.dataset.act;
    if (act === 'start-blank') { return startWorkout(null); }
    if (act === 'routines') { R = null; return go('routines'); }
    if (!s) { return; }
    const row = a.closest('.set');
    const i = row ? +row.dataset.i : +a.dataset.i, j = row ? +row.dataset.j : -1;
    const ex = s.exercises[i];

    if (act === 'tick') {
      const st = ex.sets[j];
      if (!st.done) {
        const prev = previous(ex.name, s === A ? null : { id: s.editId, date: s.date, start: s.start });
        const p = prev ? prev.sets[j] || prev.sets[prev.sets.length - 1] : null;
        if (st.r === '' || st.r == null) { st.r = String(ex.target || (p ? num(p.r) : '')); }
        if (st.kg === '' || st.kg == null) { st.kg = p ? String(num(p.kg)) : '0'; }
        if (!num(st.r)) { toast('ใส่จำนวนครั้งก่อนกดจบเซ็ต'); st.r = ''; rerender(s); return; }
        st.done = true;
        if (s === A) { startRest(ex.rest || S.settings.rest); }
      } else { st.done = false; }
      persist(s); rerender(s); return;
    }
    if (act === 'useprev') {
      const prev = previous(ex.name, s === A ? null : { id: s.editId, date: s.date, start: s.start });
      const p = prev && prev.sets[j];
      if (p) { ex.sets[j].kg = String(num(p.kg)); ex.sets[j].r = String(num(p.r)); persist(s); rerender(s); }
      return;
    }
    if (act === 'addset') {
      const lastSet = ex.sets[ex.sets.length - 1];
      ex.sets.push({ kg: lastSet ? lastSet.kg : '', r: lastSet && !lastSet.done ? lastSet.r : (ex.target ? '' : (lastSet ? lastSet.r : '')), done: !!s.editId });
      persist(s); rerender(s); return;
    }
    if (act === 'setmenu') {
      openSheet('<h2>' + esc(ex.name) + ' · เซ็ต ' + (j + 1) + '</h2><div class="pick-list">'
        + '<button type="button" class="pick" data-m="dup"><span>คัดลอกเซ็ตนี้</span><small>เพิ่มเซ็ตเดียวกันต่อท้าย</small></button>'
        + '<button type="button" class="pick" data-m="del"><span style="color:#fb7185">ลบเซ็ตนี้</span></button></div>',
        sh => sh.addEventListener('click', ev => {
          const m = ev.target.closest('[data-m]'); if (!m) { return; }
          if (m.dataset.m === 'dup') { ex.sets.splice(j + 1, 0, { ...ex.sets[j], done: !!s.editId }); }
          else if (ex.sets.length > 1) { ex.sets.splice(j, 1); }
          else { ex.sets[0] = { kg: '', r: '', done: false }; }
          closeSheet(); persist(s); rerender(s);
        }));
      return;
    }
    if (act === 'exmenu') {
      openSheet('<h2>' + esc(ex.name) + '</h2><div class="pick-list">'
        + (i > 0 ? '<button type="button" class="pick" data-m="up"><span>↑ ย้ายขึ้น</span></button>' : '')
        + (i < s.exercises.length - 1 ? '<button type="button" class="pick" data-m="down"><span>↓ ย้ายลง</span></button>' : '')
        + '<button type="button" class="pick" data-m="swap"><span>เปลี่ยนเป็นท่าอื่น</span></button>'
        + (s === A ? '<div class="pick-h">เวลาพักของท่านี้</div><div class="chips" style="padding:6px 0">' + [45, 60, 90, 120, 150, 180, 240].map(t => '<button type="button" class="chip' + ((ex.rest || S.settings.rest) === t ? ' is-on' : '') + '" data-rest-set="' + t + '">' + clock(t) + '</button>').join('') + '</div>' : '')
        + '<button type="button" class="pick" data-m="del"><span style="color:#fb7185">ลบท่านี้ออกจาก Workout</span></button></div>',
        sh => sh.addEventListener('click', async ev => {
          const rs = ev.target.closest('[data-rest-set]');
          if (rs) { ex.rest = +rs.dataset.restSet; persist(s); closeSheet(); rerender(s); return; }
          const m = ev.target.closest('[data-m]'); if (!m) { return; }
          closeSheet();
          if (m.dataset.m === 'up' || m.dataset.m === 'down') {
            const k = m.dataset.m === 'up' ? i - 1 : i + 1;
            [s.exercises[i], s.exercises[k]] = [s.exercises[k], s.exercises[i]];
          } else if (m.dataset.m === 'swap') {
            pickExercise(name => { ex.name = name; persist(s); rerender(s); }, 'เปลี่ยนเป็นท่า');
            return;
          } else if (m.dataset.m === 'del') {
            if (ex.sets.some(x => x.done) && !(await ask('ลบ ' + ex.name + '?', 'เซ็ตที่ทำไปแล้วของท่านี้จะหายไป', 'ลบท่า', true))) { return; }
            s.exercises.splice(i, 1);
          }
          persist(s); rerender(s);
        }));
      return;
    }
    if (act === 'addex') {
      pickExercise(name => {
        const ne = newExercise(name, 3, null, S.settings.rest);
        if (s.editId) { ne.sets.forEach(x => { x.done = true; }); }
        s.exercises.push(ne); persist(s); rerender(s);
        setTimeout(() => { const cards = document.querySelectorAll('#tab-' + (s === A ? 'workout' : 'history') + ' .ex-card'); const c = cards[cards.length - 1]; if (c) { c.scrollIntoView({ behavior: 'smooth', block: 'center' }); } }, 50);
      });
      return;
    }
    if (act === 'finish') { return finishWorkout(); }
    if (act === 'discard') {
      if (await ask('ยกเลิก Workout นี้?', 'ข้อมูลที่บันทึกระหว่างฝึกจะหายทั้งหมด', 'ยกเลิก Workout', true)) { A = null; saveActive(); tick(); renderWorkoutTab(); toast('ยกเลิกแล้ว'); }
      return;
    }
    if (act === 'cancel-edit') { E = null; renderHistory(); return; }
    if (act === 'save-edit') { return saveEdit(); }
  }
  ['tab-workout', 'tab-history'].forEach(id => {
    $(id).addEventListener('input', onSessionInput);
    $(id).addEventListener('click', onSessionClick);
  });

  /** Sets that count: ticked sets with reps (kg 0 = body weight). */
  const keptSets = (ex, all) => ex.sets.filter(x => (all || x.done) && num(x.r) > 0).map(x => ({ kg: num(x.kg), r: Math.round(num(x.r)) }));
  async function finishWorkout() {
    let all = false;
    const doneCount = A.exercises.reduce((a, e) => a + keptSets(e, false).length, 0);
    if (!doneCount) {
      const filled = A.exercises.reduce((a, e) => a + keptSets(e, true).length, 0);
      if (!filled) { toast('ยังไม่มีเซ็ตที่ทำ — กรอกครั้งแล้วกด ✓ ที่เซ็ต'); return; }
      if (!(await ask('ยังไม่ได้กด ✓ เซ็ตไหนเลย', 'บันทึกทุกเซ็ตที่กรอกจำนวนครั้งไว้ (' + filled + ' เซ็ต)?', 'บันทึกทั้งหมด'))) { return; }
      all = true;
    } else {
      const undone = A.exercises.reduce((a, e) => a + e.sets.filter(x => !x.done).length, 0);
      if (undone && !(await ask('จบการฝึก?', 'มี ' + undone + ' เซ็ตที่ยังไม่ได้กด ✓ จะไม่ถูกบันทึก', 'จบการฝึก'))) { return; }
    }
    const w = {
      id: A.id, date: A.date, start: A.start, end: Date.now(), name: A.name.trim() || 'Workout', routineId: A.routineId, note: (A.note || '').trim(),
      exercises: A.exercises.map(e => ({ name: e.name, sets: keptSets(e, all) })).filter(e => e.sets.length),
    };
    S.workouts.push(w);
    w.exercises.forEach(e => { if (!exNames().some(n => same(n, e.name))) { S.exercises.push(e.name); } });
    save();
    A = null; saveActive(); tick();
    renderWorkoutTab();
    summarySheet(w);
  }
  function summarySheet(w) {
    const prs = prsOf(w);
    openSheet('<div class="summary-hero"><div class="trophy">' + (prs.length ? '★' : '✓') + '</div><h2>' + (prs.length ? 'เยี่ยมมาก! ทำสถิติใหม่ ' + prs.length + ' ท่า' : 'จบการฝึกแล้ว เก่งมาก!') + '</h2>'
      + '<p class="lead">' + esc(w.name) + ' · ' + thShort(w.date) + '</p></div>'
      + '<div class="kpis"><div class="kpi"><b>' + durText(wMinutes(w)) + '</b><small>เวลา</small></div><div class="kpi"><b>' + w.exercises.length + '</b><small>ท่า</small></div>'
      + '<div class="kpi"><b>' + wSets(w) + '</b><small>เซ็ต</small></div><div class="kpi"><b>' + fmt(wVolume(w), 0) + '</b><small>kg Volume</small></div></div>'
      + (prs.length ? '<div class="pr-list">' + prs.map(p => '<div class="mini"><div class="ic">★</div><div class="t"><b>' + esc(p.name) + '</b><small>PR ' + esc(p.kinds.join(' · ')) + '</small></div><div class="r">' + setText(p.set) + ' kg</div></div>').join('') + '</div>' : '')
      + '<div class="btn-row" style="margin-top:18px"><button type="button" class="btn soft" data-close>ปิด</button><button type="button" class="btn primary" id="sum-detail">ดูรายละเอียด</button></div>',
      sh => { sh.querySelector('#sum-detail').onclick = () => { closeSheet(); histId = w.id; E = null; go('history'); }; });
  }

  /* ===================================================================== 3. ROUTINES */
  const routineMinutes = r => Math.max(5, Math.round(r.exercises.reduce((a, x) => a + num(x.sets) * (40 + num(x.rest)), 0) / 60));
  function renderRoutines() {
    const el = $('tab-routines');
    if (R) { el.innerHTML = routineEditorHtml(); return; }
    el.innerHTML = '<button type="button" class="btn primary block" data-act="new" style="margin-top:12px">+ สร้างตารางฝึกใหม่</button>'
      + (S.routines.length ? S.routines.map(r => '<div class="card routine"><div class="r-name">' + esc(r.name) + '</div>'
        + '<div class="r-meta">' + r.exercises.length + ' ท่า · ' + r.exercises.reduce((a, x) => a + num(x.sets), 0) + ' เซ็ต · ประมาณ ' + routineMinutes(r) + ' นาที</div>'
        + '<div class="r-ex">' + r.exercises.map(x => esc(x.name) + ' <span class="muted">' + x.sets + '×' + x.reps + '</span>').join(' · ') + '</div>'
        + '<div class="btn-row"><button type="button" class="btn primary sm" data-act="start" data-id="' + r.id + '">▶ เริ่ม</button>'
        + '<button type="button" class="btn soft sm" data-act="edit" data-id="' + r.id + '">แก้ไข</button>'
        + '<button type="button" class="btn soft sm" data-act="dup" data-id="' + r.id + '">สำเนา</button>'
        + '<button type="button" class="btn danger sm" data-act="del" data-id="' + r.id + '" aria-label="ลบ">ลบ</button></div></div>').join('')
        : '<div class="card flat empty"><b>ยังไม่มีตารางฝึก</b>สร้างตาราง เช่น Push / Pull / Legs แล้วกดเริ่มได้ทันที</div>');
  }
  function routineEditorHtml() {
    return '<div class="card"><label class="field" style="margin-top:0"><span>ชื่อตารางฝึก</span><input type="text" data-rf="name" value="' + esc(R.name) + '" placeholder="เช่น Push, Pull, Legs, วันอก" maxlength="60"></label>'
      + '<div class="chips" style="margin-top:10px">' + ['Push', 'Pull', 'Legs', 'Upper', 'Lower', 'วันอก', 'วันหลัง', 'วันขา', 'Full Body'].map(n => '<button type="button" class="chip" data-name="' + n + '">' + n + '</button>').join('') + '</div></div>'
      + '<div class="card"><div class="card-head"><h3>ท่าในตาราง (' + R.exercises.length + ')</h3><span class="muted small">เรียงตามลำดับที่เล่น</span></div>'
      + (R.exercises.length ? R.exercises.map((x, i) => '<div class="rt-row" data-i="' + i + '"><div class="nm">' + (i + 1) + '. ' + esc(x.name) + '</div>'
        + '<div class="rt-btns"><button type="button" class="icon-btn" data-ract="up" ' + (i ? '' : 'disabled') + ' aria-label="ย้ายขึ้น">↑</button>'
        + '<button type="button" class="icon-btn" data-ract="down" ' + (i < R.exercises.length - 1 ? '' : 'disabled') + ' aria-label="ย้ายลง">↓</button>'
        + '<button type="button" class="icon-btn" data-ract="del" aria-label="ลบท่า" style="color:#fb7185">×</button></div>'
        + '<div class="rt-nums"><label>เซ็ต<input type="number" min="1" max="20" inputmode="numeric" data-rx="sets" value="' + x.sets + '"></label>'
        + '<label>ครั้งเป้าหมาย<input type="number" min="1" max="100" inputmode="numeric" data-rx="reps" value="' + x.reps + '"></label>'
        + '<label>พัก (วินาที)<input type="number" min="0" max="900" step="15" inputmode="numeric" data-rx="rest" value="' + x.rest + '"></label></div></div>').join('')
        : '<div class="empty" style="padding:10px">ยังไม่มีท่า — กด "+ เพิ่มท่า"</div>')
      + '<button type="button" class="btn ghost block" data-act="r-add" style="margin-top:10px">+ เพิ่มท่า</button></div>'
      + '<div class="btn-row"><button type="button" class="btn soft" data-act="r-cancel">ยกเลิก</button><button type="button" class="btn primary" data-act="r-save">บันทึกตาราง</button></div>';
  }
  $('tab-routines').addEventListener('input', e => {
    if (!R) { return; }
    if (e.target.dataset.rf === 'name') { R.name = e.target.value; }
    const rx = e.target.dataset.rx;
    if (rx) { R.exercises[e.target.closest('.rt-row').dataset.i][rx] = Math.max(0, Math.round(num(e.target.value))); }
  });
  $('tab-routines').addEventListener('click', async e => {
    const nm = e.target.closest('[data-name]');
    if (nm && R) { R.name = nm.dataset.name; renderRoutines(); return; }
    const ra = e.target.closest('[data-ract]');
    if (ra && R) {
      const i = +ra.closest('.rt-row').dataset.i;
      if (ra.dataset.ract === 'del') { R.exercises.splice(i, 1); }
      else { const k = ra.dataset.ract === 'up' ? i - 1 : i + 1; [R.exercises[i], R.exercises[k]] = [R.exercises[k], R.exercises[i]]; }
      renderRoutines(); return;
    }
    const a = e.target.closest('[data-act]');
    if (!a) { return; }
    const r = S.routines.find(x => x.id === a.dataset.id);
    switch (a.dataset.act) {
      case 'new': R = { id: null, name: '', exercises: [] }; renderRoutines(); window.scrollTo(0, 0); break;
      case 'edit': R = clone(r); renderRoutines(); window.scrollTo(0, 0); break;
      case 'dup': S.routines.splice(S.routines.indexOf(r) + 1, 0, { ...clone(r), id: uid(), name: r.name + ' (สำเนา)' }); save(); renderRoutines(); toast('ทำสำเนาแล้ว'); break;
      case 'del': if (await ask('ลบตาราง "' + r.name + '"?', 'ประวัติการฝึกที่เคยทำจากตารางนี้ยังอยู่ครบ', 'ลบตาราง', true)) { S.routines = S.routines.filter(x => x !== r); save(); renderRoutines(); toast('ลบตารางแล้ว'); } break;
      case 'start': startWorkout(r); break;
      case 'r-add': pickExercise(name => { R.exercises.push({ name, sets: 3, reps: 10, rest: S.settings.rest }); renderRoutines(); }); break;
      case 'r-cancel': R = null; renderRoutines(); break;
      case 'r-save': {
        R.name = R.name.trim();
        if (!R.name) { toast('ตั้งชื่อตารางก่อน'); return; }
        if (!R.exercises.length) { toast('เพิ่มอย่างน้อย 1 ท่า'); return; }
        R.exercises.forEach(x => { x.sets = Math.max(1, x.sets || 1); x.reps = Math.max(1, x.reps || 1); });
        if (R.id) { S.routines[S.routines.findIndex(x => x.id === R.id)] = R; } else { R.id = uid(); S.routines.push(R); }
        save(); R = null; renderRoutines(); toast('บันทึกตารางแล้ว');
        break;
      }
    }
  });

  /* ===================================================================== 4. HISTORY */
  let hq = '', hPeriod = 'all', hFrom = '', hTo = '';
  function historyItem(w) {
    const d = parse(w.date), prs = prsOf(w);
    return '<div class="card h-item" data-wid="' + w.id + '"><div class="h-date"><b>' + d.getDate() + '</b><small>' + TH_M[d.getMonth()] + '</small></div>'
      + '<div class="h-body"><div class="nm">' + esc(w.name) + (prs.length ? ' <span class="badge pr">★ PR ' + prs.length + '</span>' : '') + '</div>'
      + '<div class="ex">' + w.exercises.map(e => esc(e.name) + ' <span class="muted">' + e.sets.length + '×</span>').join(' · ') + '</div>'
      + '<div class="meta"><span>⏱ ' + durText(wMinutes(w)) + '</span><span>' + wSets(w) + ' เซ็ต</span><span>' + fmt(wVolume(w), 0) + ' kg</span>' + (w.start ? '<span>' + hhmm(w.start) + '</span>' : '') + '</div></div></div>';
  }
  function renderHistory() {
    const el = $('tab-history');
    if (E) { el.innerHTML = sessionHtml(E, 'edit'); return; }
    const w = histId && S.workouts.find(x => x.id === histId);
    if (w) { el.innerHTML = historyDetail(w); return; }
    histId = null;
    const t = today();
    const from = hPeriod === 'custom' ? hFrom : hPeriod === 'all' ? '' : addDays(t, -num(hPeriod));
    const to = hPeriod === 'custom' ? hTo : '';
    const q = hq.trim().toLowerCase();
    const list = workouts().filter(x => (!from || x.date >= from) && (!to || x.date <= to)
      && (!q || x.name.toLowerCase().includes(q) || x.exercises.some(e => e.name.toLowerCase().includes(q))));
    let h = '<div class="search" style="margin-top:12px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>'
      + '<input type="search" id="h-q" value="' + esc(hq) + '" placeholder="ค้นหาชื่อท่า หรือชื่อ Workout"></div>'
      + '<div class="chips" style="margin-top:10px">' + [['all', 'ทั้งหมด'], ['7', '7 วัน'], ['30', '30 วัน'], ['90', '3 เดือน'], ['365', '1 ปี'], ['custom', 'เลือกวันที่']]
        .map(([k, l]) => '<button type="button" class="chip' + (hPeriod === k ? ' is-on' : '') + '" data-hp="' + k + '">' + l + '</button>').join('') + '</div>'
      + (hPeriod === 'custom' ? '<div class="custom-range"><label class="field"><span>ตั้งแต่</span><input type="date" id="h-from" value="' + hFrom + '"></label><label class="field"><span>ถึง</span><input type="date" id="h-to" value="' + hTo + '"></label></div>' : '');
    if (!list.length) {
      h += '<div class="card flat empty" style="margin-top:14px"><b>' + (S.workouts.length ? 'ไม่พบ Workout ที่ตรงเงื่อนไข' : 'ยังไม่มีประวัติ') + '</b>' + (S.workouts.length ? 'ลองเปลี่ยนคำค้นหรือช่วงวันที่' : 'จบ Workout แรกแล้วจะเห็นที่นี่') + '</div>';
    } else {
      h += '<p class="muted small" style="margin:12px 4px 0">' + list.length + ' Workout · ' + list.reduce((a, x) => a + wSets(x), 0) + ' เซ็ต · ' + fmt(list.reduce((a, x) => a + wVolume(x), 0) / 1000) + ' ตัน</p>';
      let month = '';
      list.forEach(x => {
        const m = x.date.slice(0, 7);
        if (m !== month) { month = m; const d = parse(x.date); h += '<div class="month-h">' + TH_MF[d.getMonth()] + ' ' + (d.getFullYear() + 543) + '</div>'; }
        h += historyItem(x);
      });
    }
    el.innerHTML = h;
  }
  function historyDetail(w) {
    const prs = prsOf(w);
    let h = '<button type="button" class="link" data-hact="back" style="margin-top:8px">‹ กลับไปประวัติ</button>'
      + '<div class="card"><h2 style="font-size:20px">' + esc(w.name) + '</h2><p class="muted small" style="margin-top:4px">' + thLong(w.date) + (w.start ? ' · ' + hhmm(w.start) + (w.end ? '–' + hhmm(w.end) : '') : '') + '</p>'
      + '<div class="kpis"><div class="kpi"><b>' + durText(wMinutes(w)) + '</b><small>เวลา</small></div><div class="kpi"><b>' + w.exercises.length + '</b><small>ท่า</small></div>'
      + '<div class="kpi"><b>' + wSets(w) + '</b><small>เซ็ต</small></div><div class="kpi"><b>' + fmt(wVolume(w), 0) + '</b><small>kg Volume</small></div></div>'
      + (w.note ? '<p style="margin-top:12px" class="muted">📝 ' + esc(w.note) + '</p>' : '') + '</div>';
    w.exercises.forEach(e => {
      const prev = previous(e.name, w);
      const pr = prs.find(p => same(p.name, e.name));
      const bs = bestSet(e.sets), pb = prev ? bestSet(prev.sets) : null;
      h += '<div class="card"><div class="card-head" style="margin-bottom:4px"><div><div class="ex-title">' + esc(e.name) + (pr ? ' <span class="badge pr">★ PR</span>' : '') + '</div>'
        + '<div class="ex-sub">' + (prev ? 'เทียบกับ ' + thShort(prev.w.date) : 'ครั้งแรกของท่านี้') + '</div></div>'
        + (pb ? '<div class="center"><div class="delta">' + deltaHtml(num(bs.kg) - num(pb.kg), 'kg') + '</div><small class="muted">เซ็ตหนักสุด</small></div>' : '') + '</div>'
        + '<table class="cmp-table"><tr><th>เซ็ต</th><th class="c">ครั้งนี้</th><th class="c">ครั้งก่อน</th><th class="c">ต่าง</th></tr>'
        + e.sets.map((s, j) => {
          const p = prev ? prev.sets[j] : null;
          let d = '<span class="same">—</span>';
          if (p) {
            const dk = num(s.kg) - num(p.kg), dr = num(s.r) - num(p.r);
            d = dk ? deltaHtml(dk, 'kg') : dr ? '<span class="' + (dr > 0 ? 'up' : 'down') + '">' + (dr > 0 ? '+' : '') + dr + ' ครั้ง</span>' : '<span class="same">เท่าเดิม</span>';
          }
          return '<tr><td>' + (j + 1) + '</td><td class="c"><b>' + setText(s) + '</b></td><td class="c muted">' + (p ? setText(p) : '—') + '</td><td class="c delta">' + d + '</td></tr>';
        }).join('')
        + '</table><p class="muted small" style="margin-top:8px">Volume ' + fmt(setsVol(e.sets), 0) + ' kg' + (prev ? ' (' + deltaHtml(setsVol(e.sets) - setsVol(prev.sets), 'kg') + ')' : '')
        + ' · 1RM ≈ ' + fmt(best1rm(e.sets)) + ' kg</p></div>';
    });
    h += '<div class="btn-row"><button type="button" class="btn soft" data-hact="edit">แก้ไข</button><button type="button" class="btn soft" data-hact="repeat">ทำซ้ำ</button>'
      + '<button type="button" class="btn danger" data-hact="del">ลบ</button></div>';
    return h;
  }
  $('tab-history').addEventListener('input', e => {
    if (e.target.id === 'h-q') { hq = e.target.value; const pos = e.target.selectionStart; renderHistory(); const q = $('h-q'); q.focus(); q.setSelectionRange(pos, pos); }
    if (e.target.id === 'h-from') { hFrom = e.target.value; renderHistory(); }
    if (e.target.id === 'h-to') { hTo = e.target.value; renderHistory(); }
  });
  $('tab-history').addEventListener('click', async e => {
    const p = e.target.closest('[data-hp]');
    if (p) { hPeriod = p.dataset.hp; if (hPeriod === 'custom' && !hFrom) { hFrom = addDays(today(), -30); hTo = today(); } renderHistory(); return; }
    const a = e.target.closest('[data-hact]');
    const w = histId && S.workouts.find(x => x.id === histId);
    if (a) {
      if (a.dataset.hact === 'back') { histId = null; renderHistory(); return; }
      if (a.dataset.hact === 'repeat') { startWorkout(null, w); return; }
      if (a.dataset.hact === 'edit') {
        E = { editId: w.id, name: w.name, date: w.date, start: w.start, minutes: wMinutes(w), note: w.note || '', routineId: w.routineId,
          exercises: w.exercises.map(x => ({ name: x.name, rest: S.settings.rest, target: null, sets: x.sets.map(s => ({ kg: String(s.kg), r: String(s.r), done: true })) })) };
        renderHistory(); window.scrollTo(0, 0); return;
      }
      if (a.dataset.hact === 'del') {
        if (await ask('ลบ Workout นี้?', w.name + ' · ' + thShort(w.date) + ' — ย้อนกลับไม่ได้', 'ลบ Workout', true)) {
          S.workouts = S.workouts.filter(x => x !== w); save(); histId = null; renderHistory(); toast('ลบแล้ว');
        }
        return;
      }
    }
    if (E) { return; }
    const item = e.target.closest('[data-wid]');
    if (item) { histId = item.dataset.wid; renderHistory(); window.scrollTo(0, 0); }
  });
  function saveEdit() {
    const w = S.workouts.find(x => x.id === E.editId);
    if (!w) { E = null; renderHistory(); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(E.date)) { toast('วันที่ไม่ถูกต้อง'); return; }
    const ex = E.exercises.map(e => ({ name: e.name, sets: keptSets(e, true) })).filter(e => e.sets.length);
    if (!ex.length) { toast('ต้องมีอย่างน้อย 1 เซ็ต — ถ้าจะลบทั้ง Workout ใช้ปุ่ม "ลบ"'); return; }
    w.name = E.name.trim() || 'Workout'; w.note = (E.note || '').trim(); w.exercises = ex;
    if (w.date !== E.date) { w.date = E.date; if (w.start) { const d = parse(E.date); const s = new Date(w.start); d.setHours(s.getHours(), s.getMinutes()); w.start = d.getTime(); } }
    if (E.minutes != null) { w.start = w.start || parse(w.date).setHours(18, 0, 0, 0); w.end = w.start + E.minutes * 60000; }
    save(); E = null; histId = w.id; renderHistory(); window.scrollTo(0, 0); toast('บันทึกการแก้ไขแล้ว');
  }

  /* ===================================================================== 5. PROGRESS */
  let pPeriod = '90', pFrom = '', pTo = '', pEx = '', pMetric = 'kg';
  function periodRange() {
    const t = today();
    if (pPeriod === 'week') { return [weekStart(t), t]; }
    if (pPeriod === 'month') { return [t.slice(0, 8) + '01', t]; }
    if (pPeriod === 'custom') { return [pFrom || addDays(t, -30), pTo || t]; }
    if (pPeriod === 'all') { const first = S.workouts.concat(S.body).map(x => x.date).sort()[0] || t; return [first, t]; }
    return [addDays(t, -num(pPeriod) + 1), t];
  }
  /**
   * points = [{ d, y, pr }]   opt.avg = [{ d, y }] trend line drawn on top (points become faint dots)
   *                           opt.goal = number -> dashed target line
   */
  function lineChart(points, unit, opt) {
    opt = opt || {};
    if (points.length < 2) {
      return '<div class="empty" style="padding:22px 6px">' + (points.length ? 'มีข้อมูล 1 ครั้งในช่วงนี้ — ต้องมี 2 ครั้งขึ้นไปถึงจะเห็นกราฟ' : 'ไม่มีข้อมูลในช่วงนี้') + '</div>';
    }
    const W = 600, H = 250, L = 58, Rr = 16, T = 18, B = 36;
    const xs = points.map(p => parse(p.d).getTime()), ys = points.map(p => p.y);
    const avg = opt.avg && opt.avg.length > 1 ? opt.avg : null;
    let y0 = Math.min(...ys), y1 = Math.max(...ys);
    /* show the goal line only when it is reasonably close (otherwise the curve becomes flat) */
    const goal = opt.goal && Math.abs(opt.goal - (y0 + y1) / 2) <= Math.max(8, (y1 - y0) * 2) ? opt.goal : null;
    if (goal) { y0 = Math.min(y0, goal); y1 = Math.max(y1, goal); }
    const py = (y1 - y0) * 0.15 || Math.max(1, y1 * 0.05); y0 = Math.max(0, y0 - py); y1 += py;
    const x0 = xs[0], x1 = xs[xs.length - 1] === x0 ? x0 + 864e5 : xs[xs.length - 1];
    const X = t => L + (t - x0) / (x1 - x0) * (W - L - Rr), Y = v => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
    let g = '<svg viewBox="0 0 ' + W + ' ' + H + '"><defs><linearGradient id="lg" x1="0" x2="1"><stop offset="0" stop-color="#4f8cff"/><stop offset="1" stop-color="#a78bfa"/></linearGradient>'
      + '<linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6366f1" stop-opacity=".35"/><stop offset="1" stop-color="#6366f1" stop-opacity="0"/></linearGradient></defs>';
    for (let i = 0; i <= 4; i++) {
      const v = y0 + (y1 - y0) * i / 4, yy = Y(v);
      g += '<line class="grid-l" x1="' + L + '" x2="' + (W - Rr) + '" y1="' + yy + '" y2="' + yy + '"/><text class="lbl" x="' + (L - 10) + '" y="' + (yy + 6) + '" text-anchor="end">' + fmt(v, v < 100 ? 1 : 0) + '</text>';
    }
    [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])].forEach((i, k, arr) => {
      g += '<text class="lbl" x="' + X(xs[i]) + '" y="' + (H - 8) + '" text-anchor="' + (k === 0 ? 'start' : k === arr.length - 1 ? 'end' : 'middle') + '">' + thShort(points[i].d) + '</text>';
    });
    const path = points.map((p, i) => (i ? 'L' : 'M') + X(xs[i]).toFixed(1) + ' ' + Y(p.y).toFixed(1)).join(' ');
    if (goal) {
      g += '<line class="goal" x1="' + L + '" x2="' + (W - Rr) + '" y1="' + Y(goal).toFixed(1) + '" y2="' + Y(goal).toFixed(1) + '"/>'
         + '<text class="goal-lbl" x="' + (W - Rr) + '" y="' + (Y(goal) - 8).toFixed(1) + '" text-anchor="end">เป้า ' + fmt(goal) + '</text>';
    }
    if (avg) {
      const ap = avg.map(p => (p === avg[0] ? 'M' : 'L') + X(parse(p.d).getTime()).toFixed(1) + ' ' + Y(p.y).toFixed(1)).join(' ');
      g += '<path class="area" d="' + ap + ' L' + X(xs[xs.length - 1]).toFixed(1) + ' ' + (H - B) + ' L' + X(xs[0]).toFixed(1) + ' ' + (H - B) + 'Z"/>'
         + '<path class="line faint" d="' + path + '"/><path class="line" d="' + ap + '"/>';
      points.forEach((p, i) => { g += '<circle class="pt raw" cx="' + X(xs[i]).toFixed(1) + '" cy="' + Y(p.y).toFixed(1) + '" r="3.5"><title>' + thShort(p.d) + ': ' + fmt(p.y) + ' ' + unit + ' (เฉลี่ย 7 วัน ' + fmt(avg[i] ? avg[i].y : p.y) + ')</title></circle>'; });
      const la = avg[avg.length - 1];
      g += '<circle class="pt" cx="' + X(parse(la.d).getTime()).toFixed(1) + '" cy="' + Y(la.y).toFixed(1) + '" r="6"/>';
      return '<div class="chart">' + g + '</svg></div>'
        + '<div class="legend"><span><i class="lg-dot"></i>ชั่งจริง</span><span><i class="lg-line"></i>ค่าเฉลี่ย 7 วัน</span>' + (goal ? '<span><i class="lg-goal"></i>เป้าหมาย</span>' : '') + '</div>';
    }
    g += '<path class="area" d="' + path + ' L' + X(xs[xs.length - 1]).toFixed(1) + ' ' + (H - B) + ' L' + X(xs[0]).toFixed(1) + ' ' + (H - B) + 'Z"/><path class="line" d="' + path + '"/>';
    points.forEach((p, i) => { g += '<circle class="pt' + (p.pr ? ' pr' : '') + '" cx="' + X(xs[i]).toFixed(1) + '" cy="' + Y(p.y).toFixed(1) + '" r="' + (p.pr ? 6.5 : 5) + '"><title>' + thShort(p.d) + ': ' + fmt(p.y) + ' ' + unit + '</title></circle>'; });
    return '<div class="chart">' + g + '</svg></div>';
  }
  function barChart(bars) {
    const W = 600, H = 210, L = 10, Rr = 10, T = 26, B = 34;
    const max = Math.max(...bars.map(b => b.v), 1), bw = (W - L - Rr) / bars.length;
    let g = '<svg viewBox="0 0 ' + W + ' ' + H + '"><defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4f8cff" stop-opacity=".9"/><stop offset="1" stop-color="#4f8cff" stop-opacity=".35"/></linearGradient>'
      + '<linearGradient id="bgc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a78bfa"/><stop offset="1" stop-color="#6366f1" stop-opacity=".5"/></linearGradient></defs>';
    bars.forEach((b, i) => {
      const h = (H - T - B) * b.v / max, x = L + i * bw + bw * .15, w = bw * .7, y = H - B - h;
      g += '<rect class="bar' + (b.cur ? ' cur' : '') + '" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + Math.max(h, b.v ? 2 : 0).toFixed(1) + '" rx="6"><title>' + esc(b.label) + ': ' + fmt(b.v, 0) + ' kg</title></rect>';
      if (bars.length <= 12 || i % Math.ceil(bars.length / 8) === 0) { g += '<text class="lbl" x="' + (x + w / 2).toFixed(1) + '" y="' + (H - 10) + '" text-anchor="middle">' + esc(b.label) + '</text>'; }
      if (b.v && bars.length <= 8) { g += '<text class="lbl" x="' + (x + w / 2).toFixed(1) + '" y="' + (y - 8).toFixed(1) + '" text-anchor="middle">' + fmt(b.v / 1000) + 't</text>'; }
    });
    return '<div class="chart">' + g + '</svg></div>';
  }
  function totals(from, to) {
    const ws = S.workouts.filter(w => w.date >= from && w.date <= to);
    const mins = ws.map(wMinutes).filter(m => m != null);
    return { n: ws.length, sets: ws.reduce((a, w) => a + wSets(w), 0), vol: ws.reduce((a, w) => a + wVolume(w), 0), avg: mins.length ? Math.round(mins.reduce((a, b) => a + b, 0) / mins.length) : null };
  }
  function cmpCard(label, cur, prev, unit, digits) {
    let d = '<span class="same">ช่วงก่อนหน้า —</span>';
    if (prev > 0) { const pct = (cur - prev) / prev * 100; d = '<span class="' + (pct > 0 ? 'up' : pct < 0 ? 'down' : 'same') + '">' + (pct > 0 ? '▲ +' : pct < 0 ? '▼ ' : '') + fmt(pct, 0) + '% เทียบช่วงก่อน</span>'; }
    else if (cur > 0) { d = '<span class="up">ใหม่ในช่วงนี้</span>'; }
    if (cur == null) { return '<div class="cmp"><div class="k">' + label + '</div><div class="v">—</div><div class="d"><span class="same">ยังไม่มีข้อมูลเวลา</span></div></div>'; }
    return '<div class="cmp"><div class="k">' + label + '</div><div class="v">' + fmt(cur, digits || 0) + (unit ? ' <small class="muted" style="font-size:13px">' + unit + '</small>' : '') + '</div><div class="d">' + d + '</div></div>';
  }
  function renderProgress() {
    const el = $('tab-progress');
    const [from, to] = periodRange();
    const len = diffDays(from, to) + 1, pFromPrev = addDays(from, -len), pToPrev = addDays(from, -1);
    const cur = totals(from, to), prev = totals(pFromPrev, pToPrev);
    let h = '<div class="chips" style="margin-top:12px">' + [['week', 'สัปดาห์นี้'], ['month', 'เดือนนี้'], ['30', '30 วัน'], ['90', '3 เดือน'], ['365', '1 ปี'], ['all', 'ทั้งหมด'], ['custom', 'เลือกช่วง']]
      .map(([k, l]) => '<button type="button" class="chip' + (pPeriod === k ? ' is-on' : '') + '" data-pp="' + k + '">' + l + '</button>').join('') + '</div>'
      + (pPeriod === 'custom' ? '<div class="custom-range"><label class="field"><span>ตั้งแต่</span><input type="date" id="p-from" value="' + from + '"></label><label class="field"><span>ถึง</span><input type="date" id="p-to" value="' + to + '"></label></div>' : '')
      + '<p class="muted small" style="margin:10px 4px 0">' + thShort(from) + ' – ' + thShort(to) + ' (' + len + ' วัน) · เทียบกับ ' + thShort(pFromPrev) + ' – ' + thShort(pToPrev) + '</p>'
      + '<div class="cmp-grid" style="margin-top:10px">' + cmpCard('Workout', cur.n, prev.n, 'ครั้ง') + cmpCard('เซ็ตทั้งหมด', cur.sets, prev.sets, 'เซ็ต')
      + cmpCard('Volume (น้ำหนัก × ครั้ง)', cur.vol / 1000, prev.vol / 1000, 'ตัน', 1) + cmpCard('เวลาเฉลี่ย', cur.avg, prev.avg || 0, 'นาที') + '</div>';

    /* volume per week (or per month for long ranges) */
    const monthly = len > 120;
    const buckets = [];
    for (let d = monthly ? from.slice(0, 8) + '01' : weekStart(from); d <= to; d = monthly ? iso(new Date(parse(d).getFullYear(), parse(d).getMonth() + 1, 1)) : addDays(d, 7)) {
      const end = monthly ? addDays(iso(new Date(parse(d).getFullYear(), parse(d).getMonth() + 1, 1)), -1) : addDays(d, 6);
      buckets.push({ label: monthly ? TH_M[parse(d).getMonth()] : thShort(d).replace(/ \d+$/, ''), v: S.workouts.filter(w => w.date >= d && w.date <= end).reduce((a, w) => a + wVolume(w), 0), cur: today() >= d && today() <= end });
      if (buckets.length > 60) { break; }
    }
    h += '<div class="card"><div class="card-head"><h3>Volume ราย' + (monthly ? 'เดือน' : 'สัปดาห์') + '</h3><span class="muted small">kg × ครั้ง</span></div>' + (cur.vol ? barChart(buckets) : '<div class="empty">ไม่มีการฝึกในช่วงนี้</div>') + '</div>';

    /* one exercise */
    const names = exNames().filter(n => exHistory(n).length);
    if (names.length) {
      if (!names.some(n => n === pEx)) { pEx = names[0]; }
      const hist = exHistory(pEx);
      const inRange = hist.filter(x => x.w.date >= from && x.w.date <= to);
      const val = sets => (pMetric === 'kg' ? num(bestSet(sets).kg) : pMetric === 'orm' ? best1rm(sets) : setsVol(sets));
      let top = Math.max(0, ...hist.filter(x => x.w.date < from).map(x => val(x.sets)));
      const byDay = {};
      inRange.forEach(x => { byDay[x.w.date] = Math.max(byDay[x.w.date] || 0, val(x.sets)); });
      const pts = Object.keys(byDay).sort().map(d => { const pr = byDay[d] > top && top > 0; top = Math.max(top, byDay[d]); return { d, y: byDay[d], pr }; });
      const allBest = hist.reduce((b, x) => { const s = bestSet(x.sets); return !b || num(s.kg) > num(b.s.kg) || (num(s.kg) === num(b.s.kg) && num(s.r) > num(b.s.r)) ? { s, d: x.w.date } : b; }, null);
      const change = pts.length > 1 ? pts[pts.length - 1].y - pts[0].y : null;
      h += '<div class="card"><div class="card-head"><h3>น้ำหนักที่ยกแต่ละท่า</h3></div>'
        + '<select id="p-ex">' + names.map(n => '<option' + (n === pEx ? ' selected' : '') + '>' + esc(n) + '</option>').join('') + '</select>'
        + '<div class="chips" style="margin-top:10px">' + [['kg', 'น้ำหนักสูงสุด'], ['orm', '1RM ประมาณ'], ['vol', 'Volume']].map(([k, l]) => '<button type="button" class="chip' + (pMetric === k ? ' is-on' : '') + '" data-pm="' + k + '">' + l + '</button>').join('') + '</div>'
        + '<div class="row2" style="margin-top:12px"><div class="cmp"><div class="k">สูงสุดที่เคยยก</div><div class="v">' + setText(allBest.s) + ' <small class="muted" style="font-size:13px">kg</small></div><div class="d muted">' + thShort(allBest.d) + '</div></div>'
        + '<div class="cmp"><div class="k">เปลี่ยนแปลงในช่วงนี้</div><div class="v">' + (change == null ? '—' : (change > 0 ? '+' : '') + fmt(change)) + ' <small class="muted" style="font-size:13px">kg</small></div><div class="d muted">' + inRange.length + ' ครั้งที่ฝึก</div></div></div>'
        + lineChart(pts, 'kg') + '<p class="muted small" style="margin-top:6px">จุดสีทอง = ทำสถิติใหม่ · 1RM ประมาณจากสูตร Epley: kg × (1 + ครั้ง ÷ 30)</p></div>';
    }

    /* body weight */
    const body = S.body.slice().sort(byTime), bIn = body.filter(b => b.date >= from && b.date <= to);
    const avgIn = bodyAvg(body).filter(p => p.d >= from && p.d <= to);        // average uses the days before the period too
    const lastB = body[body.length - 1], lastAvg = body.length ? bodyAvg(body).pop().y : null;
    const rate = bodyRate(bIn), goal = S.settings.goalKg;
    const dirTxt = { lose: 'ลดน้ำหนัก', gain: 'เพิ่มน้ำหนัก', keep: 'รักษาน้ำหนัก' }[S.settings.goalDir] || '';
    const kgS = ' <small class="muted" style="font-size:13px">kg</small>';
    h += '<div class="card"><div class="card-head"><h3>น้ำหนักตัว</h3><button type="button" class="btn primary sm" data-pact="body">+ บันทึก</button></div>';
    if (body.length) {
      h += '<div class="cmp-grid">'
        + '<div class="cmp"><div class="k">ล่าสุด</div><div class="v">' + fmt(lastB.kg) + kgS + '</div><div class="d muted">' + thShort(lastB.date) + '</div></div>'
        + '<div class="cmp"><div class="k">ค่าเฉลี่ย 7 วัน</div><div class="v">' + fmt(lastAvg) + kgS + '</div><div class="d muted">แนวโน้มจริง ไม่แกว่งตามวัน</div></div>'
        + '<div class="cmp"><div class="k">เปลี่ยนแปลงในช่วงนี้</div><div class="v">' + (avgIn.length > 1 ? bodyDelta(avgIn[avgIn.length - 1].y - avgIn[0].y, 'kg') : '—') + '</div><div class="d muted">' + bIn.length + ' ครั้งที่ชั่ง (เทียบค่าเฉลี่ย)</div></div>'
        + '<div class="cmp"><div class="k">อัตราต่อสัปดาห์</div><div class="v">' + (rate == null ? '—' : bodyDelta(rate, 'kg')) + '</div><div class="d muted">' + (rate == null ? 'ต้องมีข้อมูล 7 วันขึ้นไป' : Math.abs(rate) > 1 ? 'เร็วกว่าปกติ (เกิน 1 kg)' : 'ในช่วงนี้') + '</div></div></div>';
      h += '<div class="goal-box">' + (goal
        ? '<div><div class="k">🎯 เป้าหมาย: ' + esc(dirTxt) + '</div><b>' + fmt(goal) + ' kg</b> · ' + esc(goalLeft(lastAvg))
          + (goalEta(lastAvg, rate) ? '<div class="d muted">' + esc(goalEta(lastAvg, rate)) + ' (ตามอัตราปัจจุบัน)</div>' : '') + '</div>'
        : '<div><div class="k">🎯 ยังไม่ได้ตั้งเป้าหมาย</div><span class="muted small">ตั้งเป้าแล้วจะเห็นเส้นเป้าบนกราฟ และเหลืออีกกี่ kg</span></div>')
        + '<button type="button" class="btn soft sm" data-pact="goal">' + (goal ? 'แก้เป้า' : 'ตั้งเป้า') + '</button></div>';
    }
    h += lineChart(bIn.map(b => ({ d: b.date, y: b.kg })), 'kg', { avg: avgIn, goal })
      + (body.length ? '<button type="button" class="link" data-pact="body-list">ดู / แก้ไขประวัติน้ำหนัก</button>' : '') + '</div>';

    /* records */
    if (names.length) {
      h += '<div class="card"><div class="card-head"><h3>สถิติส่วนตัว (PR)</h3><span class="muted small">แตะเพื่อดูกราฟ</span></div>'
        + names.map(n => {
          const hs = exHistory(n);
          const b = hs.reduce((m, x) => { const s = bestSet(x.sets); return !m || num(s.kg) > num(m.kg) || (num(s.kg) === num(m.kg) && num(s.r) > num(m.r)) ? s : m; }, null);
          return '<div class="pr-row" data-pex="' + esc(n) + '"><div><div class="nm">' + esc(n) + '</div><small class="muted">' + hs.length + ' ครั้ง</small></div>'
            + '<div class="v">' + setText(b) + '<small>หนักสุด (kg)</small></div><div class="v">' + fmt(Math.max(...hs.map(x => best1rm(x.sets)))) + '<small>1RM ≈</small></div></div>';
        }).join('') + '</div>';
    } else {
      h += '<div class="card flat empty"><b>ยังไม่มีข้อมูลการฝึก</b>จบ Workout แรกแล้วกราฟจะขึ้นที่นี่</div>';
    }
    el.innerHTML = h;
  }
  $('tab-progress').addEventListener('change', e => {
    if (e.target.id === 'p-ex') { pEx = e.target.value; renderProgress(); }
    if (e.target.id === 'p-from') { pFrom = e.target.value; renderProgress(); }
    if (e.target.id === 'p-to') { pTo = e.target.value; renderProgress(); }
  });
  $('tab-progress').addEventListener('click', e => {
    const pp = e.target.closest('[data-pp]'); if (pp) { pPeriod = pp.dataset.pp; renderProgress(); return; }
    const pm = e.target.closest('[data-pm]'); if (pm) { pMetric = pm.dataset.pm; renderProgress(); return; }
    const px = e.target.closest('[data-pex]'); if (px) { pEx = px.dataset.pex; renderProgress(); $('p-ex').scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    const pa = e.target.closest('[data-pact]');
    if (pa) { ({ body: bodySheet, 'body-list': bodyListSheet, goal: goalSheet })[pa.dataset.pact](); }
  });

  /** Target body weight + direction (colours of the changes follow it). */
  function goalSheet() {
    const st = S.settings, last = S.body.slice().sort(byTime).pop();
    let dir = st.goalDir && st.goalDir !== 'none' ? st.goalDir : 'lose';
    openSheet('<h2>เป้าหมายน้ำหนักตัว</h2><p class="lead">' + (last ? 'ตอนนี้ ' + fmt(last.kg) + ' kg' : 'ยังไม่มีบันทึกน้ำหนัก') + '</p>'
      + '<div class="pick-h">อยากทำอะไร</div><div class="chips" style="padding:6px 0" id="g-dir">'
      + [['lose', 'ลดน้ำหนัก'], ['gain', 'เพิ่มน้ำหนัก / กล้าม'], ['keep', 'รักษาน้ำหนัก']].map(([k, l]) => '<button type="button" class="chip' + (dir === k ? ' is-on' : '') + '" data-dir="' + k + '">' + l + '</button>').join('') + '</div>'
      + '<label class="field"><span>น้ำหนักเป้าหมาย (kg)</span><input type="number" id="g-kg" step="0.1" min="20" max="300" inputmode="decimal" value="' + (st.goalKg || '') + '" placeholder="' + (last ? fmt(last.kg) : '70.0') + '"></label>'
      + '<p class="muted small" style="margin-top:8px">สีของการเปลี่ยนแปลงจะเป็นไปตามเป้า เช่น ลดน้ำหนัก: ลดลง = สีเขียว · เพิ่มน้ำหนัก: เพิ่มขึ้น = สีเขียว</p>'
      + '<div class="btn-row" style="margin-top:16px">' + (st.goalKg ? '<button type="button" class="btn danger" id="g-clear">ลบเป้า</button>' : '<button type="button" class="btn soft" data-close>ยกเลิก</button>')
      + '<button type="button" class="btn primary" id="g-save">บันทึกเป้า</button></div>',
      sh => {
        sh.querySelector('#g-dir').addEventListener('click', e => {
          const b = e.target.closest('[data-dir]'); if (!b) { return; }
          dir = b.dataset.dir; sh.querySelectorAll('#g-dir .chip').forEach(c => c.classList.toggle('is-on', c === b));
        });
        sh.querySelector('#g-save').onclick = () => {
          const kg = num(sh.querySelector('#g-kg').value);
          if (kg < 20 || kg > 300) { toast('ใส่น้ำหนักเป้าหมาย 20 - 300 kg'); return; }
          st.goalKg = kg; st.goalDir = dir; save(); closeSheet(); render(); toast('ตั้งเป้า ' + fmt(kg) + ' kg แล้ว');
        };
        const c = sh.querySelector('#g-clear');
        if (c) { c.onclick = () => { st.goalKg = null; st.goalDir = 'none'; save(); closeSheet(); render(); toast('ลบเป้าแล้ว'); }; }
      });
  }

  /* ===================================================================== body weight sheets */
  function bodySheet() {
    const last = S.body.slice().sort(byTime).pop();
    openSheet('<h2>บันทึกน้ำหนักตัว</h2><p class="lead">' + (last ? 'ครั้งล่าสุด ' + fmt(last.kg) + ' kg (' + thShort(last.date) + ')' : 'ชั่งตอนเช้าหลังตื่นนอนจะได้ค่าที่สม่ำเสมอที่สุด') + '</p>'
      + '<div class="row2"><label class="field"><span>วันที่</span><input type="date" id="b-date" value="' + today() + '"></label>'
      + '<label class="field"><span>น้ำหนัก (kg)</span><input type="number" id="b-kg" step="0.1" min="20" max="300" inputmode="decimal" placeholder="' + (last ? fmt(last.kg) : '70.0') + '"></label></div>'
      + '<div class="btn-row" style="margin-top:16px"><button type="button" class="btn soft" data-close>ยกเลิก</button><button type="button" class="btn primary" id="b-save">บันทึก</button></div>',
      sh => {
        setTimeout(() => { const k = sh.querySelector('#b-kg'); if (k && document.body.contains(k)) { k.focus(); } }, 80);
        sh.querySelector('#b-save').onclick = () => {
          const date = sh.querySelector('#b-date').value, kg = num(sh.querySelector('#b-kg').value);
          if (!date || kg < 20 || kg > 300) { toast('ใส่น้ำหนัก 20 - 300 kg'); return; }
          const o = S.body.find(b => b.date === date);
          if (o) { o.kg = kg; } else { S.body.push({ date, kg }); }
          save(); closeSheet(); render(); toast(o ? 'แก้น้ำหนักของ ' + thShort(date) + ' แล้ว' : 'บันทึกน้ำหนักแล้ว');
        };
      });
  }
  function bodyListSheet() {
    const list = S.body.slice().sort(byTime).reverse();
    openSheet('<h2>ประวัติน้ำหนักตัว</h2><div class="pick-list">' + list.map((b, i) => {
      const p = list[i + 1];
      return '<div class="pick"><span>' + thShort(b.date) + '</span><span><b>' + fmt(b.kg) + ' kg</b> ' + (p ? '<small>' + bodyDelta(b.kg - p.kg, '') + '</small>' : '') + ' <button type="button" class="link danger" data-bdel="' + b.date + '">ลบ</button></span></div>';
    }).join('') + '</div>',
      sh => sh.addEventListener('click', async e => {
        const d = e.target.dataset.bdel; if (!d) { return; }
        S.body = S.body.filter(b => b.date !== d); save(); render(); bodyListSheet(); toast('ลบแล้ว');
      }));
  }

  /* ===================================================================== settings + backup */
  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  $('open-settings').addEventListener('click', settingsSheet);
  function settingsSheet() {
    const exp = localStorage.getItem(KEY_EXPORTED);
    openSheet('<h2>ตั้งค่าและสำรองข้อมูล</h2><p class="lead">ข้อมูลเก็บในเครื่องนี้เท่านั้น ควร Export เก็บไว้เป็นระยะ</p>'
      + '<div class="pick-h">เวลาพักเริ่มต้น</div><div class="chips" style="padding:6px 0">' + [45, 60, 90, 120, 150, 180].map(t => '<button type="button" class="chip' + (S.settings.rest === t ? ' is-on' : '') + '" data-srest="' + t + '">' + clock(t) + '</button>').join('') + '</div>'
      + '<div class="pick-h">สำรอง / ย้ายเครื่อง</div>'
      + '<p class="muted small" style="margin:4px 4px 0">' + S.workouts.length + ' Workout · ' + S.routines.length + ' ตารางฝึก · ' + S.body.length + ' บันทึกน้ำหนัก · Export ล่าสุด: ' + (exp ? thShort(exp) : 'ยังไม่เคย') + '</p>'
      + '<div class="btn-row"><button type="button" class="btn primary" id="s-exp">Export (.json)</button><button type="button" class="btn soft" id="s-csv">Excel (.csv)</button></div>'
      + '<label class="btn soft block" style="margin-top:10px;position:relative;overflow:hidden">Import จากไฟล์ (.json)<input type="file" id="s-imp" accept="application/json,.json" style="position:absolute;inset:0;opacity:0"></label>'
      + '<div class="pick-h">อันตราย</div><button type="button" class="btn danger block" id="s-wipe">ลบข้อมูลทั้งหมดในเครื่องนี้</button>',
      sh => {
        sh.addEventListener('click', e => { const r = e.target.closest('[data-srest]'); if (r) { S.settings.rest = +r.dataset.srest; save(); settingsSheet(); toast('เวลาพักเริ่มต้น ' + clock(S.settings.rest)); } });
        sh.querySelector('#s-exp').onclick = () => {
          download('workout-log-' + today() + '.json', JSON.stringify({ app: 'workout-log', version: 2, exported: new Date().toISOString(), ...S }, null, 1), 'application/json');
          localStorage.setItem(KEY_EXPORTED, today()); settingsSheet();
        };
        sh.querySelector('#s-csv').onclick = () => {
          const q = s => '"' + String(s).replace(/"/g, '""') + '"';
          const rows = ['date,workout,exercise,set,kg,reps,est_1rm,minutes'];
          S.workouts.slice().sort(byTime).forEach(w => w.exercises.forEach(e => e.sets.forEach((s, i) => rows.push([w.date, q(w.name), q(e.name), i + 1, s.kg, s.r, fmt(e1rm(s.kg, s.r)), wMinutes(w) || ''].join(',')))));
          download('workout-sets-' + today() + '.csv', '\ufeff' + rows.join('\r\n'), 'text/csv');
        };
        sh.querySelector('#s-imp').onchange = ev => importFile(ev.target.files[0]);
        sh.querySelector('#s-wipe').onclick = async () => {
          if (!(await ask('ลบข้อมูลทั้งหมด?', 'Workout ตารางฝึก และน้ำหนักตัวในเครื่องนี้จะหายถาวร (Export ก่อน)', 'ลบทั้งหมด', true))) { return; }
          S = blank(); seedRoutines(S); A = null; E = null; histId = null; R = null; save(); saveActive(); go('home'); toast('ลบข้อมูลแล้ว');
        };
      });
  }
  async function importFile(file) {
    if (!file) { return; }
    let d;
    try { d = JSON.parse(await file.text()); } catch (e) { toast('ไฟล์ไม่ถูกต้อง (ไม่ใช่ JSON)'); return; }
    let inc;
    if (d && Array.isArray(d.workouts)) { inc = { ...blank(), ...d }; }
    else if (d && Array.isArray(d.entries)) { inc = fromV1(d); }
    else { toast('ไฟล์นี้ไม่ใช่ข้อมูลของ Workout Log'); return; }
    const okDate = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s));
    inc.workouts = inc.workouts.filter(w => w && okDate(w.date) && Array.isArray(w.exercises)).map(w => ({
      id: String(w.id || uid()), date: w.date, start: num(w.start) || null, end: num(w.end) || null, name: String(w.name || 'Workout').slice(0, 80),
      routineId: w.routineId || null, note: String(w.note || '').slice(0, 500),
      exercises: w.exercises.filter(e => e && e.name && Array.isArray(e.sets)).map(e => ({ name: String(e.name).slice(0, 80), sets: e.sets.map(s => ({ kg: num(s.kg), r: Math.round(num(s.r)) })).filter(s => s.r > 0) })).filter(e => e.sets.length),
    })).filter(w => w.exercises.length);
    inc.body = (inc.body || []).filter(b => b && okDate(b.date) && num(b.kg) > 0).map(b => ({ date: b.date, kg: num(b.kg) }));
    inc.routines = (inc.routines || []).filter(r => r && r.name && Array.isArray(r.exercises)).map(r => ({ id: String(r.id || uid()), name: String(r.name).slice(0, 60),
      exercises: r.exercises.filter(x => x && x.name).map(x => ({ name: String(x.name).slice(0, 80), sets: Math.max(1, Math.round(num(x.sets))) || 3, reps: Math.max(1, Math.round(num(x.reps))) || 10, rest: Math.round(num(x.rest)) || 90 })) }));
    closeSheet();
    const merge = await ask('Import ' + inc.workouts.length + ' Workout?', 'ตกลง = รวมกับข้อมูลในเครื่องนี้ (แนะนำ) · ' + inc.routines.length + ' ตารางฝึก · ' + inc.body.length + ' บันทึกน้ำหนัก', 'รวมข้อมูล');
    if (merge) {
      const ids = new Set(S.workouts.map(w => w.id));
      inc.workouts.forEach(w => { if (!ids.has(w.id)) { S.workouts.push(w); } });
      const rids = new Set(S.routines.map(r => r.id));
      inc.routines.forEach(r => { if (!rids.has(r.id)) { S.routines.push(r); } });
      inc.body.forEach(b => { const o = S.body.find(x => x.date === b.date); if (o) { o.kg = b.kg; } else { S.body.push(b); } });
      (inc.exercises || []).forEach(n => { if (!exNames().some(m => same(m, n))) { S.exercises.push(String(n)); } });
    } else if (await ask('แทนที่ข้อมูลทั้งหมด?', 'ข้อมูลในเครื่องนี้จะถูกแทนด้วยข้อมูลจากไฟล์', 'แทนที่', true)) {
      S = { ...blank(), workouts: inc.workouts, routines: inc.routines, body: inc.body, exercises: (inc.exercises || []).map(String), settings: { ...blank().settings, ...(inc.settings || {}) } };
    } else { return; }
    save(); histId = null; E = null; render(); toast('Import เรียบร้อย');
  }

  /* ===================================================================== start */
  saveActive();
  go(A ? 'workout' : 'home');
  if (A) { toast('กู้คืน Workout ที่ยังไม่จบแล้ว — ฝึกต่อได้เลย'); }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { tick(); if (tab === 'home') { renderHome(); } } });
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) { navigator.serviceWorker.register('sw.js').catch(() => {}); }

  window.__wl = { get S() { return S; }, get A() { return A; } };   // for the automated test only
})();
