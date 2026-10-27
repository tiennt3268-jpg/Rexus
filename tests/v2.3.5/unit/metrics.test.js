// Unit checks for public/rexus-metrics.js (PRJ-01). Run: node tests/v2.3.5/unit/metrics.test.js
const M = require('../../../public/rexus-metrics.js');
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  → ' + JSON.stringify(d))); };

// Worked example of the requirement: 100h scope, 60h earned, 50h logged, 50h planned by today → 60 %, 120 / 120 → 120 Ahead
let tasks = [
  { id: 'a', estimated_hours: 50, progress: 100, status: 'In Progress', start_date: '2026-10-01', due_date: '2026-10-10' },
  { id: 'b', estimated_hours: 50, progress: 20, status: 'In Progress', start_date: '2026-11-01', due_date: '2026-11-10' }
];
let r = M.project(tasks, { a: 40, b: 10 }, '2026-10-20');
ok('worked example: completion 60', r.completion === 60, r);
ok('worked example: planned 50, earned 60', r.planned === 50 && r.earned === 60, r);
ok('worked example: SPI 120, EI 120, performance 120 Ahead', r.spi === 120 && r.ei === 120 && r.performance === 120 && r.label === 'Ahead', r);
ok('completion never above 100 while performance can be', r.completion <= 100 && r.performance > 100);

r = M.project([{ id: 'a', estimated_hours: 10, progress: 50, status: 'In Progress', start_date: '2026-10-01', due_date: '2026-10-10' }], { a: 5 }, '2026-10-10');
ok('due today, half done, hours on budget → SPI 50, EI 100, 65 Behind', r.spi === 50 && r.ei === 100 && r.performance === 65 && r.label === 'Behind', r);
r = M.project([{ id: 'a', estimated_hours: 10, progress: 100, status: 'Completed', start_date: '2026-10-01', due_date: '2026-10-10' }], { a: 10 }, '2026-10-15');
ok('done on time and on budget → exactly 100 On track', r.performance === 100 && r.label === 'On track', r);
r = M.project([{ id: 'a', estimated_hours: 10, progress: 30, status: 'Completed', due_date: '2026-10-10' }], { a: 6 }, '2026-10-15');
ok('Completed counts as 100 % whatever the stored progress', r.completion === 100 && r.earned === 10, r);
ok('completed with fewer hours → effort index above 100', r.ei === 167 && r.label === 'Ahead', r);

r = M.project([], {}, '2026-10-15');
ok('no tasks → N/A, no NaN', r.completion === null && r.performance === null && r.label === 'No tasks', r);
r = M.project([{ id: 'a', progress: 40, status: 'In Progress' }, { id: 'b', progress: 0, status: 'Not Started' }], {}, '2026-10-15');
ok('no estimates → completion from progress (20), performance N/A', r.completion === 20 && r.performance === null && r.label === 'No estimates', r);
r = M.project([{ id: 'a', estimated_hours: 8, progress: 0, status: 'Not Started', start_date: '2026-11-01', due_date: '2026-11-05' }], {}, '2026-10-15');
ok('future task, nothing done → Not started', r.label === 'Not started' && r.performance === null, r);
r = M.project([{ id: 'a', estimated_hours: 8, progress: 0, status: 'In Progress', start_date: '2026-10-01', due_date: '2026-10-05' }], { a: 4 }, '2026-10-15');
ok('severely overdue with no earned work → 0 Behind (never ahead)', r.performance === 0 && r.label === 'Behind', r);
r = M.project([{ id: 'a', estimated_hours: 8, progress: 50, status: 'In Progress', start_date: '2026-11-01', due_date: '2026-11-05' }], {}, '2026-10-15');
ok('work started early, nothing planned yet, no logs → Insufficient data (no division by zero)', r.label === 'Insufficient data' && r.performance === null && r.spi === null && r.ei === null, r);
r = M.project([{ id: 'a', estimated_hours: 8, progress: 50, status: 'In Progress' }], { a: 2 }, '2026-10-15');
ok('no dates → schedule index N/A, performance from effort only', r.spi === null && r.ei === 200 && r.performance === 200, r);
r = M.project([{ id: 'a', estimated_hours: 10, progress: 150, status: 'In Progress', due_date: '2026-10-01' }, { id: 'c', estimated_hours: 99, status: 'Cancelled' }], { a: -5 }, '2026-10-15');
ok('progress capped at 100, negative hours ignored, cancelled excluded', r.completion === 100 && r.logged === 0 && r.estimated === 10, r);
r = M.project([{ id: 'a', estimated_hours: 10, progress: 0, subtask_done: 0.5, status: 'In Progress' }], {}, '2026-10-15');
ok('no Done % → share of completed subtasks', r.completion === 50, r);
r = M.project([{ id: 'a', estimated_hours: 10, progress: 20, subtask_done: 0.5, status: 'In Progress' }], {}, '2026-10-15');
ok('explicit Done % wins over subtasks', r.completion === 20, r);
ok('huge index capped for display', M.project([{ id: 'a', estimated_hours: 100, progress: 100, status: 'Completed' }], { a: 0.01 }, '2026-10-15').ei === 999);
ok('planned share linear inclusive (day 3 of 5 = 0.6)', Math.abs(M.plannedShare({ start_date: '2026-10-01', due_date: '2026-10-05' }, '2026-10-03') - 0.6) < 1e-9);
ok('same input → same score (reproducible)', JSON.stringify(M.project(tasks, { a: 40, b: 10 }, '2026-10-20')) === JSON.stringify(M.project(tasks, { a: 40, b: 10 }, '2026-10-20')));
console.log(`\n${pass} / ${pass + fail} passed`);
process.exit(fail ? 1 : 0);
