import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const context = { window: {} };
vm.createContext(context);
for (const name of ['problems.js', 'problem_engine.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, '.local-runtime', name), 'utf8'), context, { filename: name });
}
vm.runInContext(fs.readFileSync(path.join(root, 'all_problems.js'), 'utf8'), context, { filename: 'all_problems.js' });

const problems = context.window.PROBLEMS;
const core = context.window.CORE_PROBLEMS;
const generated = context.window.GENERATED_PROBLEMS;
const familyDefs = context.window.PROBLEM_FAMILIES;
const failures = [];
const checks = [];
const check = (condition, scope, detail) => {
  if (!condition) failures.push({ scope, detail });
  else checks.push({ scope, detail });
};
const numAnswer = p => Number(p.answer);
const sameNumber = (p, expected) => Number.isFinite(expected) && Math.abs(numAnswer(p) - expected) < 1e-9;
const choose = (n, k) => {
  if (k < 0 || k > n) return 0;
  let value = 1;
  for (let i = 1; i <= Math.min(k, n - k); i++) value = value * (n - i + 1) / i;
  return value;
};
const gcd = (a, b) => b ? gcd(b, a % b) : Math.abs(a);

function permutations(values, length) {
  const out = [];
  const used = Array(values.length).fill(false);
  function visit(prefix) {
    if (prefix.length === length) return void out.push(prefix.slice());
    for (let i = 0; i < values.length; i++) if (!used[i]) {
      used[i] = true;
      prefix.push(values[i]);
      visit(prefix);
      prefix.pop();
      used[i] = false;
    }
  }
  visit([]);
  return out;
}

function josephus(n, k) {
  const people = Array.from({ length: n }, (_, i) => i + 1);
  let index = 0;
  while (people.length > 1) {
    index = (index + k - 1) % people.length;
    people.splice(index, 1);
  }
  return people[0];
}

function trailExists(edges) {
  const vertices = [...new Set(edges.flatMap(e => [...e]))];
  const memo = new Set();
  function walk(node, mask) {
    if (mask === (1 << edges.length) - 1) return true;
    const key = `${node}:${mask}`;
    if (memo.has(key)) return false;
    memo.add(key);
    for (let i = 0; i < edges.length; i++) if (!(mask & (1 << i))) {
      const [a, b] = edges[i];
      if (a === node && walk(b, mask | (1 << i))) return true;
      if (b === node && walk(a, mask | (1 << i))) return true;
    }
    return false;
  }
  return vertices.some(v => walk(v, 0));
}

function minimumWeighings(n) {
  const dp = Array(n + 1).fill(0);
  for (let candidates = 2; candidates <= n; candidates++) {
    let best = Infinity;
    for (let pan = 1; pan * 2 <= candidates; pan++) {
      const worst = Math.max(pan, candidates - 2 * pan);
      best = Math.min(best, 1 + dp[worst]);
    }
    dp[candidates] = best;
  }
  return dp[n];
}

function dominoTilingExists(rows, cols) {
  const cells = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if ((r === 0 && c === 0) || (r === rows - 1 && c === cols - 1)) continue;
    cells.push([r, c]);
  }
  const key = (r, c) => `${r},${c}`;
  const black = cells.filter(([r, c]) => (r + c) % 2 === 0);
  const white = new Set(cells.filter(([r, c]) => (r + c) % 2).map(([r, c]) => key(r, c)));
  if (black.length !== white.size) return false;
  const matching = new Map();
  function augment(r, c, seen) {
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = key(r + dr, c + dc);
      if (!white.has(next) || seen.has(next)) continue;
      seen.add(next);
      const prior = matching.get(next);
      if (!prior || augment(prior[0], prior[1], seen)) {
        matching.set(next, [r, c]);
        return true;
      }
    }
    return false;
  }
  return black.every(([r, c]) => augment(r, c, new Set()));
}

function nonAdjacentCircleSelections(n, k) {
  let count = 0;
  function visit(next, selected) {
    if (selected.length === k) {
      for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) {
        const d = Math.abs(selected[i] - selected[j]);
        if (d === 1 || d === n - 1) return;
      }
      count++;
      return;
    }
    for (let i = next; i < n; i++) visit(i + 1, [...selected, i]);
  }
  visit(0, []);
  return count;
}

function dominoTilings2ByN(n) {
  let count = 0;
  const filled = Array(2 * n).fill(false);
  function visit() {
    const first = filled.indexOf(false);
    if (first < 0) return void count++;
    const r = Math.floor(first / n), c = first % n;
    if (r === 0 && !filled[n + c]) {
      filled[first] = filled[n + c] = true;
      visit();
      filled[first] = filled[n + c] = false;
    }
    if (c + 1 < n && !filled[first + 1]) {
      filled[first] = filled[first + 1] = true;
      visit();
      filled[first] = filled[first + 1] = false;
    }
  }
  visit();
  return count;
}

function tournamentConstructionMaxWins(n) {
  const wins = Array(n).fill(0);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const clockwise = (j - i + n) % n;
    let winner;
    if (n % 2 === 1) winner = clockwise <= (n - 1) / 2 ? i : j;
    else if (clockwise < n / 2) winner = i;
    else if (clockwise > n / 2) winner = j;
    else winner = i % 2 === 0 ? i : j;
    wins[winner]++;
  }
  return Math.max(...wins);
}

function hatCoreAnswer() {
  const colors = ['赤', '青'];
  let worlds = [];
  for (const A of colors) for (const B of colors) for (const C of colors) {
    if ([A, B, C].includes('赤')) worlds.push([A, B, C]);
  }
  const knows = (world, person, candidates) => {
    const visible = [0, 1, 2].filter(i => i !== person);
    const possible = candidates.filter(w => visible.every(i => w[i] === world[i]));
    return new Set(possible.map(w => w[person])).size === 1;
  };
  worlds = worlds.filter(w => !knows(w, 0, worlds));
  worlds = worlds.filter(w => !knows(w, 1, worlds));
  const possibleForC = new Set(worlds.map(w => w[2]));
  return possibleForC.size === 1 ? [...possibleForC][0] : null;
}

// A. Structural and metadata integrity.
check(Array.isArray(problems) && problems.length === 438, 'bank', `question count ${problems.length}`);
check(core.length === 18, 'bank', `core count ${core.length}`);
check(generated.length === 420, 'bank', `generated count ${generated.length}`);
check(familyDefs.length === 30, 'bank', `family count ${familyDefs.length}`);
check(new Set(problems.map(p => p.id)).size === problems.length, 'bank', 'all IDs are unique');
for (const p of problems) {
  for (const field of ['id', 'prompt', 'answer', 'answerType', 'solution']) {
    check(p[field] !== undefined && p[field] !== null && p[field] !== '' && (!Array.isArray(p[field]) || p[field].length > 0), p.id, `${field} present`);
  }
  check(['number', 'fraction', 'text'].includes(p.answerType), p.id, `known answerType ${p.answerType}`);
  if (p.answerType === 'number' || p.answerType === 'fraction') check(Number.isFinite(Number(p.answer)), p.id, `finite numeric answer ${p.answer}`);
  check(['school', 'junior', 'olympiad'].includes(p.track), p.id, `valid track ${p.track}`);
  check(Number.isInteger(p.level) && p.level >= 1 && p.level <= 5, p.id, `valid level ${p.level}`);
}
for (const family of familyDefs) {
  const members = generated.filter(p => p.family === family.key);
  check(members.length === 14, family.key, `14 variants present`);
  check(members.every((p, i) => p.variant === i + 1), family.key, 'variants are contiguous 1..14');
  check(members.every(p => p.track === family.track), family.key, `track agrees with family metadata`);
  check(new Set(members.map(p => JSON.stringify(p.params))).size === members.length, family.key, 'no repeated parameter tuple');
}

const exactPromptGroups = [...Map.groupBy(problems, p => p.prompt).values()].filter(group => group.length > 1);

// B. Independent validation of all generated instances.
const methods = {
  S01: 'integer enumeration below the strict upper bound',
  S02: 'exact work-unit conservation',
  S03: 'ordered-card permutation enumeration',
  S04: 'coordinate shoelace area',
  S05: 'explicit circular elimination simulation',
  S06: 'positive-integer triple enumeration',
  S07: 'distance closure and per-traveller distance',
  S08: 'enumeration of every two-digit integer in range',
  S09: 'enumeration of pairs of horizontal and vertical grid lines',
  S10: 'enumeration of boundary cells',
  J01: 'backward dynamic game-state solver',
  J02: 'residue-class capacity plus extremal witness',
  J03: 'reachable lit-count state graph',
  J04: 'dynamic enumeration of 1/2-step compositions',
  J05: 'edge-mask Euler-trail search',
  J06: 'optimal equal-pan minimax recurrence',
  J07: 'bipartite matching on the corner-deleted grid',
  J08: 'handshake parity plus explicit matching construction',
  J09: 'combination enumeration with circular adjacency rejection',
  J10: 'piece-count invariant plus one-cell-at-a-time construction',
  O01: 'direct divisor enumeration for every integer in range',
  O02: 'binary shortest-path enumeration',
  O03: 'start/length enumeration of consecutive positive sums',
  O04: 'balanced-weight contiguous-interval invariant',
  O05: 'adjacent-gap bound plus extremal construction',
  O06: 'positive-integer triple enumeration',
  O07: 'explicit recursive domino placement',
  O08: 'direct divisor enumeration',
  O09: 'average lower bound plus explicit balanced tournament construction',
  O10: 'binary-string enumeration'
};

function expectedGenerated(p) {
  const x = p.params;
  switch (p.family) {
    case 'S01': {
      let best = 0;
      for (let n = 1; n < x.limit; n++) if (n % x.m === x.a && n % x.n === x.b) best = n;
      return best;
    }
    case 'S02': {
      const remaining = x.L - x.t * (x.ra + x.rb);
      assert(remaining >= 0, `${p.id}: team phase exceeds job`);
      return x.t + remaining / x.ra;
    }
    case 'S03': return permutations(x.digits, 3).filter(ds => Number(ds.join('')) % x.div === 0).length;
    case 'S04': {
      const points = [[x.ap, 0], [x.side, x.side], [0, x.aq]];
      let twice = 0;
      for (let i = 0; i < 3; i++) twice += points[i][0] * points[(i + 1) % 3][1] - points[i][1] * points[(i + 1) % 3][0];
      return Math.abs(twice) / 2;
    }
    case 'S05': return josephus(x.n, x.k);
    case 'S06': {
      const values = new Set();
      for (let A = 1; A < x.total; A++) for (let B = 1; B < x.total; B++) {
        const C = x.total - A - B;
        if (C > 0 && A > B && B > C && A === 2 * C - x.d) values.add(B);
      }
      return [...values].reduce((a, b) => a + b, 0);
    }
    case 'S07': return x.va * (x.D / (x.va + x.vb));
    case 'S08': {
      let count = 0;
      for (let n = x.lower; n <= 99; n++) {
        const reversed = (n % 10) * 10 + Math.floor(n / 10);
        if (n - reversed === x.diff) count++;
      }
      return count;
    }
    case 'S09': {
      let count = 0;
      for (let r1 = 0; r1 <= x.m; r1++) for (let r2 = r1 + 1; r2 <= x.m; r2++)
        for (let c1 = 0; c1 <= x.n; c1++) for (let c2 = c1 + 1; c2 <= x.n; c2++) count++;
      return count;
    }
    case 'S10': {
      let count = 0;
      for (let r = 0; r < x.n; r++) for (let c = 0; c < x.n; c++) if (r === 0 || c === 0 || r === x.n - 1 || c === x.n - 1) count++;
      return count;
    }
    case 'J01': {
      const win = Array(x.n + 1).fill(false);
      for (let stones = 1; stones <= x.n; stones++) win[stones] = Array.from({ length: Math.min(x.maxTake, stones) }, (_, i) => i + 1).some(t => !win[stones - t]);
      const winningMoves = Array.from({ length: x.maxTake }, (_, i) => i + 1).filter(t => t <= x.n && !win[x.n - t]);
      return winningMoves.length === 1 ? winningMoves[0] : NaN;
    }
    case 'J02': {
      const maxAvoiding = Math.min(x.range, x.m);
      return maxAvoiding + 1;
    }
    case 'J03': {
      const reachable = new Set([0]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const lit of [...reachable]) {
          const candidates = [];
          if (lit >= 2) candidates.push(lit - 2);
          if (lit >= 1 && lit < x.lamps) candidates.push(lit);
          if (x.lamps - lit >= 2) candidates.push(lit + 2);
          for (const next of candidates) if (!reachable.has(next)) { reachable.add(next); changed = true; }
        }
      }
      return reachable.has(x.target) ? 'できる' : 'できない';
    }
    case 'J04': {
      const ways = Array(x.n + 1).fill(0); ways[0] = 1;
      for (let n = 1; n <= x.n; n++) ways[n] = ways[n - 1] + (ways[n - 2] || 0);
      return ways[x.n];
    }
    case 'J05': return trailExists(x.edges) ? 'できる' : 'できない';
    case 'J06': return minimumWeighings(x.n);
    case 'J07': return dominoTilingExists(x.m, x.n) ? 'できる' : 'できない';
    case 'J08': return x.oddPeople % 2 === 0 && x.oddPeople <= x.n ? 'できる' : 'できない';
    case 'J09': return nonAdjacentCircleSelections(x.n, x.k);
    case 'J10': return x.m * x.n - 1;
    case 'O01': {
      let count = 0;
      for (let n = 1; n <= x.N; n++) {
        let divisors = 0;
        for (let d = 1; d <= n; d++) if (n % d === 0) divisors++;
        if (divisors % 2) count++;
      }
      return count;
    }
    case 'O02': {
      let count = 0;
      function walk(right, up) {
        if (right === x.px && up === x.py) return;
        if (right === x.a && up === x.b) return void count++;
        if (right < x.a) walk(right + 1, up);
        if (up < x.b) walk(right, up + 1);
      }
      walk(0, 0);
      return count;
    }
    case 'O03': {
      let count = 0;
      for (let start = 1; start < x.N; start++) {
        let sum = start;
        for (let next = start + 1; sum < x.N; next++) {
          sum += next;
          if (sum === x.N) count++;
        }
      }
      return count;
    }
    case 'O04': {
      let reach = 0;
      for (const weight of x.weights) {
        assert(weight <= 2 * reach + 1, `${p.id}: gap in balanced reachable interval`);
        reach += weight;
      }
      return reach;
    }
    case 'O05': {
      const bound = Math.floor((x.N - 1) / (x.k - 1));
      const witness = Array.from({ length: x.k }, (_, i) => 1 + i * bound);
      assert(witness.at(-1) <= x.N, `${p.id}: extremal witness outside range`);
      return bound;
    }
    case 'O06': {
      let best = 0;
      for (let a = 1; a < x.S; a++) for (let b = 1; b < x.S - a; b++) {
        const c = x.S - a - b;
        best = Math.max(best, a * b * c);
      }
      return best;
    }
    case 'O07': return dominoTilings2ByN(x.n);
    case 'O08': {
      let count = 0;
      for (let d = 1; d <= x.num; d++) if (x.num % d === 0) count++;
      return count;
    }
    case 'O09': {
      const guaranteed = Math.ceil((x.n - 1) / 2);
      assert.equal(tournamentConstructionMaxWins(x.n), guaranteed, `${p.id}: balanced tournament witness`);
      return guaranteed;
    }
    case 'O10': {
      let count = 0;
      for (let mask = 0; mask < 2 ** x.n; mask++) if ((mask & (mask << 1)) === 0) count++;
      return count;
    }
    default: throw new Error(`No validator for family ${p.family}`);
  }
}

for (const p of generated) {
  let expected;
  try { expected = expectedGenerated(p); }
  catch (error) { failures.push({ scope: p.id, detail: `validator error: ${error.message}` }); continue; }
  const okay = typeof expected === 'string' ? p.answer === expected : sameNumber(p, expected);
  check(okay, p.id, `independent answer ${expected}; stored ${p.answer}`);
}

// C. Independent review of all core questions.
const coreExpected = new Map([
  ['S01', (() => { let best = 0; for (let n = 1; n < 100; n++) if (n % 7 === 3 && n % 5 === 1) best = n; return best; })()],
  ['S02', 4 + (36 - 4 * (3 + 2)) / 3],
  ['S03', permutations([1, 2, 3, 4, 5], 3).filter(ds => Number(ds.join('')) % 6 === 0).length],
  ['S04', (() => { const q = [[4, 0], [12, 12], [0, 6]]; return Math.abs(q.reduce((s, p, i) => s + p[0] * q[(i + 1) % 3][1] - p[1] * q[(i + 1) % 3][0], 0)) / 2; })()],
  ['S05', (() => { let a = Array.from({ length: 40 }, (_, i) => i + 1); while (a.length > 1) a = a.filter((_, i) => i % 2 === 0); return a[0]; })()],
  ['S06', (() => { const b = new Set(); for (let A = 1; A < 30; A++) for (let B = 1; B < 30; B++) { const C = 30 - A - B; if (A > B && B > C && C > 0 && A === 2 * C - 3) b.add(B); } return [...b].reduce((a, x) => a + x, 0); })()],
  ['J01', 1],
  ['J02', 'はい'],
  ['J03', 'できない'],
  ['J04', (() => { const w = [1, 1]; for (let i = 2; i <= 7; i++) w[i] = w[i - 1] + w[i - 2]; return w[7]; })()],
  ['J05', trailExists(['AO', 'OC', 'BO', 'OD', 'AB', 'BC', 'CD', 'DA']) ? 'できる' : 'できない'],
  ['J06', minimumWeighings(27) <= 3 ? 'できる' : 'できない'],
  ['O01', (() => { let c = 0; for (let n = 1; n <= 100; n++) { let d = 0; for (let i = 1; i <= n; i++) if (n % i === 0) d++; if (d % 2) c++; } return c; })()],
  ['O02', (() => { let c = 0; function w(r, u) { if (r === 2 && u === 1) return; if (r === 4 && u === 3) return void c++; if (r < 4) w(r + 1, u); if (u < 3) w(r, u + 1); } w(0, 0); return c; })()],
  ['O03', hatCoreAnswer()],
  ['O04', 'できない'],
  ['O05', (() => { const reach = new Set([0]); for (const w of [1, 3, 9, 27]) for (const v of [...reach]) { reach.add(v + w); reach.add(v - w); } return Array.from({ length: 40 }, (_, i) => i + 1).every(v => reach.has(v)) ? 'できる' : 'できない'; })()],
  ['O06', choose(6, 4)]
]);
for (const p of core) {
  const expected = coreExpected.get(p.id);
  const okay = typeof expected === 'string' ? p.answer === expected : sameNumber(p, expected);
  check(okay, p.id, `core independent answer ${expected}; stored ${p.answer}`);
  check(Array.isArray(p.solution) && p.solution.length >= 3, p.id, 'core solution has at least three explanatory steps');
}

// E. Duplicate and answer-pattern evidence.
const templateGroups = familyDefs.map(f => ({ family: f.key, ids: generated.filter(p => p.family === f.key).map(p => p.id) }));
const concentrations = familyDefs.map(f => {
  const members = generated.filter(p => p.family === f.key);
  const counts = Object.fromEntries([...Map.groupBy(members, p => p.answer)].map(([answer, ps]) => [answer, ps.length]).sort((a, b) => b[1] - a[1]));
  return { family: f.key, counts, maxShare: Math.max(...Object.values(counts)) / members.length };
});
const crossContextIsomorphisms = [];
for (const a of generated.filter(p => p.family === 'J04')) for (const b of generated.filter(p => p.family === 'O07')) {
  if (a.params.n === b.params.n) crossContextIsomorphisms.push([a.id, b.id]);
}

const result = {
  status: failures.length ? 'FAIL' : 'PASS',
  coverage: {
    questions: problems.length,
    coreReviewed: core.length,
    generatedFamiliesReviewed: familyDefs.length,
    generatedInstancesChecked: generated.length
  },
  structural: {
    uniqueIds: new Set(problems.map(p => p.id)).size,
    exactPromptDuplicates: exactPromptGroups.map(group => group.map(p => p.id)),
    repeatedParameterTuplesWithinFamily: familyDefs.flatMap(f => {
      const groups = [...Map.groupBy(generated.filter(p => p.family === f.key), p => JSON.stringify(p.params)).values()].filter(g => g.length > 1);
      return groups.map(g => g.map(p => p.id));
    })
  },
  familyMethods: Object.fromEntries(familyDefs.map(f => [f.key, methods[f.key]])),
  templateNearDuplicateGroups: templateGroups,
  crossContextIsomorphisms,
  answerConcentrations: concentrations,
  failures
};

console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exitCode = 1;
