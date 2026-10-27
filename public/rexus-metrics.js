/* REXUS v2.3.5 PRJ-01 — project completion and performance index (pure functions, no DOM).
   Completion (0–100) = earned hours / estimated hours. Earned hours of a task = estimate × done fraction,
   where the done fraction is the task's Done % (Completed counts as 100 %; without a Done %, the share of completed subtasks). Logged hours never count as done work.
   Performance = round(0.7 × SPI + 0.3 × EI) where
     SPI (schedule index) = 100 × earned / planned-earned-by-today (planned hours spread evenly from start to due date),
     EI  (effort index)   = 100 × earned / logged hours.
   Strict thresholds as requested: < 100 Behind, = 100 On track, > 100 Ahead. */
(function (root) {
  var DAY = 86400000;
  function num(v) { var n = parseFloat(v); return isFinite(n) && n > 0 ? n : 0; }
  function day(s) { if (!s || !/^\d{4}-\d{2}-\d{2}/.test(String(s))) return null; var d = Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)); return isNaN(d) ? null : d; }
  /* Done fraction: Completed = 1; otherwise the task's Done % when set; otherwise the share of its
     subtasks that are completed (subtask_done, 0..1, supplied by the caller); otherwise 0. */
  function frac(t) {
    if (t.status === 'Completed') return 1;
    var p = parseFloat(t.progress); if (!isFinite(p)) p = 0;
    if (p > 0) return Math.min(p, 100) / 100;
    var s = parseFloat(t.subtask_done);
    return isFinite(s) ? Math.min(Math.max(s, 0), 1) : 0;
  }
  /** Share of a task's estimate that should be done by `asOf` (inclusive days, linear). null = no usable dates. */
  function plannedShare(t, asOf) {
    var due = day(t.due_date); if (due === null) return null;
    var start = day(t.start_date); if (start === null || start > due) start = due;
    if (asOf < start) return 0;
    if (asOf >= due) return 1;
    return (Math.floor((asOf - start) / DAY) + 1) / (Math.floor((due - start) / DAY) + 1);
  }
  function cap(v) { return v === null ? null : Math.min(Math.round(v), 999); }

  /**
   * @param tasks   [{status, progress, estimated_hours, start_date, due_date, id}]
   * @param logged  function(task) -> logged hours for that task (incl. its subtasks), or a number map by id
   * @param asOfIso 'YYYY-MM-DD' (local "today")
   */
  function project(tasks, logged, asOfIso) {
    var asOf = day(asOfIso);
    var getLogged = typeof logged === 'function' ? logged : function (t) { return (logged || {})[t.id] || 0; };
    var est = 0, earned = 0, planned = 0, earnedDated = 0, hours = 0, n = 0, fracSum = 0;
    (tasks || []).forEach(function (t) {
      if (!t || t.status === 'Cancelled') return;
      n++;
      var e = num(t.estimated_hours), f = frac(t);
      fracSum += f;
      est += e; earned += e * f;
      hours += num(getLogged(t));
      var share = asOf === null ? null : plannedShare(t, asOf);
      if (share !== null) { planned += e * share; earnedDated += e * f; }
    });
    var completion = est > 0 ? Math.round(Math.min(100, 100 * earned / est)) : (n ? Math.round(100 * fracSum / n) : null);
    var spi = planned > 0 ? 100 * earnedDated / planned : null;
    var ei = hours > 0 ? 100 * earned / hours : null;
    var perf = null, label, state;
    if (!n) { label = 'No tasks'; state = 'na'; }
    else if (est <= 0) { label = 'No estimates'; state = 'na'; }
    else if (earned === 0 && planned === 0) { label = 'Not started'; state = 'na'; }
    else {
      if (spi !== null && ei !== null) perf = 0.7 * spi + 0.3 * ei;
      else if (spi !== null) perf = spi;
      else if (ei !== null) perf = ei;
      if (perf === null) { label = 'Insufficient data'; state = 'na'; }
      else {
        perf = Math.round(perf);
        if (earned === 0) perf = Math.min(perf, 0);          // no earned work can never look ahead
        state = perf < 100 ? 'behind' : perf === 100 ? 'ontrack' : 'ahead';
        label = state === 'behind' ? 'Behind' : state === 'ontrack' ? 'On track' : 'Ahead';
      }
    }
    var r1 = function (v) { return Math.round(v * 10) / 10; };
    return {
      tasks: n, estimated: r1(est), logged: r1(hours), planned: r1(planned), earned: r1(earned),
      completion: completion, spi: cap(spi), ei: cap(ei), performance: perf === null ? null : Math.min(perf, 999),
      state: state, label: label
    };
  }
  var api = { project: project, plannedShare: function (t, iso) { return plannedShare(t, day(iso)); }, version: '2.3.5' };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.REXUSMetrics = api;
})(this);
