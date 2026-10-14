# Pressure-weighted moisture carrier: independent scheme review

2026-10-13. Review of a **new, uncoupled research prototype**. No frozen source,
package, prior report, binding, or third-batch integration was modified. This
review does not turn the remaining three-day water-budget failure into a pass.

## Decision

The proposed common mass/carrier equations are a useful source-free experiment.
They are **not yet a minimal coupled-model fix**. Replacing only the humidity
update, dividing the result by independently evolved native pressure, and retaining
native filtering/clipping cannot simultaneously establish tracer consistency,
positivity, and water conservation. The current source-free scope is appropriate;
it deliberately excludes evaporation/precipitation and does not write carrier
humidity into the running model.

The independent executable
`physics-moisture-carrier-counterexamples.jl` completed with **17 passes, 0 failures,
0 errors**. It invokes the actual pinned SpeedyWeather Leapfrog/RAW and clipping
kernels. These are controlled counterexamples, **not a decomposition of the
observed 0.06136 mm three-day peak**.

## Equations accepted for the source-free experiment

Let `M = ps` [Pa], `Q_k = M*q_k` [Pa], and `ds_k` be sigma-layer thickness,
with top sigma zero and bottom sigma one. The grid inventory is
`sum_i areaWeight_i * sum_k ds_k*Q_ik / gravity` [kg/m² = mm water].

For downward-positive vertical mass flux `G` [Pa/s]:

```
H_k       = -div(M*u_k)
Mdot      = sum_k ds_k*H_k
G_top     = 0
G_bottom(k) - G_top(k) = ds_k*(H_k - Mdot)
Qdot_k    = -div(Q_k*u_k)
            - (q_face_bottom*G_bottom - q_face_top*G_top)/ds_k
```

With exactly shared interface fluxes, the vertical contribution telescopes; the
bottom flux vanishes to summation roundoff. With the same horizontal operator,
time levels, and RAW coefficients, `Q=c*M` implies `Qdot=c*Mdot` and remains so.
Pressure-independent global correction factors are unnecessary for this result.
The prototype must report its actual bottom-flux roundoff rather than hide a
finite closure error by forcibly zeroing a boundary.

Using native spherical-harmonic divergence preserves its Gaussian-weighted
global zero mode. It does **not** supply a demonstrated neighboring finite-volume
face budget. The vertical part has shared local interfaces; the horizontal
spectral discretization is nonlocal. Global conservation, tracer consistency,
and shape preservation are different requirements; see the definitions in
[Bradley, Bosler and Guba (2022), section 1.1](https://gmd.copernicus.org/articles/15/6285/2022/gmd-15-6285-2022.html).

## Important findings before any coupled integration

### P1 — Native pressure is not the proposed carrier mass

Native `dynamics/tendencies.jl:397,420` advances `ln(ps)`, combining the current
horizontal pressure-gradient flux with vertically integrated **old spectral**
divergence (`:248`); semi-implicit correction then changes the pressure tendency.
The proposed `Mdot=sum ds*(-div(M*u_current))` is a different finite-time update.
The continuous product identity alone does not establish discrete equivalence.
Likewise the native advective q form (`q*D-div(u*q)` plus vertical material
advection) and this Q-flux form need not obey a discrete product rule after
spectral truncation. The source-free prototype preserves the intended passive
transport equation in its continuum interpretation, not the native per-grid
one-step q increment.

The independent constant-tracer example preserved `Q/M` to
`3.47e-18 kg/kg`. Dividing the same Q by a pressure field differing locally by
±1% changed that constant tracer by `1.71717e-4 kg/kg`. A globally correct water
inventory alone would not detect this local consistency failure. This ±1% is a
constructed sensitivity, not the measured native/prototype pressure discrepancy.

Native `horizontal_diffusion.jl:349` sets the **log-pressure tendency** zero mode
to zero. This does not algebraically conserve `sum(exp(logp))`. A pressure-compatible
transport alternative may be possible, but it must derive its fluxes from the
actual pressure update, including its time centering, rather than silently use a
second air mass. A local mass-flux correction would itself change the discrete
transport and needs separate validation.

### P1 — Common Q/RAW conservation does not imply nonnegative humidity

Actual native RAW (`steppers/leapfrog.jl:298`) is

```
tentative = old + span*tendency
delta     = old - 2*current + tentative
old'      = current + w1*delta
current'  = tentative - w2*delta
```

For the configured filters, `w1=.0265`, `w2=.0235`. A three-cell periodic centered
flux with uniform mass, nonnegative initial tracer `(0,1,0)`, and full-span
Courant number `.2` conserved the sum while producing `Qmin=-.09765`. Even before
considering a spatial method, nonnegative `old=1`, `current=0`, and
`tentative=0` give `current'=-.0235`. A limiter applied only to the unfiltered
tentative update therefore does not prove positivity of the final RAW state.
Both retained memory levels must be checked, not just the published current q.

Native `dynamics/hole_filling.jl:19` applies `max(q,0)` only on the transformed
grid (`time_stepping/transform.jl:155`). In the actual native clip test, uniform
`q=-1e-6` at `ps=100000 Pa` became zero and created `0.01019368 mm` at gravity
9.81. This controlled value scales with pressure, affected area, and layer
thickness. It is not a measured clip contribution to the three-day audit.
No global rescaling after this clip is acceptable as evidence that the local
transport was conservative. Positivity must be solved together with the final
filter/remapping update, or its failure must remain a failed gate.

### P1 — Exact atmospheric mass sources change the native humidity source equation

Native humidity is documented as specific humidity in
`parameterizations/large_scale_condensation.jl:66`. Native surface tendencies use
`g*flux/(ps*ds)` (`parameterizations/tendencies.jl:105`), i.e. an instantaneous
fixed-pressure conversion. If an external total-air mass source `s_M` is added,
the local source identity is

```
M*qdot = Qdot - q*Mdot
```

Thus assigning `Qdot=M_phys*S_q` and also increasing total air mass introduces
the dilution term `-q*s_M/M`. Adding `q*s_M` back to Qdot to preserve the original
native qdot instead adds water beyond the specified E−P flux. The distinction is
small in a dilute limit but is an equation choice, not an indexing fix.

A deliberately large, no-wind counterexample (`M=100000 Pa`, `q=.02`, pure-water
mass source `1 Pa/s`, 1800 s) gives native fixed-mass q `.038`, versus exact
water-and-total-mass q `.0373280943`; retaining `.038` with the larger mass adds
68.4 Pa of extra water. This is an explanatory test, not a realistic E rate.

With a layer external air-mass source `s_k`, continuity requires
`Mdot=sum ds*(H_k+s_k)` and
`G_bottom-G_top=ds*(H_k+s_k-Mdot)` — **plus** the layer source.
Internal moisture redistribution from convection or diffusion cannot be
indiscriminately labeled an external total-air source. A physically coupled
scheme needs a declared dry/total-air mass convention and separated source
interfaces. [ECMWF Technical Memorandum 849 (2019)](https://www.ecmwf.int/en/elibrary/81081-dry-mass-versus-total-mass-conservation-ifs)
likewise treats changes to dry versus total mass continuity as changes that also
affect tracer equations. The proposed source-free first stage avoids this
unresolved choice; it does not resolve it.

### P2 — History, diffusion, and spectral reconstruction remain part of the scheme

* `steppers/leapfrog.jl:55,60,65,70`: nonlinear dynamics reads current grid state;
  linear dynamics and horizontal diffusion read old spectral state; physics
  reads old grid state. `transform.jl:140` first retains the previously published
  grid. Since RAW modifies the retained spectrum and clip is nonlinear, the
  physics grid is not generally the transform of the filtered old spectrum.
  A restart must retain the carrier's two filter states and the actual physics
  history, not rebuild all of them from a single current `p*q`.
* Startup spans are 900, 1800, then 3600 seconds for the configured 30-minute
  clock; filters are disabled for the first two updates. The same native counter
  and coefficient semantics are required. One additional radius division is
  incorrect if a carrier tendency is already in Pa/s.
* `horizontal_diffusion.jl:354` diffuses native q. A zero-area-mean q tendency
  need not have zero pressure-weighted water tendency. An illustrative equal-area
  two-cell operator with `p=(100000,80000)` and `dq=(-1e-6,1e-6)` gives a nonzero
  weighted water tendency despite `sum(dq)=0`. This is an algebraic example, not
  a measurement of native hyperdiffusion. Omitting diffusion or diffusing Q
  instead changes the numerical dissipation and must be identified as such.
  A before/after measurement of the full native horizontal-diffusion stage also
  includes its pressure-tendency scalar-row/zero-mode truncation; it cannot be
  attributed to q hyperdiffusion alone without a further separated experiment.
* `q=Q/M` generally contains modes beyond native scalar truncation. A q
  grid→spectrum→grid projection followed by clipping need not preserve
  `sum(M*q)`, even if Q itself was conserved. Native scalar auxiliary rows must
  remain exactly zero; repopulating the unused row to reduce this projection
  error would reintroduce an already diagnosed invalid state.
* The existing startup flux ledger is a diagnostic of LF/RAW source quadrature.
  A carrier must pass an independent stock-versus-source comparison. Updating
  only that ledger or replacing stock diagnostics with the shadow inventory is
  not a physical correction. Surface reservoirs also use their own time-step
  convention, which must be retained in the coupled water ledger.

## Necessary scope

A source-free shadow helper can remain small. A coupled solution must cover at
least five interfaces: (1) pressure/air-mass continuity and its SI time centering;
(2) prognostic Q filter history, physics history, and restart serialization;
(3) compatible horizontal and vertical tracer fluxes; (4) physical water/air
sources at their true pressure and time level; (5) diffusion, positivity, and
conservative spectral/grid reconstruction. Native momentum and temperature
equations need not automatically be rewritten, but this is a transport and
time-integration change, not a post-transform humidity patch.

The proposed two grid time levels of M and Q alone require
`2*3168*(1+8)=57024 Float64` values, 456192 bytes (0.435 MiB), before scratch fluxes,
physics history, or spectral copies. Memory is modest; numerical compatibility
is the unresolved cost. No defensible line-count or runtime estimate is possible
until the compatible pressure and positivity algorithms are specified.

## Verification record

`build/earth-speedy-transport/physics-moisture-carrier-counterexamples.json`
binds its script and the actual native RAW and clipping source SHAs. The companion
log records 5+3+5+4 passing assertions and process exit code 0. A constructor
time-step adjustment informational message is present; no model time step was
run in that test. All reported physical units are explicit above.

The source-free native test by the implementation agent was independently read
against its code, output, log, and runner status:
`wet-carrier-projected-native-red.jl` applies the import-only scalar projection,
asserts auxiliary zeros before and after every step, sets `dynamics_only=true`,
and does not register either global mass or SST constraints. It executes native
steps; it does not replace the moisture update.

| End clock | LF update span | Air mass change kg/m² | Water change mm | Clip addition mm |
|---|---:|---:|---:|---:|
| 00:15 | 900 s | +0.3496144347 | +0.003560263276 | 0 |
| 00:30 | 1800 s | +1.0409774596 | +0.010417058096 | 0 |
| 01:00 | 3600 s | +2.1640752708 | +0.032323597159 | 0 |

The expected conservation requirements were **0 passes, 9 failures, 0 errors**,
process code 1, with runner `sourceUnchanged=true` and `inputsUnchanged=true`.
Minimum raw q remained positive. Hence this example's loss of inventory closure
cannot be attributed to clipping, physical E−P, or nonzero auxiliary scalar
initialization. It does not yet apportion the error among pressure evolution,
transport, RAW, and hyperdiffusion, and its unconstrained dynamics-only setup is
not identical to the coupled three-day budget audit.

This measured mass drift gives a direct compatibility obstruction for that
unconstrained pressure trajectory: if a uniform source-free tracer `q=c` stays
uniform and uses native pressure, its water stock is `W=c*M_total`. For `c=.012`,
the measured one-hour air-mass increase implies `+0.02596890325 mm` of water.
Unchanged native pressure, exact constant-tracer preservation, and closed water
conservation therefore cannot all hold on that trajectory. This proof does not
substitute the unconstrained test for the separately constrained coupled audit.

Third-batch formal integrations retain the raw archived initial state. The
separate projected-initial coupled audit also still fails: slab peak
`0.06139591904721804 mm`, seasonal `0.06138822975092592 mm`, with five steps above
0.05 mm in each. These are separate evidence cases, not a change to the formal
third-batch initial conditions.

The source-free helper `wet-carrier-prototype.jl` was read before its tests.
Its current H/G/Q signs, use of native current velocities, Pa/s scaling, and
native RAW startup counter match the reviewed equations. No model humidity or
pressure writeback, clipping, source injection, or global correction was found.
It reports bottom closure independently. Its two-equal-level constructor is a
cold-start shadow initializer, not a demonstrated mid-run restart importer.
The helper is now frozen at SHA-256
`7257bb812f89f266bd891bef3197008c9dd8ba74312be387ae865bc29808833f`.
`wet-carrier-test-v2.jl` completed **92 passes**, code 0, with source and inputs
unchanged. I read its assertions and the resulting
`wet-carrier-prototype-test.json`; the GREEN label applies to the source-free
mechanism tests, not to the three integration-readiness flags, which are all
**false**. The first native staged step matches the actual native time-step
routine bitwise in all five spectral prognostic fields; subsequent inventories
match the independently executed RED trajectory. Eighteen explicit flux-output
auxiliary-zero checks passed. The initial attempt's three strict-equality
failures arose from comparing separate and batched pressure reconstruction
paths at `1.8–3.6e-12 kg/m²`; the revised fixture uses the RED's same reconstruction
path and retains exact equality, without changing the helper or physical
conservation limits. That initial failed log remains preserved.

| Verified quantity after three updates | Value / interpretation |
|---|---|
| Real-field carrier water | `45.42158602492369 mm` at all three endpoints; genuinely transported locally |
| Constant q with the carrier's own M | maximum error `5.20417e-18 kg/kg` |
| Constant q divided by native pressure | maximum error `1.1787818e-4 kg/kg`; bridge fails |
| Largest carrier/native pressure difference | `827.2483 Pa` |
| Artificial sharp tracer minimum q | `-0.0029711599 kg/kg`; positivity fails |
| Artificial sharp tracer negative water stock | `0.4454421072 mm`; ordinary clipping would add that amount |
| Real-field q projection to valid native scalar spectrum | water change `-4.4727673e-6 mm`; local maximum q error `7.7249730e-5 kg/kg` |
| Vertical bottom closure / layer continuity error | at most `2.22e-16 / 1.72e-15 Pa/s` |

The sharp tracer is an intentional discontinuous test (`q=.02` in one
longitude hemisphere, zero in the other), not the archived actual humidity.
Actual humidity stayed positive over these three updates. No clipping was
performed on the carrier. The valid-scalar projection water loss is much smaller
than the three-day 0.061 mm failure; it fails an exact-conservation interface
requirement but cannot by itself explain that peak. The output name
`maxQAuxiliary` refers to the spectrum of **q=Q/M**, in kg/kg, not Q in Pa.

I also read `wet-carrier-fields-verify.jl` and its separate explicit-summation
result, which binds the saved JLD2 by SHA. Both retained RAW levels preserve
their initial global M/Q inventories to summation roundoff. Both real-field
levels remain positive in this short case. The sharp tracer is negative in
**both** memories: old minimum q `-0.0016184768 kg/kg`, old negative water
`0.2314814672 mm`, versus the current values in the table. Thus the positivity
failure is not an artifact of inspecting only one time level. This separate
verification also recovers the same native-pressure bridge error directly from
the saved arrays, without using the prototype stock function.

The native stage probes provide an additional useful lead, not a cumulative
budget attribution. In the third update, candidate water inventory changes from
`45.4048285979 mm` after explicit dynamics to `45.4538157385 mm` after SI
(`+0.0489871406 mm`), then `45.4539096221 mm` after the full HD/truncation stage
(`+0.0000938836 mm`). SI does not update q, so its direct inventory change here
comes from pressure. These are three candidate endpoints constructed from the
same retained states; summing this stage increment over successive LF updates
would not be a valid accumulated water-budget decomposition. They prioritize
pressure/tracer time-level compatibility for further diagnosis and do not prove
that the three-day coupled peak has been fully attributed.

These results reject direct coupled insertion of this prototype. No three-day
shadow or long coupled carrier run is needed to discover the already-failed
pressure/positivity/remapping interfaces, and none has been accepted by this
review. A future new version should first demonstrate compatible pressure
transport and both-memory positivity on these short fixtures before a coupled
three-day test. The existing third-batch model remains untouched.
