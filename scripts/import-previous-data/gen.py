"""Builds migration 036 (import of the old REXUS data export) from the CSV folder.
usage: python3 -I gen.py <csv_dir> <schema.json> <out.sql>"""
import sys, json, os
CSV, SCHEMA, OUT = sys.argv[1:4]
S = json.load(open(SCHEMA))['cols']

def parse(path):
    """CSV parser that keeps NULL (unquoted empty) apart from '' (quoted empty)."""
    s = open(path, encoding='utf-8').read()
    rows, row, i, n = [], [], 0, len(s)
    if not s.strip(): return []
    while i < n:
        if s[i] == '"':
            j, buf = i + 1, []
            while True:
                k = s.index('"', j)
                buf.append(s[j:k])
                if k + 1 < n and s[k + 1] == '"': buf.append('"'); j = k + 2; continue
                i = k + 1; break
            row.append(''.join(buf))
        else:
            k = i
            while k < n and s[k] not in ',\r\n': k += 1
            v = s[i:k]; row.append(None if v == '' else v); i = k
        if i < n and s[i] == ',': i += 1; continue
        while i < n and s[i] in '\r\n':
            if s[i] == '\n': rows.append(row); row = []
            i += 1
        if i >= n and row: rows.append(row); row = []
    if row: rows.append(row)
    return rows

def lit(v): return 'NULL' if v is None else "'" + v.replace("'", "''") + "'"

ORDER = ['users', 'task_types', 'reporters', 'projects', 'project_members', 'tasks', 'subtasks', 'worklogs',
         'comments', 'activity_log', 'notifications', 'employee_rates', 'finance_audit_log', 'departments', 'employee_performance']
SEED_USERS = None  # filled from the caller's list below
out, report = [], []
for t in ORDER:
    f = os.path.join(CSV, t + '.csv')
    if not os.path.exists(f): report.append(f'{t}: no file'); continue
    rows = parse(f)
    if len(rows) < 2: report.append(f'{t}: 0 rows'); continue
    head, data = rows[0], rows[1:]
    if t == 'users' and 'member_type' in head:   # old column; keep the value as job position when that is empty
        mi, pi = head.index('member_type'), head.index('position')
        for r in data:
            if r[mi] and not r[pi]: r[pi] = r[mi]
    keep = [i for i, c in enumerate(head) if c in S[t]]
    dropped = [c for c in head if c not in S[t]]
    cols = ', '.join('"' + head[i] + '"' for i in keep)
    for r in data:
        assert len(r) == len(head), (t, r)
        out.append(f'INSERT INTO {t} ({cols}) VALUES (' + ', '.join(lit(r[i]) for i in keep) + ');')
    report.append(f'{t}: {len(data)} rows' + (f' (dropped old columns: {", ".join(dropped)})' if dropped else ''))

cs = parse(os.path.join(CSV, 'company_settings.csv'))
if len(cs) > 1:
    head, r = cs[0], cs[1]
    sets = ', '.join(f'"{c}" = {lit(r[i])}' for i, c in enumerate(head) if c in S['company_settings'] and c != 'id')
    out.append(f'UPDATE company_settings SET {sets} WHERE id = {int(r[head.index("id")])};')
    report.append('company_settings: 1 row (updated in place)')

seed = json.load(open(SCHEMA)).get('seed_users', [])
sql = f"""-- REXUS v2.3.2: import the data exported from the previous REXUS database (CSV export, 16 tables).
-- Runs once, on a NEW (empty) database right after migrations 001-035. It replaces the sample/seed rows
-- those migrations create (demo team accounts, demo project, tasks, rates, departments, task types)
-- with the exported data. Configuration rows (company settings id 1, HR settings, profile fields) are kept.
-- Safety: it refuses to run (and the deploy fails without changes) if the database already holds any
-- account that is not one of the seed accounts, i.e. if this is not a fresh database.
DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM users WHERE id NOT IN ({', '.join(lit(u) for u in seed)})) THEN
    RAISE EXCEPTION 'REXUS 036: this database already contains real accounts; the import only runs on a new database';
  END IF;
END $guard$;

-- remove the seed rows created by 001-035 (children first)
DELETE FROM worklogs;
DELETE FROM tasks;
DELETE FROM project_members;
DELETE FROM projects;
DELETE FROM employee_project_rates;
DELETE FROM employee_rates;
DELETE FROM departments;
DELETE FROM task_types;
DELETE FROM reporters;
UPDATE rexus_hr_settings SET updated_by = NULL;
UPDATE rexus_demographic_fields SET updated_by = NULL;
DELETE FROM users;

-- imported data
""" + '\n'.join(out) + '\n'
open(OUT, 'w', encoding='utf-8').write(sql)
print('\n'.join(report))
