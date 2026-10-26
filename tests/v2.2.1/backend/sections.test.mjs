// v2.3.4 SUR-04/05: unit checks of sections, branching path and answer validation (lib/survey.mts).
import { tsImport } from 'tsx/esm/api';
const L = await tsImport(new URL('../../../netlify/functions/lib/survey.mts', import.meta.url).pathname, import.meta.url);
const ok = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) process.exitCode = 1; };
const items = L.validateQuestions([
  { id: 'q_role0001', type: 'single', title: 'Role?', required: true, options: ['Staff', 'Student'], routes: { Student: 's_stud0001', Staff: 'next' } },
  { id: 's_staff001', type: 'section', title: 'Staff' },
  { id: 'q_staff001', type: 'short', title: 'Department?', required: true },
  { id: 'q_staff002', type: 'single', title: 'Done?', required: true, options: ['Yes', 'No'], routes: { Yes: 'end' } },
  { id: 's_stud0001', type: 'section', title: 'Students' },
  { id: 'q_stud0001', type: 'short', title: 'Class?', required: true }]);
ok('routes kept, next dropped', JSON.stringify(items[0].routes) === '{"Student":"s_stud0001"}');
ok('pages: 3', L.pages(items).length === 3);
ok('path student skips staff', JSON.stringify(L.answerPath(items, { q_role0001: 'Student' })) === '["q_role0001","q_stud0001"]');
ok('path staff + end', JSON.stringify(L.answerPath(items, { q_role0001: 'Staff', q_staff002: 'Yes' })) === '["q_role0001","q_staff001","q_staff002"]');
ok('path staff + no', L.answerPath(items, { q_role0001: 'Staff', q_staff002: 'No' }).length === 4);
let e = ''; try { L.validateAnswers(items, { q_role0001: 'Student' }); } catch (x) { e = x.message; }
ok('student: class required (Question 4)', e === 'Question 4 is required.');
ok('student answer valid, off-path dropped', JSON.stringify(L.validateAnswers(items, { q_role0001: 'Student', q_stud0001: '12A', q_staff001: 'HR' })) === '{"q_role0001":"Student","q_stud0001":"12A"}');
e = ''; try { L.validateQuestions([{ type: 'section', id: 's_aaaa1111' }, { type: 'single', title: 'x', options: ['a', 'b'], routes: { a: 's_aaaa1111' } }]); } catch (x) { e = x.message; }
ok('backward route rejected', /deleted or comes before/.test(e));
e = ''; try { L.validateQuestions([{ type: 'single', title: 'x', options: ['a', 'b'], routes: { a: 's_gone0000' } }]); } catch (x) { e = x.message; }
ok('missing section rejected', /deleted or comes before/.test(e));
const plain = L.validateQuestions([{ type: 'short', title: 'A', required: true }, { type: 'rating', title: 'B' }]);
ok('no sections: one page, all on path', L.pages(plain).length === 1 && L.answerPath(plain, {}).length === 2);
ok('section numbering: questions only', L.realQuestions(items).length === 4);
