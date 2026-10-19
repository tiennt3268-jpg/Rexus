// REXUS v2.3.0 backend integration tests — REXUS Survey v1.0.0 + First Login (AC01–AC08 server side).
// Real SQL (PGlite / PostgreSQL 16), real function handlers, all migrations 001–035.
import { boot } from './harness.mjs';
const results = []; let section = '';
const ok = (name, cond, detail) => { results.push({ section, name, pass: !!cond, detail: cond ? undefined : detail }); console.log((cond ? 'PASS ' : 'FAIL ') + section + ' :: ' + name + (cond ? '' : '  → ' + JSON.stringify(detail)?.slice(0, 400))); };
const S = (s) => { section = s; };
const { db, call } = await boot();
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const ADMIN = 'ADMIN_TIENNT', PM = 'U_MINCT', MEM = 'U_TRUONGPN', MEM2 = 'U_TOANTA';
const tok = () => 'tok_' + Math.random().toString(36).slice(2, 12);

/* ------------------------------------------------------------ migration */
S('Migration 035');
const cols = (await q(`SELECT column_name FROM information_schema.columns WHERE table_name='users'`)).map(r => r.column_name);
ok('users has must_change_password / profile_gate / onboarding_completed_at', ['must_change_password', 'profile_gate', 'onboarding_completed_at'].every(c => cols.includes(c)));
const tables = (await q(`SELECT table_name FROM information_schema.tables WHERE table_schema='public'`)).map(r => r.table_name);
ok('survey + demographic tables exist', ['rexus_demographic_fields', 'rexus_user_demographics', 'rexus_surveys', 'rexus_survey_versions', 'rexus_survey_responses'].every(t => tables.includes(t)));
ok('existing accounts are not gated after the migration', (await q('SELECT COUNT(*)::int n FROM users WHERE must_change_password OR profile_gate'))[0].n === 0);
let r = await call(MEM, 'GET', '/api/tasks'); ok('existing account keeps working', r.status === 200, r.status);
const fieldRows = await q('SELECT key, required, visible FROM rexus_demographic_fields ORDER BY sort_order');
ok('default fields: DOB + Education required (D1), others optional', fieldRows.filter(f => f.required).map(f => f.key).join() === 'date_of_birth,education_level' && fieldRows.length === 7, fieldRows);

/* ------------------------------------------------------------ AC01 / AC02 First Login */
S('AC01 First Login: password');
r = await call(ADMIN, 'POST', '/api/admin/users', { full_name: 'Survey Newbie', email: 'survey.newbie@ueh.edu.vn', username: 'survey.newbie', department: 'Finance', position: 'Accountant' });
const NEW = r.json.user.id, temp = r.json.temp_password;
ok('admin creates the account with a temporary password', r.status === 200 && !!temp, r.json);
r = await call(null, 'POST', '/api/auth/login', { username: 'survey.newbie', password: temp });
ok('sign-in succeeds and reports the password step', r.status === 200 && r.json.onboarding?.step === 'password', r.json);
r = await call(NEW, 'GET', '/api/auth/me'); ok('/auth/me works while gated and shows step=password', r.json.user?.id === NEW && r.json.onboarding.step === 'password', r.json);
for (const p of ['/api/tasks', '/api/projects', '/api/rexus-documents', '/api/surveys', '/api/hr/team'])
  { r = await call(NEW, 'GET', p); ok('business API blocked while gated: ' + p, r.status === 401, r.status); }
r = await call(NEW, 'POST', '/api/onboarding', { values: { date_of_birth: '1999-01-01', education_level: 'Bachelor' } });
ok('profile cannot be filled before the password step', r.status === 403, r.json);
r = await call(NEW, 'POST', '/api/auth/change-password', { current_password: temp, new_password: 'short' }); ok('weak password rejected (policy)', r.status === 400 && /8 characters/.test(r.json.error), r.json);
r = await call(NEW, 'POST', '/api/auth/change-password', { current_password: temp, new_password: 'NewPass123', confirm_password: 'NewPass124' }); ok('confirmation must match', r.status === 400 && r.json.field === 'confirm_password', r.json);
r = await call(NEW, 'POST', '/api/auth/change-password', { current_password: 'wrong-one', new_password: 'NewPass123' }); ok('wrong temporary password rejected', r.status === 401, r.json);
r = await call(NEW, 'POST', '/api/auth/change-password', { current_password: temp, new_password: temp + '1a' === temp ? 'x' : temp }); ok('cannot reuse the temporary password', r.status === 400, r.json);
r = await call(NEW, 'POST', '/api/auth/change-password', { current_password: temp, new_password: 'NewPass123', confirm_password: 'NewPass123' });
ok('password changed → next step is profile', r.status === 200 && r.json.onboarding.step === 'profile' && r.json.onboarding.missing.join() === 'date_of_birth,education_level', r.json);
ok('flag cleared only after the server saved it', (await q('SELECT must_change_password FROM users WHERE id=$1', [NEW]))[0].must_change_password === false);
const audit = await q("SELECT summary, details FROM rexus_audit_log WHERE entity_id=$1 AND action LIKE '%password%'", [NEW]);
ok('passwords never written to the audit log', audit.length >= 1 && !JSON.stringify(audit).includes('NewPass123') && !JSON.stringify(audit).includes(temp), audit);

S('AC02 First Login: profile');
r = await call(NEW, 'GET', '/api/tasks'); ok('still blocked before the profile is complete', r.status === 401);
r = await call(NEW, 'GET', '/api/onboarding'); ok('profile step lists the visible fields and missing required ones', r.json.fields.length === 7 && r.json.onboarding.step === 'profile', r.json);
r = await call(NEW, 'POST', '/api/onboarding', { values: { education_level: 'Bachelor' } }); ok('missing DOB → field error, nothing completed', r.status === 400 && r.json.fields.date_of_birth, r.json);
r = await call(NEW, 'POST', '/api/onboarding', { values: { date_of_birth: '2999-01-01', education_level: 'PhD' } }); ok('future DOB and unknown option rejected per field', r.status === 400 && r.json.fields.date_of_birth && r.json.fields.education_level, r.json);
r = await call(NEW, 'POST', '/api/onboarding', { values: { employment_start: '2026-01-01' } }); ok('admin-managed field cannot be self-edited', r.status === 400 && r.json.fields.employment_start, r.json);
r = await call(NEW, 'POST', '/api/onboarding', { values: { date_of_birth: '1999-05-20', education_level: 'Bachelor', gender: 'Prefer not to say' } });
ok('valid profile saved → no step left', r.status === 200 && r.json.onboarding.step === null, r.json);
r = await call(NEW, 'GET', '/api/tasks'); ok('workspace reachable after onboarding', r.status === 200, r.status);
ok('demographic values not in the audit log', !JSON.stringify(await q("SELECT summary, details FROM rexus_audit_log WHERE action='demographics_update'")).includes('1999-05-20'));

S('AC08 Demographic privacy');
r = await call(MEM, 'GET', '/api/onboarding?user_id=' + NEW); ok('another employee cannot read demographics', r.status === 403, r.json);
r = await call(PM, 'GET', '/api/onboarding?user_id=' + NEW); ok('a Project Manager cannot read demographics either', r.status === 403, r.json);
r = await call(ADMIN, 'GET', '/api/onboarding?user_id=' + NEW); ok('System Admin can (authorised)', r.status === 200 && r.json.values.date_of_birth === '1999-05-20', r.json);
r = await call(ADMIN, 'POST', '/api/onboarding', { user_id: NEW, values: { employment_start: '2026-01-05' } }); ok('admin edits an admin-managed field', r.status === 200, r.json);
r = await call(MEM, 'PUT', '/api/profile-fields', { fields: [{ key: 'gender', required: true }] }); ok('only admin configures fields', r.status === 403);
r = await call(ADMIN, 'PUT', '/api/profile-fields', { fields: [{ key: 'gender', visible: false, required: true }] });
ok('a hidden field is never required', r.status === 200 && (await q("SELECT required FROM rexus_demographic_fields WHERE key='gender'"))[0].required === false, r.json);
await call(ADMIN, 'PUT', '/api/profile-fields', { fields: [{ key: 'gender', visible: true }] });

/* ------------------------------------------------------------ surveys: create / builder / versions */
S('Survey builder');
const dep = (await q('SELECT department FROM users WHERE id=$1', [MEM]))[0].department || 'Finance';
r = await call(MEM, 'POST', '/api/surveys', { action: 'create', name: 'Member survey' }); ok('a Member cannot create surveys', r.status === 403);
r = await call(PM, 'POST', '/api/surveys', { action: 'create', name: 'PM pulse', template: 'engagement' });
const PMS = r.json.id; ok('a Project Manager creates from a template', r.status === 200 && !!PMS, r.json);
r = await call(PM, 'PUT', '/api/surveys', { id: PMS, action: 'settings', mandatory: true, target: { all: true } }); ok('only admin can make a survey mandatory', r.status === 403, r.json);
r = await call(ADMIN, 'POST', '/api/surveys', { action: 'create', name: 'Employee Experience 2026', description: 'Help us improve.' });
const SV = r.json.id;
r = await call(ADMIN, 'PUT', '/api/surveys', { id: SV, questions: [{ type: 'single', title: 'Satisfied?', options: ['Yes'] }] }); ok('single choice needs ≥2 options', r.status === 400, r.json);
r = await call(ADMIN, 'PUT', '/api/surveys', { id: SV, questions: [{ type: 'weird', title: 'x' }] }); ok('unknown question type rejected', r.status === 400);
const QS = [{ type: 'single', title: 'How satisfied are you?', required: true, options: ['Very satisfied', 'Satisfied', 'Neutral'] },
  { type: 'rating', title: 'Rate teamwork', required: true, max: 5 }, { type: 'multiple', title: 'Improve', options: ['Tools', 'Training'] },
  { type: 'short', title: 'Comment', max_length: 20 }, { type: 'number', title: 'Years', min: 0, max: 50 }, { type: 'date', title: 'Start' },
  { type: 'scale', title: 'Recommend', min: 0, max: 10 }, { type: 'dropdown', title: 'Office', options: ['HCMC', 'Nha Trang'] }, { type: 'long', title: 'More' }];
r = await call(ADMIN, 'PUT', '/api/surveys', { id: SV, questions: QS }); ok('all 9 question types saved', r.status === 200 && r.json.questions.length === 9, r.json);
const qid = r.json.questions.map(x => x.id);
r = await call(ADMIN, 'POST', '/api/surveys', { action: 'publish', id: PMS }); ok('PM publishes own survey', r.status === 200);
r = await call(MEM, 'GET', '/api/surveys?id=' + SV); ok('non-owner cannot open the builder', r.status === 404);

/* ------------------------------------------------------------ AC03 mandatory targeting (OR) */
S('AC03 Mandatory targeting');
r = await call(ADMIN, 'PUT', '/api/surveys', { id: SV, action: 'settings', mandatory: true, target: {} }); ok('mandatory needs a target group', r.status === 400, r.json);
r = await call(ADMIN, 'POST', '/api/surveys', { action: 'estimate', target: { departments: ['Finance'], users: [MEM] } });
const est = r.json.count; ok('estimate counts unique users (OR)', est >= 2, r.json);
r = await call(ADMIN, 'PUT', '/api/surveys', { id: SV, action: 'settings', mandatory: true, priority: 10, target: { departments: ['Finance'], users: [MEM] } });
ok('mandatory settings saved', r.status === 200 && r.json.target_count === est, r.json);
r = await call(MEM, 'GET', '/api/tasks'); ok('draft mandatory survey does not gate anyone', r.status === 200);
r = await call(ADMIN, 'POST', '/api/surveys', { action: 'publish', id: SV }); ok('publish → version 1', r.status === 200 && r.json.version === 1, r.json);
r = await call(MEM, 'GET', '/api/auth/me'); ok('targeted by User ID → step survey', r.json.onboarding.step === 'survey' && r.json.onboarding.surveys[0] === SV, r.json.onboarding);
r = await call(NEW, 'GET', '/api/tasks'); ok('targeted by department (Finance) → business API blocked', r.status === 401);
const outsider = (await q("SELECT id FROM users WHERE id NOT IN ($1,$2,$3) AND COALESCE(department,'') <> 'Finance' AND deleted_at IS NULL AND status='Active' LIMIT 1", [MEM, NEW, ADMIN]))[0].id;
r = await call(outsider, 'GET', '/api/tasks'); ok('user outside every group is not gated', r.status === 200, r.status);
r = await call(MEM, 'GET', '/api/onboarding'); ok('intro data: name, question count, estimate', r.json.surveys[0]?.name === 'Employee Experience 2026' && r.json.surveys[0].question_count === 9, r.json.surveys);

/* ------------------------------------------------------------ AC05 / AC06 responses */
S('AC05/AC06 Responses');
r = await call(MEM, 'GET', '/api/survey-respond?id=' + SV); ok('respondent sees the published questions', r.status === 200 && r.json.questions.length === 9 && r.json.respondent?.name, r.json);
const vid = r.json.survey.version_id;
r = await call(MEM, 'POST', '/api/survey-respond', { id: SV, client_token: tok(), answers: { [qid[1]]: 4 } }); ok('required question missing → error points at the question', r.status === 400 && r.json.question === qid[0], r.json);
r = await call(MEM, 'POST', '/api/survey-respond', { id: SV, client_token: tok(), answers: { [qid[0]]: 'Maybe', [qid[1]]: 4 } }); ok('invalid option rejected', r.status === 400);
r = await call(MEM, 'POST', '/api/survey-respond', { id: SV, client_token: tok(), answers: { [qid[0]]: 'Satisfied', [qid[1]]: 9 } }); ok('rating out of range rejected', r.status === 400);
r = await call(MEM, 'POST', '/api/survey-respond', { id: SV, client_token: tok(), answers: { [qid[0]]: 'Satisfied', [qid[1]]: 4, [qid[3]]: 'x'.repeat(21) } }); ok('text length limit enforced', r.status === 400);
r = await call(MEM, 'GET', '/api/tasks'); ok('AC05: still gated after failed attempts (nothing saved)', r.status === 401);
const T1 = tok();
r = await call(MEM, 'POST', '/api/survey-respond', { id: SV, version_id: vid, client_token: T1, user_id: ADMIN, respondent: 'Someone else', answers: { [qid[0]]: 'Satisfied', [qid[1]]: 4, [qid[2]]: ['Training'], [qid[4]]: 3 } });
ok('submit succeeds → gate released', r.status === 200 && r.json.onboarding.step === null, r.json);
const saved = (await q('SELECT user_id, version_id, department FROM rexus_survey_responses WHERE client_token=$1', [T1]))[0];
ok('AC06: response stored with the session user, not the user_id in the request', saved.user_id === MEM && saved.version_id === vid, saved);
r = await call(MEM, 'POST', '/api/survey-respond', { id: SV, client_token: T1, answers: { [qid[0]]: 'Satisfied', [qid[1]]: 4 } }); ok('re-sending the same submission is idempotent', r.status === 200 && r.json.response_id, r.json);
r = await call(MEM, 'POST', '/api/survey-respond', { id: SV, client_token: tok(), answers: { [qid[0]]: 'Neutral', [qid[1]]: 2 } }); ok('a second, different submission is refused', r.status === 409 && r.json.already, r.json);
ok('exactly one response counted', (await q('SELECT COUNT(*)::int n FROM rexus_survey_responses WHERE survey_id=$1', [SV]))[0].n === 1);
r = await call(MEM, 'GET', '/api/tasks'); ok('workspace open again', r.status === 200);
r = await call(outsider, 'GET', '/api/survey-respond?id=' + SV); ok('a person outside the target cannot answer', r.status === 403);

/* ------------------------------------------------------------ versioning */
S('Versioning');
await call(ADMIN, 'PUT', '/api/surveys', { id: SV, questions: QS.slice(0, 3).map((x, i) => ({ ...x, id: qid[i] })).concat([{ type: 'short', title: 'New question' }]) });
r = await call(ADMIN, 'GET', '/api/surveys?id=' + SV); ok('editing after publish keeps the published set and flags unpublished changes', r.json.survey.has_unpublished_changes && r.json.survey.published_questions.length === 9, r.json.survey);
r = await call(ADMIN, 'POST', '/api/surveys', { action: 'publish', id: SV }); ok('re-publish creates version 2', r.json.version === 2 && r.json.new_version, r.json);
ok('the earlier answer stays linked to version 1', (await q('SELECT v.version FROM rexus_survey_responses r JOIN rexus_survey_versions v ON v.id=r.version_id WHERE r.client_token=$1', [T1]))[0].version === 1);
r = await call(NEW, 'POST', '/api/survey-respond', { id: SV, version_id: vid, client_token: tok(), answers: { [qid[0]]: 'Satisfied', [qid[1]]: 4 } });
ok('a stale form (old version) is asked to reload', r.status === 409 && r.json.reload, r.json);

/* ------------------------------------------------------------ AC07 availability */
S('AC07 Availability');
r = await call(ADMIN, 'PUT', '/api/surveys', { id: SV, action: 'settings', mandatory: true, priority: 10, target: { departments: ['Finance'], users: [MEM] }, max_responses: 1 });
r = await call(NEW, 'GET', '/api/auth/me'); ok('quota reached → gate released for people who did not answer (D3)', r.json.onboarding.step === null, r.json.onboarding);
r = await call(NEW, 'POST', '/api/survey-respond', { id: SV, client_token: tok(), answers: { [qid[0]]: 'Satisfied', [qid[1]]: 4 } }); ok('server refuses new responses over quota', r.status === 409 && r.json.closed, r.json);
r = await call(ADMIN, 'PUT', '/api/surveys', { id: SV, action: 'settings', mandatory: true, priority: 10, target: { departments: ['Finance'], users: [MEM] }, max_responses: null, opens_at: '2020-01-01T08:00', closes_at: '2021-01-01T08:00' });
r = await call(NEW, 'GET', '/api/tasks'); ok('closing date passed → no gate', r.status === 200);
r = await call(ADMIN, 'PUT', '/api/surveys', { id: SV, action: 'settings', mandatory: true, priority: 10, target: { departments: ['Finance'], users: [MEM] }, opens_at: '2999-01-01T08:00', closes_at: null });
r = await call(ADMIN, 'GET', '/api/surveys'); ok('opening date in the future → Scheduled', r.json.surveys.find(s => s.id === SV).effective_status === 'Scheduled', r.json.surveys.find(s => s.id === SV));
r = await call(NEW, 'GET', '/api/tasks'); ok('scheduled survey does not gate', r.status === 200);
r = await call(ADMIN, 'PUT', '/api/surveys', { id: SV, action: 'settings', mandatory: true, priority: 10, target: { departments: ['Finance'], users: [MEM] }, opens_at: '2999-01-01T08:00', closes_at: '2998-01-01T08:00' });
ok('closing before opening rejected', r.status === 400);
await call(ADMIN, 'PUT', '/api/surveys', { id: SV, action: 'settings', mandatory: true, priority: 10, target: { departments: ['Finance'], users: [MEM] } });
r = await call(NEW, 'GET', '/api/tasks'); ok('open again → gated again', r.status === 401);
r = await call(ADMIN, 'POST', '/api/surveys', { action: 'close', id: SV }); ok('manual close', r.status === 200);
r = await call(NEW, 'GET', '/api/tasks'); ok('closed manually → gate released', r.status === 200);
r = await call(ADMIN, 'POST', '/api/surveys', { action: 'reopen', id: SV });
r = await call(NEW, 'GET', '/api/auth/me'); ok('reopen → gated again', r.json.onboarding.step === 'survey');

/* ------------------------------------------------------------ multiple mandatory surveys: priority order */
S('Priority');
r = await call(ADMIN, 'POST', '/api/surveys', { action: 'create', name: 'Urgent check-in' }); const SV2 = r.json.id;
await call(ADMIN, 'PUT', '/api/surveys', { id: SV2, questions: [{ type: 'rating', title: 'Mood', required: true, max: 5 }] });
await call(ADMIN, 'PUT', '/api/surveys', { id: SV2, action: 'settings', mandatory: true, priority: 1, target: { users: [NEW] } });
await call(ADMIN, 'POST', '/api/surveys', { action: 'publish', id: SV2 });
r = await call(NEW, 'GET', '/api/auth/me'); ok('higher priority survey comes first', r.json.onboarding.surveys.join() === [SV2, SV].join(), r.json.onboarding);

/* ------------------------------------------------------------ analytics / export / void */
S('Analytics');
r = await call(ADMIN, 'GET', `/api/surveys?id=${SV}&analytics=1`);
const s1 = r.json.questions?.find(x => x.id === qid[0]);
ok('summary per question (choice counts)', r.status === 200 && s1.options.find(o => o.label === 'Satisfied').count === 1, r.json);
ok('rating average', r.json.questions.find(x => x.id === qid[1]).average === 4);
ok('respondent shown to the owner for an authenticated survey', r.json.shows_respondent && !!r.json.responses[0].respondent);
r = await call(PM, 'GET', `/api/surveys?id=${SV}&analytics=1`); ok('a non-owner cannot read responses', r.status === 404);
r = await call(ADMIN, 'GET', `/api/surveys?id=${SV}&export=1`); ok('export includes User ID column for authenticated surveys', r.json.columns.includes('User ID') && r.json.rows.length === 1, r.json.columns);
const RID = r.json.rows[0][0];
r = await call(ADMIN, 'POST', '/api/surveys', { action: 'void_response', id: SV, response_id: RID }); ok('excluding a response needs a reason', r.status === 400);
r = await call(ADMIN, 'POST', '/api/surveys', { action: 'void_response', id: SV, response_id: RID, reason: 'Test entry' }); ok('response excluded with a logged reason', r.status === 200 && (await q("SELECT COUNT(*)::int n FROM rexus_audit_log WHERE action='survey_response_void'"))[0].n === 1);
ok('the original answers are kept (not edited)', (await q('SELECT status, answers FROM rexus_survey_responses WHERE id=$1', [RID]))[0].status === 'void');

S('Public survey');
r = await call(ADMIN, 'POST', '/api/surveys', { action: 'create', name: 'Open day feedback', mode: 'public' }); const PUB = r.json.id;
await call(ADMIN, 'PUT', '/api/surveys', { id: PUB, questions: [{ type: 'rating', title: 'Overall', required: true, max: 5 }] });
r = await call(ADMIN, 'PUT', '/api/surveys', { id: PUB, action: 'settings', mandatory: true, target: { all: true } }); ok('a public survey cannot be mandatory', r.status === 400, r.json);
await call(ADMIN, 'POST', '/api/surveys', { action: 'publish', id: PUB });
const pq = (await call(null, 'GET', '/api/survey-respond?id=' + PUB)).json.questions;
r = await call(null, 'POST', '/api/survey-respond', { id: PUB, client_token: tok(), answers: { [pq[0].id]: 5 } }); ok('anyone with the link can answer a public survey', r.status === 200, r.json);
r = await call(MEM, 'POST', '/api/survey-respond', { id: PUB, client_token: tok(), answers: { [pq[0].id]: 4 } });
ok('no user id stored even when a signed-in person answers', (await q('SELECT COUNT(*)::int n FROM rexus_survey_responses WHERE survey_id=$1 AND user_id IS NOT NULL', [PUB]))[0].n === 0);
r = await call(ADMIN, 'GET', `/api/surveys?id=${PUB}&export=1`); ok('public export has no respondent columns', !r.json.columns.includes('User ID') && r.json.rows.length === 2, r.json.columns);
r = await call(null, 'GET', '/api/survey-respond?id=' + SV); ok('authenticated survey needs sign-in', r.status === 401);

/* ------------------------------------------------------------ rollout + admin reset */
S('Rollout and reset');
r = await call(ADMIN, 'POST', '/api/profile-fields', { action: 'apply_existing' }); ok('admin enforces required fields for existing accounts', r.status === 200 && r.json.accounts >= 10, r.json);
r = await call(MEM2, 'GET', '/api/auth/me'); ok('existing account without DOB now has the profile step', r.json.onboarding.step === 'profile', r.json.onboarding);
await q('UPDATE users SET profile_gate = FALSE');   // keep the remaining checks independent
r = await call(ADMIN, 'POST', '/api/admin/users/' + MEM2, { action: 'reset_password' });
ok('admin reset gives a temporary password and forces a change', r.status === 200 && r.json.temp_password && (await q('SELECT must_change_password FROM users WHERE id=$1', [MEM2]))[0].must_change_password, r.json);
r = await call(MEM2, 'GET', '/api/tasks'); ok('…and the account is gated until it is changed', r.status === 401);

const failed = results.filter(x => !x.pass);
console.log(`\n${results.length - failed.length}/${results.length} survey backend checks passed`);
import fs from 'node:fs'; fs.writeFileSync(new URL('./survey-results.json', import.meta.url), JSON.stringify(results, null, 1));
process.exit(failed.length ? 1 : 0);
