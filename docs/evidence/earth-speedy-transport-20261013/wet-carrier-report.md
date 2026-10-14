# Native pressure-weighted water carrier: source-free feasibility boundary

2026-10-13. Research-only files; all earlier evidence, installed package, frozen
V3 inputs and third-batch integration drivers remain unchanged. This is not a
coupled water-conservation fix and does not turn the three-day 0.05 mm gate green.

## Question and experiment scope

The earlier discrete startup ledger separates LF/RAW source quadrature from the
remaining inventory error. The time-step experiment reduced the three-day peak
from 0.0631824 mm at 30 minutes to 0.0421049 mm at 7.5 minutes, but its terminal
residual did not approach zero. Those results motivate a pressure-weighted
prognostic carrier rather than another budget convention or compensating water
source. See the separately frozen `startup-report.md`,
`timestep-convergence-report.md`, and `implicit-flux-prototype.jl` (37 tests).

The new experiment uses the frozen 2001 initial state, T32 / 8 nonuniform sigma
layers / Float64, the corrected V3 thermal operator, and native 30-minute
Leapfrog. Only three native updates are needed to expose the coupling boundary:
the 900-second and 1800-second startup spans, then the first 3600-second full
span. Their clock endpoints are 00:15, 00:30, and 01:00. The model is set to
`dynamics_only=true`, with neither mass nor prescribed-SST contexts registered.
There is no evaporation, precipitation, surface-reservoir update, global mass
constraint, or humidity budget adjustment in this experiment.

Two initial states are kept separate. `wet-carrier-native-red.jl` retains the
raw archived auxiliary scalar rows. The separate
`wet-carrier-projected-native-red.jl` applies the verified import-only
`scalar-initial-projection.jl` helper, including verified humidity history and
proven stationary temperature/pressure/vorticity/divergence histories. It
asserts exact scalar auxiliary zeros before and after each native update.
Its initial import changes air inventory by +0.0000552117 kg/m² and water by
−0.00000175780 mm; this is an explicitly recorded initial-state change, excluded
from all subsequent residuals. Neither state is substituted into formal V3 runs.

## Real native RED

Each native script requires both air and water inventory closure in this closed,
source-free setup. Both return **0 passes, 9 failures, 0 errors**, exit code 1,
with unchanged sources and inputs. The failed requirements are retained.

| End clock | Air drift, raw kg/m² | Air drift, projected kg/m² | Water drift, raw mm | Water drift, projected mm |
|---|---:|---:|---:|---:|
| 00:15 | +0.3495876967 | +0.3496144347 | +0.003560310528 | +0.003560263276 |
| 00:30 | +1.0408662521 | +1.0409774596 | +0.010416218956 | +0.010417058096 |
| 01:00 | +2.1637955641 | +2.1640752708 | +0.032321069489 | +0.032323597159 |

Raw spectral humidity stays positive and the native clip adds exactly zero in
both tests. Thus neither the import-only auxiliary projection nor humidity
clipping explains this source-free example's inventory drift. This does not
attribute the entire coupled three-day error to one term. In the separate
coupled V3 audits the original-aux peaks are 0.061368830255 / 0.061360944009 mm;
the derived projected-initial peaks are 0.061395919047 / 0.061388229751 mm. Each
mode in each audit still has five steps over 0.05 mm. Physical column closure
near 5e−20 is a different, successful test, not closure of the numerical update.

## Prototype equations and API

`wet-carrier-prototype.jl` defines `NativeWetCarrier`. Its state is an
authoritative surface air pressure mass `M = ps` [Pa] on 3168 grid points and
layer water carrier `Q = M*q` [Pa] on 3168 × 8 points. Both retain independent
`old` and `current` RAW memories. The water inventory [kg/m² = mm] is
`sum_i w_i * sum_k ds_k*Q_ik / g`, with normalized native Gaussian weights.

For downward-positive interface air mass flux G [Pa/s]:

```
H_k       = -div(M*u_k)
Mdot      = sum_k ds_k*H_k
G_top     = 0
G_(k+1/2) = G_(k-1/2) + ds_k*(H_k - Mdot)
Qdot_k    = -div(Q_k*u_k)
            - (qface_(k+1/2)*G_(k+1/2) - qface_(k-1/2)*G_(k-1/2))/ds_k
qface     = arithmetic mean of adjacent current Q/M
```

The lower boundary is zero; the recurrence's independently computed bottom
closure and every layer continuity residual are tested against roundoff. The
native spectral flux-divergence operator supplies H and horizontal Q transport,
using current native velocities and dividing its radius-scaled output once by
the model radius. This is globally conservative Gaussian spectral divergence,
not a proof of neighboring horizontal finite-volume face budgets. Only the
vertical interfaces are explicitly shared local faces.

`advance_carrier!` calls the actual native Leapfrog/RAW kernel separately for M
and Q. It uses the native clock counter, spans, and filter coefficients, including
zero filters at the first two updates. For later updates:

```
tentative = old + span*tendency
delta     = old - 2*current + tentative
old'      = current + 0.0265*delta
current'  = tentative - 0.0235*delta
```

With Q=c*M at both memories, the shared fluxes give Qdot=c*Mdot, so constant
specific humidity and the two global inventories are preserved algebraically.
No zero-mode replacement, residual injection, clipping, or model writeback is
present. The two-argument `CarrierState(M,Q)` copies equal initial memories and
is only a cold-start initializer; it is not a valid importer for a 2006 restart.
The four-field constructor can store distinct histories, but their faithful
restart import has not been implemented here.

`carrier_tendency`, `advance_carrier!`, `carrier_stock`, and copy-only
`projection_diagnostics` are the research API. They do not replace any native
method. There is deliberately no physical-source input. The prototype excludes
carrier hyperdiffusion; this is a different numerical operator, not an unchanged
native q transport implementation.

## Numerical results and rejected coupling gates

`wet-carrier-test-v2.jl` completes **92/92 grouped assertions**, plus its initial
state-hash assertion. All 18 native M/Q horizontal-flux auxiliary checks are
exactly zero. The maximum real-carrier layer continuity error is 1.72e−15 Pa/s;
bottom closure is at most 2.22e−16 Pa/s. Real humidity, uniform q=0.012, and a
controlled longitude-step tracer are each transported rather than frozen.
Every current inventory remains at its own initial value to roundoff. The
real-water BLAS inventory is exactly 45.42158602492369 mm at all three outputs.
`wet-carrier-fields-verify.jl` independently sums all saved cells and both RAW
memories: **34/34 assertions**, with air and water closure within roundoff.

The acceptance script `wet-carrier-interface-red.mjs` returns **0 passes and
9 failures**. These are failures of the proposed native coupling, retained as
RED evidence, separate from the shared-carrier mechanism's GREEN tests.

| End clock | Own-M constant-q error kg/kg | Native-ps bridge error kg/kg | Max M−native ps magnitude Pa | Sharp min q kg/kg | Sharp negative-water magnitude mm |
|---|---:|---:|---:|---:|---:|
| 00:15 | 3.47e−18 | 1.06337e−4 | 699.707 | −0.000869020 | 0.118960 |
| 00:30 | 3.47e−18 | 7.99401e−5 | 429.798 | −0.00162610 | 0.232054 |
| 01:00 | 5.20e−18 | 1.17878e−4 | 827.248 | −0.00297116 | 0.445442 |

The sharp tracer starts at q=0.02 for longitude below 180° and zero elsewhere;
it uses real native winds but is not the real initial humidity distribution.
Its minimum lies at grid point 2728, layer 3, latitude −46.38856°, longitude
354.375°. Negative water means the magnitude of the negative portion of Q,
not a net water loss: its signed global inventory is still conserved. After
the third step, the old RAW memory is also negative (minimum q −0.00161848,
negative-water magnitude 0.231481 mm). Real initial humidity remains positive
in both memories over this limited window; that does not establish positivity
for all valid tracers or all future times. No clipping is applied to any carrier.

The independent review also identifies an exact obstruction for this particular
unconstrained native-pressure trajectory: preserving q=0.012 with native ps
necessarily adds `0.012*2.1640752708 = 0.02596890325 mm` of water. Thus retaining
this native pressure update, preserving constant q, and conserving source-free
water are mutually incompatible. This proof is specific to the present
no-mass-constraint experiment; it is not a substitute for the coupled audit.

For the real carrier, copy-only native q=Q/M spectrum/grid reconstruction with
legal scalar truncation gives:

| End clock | Maximum local q error kg/kg | Water increment mm | Maximum log-pressure roundtrip error Pa | Air increment kg/m² |
|---|---:|---:|---:|---:|
| 00:15 | 4.79671e−6 | −1.15164e−8 | 13.2540 | −1.14300e−6 |
| 00:30 | 2.21826e−5 | −1.45218e−6 | 40.2699 | +8.94609e−5 |
| 01:00 | 7.72497e−5 | −4.47277e−6 | 78.3878 | +1.77437e−4 |

The water column holds M fixed while projecting q; the air column separately
projects log(M) and exponentiates. Projecting both gives a third-step water
increment −4.99618e−6 mm. This is a strict representation-consistency failure,
far smaller than the observed three-day peak; it is not claimed to explain that
peak. Projected real q remains positive and its hypothetical clip contribution
is zero. Untrimmed projections are retained separately in JSON, not accepted as
legal scalar states. The historical JSON name `maxQAuxiliary` measures the
auxiliary coefficients of **specific q**, in kg/kg, not carrier Q in Pa.

The finite native update-candidate stage differences are:

| End clock | Implicit pressure stage water increment mm | HD / scalar-truncation stage water increment mm |
|---|---:|---:|
| 00:15 | +0.003553682084 | +0.000016959322 |
| 00:30 | +0.013879857931 | +0.000042626585 |
| 01:00 | +0.048987140625 | +0.000093883555 |

The staged native comparison retains the actual sequence: reinitialize, dynamics,
implicit correction (including background-temperature correction), horizontal
diffusion, prognostic update, transform, and native clock advancement. The first
step's five full prognostic fields are checked bitwise against `SW.time_step!`.
The recorded `horizontalDiffusionWaterEffectMm` is the entire horizontal-
diffusion/scalar-truncation stage. It also clears pressure-tendency zero and
auxiliary modes; it must not be described as a pure q-hyperdiffusion contribution.
These are finite update-candidate differences at one operation, not a claim
that nonlinear cross terms uniquely decompose the full coupled residual.

## Minimum physically consistent next design

1. **One authoritative air-mass continuity update and SI coupling.** Native
   ln(ps), its old/current divergence split, semi-implicit correction, and RAW
   produce a different finite-step air mass from the conservative M equation.
   A tracer flux must be paired with the actual pressure mass update. Evolving
   a closed shadow M and dividing its Q by independently evolved native ps
   fails constant-tracer consistency. Enforcing `p*q` cellwise after a pressure
   correction is not a derivation of transport. Replacing pressure by log(M)
   likewise changes pressure forces and SI coupling and needs its own equations.
   At least pressure/continuity, tracer transport, and time integration require
   coordinated core changes; momentum and thermal physics need not automatically
   be rewritten wholesale.
2. **Authoritative Q, both filter histories, and distinct physics history.**
   The published previous physical grid is not generally the inverse of the
   RAW-filtered old spectrum. Preserve both M/Q memories, the true physical
   history, and restart serialization. A q grid reconstructed from Q/M should
   be a diagnostic for thermodynamics; its lossy spectral roundtrip cannot
   silently become the authoritative water stock again.
3. **Positivity of the final update.** Centered spectral transport and RAW are
   not positivity preserving. A limiter only on tentative Q does not cover the
   subsequent RAW modification of either memory. A conservative, tracer-
   consistent positive time/space transport algorithm must be tested before
   coupling; clipping and global redistribution are not such a proof.
4. **Classified physical sources and a declared mass convention.** For specific
   humidity, `M*qdot = Qdot - q*Mdot`. Adding external total-air mass while
   retaining `Qdot=M_phys*S_q` introduces real dilution. Adding `q*Mdot` to keep
   native qdot instead creates water beyond E−P. Decide whether to retain a
   documented dilute approximation or change to total-mass-consistent sources.
   Separate external evaporation/precipitation from internal convection and
   diffusion. If a layer air source s_k is used, the G recurrence contains
   `ds_k*(H_k+s_k-Mdot)`, with a plus sign. Couple surface reservoirs to the same
   accepted flux quadrature rather than changing only the diagnostic ledger.
5. **Explicit diffusion and representation budgets.** Native q hyperdiffusion
   conserves its q zero mode, not necessarily pressure-weighted water. Removing
   it or replacing it with Q diffusion changes dissipation. Conservative
   pressure/tracer remapping and any positivity treatment must have separately
   reported local errors and inventory increments.

A Q implementation must remove, rather than duplicate, native humidity vertical
advection, the humidity horizontal advective/divergence terms, q hyperdiffusion,
q LF/RAW authority, and grid clipping as an unbudgeted state change. The global
dry-mass constraint must also be reconciled with the chosen air/water mass
definition. Temperature, virtual temperature, convection and surface fluxes
still consume diagnostic q, with explicit source-time pressures. This is a
transport-core project, not an additional wrapper that merely rescales humidity.

The independent review and 17 actual-native counterexamples are recorded in
`physics-moisture-carrier-review.md` and
`physics-moisture-carrier-counterexamples.jl`. They separately demonstrate RAW
product noncommutation, failure of positivity, clip-created water, and the
specific-humidity source dilemma. Those constructed magnitudes are not an
attribution of the observed three-day peak.

## Evidence and remaining scope

The three-step experiment is sufficient to reject native-pressure coupling of
this candidate. No coupled three-day carrier run or long climate run is claimed.
No formal V3 run includes this helper. The smallest sensible next prototype is
a source-free, pressure/SI-compatible, positivity-preserving mass-and-tracer
column/transport core, with constant-tracer and global/local continuity gates
before adding water sources. This report does not estimate a safe parameter
change that would make the current model strictly conservative.

The first mechanism-test entry, `wet-carrier-test.jl`, is retained with its
**71 passes / 3 failures / 0 errors** log. All three failures were a fixture
comparison of differently reconstructed/summed air inventories, differing by
1.8–3.6e−12 kg/m²; its five full native prognostic comparisons passed bitwise.
The separate v2 entry applies the RED script's same standalone inverse pressure
transform before exact inventory comparison and adds the flux auxiliary tests.
The helper was not changed. No physical tolerance or acceptance requirement
was relaxed, and no failed log was overwritten.

The source-free helper is frozen at SHA256
`7257bb812f89f266bd891bef3197008c9dd8ba74312be387ae865bc29808833f`.
All Julia runs have source/input unchanged checks. The independent result
verifier passes **140/140 checks**, including actual exit code 1 for the nine
coupling failures. The result and new manifest are `wet-carrier-verification.json` and
`wet-carrier-bindings.json`; they bind this new evidence and verify prior frozen
files without rewriting their manifests. The reviewer owns a separate manifest.
