# Conservative Pressure–Water Implementation Plan

> **For agentic workers:** Use test-first implementation with independent review. Preserve all frozen evidence. Independent grid implementation and mathematical review run separately from the core implementation.

**Goal:** Build and validate one conservative pressure/mass/water subsystem with genuine acoustic feedback and positive tracer transport.

**Architecture:** Shared finite-volume face mass flux drives pressure and layered tracer mass. An implicit barotropic pressure solve and persistent face momentum establish the pressure update; water uses its exact accepted flux. Grid state is authoritative, with an explicit restart.

**Tech Stack:** Julia 1.12.7, Base/SparseArrays/LinearAlgebra/Test, existing JSON3 and JLD2; pinned native SpeedyWeather only for input and diagnostic projection.

**Spec:** `docs/evidence/earth-conservative-transport-20261013/design.md`

## Global constraints

New files only in the new evidence/build directories and this plan. Previous 669 bindings and older manifests remain unchanged. No default promotion, commit, push, global correction, clipping or long climate run before subsystem gates. The user has authorized continued pressure–mass repair; carry that scope through test-first implementation without further routine permission requests.

## Review focus

- Zero concentration and sharp jumps must remain nonnegative with no hidden clipping.
- Large acoustic Courant must still propagate a damped wave, not merely smooth p.
- Nonuniform reference pressure must preserve the intended rest state and global mass.
- Sigma layer redistribution must share every vertical interface and report bottom closure.
- Restart must retain edge momentum and authoritative water without spectral loss.

### 1. Exact native-area finite-volume mesh

Create `conservative-grid.jl`, `test-conservative-grid.jl`, `grid-report.md` in the new evidence folder.
- [ ] RED: hand-computed cell areas, seam/ring overlaps, missing and malformed grids.
- [ ] GREEN: `ConservativeGrid.build_gaussian_mesh(latDegrees,lonDegrees,weights)` with area/from/to/edgeLength/centerDistance/edgeKind and original cell ordering.
- [ ] Verify real 3168-point grid, connectivity, edge pairing and rigid zonal circulation.

### 2. Shared pressure and tracer kernel

Create `conservative-core.jl` and `test-conservative-core.jl`.
- [ ] Tests first: two-cell acoustic update p=[1.5,0.5], dt=c=1, A=1, one face => pnew=[7/6,5/6], jnew=1/3; persistent-j second update; constant q; sharp q; nonuniform reference rest; rejected predictor leaves state unchanged.
- [ ] Implement `pressure_step(area,from,to,conductance,p,pref,flux,dt,c2)` returning p, persistent accepted flux and residual, with no state mutation on failure.
- [ ] Implement `transport_tracer(oldmass,newmass,from,to,F,Q)` returning new authoritative Q and solve residual. Require local air continuity before the water solve.
- [ ] Implement sigma face construction and state stepping with exact accepted momentum/flux coupling; test local/global continuity and bounds on both arrays.

### 3. Accuracy and native-grid integration

Create `benchmark-core.jl`, `native-core-probe.jl` and own restart helpers.
- [ ] Wave phase/amplitude and temporal refinement; rotation error under grid/time refinement.
- [ ] Native geometry/2001 state import with explicit projection inventory; real, constant and sharp moisture cases. Nominal 1800 s source-free integration to three days with subdivisions recorded.
- [ ] Repeat relevant shorter-step checks and own checkpoint/restart equivalence. Spectral diagnostics must not change authoritative inventories.

### 4. Evidence and final review

- [ ] New launcher archives exact executed sources and input hashes without writing old folders.
- [ ] Capture RED/GREEN logs, numeric JSON, plots, limitations and precise remaining coupling gates.
- [ ] Fresh independent review and checks appropriate to changes; verify old frozen package recursively without rewriting it.
- [ ] Seal new manifest and separate implementation/integrity acceptance from full climate acceptance.
