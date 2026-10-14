# Independent core implementation review — candidate-c1

Reviewed 2026-10-13. This is the independent implementation review requested by the implementation plan, performed under the `requesting-code-review` reviewer contract. No implementation files, native package sources, or frozen `earth-speedy-*` evidence were edited by this reviewer. Only new review scripts, logs, JSON, checkpoints, and this report were created in the two permitted new directories.

## Assessment

**Ready to complete the candidate-c1 source-free acceptance runs, with no open Critical or Important implementation finding in the reviewed code.** Two Important findings were reproduced and repaired before this verdict: an admissible wet endpoint could make the following step fail, and the launcher's input provenance omitted the terrain asset that determines the pressure reference. The native smoke's `Geometry` import ambiguity was also repaired, with its failed run retained.

This assessment does not certify the still-running three-day runs, general spherical spatial accuracy, native primitive-equation coupling, or climate acceptance. Those are separate evidence gates. In particular, inspect the native local water/dry residuals as well as global inventories when the acceptance runs complete; the native script records the local residuals but its explicit end-of-case assertions predominantly gate global inventories, bounds, and restart.

## Reviewed snapshot

| File | SHA-256 |
| --- | --- |
| `conservative-core.jl` | `3fb46467306d9deae796f771e3e87c60304380d870c8b449009981200069869d` |
| `test-conservative-core.jl` | `77ead6f2683ef4b0d2c03f7f371287bdb22191531fa0ffad0af0596d54c93b3b` |
| `benchmark-core.jl` | `7950f2f475b5be29f0bfd04d68b880a53e3e69eaaf61f5f4ebc65f3bebd120e3` |
| `native-core-probe.jl` | `b583fdaf16545196cf4e369cc58ee2373cd06cc2015203df89b0ec4fe860701f` |
| `run-core-julia.mjs` | `af9349a886467867ad0f303bb1c70b1b27e774cc8e37929ee0f571a0fbf81572` |
| `protocol.md` | `69af1511812eaad6bb3cb28564e73e9b41387fd0e840f854decf0d7bb685017a` |
| `design.md` | `32fac32e8c9ccc31b0f82f7fbaa6c06981aae96907b7a3eb89a74ebecca4bbbf` |

Requirements read: `protocol.md`, `design.md`, and `../../superpowers/plans/2026-10-13-conservative-pressure-water.md`. The working files are uncommitted evidence files, so the review is pinned by content hashes rather than an invented Git revision range.

## Strengths and algebra checked

- For an edge oriented from i to j, positive j is outgoing at i. The pressure force uses the negative physical pressure gradient, the pressure continuity update subtracts outgoing flux, and persistent j survives between steps. An independently assembled dense block system for `[p_new; jbar_new]` agrees with the implementation at two radii. This checks the sign, elimination, and radius scaling without using the implementation's B, gradient, or stiffness matrices as an oracle.
- Units close: A is steradians, L and d are angular, j is Pa m/s, the integrated transfer is `dt*(L/R)*ds*j` in the same pressure-area units as layer mass, and division by `4*pi*g` gives the documented global mean inventories. The graph quadrature/adjoint extension preserves these factors.
- The horizontal-to-vertical sigma recurrence has the correct direction. A manufactured two-column/two-layer circulation was solved from an independent four-by-four matrix: pressure stays fixed, one shared transfer circulates through both horizontal edges and both internal vertical interfaces, and top/bottom closure and water conservation hold to roundoff.
- A step commits p, W, j, and time only after all candidate checks. Both an early pressure rejection in the implementation suite and a late invalid-water rejection in the independent suite leave all authoritative state unchanged. Updating a reusable factorization cache is not an authoritative state mutation.
- The custom-gradient constructor requires a shared-pair decomposition and verifies its weighted adjoint. This is the necessary check for the implemented energy identity. The non-M-matrix three-node fixture rejects a negative solved pressure even when the predictor is positive.
- The dual water/dry solve uses the same upwind matrix for both right-hand sides. Because the matrix applied to one equals old mass up to the measured local continuity residual, the two fractions are complementary up to solve/continuity roundoff. Selecting the smaller constituent per cell is an algebraically equivalent numerical representation, not clipping or global normalization. Final water and its own donor fluxes determine the reported local water and dry residuals.
- Restart includes all authoritative acoustic and tracer state and binds geometry, reference pressure, sigma thicknesses, sound speed, gradient, transfer decomposition, and method. A restart using a newly constructed core with an empty factorization cache remained bitwise identical over seven further intervals.
- The periodic-wave fixture uses an independent discrete modal frequency and complex backward-Euler amplification. The rotation fixture specifies an exact divergence-free zonal mass flux. These are appropriate limited subsystem tests and are not described as native spherical-pressure validation.

## Reproduced and resolved findings

### Important: accepted q=1 could invalidate the next step

Location in the earlier `2f02dcd8...` core: `transport_tracer`, then lines 89 and 107–108. The old input gate required `W<=mass` exactly, while the computed humidity could exceed its old maximum within a tolerance. With admissible q=1, the first accepted step produced qmax `1.0000000000000002` and minimum dry mass `-2.220446049250313e-16`. The following step threw `ArgumentError: invalid transport inputs or negative dry mass` rather than advancing. A mixed endpoint case with only the first sigma layer wet also reproduced the issue, with minimum dry mass `-1.3877787807814457e-17`; therefore choosing wet or dry solely from the whole-domain average would not fix it.

Evidence retained:

- `review-core-probes-v2.jl` and `../../../build/earth-conservative-transport/review-core-probes-v2.json`.
- `review-mixed-bound-probe.jl` and `../../../build/earth-conservative-transport/review-mixed-bound-v1.json`, including the complete reproducible fixture.

**Resolution verified:** candidate-c1 `conservative-core.jl:109–138` solves both complementary inventories, selects the smaller constituent per cell, enforces exact wet/dry endpoint validity and both old-range bounds, and calculates residuals from final authoritative water. The independent final regression passes 400 fixed-random fixtures across all-wet, all-dry, mixed 0/1, and interior 0.2–0.8 cases, each advanced for three successive steps.

### Important: terrain input was absent from per-run provenance

Earlier launcher location: `run-core-julia.mjs:25`. It hashed SST but not `orography.nc`, although `native-core-probe.jl` computes pref from the initialized terrain. SpeedyWeather's `EarthOrography` loads the asset from disk; a changed terrain input would have changed the operator without appearing in `inputBefore`/`inputAfter`.

**Resolution verified:** candidate-c1 launcher recursively hashes all six local NetCDF artifacts, including `artifacts/70cd1588d89b925ea206267e4fffa045e72bebc0/orography.nc`. The final independent run also records all 105 native source bindings. Earlier smoke records remain earlier, partially covered evidence; no retrospective claim of complete coverage is warranted.

### Important native startup error, already repaired

`native-graph-smoke-v1.log` records `UndefVarError: Geometry not defined in Main` from conflicting exports. `native-core-probe.jl:32` now uses `ConservativeCore.Geometry`. The original failed log/status remain available. This first run never entered native core stepping and cannot support a numerical acceptance claim.

### Other fixes checked

Negative and NaN `advance!` intervals previously returned an empty successful result. Candidate-c1 rejects nonpositive/nonfinite intervals and intervals that cannot advance representable time. The design now correctly limits its pressure M-matrix/positive-predictor proof to TPFA and separately describes variational solved-pressure rejection. The checkpoint fixture now uses its run name rather than repeatedly replacing one generic test checkpoint.

## Independent validation

The final archived independent run is:

```text
node docs/evidence/earth-conservative-transport-20261013/run-core-julia.mjs \
  docs/evidence/earth-conservative-transport-20261013/review-candidate-c1.jl \
  review-candidate-c1
```

Runtime: the provided Julia 1.12.7 binary and pinned project; Julia threads 2 and BLAS threads 1. `review-candidate-c1-status.json` reports exit code 0, `sourceUnchanged=true`, and `inputUnchanged=true`. All six archived source files independently matched their content-addressed archive hashes. The status contains six NetCDF inputs and 105 native SpeedyWeather source bindings.

| Independent check | Result |
| --- | --- |
| Manufactured two-column sigma circulation | 8/8 |
| Late rejection leaves authoritative state unchanged | 2/2 |
| Wet/dry endpoint, old range, local/global budget regression | 6600/6600 |
| Invalid/nonadvancing intervals | 6/6 |
| Independent dense pressure/momentum system and radius scaling | 6/6 |
| Restart with fresh factorization cache | 2/2 |

There are 6,624 grouped behavioral assertions, plus source-stability assertions. Largest observed values in the endpoint regression:

| Metric | Value |
| --- | ---: |
| Local water residual divided by local mass scale | `7.14562486583188e-16` |
| Local dry residual divided by local mass scale | `6.710150493415851e-16` |
| Three-step global water drift, toy mass units | `4.440892098500626e-15` |
| Fraction complementarity residual | `8.881784197001252e-16` |

The implementation's separately recorded `candidate-c1-core` run has 185 passing assertions and unchanged source/input hashes. Its earlier benchmark run is useful existing evidence, but it must not substitute for whatever fresh benchmark and native acceptance records the final candidate requires.

Review development failures are retained honestly: `review-core-probes-v1.log` failed due to an invalid numeric literal in the review script after its first eight checks passed; `review-sigma-probe-v1.log` used an over-tight `1e-16` global sum threshold and observed `2.22e-16`. The corrected v2 script uses `1e-15`, consistent with floating-point summation, and passes. Neither failure was a production-kernel defect.

## Remaining Minor issues

1. **Run-name reservation does not cover in-flight or interrupted runs.** `run-core-julia.mjs:10–11` checks only a completed status file; the file is written after the child exits. Concurrent launches with the same name, or a restart after interruption before status creation, can overwrite that name's output files. Current candidate runs use distinct names, so this does not invalidate them. Before treating the launcher as a reusable evidence service, atomically reserve each run name before spawn and retain an interrupted/failed status.
2. **Native case/duration arguments can produce misleading labels or empty runs.** `native-core-probe.jl:19,55–61` does not validate positive days/dt or restrict case names. An unknown case falls through to the sharp fixture while retaining the unknown label; zero duration can skip all steps and retain `restartBitwiseEqual=true`. Current reviewed candidate invocations use valid explicit configurations. Validate positive finite duration/step, an allowed case set, and at least one actual restart comparison before reporting that check as executed.

These are static wrapper-hardening findings, not failures observed in the valid candidate-c1 numerical invocation. No implementation edits were made by the reviewer to address them.

## Declined to judge

- Spherical consistency, pole errors, reconstruction-gradient choice, and weak-mode convergence: assigned to the separate mathematical/spatial review; this review checks the core adjoint contract and use of shared transfers, not the adapter's full spatial accuracy.
- Three-day native acceptance and 1800/900/450-second comparisons: their final results were not available at this review's completion; the parent must assess the completed evidence.
- Native nonlinear momentum, Coriolis, baroclinic temperature/semi-implicit dynamics, physical sources, and climate skill: explicitly outside this source-free subsystem's plan.
- Product TypeScript, renderer behavior, and their broad test suites: not part of these evidence-only changes; pre-existing workspace changes were left untouched.
- Long-term checkpoint compatibility across future algorithm/schema revisions and hostile/corrupt checkpoint handling: this stage promises exact own-state restart with the reviewed operator, not a public migration or untrusted-serialization format.

## Recommendations

Keep the final candidate frozen while runs are active. Evaluate native local water and dry relative residuals, pressure/bottom closure, global inventories, bounds, actual restart work, and accepted/rejected step counts together. Preserve the original TPFA and failed smoke records and state their limits explicitly. Passing those source-free checks still leaves the documented spatial and coupled-model gates open.
