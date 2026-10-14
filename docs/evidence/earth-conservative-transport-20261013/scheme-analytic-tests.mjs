// Independent small-matrix algebra tests. Does not import/run the model or core.
import { strict as assert } from 'node:assert';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';

const checks = [];
function check(name, value, limit) {
  assert.ok(Number.isFinite(value) && value <= limit, `${name}: ${value} > ${limit}`);
  checks.push({ name, value, limit });
}
const sum = a => a.reduce((s, x) => s + x, 0);
const dot = (a, b) => sum(a.map((x, i) => x * b[i]));
const maxabs = a => Math.max(...a.map(Math.abs));
const zeros = n => Array(n).fill(0);
const matvec = (M, x) => M.map(row => dot(row, x));
function solve(M, rhs) {
  const a = M.map((row, i) => [...row, rhs[i]]), n = rhs.length;
  for (let k = 0; k < n; ++k) {
    let pivot = k;
    for (let i = k + 1; i < n; ++i) if (Math.abs(a[i][k]) > Math.abs(a[pivot][k])) pivot = i;
    [a[pivot], a[k]] = [a[k], a[pivot]];
    assert.ok(Math.abs(a[k][k]) > 1e-20);
    for (let i = k + 1; i < n; ++i) {
      const ratio = a[i][k] / a[k][k];
      for (let j = k; j <= n; ++j) a[i][j] -= ratio * a[k][j];
    }
  }
  const x = zeros(n);
  for (let i = n - 1; i >= 0; --i) {
    x[i] = (a[i][n] - sum(a[i].slice(i + 1, n).map((v, j) => v * x[i + 1 + j]))) / a[i][i];
  }
  return x;
}
function divergence(n, edges, flux) {
  const d = zeros(n);
  edges.forEach(([i, j], e) => { d[i] += flux[e]; d[j] -= flux[e]; });
  return d;
}
function acoustic(A, pref, edges, L, d, prefFace, radius, c, p, j, dt) {
  const M = A.map((x, i) => x * pref[i]);
  const S = L.map(x => x / radius);
  const G = d.map((x, e) => prefFace[e] / (radius * x));
  const H = M.map((x, i) => M.map((_, k) => i === k ? x : 0));
  edges.forEach(([i, k], e) => {
    const v = dt * dt * c * c * S[e] * G[e];
    H[i][i] += v; H[k][k] += v; H[i][k] -= v; H[k][i] -= v;
  });
  const oldDiv = divergence(p.length, edges, j.map((x, e) => S[e] * x));
  const rhs = A.map((x, i) => x * p[i] - dt * oldDiv[i]);
  const r = solve(H, rhs);
  const pn = r.map((x, i) => pref[i] * x);
  const jn = j.map((x, e) => x + dt * c * c * G[e] * (r[edges[e][0]] - r[edges[e][1]]));
  const F = jn.map((x, e) => dt * S[e] * x);
  return { p: pn, j: jn, F, rhs, H, r, M };
}

const A = [0.7, 1.1, 1.3, 0.9], pref = [1.2, 0.8, 1.5, 0.9];
const edges = [[0, 1], [1, 2], [2, 3], [3, 0], [0, 2]];
const L = [0.8, 1.1, 0.9, 1.2, 0.6], d = [0.6, 0.9, 1.2, 0.7, 1.4];
const pf = edges.map(([i, j]) => Math.sqrt(pref[i] * pref[j]));
const radius = 2.3, c = 1.7, dt = 0.31;
const oldp = pref.map((x, i) => x * [1.03, 0.98, 1.01, 0.97][i]);
const oldj = [0.013, -0.008, 0.01, -0.006, 0.004];
const a = acoustic(A, pref, edges, L, d, pf, radius, c, oldp, oldj, dt);
const div = divergence(A.length, edges, a.F);
check('acoustic local continuity', maxabs(oldp.map((x, i) => A[i] * (a.p[i] - x) + div[i])), 3e-15);
check('acoustic global pressure mass', Math.abs(dot(A, a.p) - dot(A, oldp)), 3e-15);
check('elliptic equation residual', maxabs(matvec(a.H, a.r).map((x, i) => x - a.rhs[i])), 3e-15);
const rest = acoustic(A, pref, edges, L, d, pf, radius, c, pref.map(x => 1.17 * x), zeros(edges.length), dt);
check('variable reference exact rest', maxabs(rest.p.map((x, i) => x - 1.17 * pref[i])), 3e-15);
check('variable reference zero momentum', maxabs(rest.j), 3e-15);
const meanr = dot(A, oldp) / dot(A, pref);
const energy = (p, j) => 0.5 * c * c * sum(p.map((x, i) => A[i] * pref[i] * (x / pref[i] - meanr) ** 2))
  + 0.5 * sum(j.map((x, e) => L[e] * d[e] / pf[e] * x * x));
const loss = 0.5 * c * c * sum(a.p.map((x, i) => A[i] / pref[i] * (x - oldp[i]) ** 2))
  + 0.5 * sum(a.j.map((x, e) => L[e] * d[e] / pf[e] * (x - oldj[e]) ** 2));
check('backward Euler energy identity', Math.abs(energy(a.p, a.j) - energy(oldp, oldj) + loss), 3e-15);

function tracer(mold, mnew, edges, F, qold) {
  const T = mnew.map((x, i) => mnew.map((_, j) => i === j ? x : 0));
  edges.forEach(([i, j], e) => {
    if (F[e] >= 0) { T[i][i] += F[e]; T[j][i] -= F[e]; }
    else { T[j][j] -= F[e]; T[i][j] += F[e]; }
  });
  const rhs = mold.map((x, i) => x * qold[i]);
  return { T, q: solve(T, rhs), rhs };
}
const mold = oldp.map((x, i) => A[i] * x), mnew = a.p.map((x, i) => A[i] * x);
// Large divergence-free circulation makes face CFL > 100 while both masses stay positive.
const F = a.F.map((x, e) => x + (e < 4 ? 100 : 0));
const sharp = tracer(mold, mnew, edges, F, [0, 0.02, 0, 0.007]);
check('tracer row sum equals old mass', maxabs(sharp.T.map((row, i) => sum(row) - mold[i])), 5e-14);
check('sharp tracer nonnegative', Math.max(0, -Math.min(...sharp.q)), 0);
check('sharp tracer upper bound', Math.max(0, Math.max(...sharp.q) - 0.02), 0);
check('sharp tracer water conservation', Math.abs(dot(mnew, sharp.q) - dot(mold, [0, 0.02, 0, 0.007])), 1e-14);
const constant = tracer(mold, mnew, edges, F, mold.map(() => 0.012));
check('constant tracer consistency', maxabs(constant.q.map(x => x - 0.012)), 2e-15);

// Positive old p plus SPD pressure matrix does NOT suffice for pressure positivity.
const negative = acoustic([1, 1], [1, 1], [[0, 1]], [1], [1], [1], 1, 1, [1, 1], [20], 0.1);
assert.ok(negative.rhs[0] < 0 && negative.p[0] < 0);
checks.push({ name: 'negative predictor counterexample is actually negative', passed: true });
const safe = acoustic([1, 1], [1, 1], [[0, 1]], [1], [1], [1], 1, 1, [1, 1], [20], 0.025);
assert.ok(Math.min(...safe.rhs) > 0 && Math.min(...safe.p) > 0);
checks.push({ name: 'smaller accepted step has positive predictor and pressure', passed: true });

const waveTable = [32, 64, 128, 256, 512].map(n => {
  const x = 2 * Math.PI / n;
  let pressure = 1, velocity = 0;
  for (let k = 0; k < n; ++k) {
    const pnext = (pressure - x * velocity) / (1 + x * x);
    velocity += x * pnext; pressure = pnext;
  }
  const amplitude = Math.hypot(pressure, velocity);
  const expected = (1 + x * x) ** (-n / 2);
  check(`BE wave amplification n=${n}`, Math.abs(amplitude - expected), 3e-14);
  return { stepsPerPeriod: n, amplitude, phaseLagRadians: 2 * Math.PI - n * Math.atan(x) };
});

const output = {
  scope: 'independent small-matrix algebra and analytic counterexamples only; no native/model/core implementation run',
  sourceSha256: createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex'),
  checks, passed: true, count: checks.length,
  referenceEnergy: { old: energy(oldp, oldj), new: energy(a.p, a.j), decrement: loss },
  sharpTracer: { q: sharp.q, min: Math.min(...sharp.q), max: Math.max(...sharp.q) },
  negativePressureCounterexample: { p: negative.p, rhs: negative.rhs, smallerStepPressure: safe.p },
  waveTable,
};
const out = resolve('build/earth-conservative-transport/scheme-analytic-tests.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(output, null, 2) + '\n');
process.stdout.write(`${checks.length} independent algebra checks passed; ${out}\n`);
