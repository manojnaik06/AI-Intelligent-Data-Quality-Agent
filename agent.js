/* ============================================================
   DataGuard AI — Agentic Core Engine
   The AI agent logic: tools, reasoning loop, detection algorithms
   ============================================================ */

'use strict';

// ── Demo Dataset ──────────────────────────────────────────────────────────────
const DEMO_DATASET = [
  { id: 1,  name: "Alice Johnson",    email: "alice@example.com",       age: 28,   salary: 72000,  department: "Engineering",  phone: "555-1234",    join_date: "2021-03-15" },
  { id: 2,  name: "Bob Smith",        email: "bob.smith@example.com",   age: 34,   salary: 85000,  department: "Marketing",    phone: "555-5678",    join_date: "2020-07-22" },
  { id: 3,  name: "alice johnson",    email: "alice@example.com",       age: 28,   salary: 72000,  department: "Engineering",  phone: "555-1234",    join_date: "2021-03-15" },
  { id: 4,  name: "Carol White",      email: "carol@example.com",       age: null, salary: 91000,  department: "HR",           phone: "555-9012",    join_date: "2019-11-01" },
  { id: 5,  name: "David Brown",      email: "david.brown@",            age: 45,   salary: 110000, department: "Finance",      phone: "555-3456",    join_date: "2018-05-30" },
  { id: 6,  name: "Eva Martinez",     email: "eva@example.com",         age: 31,   salary: 67000,  department: "engineering",  phone: "555-7890",    join_date: "22-01-2022" },
  { id: 7,  name: "Frank Lee",        email: "",                        age: 27,   salary: 58000,  department: "Sales",        phone: "555-2345",    join_date: "2023-01-10" },
  { id: 8,  name: "Grace Kim",        email: "grace.kim@example.com",   age: 39,   salary: 94000,  department: "Engineering",  phone: "555-6789",    join_date: "2017-08-14" },
  { id: 9,  name: "Henry Davis",      email: "henry@example.com",       age: 52,   salary: 999999, department: "Finance",      phone: "5556789",     join_date: "2015-12-01" },
  { id: 10, name: "Iris Wilson",      email: "iris@example.com",        age: 29,   salary: 73000,  department: "HR",           phone: "555-0123",    join_date: "2022-06-18" },
  { id: 11, name: "Bob Smith",        email: "bob.smith@example.com",   age: 34,   salary: 85000,  department: "Marketing",    phone: "555-5678",    join_date: "2020-07-22" },
  { id: 12, name: "Jake Turner",      email: "jake@example.com",        age: -5,   salary: 78000,  department: "Sales",        phone: "555-4567",    join_date: "2021-09-05" },
  { id: 13, name: "Kara Nelson",      email: "kara@example.com",        age: 35,   salary: null,   department: "Marketing",    phone: "555-8901",    join_date: "2020-02-28" },
  { id: 14, name: "Leo Sanchez",      email: "leo@example",             age: 44,   salary: 102000, department: "Finance",      phone: "555-2341",    join_date: "2016-04-10" },
  { id: 15, name: "",                 email: "anon@example.com",        age: 30,   salary: 65000,  department: "HR",           phone: "555-9876",    join_date: "2023-03-22" },
  { id: 16, name: "Mia Chen",         email: "mia.chen@example.com",    age: 26,   salary: 61000,  department: "SALES",        phone: "(555)1122",   join_date: "2024-01-05" },
  { id: 17, name: "Noah Patel",       email: "noah@example.com",        age: 38,   salary: 88000,  department: "Engineering",  phone: "555-3344",    join_date: "2019-07-17" },
  { id: 18, name: "Olivia Scott",     email: "olivia@example.com",      age: null, salary: 74000,  department: "Marketing",    phone: "555-5566",    join_date: "2021-11-30" },
  { id: 19, name: "Peter Adams",      email: "peter@example.com",       age: 48,   salary: 115000, department: "Finance",      phone: "555-7788",    join_date: "2014-06-20" },
  { id: 20, name: "Quinn Murphy",     email: "quinn@example.com",       age: 33,   salary: 79000,  department: "engineering",  phone: "555-9900",    join_date: "2020-10-12" },
  { id: 21, name: "Rachel Clark",     email: "rachel@example.com",      age: 41,   salary: 93000,  department: "HR",           phone: "555-1100",    join_date: "2018-03-08" },
  { id: 22, name: "Sam Taylor",       email: "sam@example.com",         age: 150,  salary: 71000,  department: "Sales",        phone: "555-2200",    join_date: "2022-08-14" },
  { id: 23, name: "Tina Wright",      email: "tina@example.com",        age: 36,   salary: 84000,  department: "Marketing",    phone: "",            join_date: "2021-05-19" },
  { id: 24, name: "Uma Foster",       email: "uma@example.com",         age: 29,   salary: 69000,  department: "Engineering",  phone: "555-4400",    join_date: "2023-02-01" },
  { id: 25, name: "Victor Hayes",     email: "victor@example.com",      age: 55,   salary: 135000, department: "Finance",      phone: "555-5500",    join_date: "2012-09-15" },
];

const DEMO_COLUMNS = ['id','name','email','age','salary','department','phone','join_date'];

// ── Utility: sleep ────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Agentic Reasoning Loop ────────────────────────────────────────────────────
class DataQualityAgent {
  constructor(logCallback, statusCallback) {
    this.logCallback    = logCallback;
    this.statusCallback = statusCallback;
    this.issues         = [];
    this.schema         = {};
    this.data           = [];
    this.columns        = [];
    this.stepCounter    = 0;
    this.running        = false;
  }

  step(label) { return `STEP ${++this.stepCounter}`; }

  log(type, icon, message, stepLabel) {
    this.logCallback({ type, icon, message, step: stepLabel || `STEP ${this.stepCounter}` });
  }

  setStatus(s) { this.statusCallback(s); }

  async run(data, columns, config) {
    this.data    = data;
    this.columns = columns;
    this.issues  = [];
    this.stepCounter = 0;
    this.running = true;

    this.setStatus('running');
    this.log('think', '🧠', 'Agent initialized. Beginning autonomous data quality investigation...', 'INIT');
    await sleep(500);

    // ── Phase 1: Schema Analysis ──
    this.step();
    this.log('think', '🔭', `<strong>THINK</strong>: First, I need to understand the dataset structure before running any checks.`, `STEP ${this.stepCounter}`);
    await sleep(700);

    this.log('action', '⚙️', `<strong>ACTION → scan_schema</strong>: Analyzing ${data.length} rows × ${columns.length} columns...`, `STEP ${this.stepCounter}`);
    await sleep(600);

    this.schema = await AgentTools.scan_schema(data, columns);

    const nullCols = Object.entries(this.schema).filter(([,s]) => s.nullCount > 0).map(([c]) => c);
    this.log('result', '📊', `<strong>RESULT</strong>: Schema analyzed. Columns with nulls: [${nullCols.join(', ') || 'none'}]. Numeric columns: [${Object.entries(this.schema).filter(([,s])=>s.isNumeric).map(([c])=>c).join(', ')}].`, `STEP ${this.stepCounter}`);
    await sleep(400);

    // ── Phase 2: Duplicate Detection ──
    if (config.duplicates) {
      this.step();
      this.log('think', '🧠', `<strong>THINK</strong>: Schema analyzed. Now detecting duplicate records using exact-match and similarity analysis (threshold: ${config.threshold}%).`, `STEP ${this.stepCounter}`);
      await sleep(600);

      this.log('action', '🔁', `<strong>ACTION → detect_duplicates</strong>: Running hash-map exact match + Levenshtein similarity on key identity fields (name, email)...`, `STEP ${this.stepCounter}`);
      await sleep(900);

      const dupIssues = await AgentTools.detect_duplicates(data, config.threshold);
      this.issues.push(...dupIssues);

      this.log('result', dupIssues.length > 0 ? '⚠️' : '✅', `<strong>RESULT</strong>: Found <strong>${dupIssues.length}</strong> duplicate issue(s). ${dupIssues.length > 0 ? `Exact: ${dupIssues.filter(i=>i.id.startsWith('dup_')).length}, Near-dup: ${dupIssues.filter(i=>i.id.startsWith('neardup')).length}.` : 'Dataset appears to have no duplicates.'}`, `STEP ${this.stepCounter}`);
      await sleep(400);
    }

    // ── Phase 3: Missing Values ──
    if (config.missing) {
      this.step();
      this.log('think', '🧠', `<strong>THINK</strong>: Duplicate check complete. Next: scan all cells for null, empty, and placeholder values.`, `STEP ${this.stepCounter}`);
      await sleep(600);

      this.log('action', '❓', `<strong>ACTION → detect_missing_values</strong>: Scanning ${data.length * columns.length} cells for nulls, empty strings, and N/A placeholders...`, `STEP ${this.stepCounter}`);
      await sleep(1000);

      const missIssues = await AgentTools.detect_missing_values(data, columns);
      this.issues.push(...missIssues);

      this.log('result', missIssues.length > 0 ? '⚠️' : '✅', `<strong>RESULT</strong>: Found <strong>${missIssues.length}</strong> missing value issue(s) across columns: [${[...new Set(missIssues.map(i=>i.column))].join(', ') || 'none'}].`, `STEP ${this.stepCounter}`);
      await sleep(400);
    }

    // ── Phase 4: Inconsistency Detection ──
    if (config.inconsistent) {
      this.step();
      this.log('think', '🧠', `<strong>THINK</strong>: Missing value scan done. Now checking format consistency, casing, and domain-specific validation rules.`, `STEP ${this.stepCounter}`);
      await sleep(600);

      this.log('action', '⚠️', `<strong>ACTION → detect_inconsistencies</strong>: Validating email format, phone standardization, department casing, and date formats...`, `STEP ${this.stepCounter}`);
      await sleep(1100);

      const incIssues = await AgentTools.detect_inconsistencies(data, columns, this.schema);
      this.issues.push(...incIssues);

      this.log('result', incIssues.length > 0 ? '⚠️' : '✅', `<strong>RESULT</strong>: Found <strong>${incIssues.length}</strong> inconsistency issue(s). Types: ${[...new Set(incIssues.map(i=>i.title.split(':')[0]))].join(', ') || 'none'}.`, `STEP ${this.stepCounter}`);
      await sleep(400);
    }

    // ── Phase 5: Outlier Detection ──
    if (config.outliers) {
      this.step();
      this.log('think', '🧠', `<strong>THINK</strong>: Consistency checks done. Running statistical outlier detection using Z-score and IQR methods on numeric columns.`, `STEP ${this.stepCounter}`);
      await sleep(600);

      this.log('action', '📈', `<strong>ACTION → detect_outliers</strong>: Computing Z-scores and IQR bounds for numeric columns. Applying domain validation rules (age: 18-100, salary: 20k-500k)...`, `STEP ${this.stepCounter}`);
      await sleep(1000);

      const outIssues = await AgentTools.detect_outliers(data, this.schema);
      this.issues.push(...outIssues);

      this.log('result', outIssues.length > 0 ? '⚠️' : '✅', `<strong>RESULT</strong>: Found <strong>${outIssues.length}</strong> outlier(s) in columns: [${[...new Set(outIssues.map(i=>i.column))].join(', ') || 'none'}].`, `STEP ${this.stepCounter}`);
      await sleep(400);
    }

    // ── Phase 6: Summary Reasoning ──
    this.step();
    const total = this.issues.length;
    const highCount = this.issues.filter(i => i.severity === 'high').length;
    const score = computeQualityScore(data.length, this.issues);

    this.log('think', '🧠', `<strong>THINK</strong>: All detection passes complete. Synthesizing findings: ${total} total issues found, ${highCount} critical. Computing quality score...`, `STEP ${this.stepCounter}`);
    await sleep(600);

    this.log('result', '📋', `<strong>SUMMARY</strong>: Data Quality Score: <strong>${score}%</strong>. ${total} issues detected (${highCount} high severity). I am now presenting these to the user for review — no changes will be applied without explicit approval.`, `STEP ${this.stepCounter}`);
    await sleep(300);

    this.log('result', '✅', `<strong>AGENT COMPLETE</strong>: Investigation finished. Awaiting your validation decisions for each suggested correction. The original data remains unchanged until you approve and apply.`, 'FINAL');

    this.running = false;
    this.setStatus('done');

    return { issues: this.issues, schema: this.schema, score };
  }
}

// ── Exports
window.DataQualityAgent = DataQualityAgent;
window.DEMO_DATASET = DEMO_DATASET;
window.DEMO_COLUMNS = DEMO_COLUMNS;
