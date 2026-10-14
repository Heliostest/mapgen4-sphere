# C2 pressure and water accuracy plan

1. Freeze C1 evidence including its explicit failed accuracy gates.
2. Independently derive/review exact pressure, momentum and integrated-flux
   evolution, then write RED tests and implement a reusable modal stepper.
3. Independently write/test an FCT water candidate; compare to C1 on smooth
   rotations, sharp patches, dry/wet endpoints, unequal masses and sigma fluxes.
4. Combine only independently passing candidates. Keep pressure, total mass,
   water, dry mass and restart identities as nonnegotiable regression gates.
5. Repeat native-shaped spatial and native2001 three-day time studies; measure
   diffusion, phase, internal steps and runtime. Preserve every failure.
6. Address still-open polar accuracy and native physical coupling based on the
   resulting evidence; no climate/default promotion without real coupled tests.

## 2026-10-13 recovered execution

Steps2–5 now have verified C2 implementation and evidence in
`docs/evidence/earth-conservative-accuracy-20261013/report.md`. Exact-time
pressure/momentum/integrated flux, FCT tracer, shared sigma coupling, analytic
fixtures, native-shaped rotations, spatial waves and native three-day studies
all completed. Fixed-linear time error falls to about1e-9Pa; tilted tracer
rotation error falls to0.00891; native humidity adjacent differences shrink3.92x.

Step1 preservation verified all existing C1 files. Prior chat never created the
C1 manifest despite its resume note; this round made a C2-owned read-only C1
snapshot without rewriting C1. All older failed accuracy flags are retained.

Step6 remains open: strong/polar pressure error does not converge. Full native
nonlinear/baroclinic physics, spectral interface and climate validation remain
unaccepted. Use CURRENT-STATE.md in the C2 directory to continue. No default
promotion, commit or push.
