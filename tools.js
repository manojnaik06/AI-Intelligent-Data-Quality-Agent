/* DataGuard AI — reusable data quality tools and methods */

'use strict';

// ── Agent Tools ───────────────────────────────────────────────────────────────
// Each tool is a discrete capability the agent can invoke
const AgentTools = {

  /**
   * TOOL: scan_schema
   * Understand the dataset structure, types, completeness
   */
  async scan_schema(data, columns) {
    const schema = {};
    for (const col of columns) {
      const values = data.map(r => r[col]);
      const nonNull = values.filter(v => v !== null && v !== undefined && v !== '');
      const numeric = nonNull.filter(v => typeof v === 'number' || (typeof v === 'string' && !isNaN(+v)));
      schema[col] = {
        totalRows:  data.length,
        nonNull:    nonNull.length,
        nullCount:  data.length - nonNull.length,
        isNumeric:  numeric.length > nonNull.length * 0.8,
        uniqueVals: new Set(values.map(v => String(v).toLowerCase().trim())).size,
        samples:    nonNull.slice(0, 3).map(String),
      };
    }
    return schema;
  },

  /**
   * TOOL: detect_duplicates
   * Find exact and fuzzy duplicate rows
   */
  async detect_duplicates(data, threshold) {
    const issues = [];
    const seen = new Map();
    const keyOf = row => `${String(row.name||'').toLowerCase().trim()}__${String(row.email||'').toLowerCase().trim()}`;

    for (let i = 0; i < data.length; i++) {
      const key = keyOf(data[i]);
      if (seen.has(key)) {
        const origIdx = seen.get(key);
        issues.push({
          id:         `dup_${i}`,
          type:       'duplicate',
          severity:   'high',
          rowIndex:   i,
          rows:       [origIdx, i],
          column:     'multiple',
          title:      `Duplicate Record Detected`,
          description: `Row ${i+1} appears to be a duplicate of Row ${origIdx+1}. Name and email match (case-insensitive).`,
          suggestion: `Remove duplicate row ${i+1} (Row ${origIdx+1} will be retained as the primary record).`,
          currentVal: `Row ${i+1}: ${data[i].name} / ${data[i].email}`,
          fixedVal:   `[DELETE] Row ${i+1}`,
          action:     'delete_row',
          confidence: 98,
        });
      } else {
        seen.set(key, i);
      }
    }

    // Near-duplicate detection by name similarity
    const processed = new Set();
    for (let i = 0; i < data.length; i++) {
      for (let j = i + 1; j < data.length; j++) {
        const key = `${i}_${j}`;
        if (processed.has(key)) continue;
        const n1 = String(data[i].name || '').toLowerCase().trim();
        const n2 = String(data[j].name || '').toLowerCase().trim();
        if (n1 === '' || n2 === '') continue;
        const sim = stringSimilarity(n1, n2);
        if (sim >= threshold / 100 && n1 !== n2) {
          const e1 = String(data[i].email || '').toLowerCase();
          const e2 = String(data[j].email || '').toLowerCase();
          if (e1 === e2 || stringSimilarity(e1, e2) > 0.85) {
            processed.add(key);
            issues.push({
              id:         `neardup_${i}_${j}`,
              type:       'duplicate',
              severity:   'medium',
              rowIndex:   i,
              rows:       [i, j],
              column:     'name',
              title:      `Near-Duplicate Names (${Math.round(sim*100)}% similar)`,
              description: `"${data[i].name}" (Row ${i+1}) and "${data[j].name}" (Row ${j+1}) are highly similar and share the same email. Likely the same person with a formatting difference.`,
              suggestion: `Standardize name format. Suggested: "${toTitleCase(n1)}"`,
              currentVal: `Row ${j+1}: ${data[j].name}`,
              fixedVal:   toTitleCase(n1),
              action:     'update_cell',
              targetRow:  j,
              targetCol:  'name',
              confidence: Math.round(sim * 100),
            });
          }
        }
      }
    }
    return issues;
  },

  /**
   * TOOL: detect_missing_values
   * Find nulls, empty strings, and placeholder values
   */
  async detect_missing_values(data, columns) {
    const issues = [];
    const PLACEHOLDERS = new Set(['n/a', 'na', 'null', 'none', 'undefined', '-', 'unknown', '?', 'tbd']);

    for (let i = 0; i < data.length; i++) {
      for (const col of columns) {
        const val = data[i][col];
        const isEmpty = val === null || val === undefined || String(val).trim() === '';
        const isPlaceholder = !isEmpty && PLACEHOLDERS.has(String(val).toLowerCase().trim());

        if (isEmpty || isPlaceholder) {
          const suggestion = suggestFill(data, i, col);
          issues.push({
            id:         `miss_${i}_${col}`,
            type:       'missing',
            severity:   col === 'id' || col === 'email' || col === 'name' ? 'high' : 'medium',
            rowIndex:   i,
            rows:       [i],
            column:     col,
            title:      `Missing Value: ${col}`,
            description: `Row ${i+1} has a ${isPlaceholder ? 'placeholder' : 'missing'} value in column "${col}". ${isPlaceholder ? `Found: "${val}"` : 'Field is empty or null.'}`,
            suggestion: suggestion ? `Fill with inferred value: "${suggestion}"` : `Provide a valid value for "${col}" or mark as intentionally missing.`,
            currentVal: isEmpty ? '(empty)' : String(val),
            fixedVal:   suggestion || '(requires manual input)',
            action:     suggestion ? 'fill_value' : 'flag_manual',
            targetRow:  i,
            targetCol:  col,
            confidence: suggestion ? 72 : 45,
          });
        }
      }
    }
    return issues;
  },

  /**
   * TOOL: detect_inconsistencies
   * Check format errors, domain violations, type mismatches
   */
  async detect_inconsistencies(data, columns, schema) {
    const issues = [];

    // Determine dominant department casing
    const depts = data.map(r => r.department).filter(Boolean);
    const normalDepts = ['Engineering', 'Marketing', 'HR', 'Finance', 'Sales', 'Operations'];

    for (let i = 0; i < data.length; i++) {
      const row = data[i];

      // Email format
      if (row.email && String(row.email).trim() !== '') {
        const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRx.test(String(row.email).trim())) {
          const suggested = fixEmail(String(row.email));
          issues.push({
            id:         `inc_email_${i}`,
            type:       'inconsistent',
            severity:   'high',
            rowIndex:   i,
            rows:       [i],
            column:     'email',
            title:      `Invalid Email Format`,
            description: `Row ${i+1}: "${row.email}" is not a valid email address format.`,
            suggestion: suggested ? `Correct to: "${suggested}"` : 'Provide a valid email address.',
            currentVal: String(row.email),
            fixedVal:   suggested || '(manual fix required)',
            action:     suggested ? 'update_cell' : 'flag_manual',
            targetRow:  i,
            targetCol:  'email',
            confidence: suggested ? 80 : 50,
          });
        }
      }

      // Phone format
      if (row.phone && String(row.phone).trim() !== '') {
        const phone = String(row.phone).trim();
        const digits = phone.replace(/\D/g, '');
        const stdRx = /^\d{3}-\d{4}$/;
        if (!stdRx.test(phone) && digits.length >= 7) {
          const fixedPhone = `${digits.slice(-7,-4)}-${digits.slice(-4)}`;
          issues.push({
            id:         `inc_phone_${i}`,
            type:       'inconsistent',
            severity:   'low',
            rowIndex:   i,
            rows:       [i],
            column:     'phone',
            title:      `Non-Standard Phone Format`,
            description: `Row ${i+1}: "${phone}" doesn't match standard format (XXX-XXXX).`,
            suggestion: `Normalize to: "${fixedPhone}"`,
            currentVal: phone,
            fixedVal:   fixedPhone,
            action:     'update_cell',
            targetRow:  i,
            targetCol:  'phone',
            confidence: 90,
          });
        }
      }

      // Department casing
      if (row.department && String(row.department).trim() !== '') {
        const dept = String(row.department).trim();
        const normalized = toTitleCase(dept.toLowerCase());
        const isStdDept = normalDepts.some(d => d.toLowerCase() === dept.toLowerCase());
        if (isStdDept && dept !== normalized) {
          issues.push({
            id:         `inc_dept_${i}`,
            type:       'inconsistent',
            severity:   'low',
            rowIndex:   i,
            rows:       [i],
            column:     'department',
            title:      `Inconsistent Department Casing`,
            description: `Row ${i+1}: Department "${dept}" uses non-standard casing. Other records use Title Case.`,
            suggestion: `Standardize to: "${normalized}"`,
            currentVal: dept,
            fixedVal:   normalized,
            action:     'update_cell',
            targetRow:  i,
            targetCol:  'department',
            confidence: 95,
          });
        }
      }

      // Date format
      if (row.join_date && String(row.join_date).trim() !== '') {
        const date = String(row.join_date).trim();
        const isoRx = /^\d{4}-\d{2}-\d{2}$/;
        if (!isoRx.test(date)) {
          const fixedDate = tryFixDate(date);
          issues.push({
            id:         `inc_date_${i}`,
            type:       'inconsistent',
            severity:   'medium',
            rowIndex:   i,
            rows:       [i],
            column:     'join_date',
            title:      `Non-ISO Date Format`,
            description: `Row ${i+1}: "${date}" is not in ISO 8601 format (YYYY-MM-DD).`,
            suggestion: fixedDate ? `Convert to: "${fixedDate}"` : 'Reformat to YYYY-MM-DD.',
            currentVal: date,
            fixedVal:   fixedDate || '(manual fix)',
            action:     fixedDate ? 'update_cell' : 'flag_manual',
            targetRow:  i,
            targetCol:  'join_date',
            confidence: fixedDate ? 85 : 60,
          });
        }
      }
    }
    return issues;
  },

  /**
   * TOOL: detect_outliers
   * Find statistical anomalies in numeric columns
   */
  async detect_outliers(data, schema) {
    const issues = [];
    const numericCols = Object.keys(schema).filter(c => schema[c].isNumeric);

    for (const col of numericCols) {
      const values = data
        .map((r, i) => ({ val: parseFloat(r[col]), idx: i }))
        .filter(x => !isNaN(x.val) && x.val !== null);

      if (values.length < 3) continue;

      const vals = values.map(x => x.val);
      const mean = vals.reduce((a,b) => a+b, 0) / vals.length;
      const std  = Math.sqrt(vals.reduce((s,v) => s + (v-mean)**2, 0) / vals.length);
      const q1   = percentile(vals, 25);
      const q3   = percentile(vals, 75);
      const iqr  = q3 - q1;

      // Domain rules
      const domainRules = {
        age:    { min: 18, max: 100, label: 'valid employee age' },
        salary: { min: 20000, max: 500000, label: 'reasonable salary range' },
      };

      for (const { val, idx } of values) {
        const zScore = std > 0 ? Math.abs((val - mean) / std) : 0;
        const isIQROutlier = val < q1 - 1.5 * iqr || val > q3 + 1.5 * iqr;
        const rule = domainRules[col];
        const isOutOfDomain = rule && (val < rule.min || val > rule.max);

        if (isOutOfDomain || (zScore > 3 && isIQROutlier)) {
          const severity = isOutOfDomain ? 'high' : (zScore > 4 ? 'high' : 'medium');
          let desc = `Row ${idx+1}: ${col}="${val}" `;
          let suggestion = '';
          if (rule && val < rule.min) {
            desc += `is below the minimum ${rule.label} (${rule.min}).`;
            suggestion = `Review: value is below domain minimum. Consider correcting to a valid value or removing if data entry error.`;
          } else if (rule && val > rule.max) {
            desc += `is above the maximum ${rule.label} (${rule.max}).`;
            suggestion = `Review: value exceeds domain maximum. Z-score: ${zScore.toFixed(1)}. Verify with source data.`;
          } else {
            desc += `is a statistical outlier (Z-score: ${zScore.toFixed(1)}, IQR boundary: [${(q1-1.5*iqr).toFixed(0)}, ${(q3+1.5*iqr).toFixed(0)}]).`;
            suggestion = `Investigate if this is a genuine value or data entry error. Mean: ${mean.toFixed(0)}, StdDev: ${std.toFixed(0)}.`;
          }
          issues.push({
            id:         `out_${col}_${idx}`,
            type:       'outlier',
            severity,
            rowIndex:   idx,
            rows:       [idx],
            column:     col,
            title:      `Outlier Detected: ${col}`,
            description: desc,
            suggestion,
            currentVal: String(val),
            fixedVal:   `${Math.round(mean)}` + (isOutOfDomain && rule && val < rule.min ? ` (mean, or verify source)` : ''),
            action:     'flag_manual',
            targetRow:  idx,
            targetCol:  col,
            confidence: Math.round(Math.min(95, 50 + zScore * 8)),
          });
        }
      }
    }
    return issues;
  },

};

window.AgentTools = AgentTools;

// ── Helper Functions ──────────────────────────────────────────────────────────

function stringSimilarity(a, b) {
  if (a === b) return 1;
  const longer  = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  const longerLen = longer.length;
  if (longerLen === 0) return 1;
  const editDist = levenshtein(longer, shorter);
  return (longerLen - editDist) / longerLen;
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({length: m+1}, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}

function toTitleCase(str) {
  return str.replace(/\w\S*/g, t => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());
}

function fixEmail(email) {
  const e = email.trim();
  // Missing TLD
  if (e.match(/^[^\s@]+@[^\s@]+$/) && !e.includes('.')) return null;
  // Missing domain part
  if (e.endsWith('@')) return null;
  // Truncated domain
  if (e.match(/^[^\s@]+@[^\s@]+\.[^\s@]{0}$/)) return null;
  return null;
}

function tryFixDate(date) {
  // DD-MM-YYYY → YYYY-MM-DD
  const dmyRx = /^(\d{2})-(\d{2})-(\d{4})$/;
  const m = date.match(dmyRx);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  // MM/DD/YYYY → YYYY-MM-DD
  const mdyRx = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
  const m2 = date.match(mdyRx);
  if (m2) return `${m2[3]}-${String(m2[1]).padStart(2,'0')}-${String(m2[2]).padStart(2,'0')}`;
  return null;
}

function suggestFill(data, rowIdx, col) {
  // For department: look at other cols in same row
  if (col === 'name' || col === 'id') return null;

  // Mode-based suggestion for categorical
  const vals = data.map(r => r[col]).filter(v => v !== null && v !== undefined && String(v).trim() !== '');
  if (vals.length === 0) return null;

  const numVals = vals.filter(v => typeof v === 'number' || !isNaN(+v));
  if (numVals.length > vals.length * 0.7) {
    // Numeric: suggest median
    const sorted = [...numVals].map(Number).sort((a,b)=>a-b);
    const median = sorted[Math.floor(sorted.length/2)];
    return String(Math.round(median));
  }

  // Categorical: mode
  const freq = {};
  for (const v of vals) freq[v] = (freq[v]||0) + 1;
  const mode = Object.entries(freq).sort((a,b)=>b[1]-a[1])[0];
  return mode ? String(mode[0]) : null;
}

function percentile(arr, p) {
  const sorted = [...arr].sort((a,b)=>a-b);
  const idx = (p/100) * (sorted.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function computeQualityScore(totalRows, issues) {
  if (totalRows === 0) return 100;
  const totalCells = totalRows * DEMO_COLUMNS.length;
  const highPenalty   = issues.filter(i=>i.severity==='high').length   * 3;
  const mediumPenalty = issues.filter(i=>i.severity==='medium').length * 1.5;
  const lowPenalty    = issues.filter(i=>i.severity==='low').length    * 0.5;
  const totalPenalty  = highPenalty + mediumPenalty + lowPenalty;
  const raw = Math.max(0, 100 - (totalPenalty / totalCells) * 100 * 3);
  return Math.round(Math.min(100, Math.max(0, raw)));
}

window.computeQualityScore = computeQualityScore;
window.stringSimilarity = stringSimilarity;
window.toTitleCase = toTitleCase;
window.percentile = percentile;
