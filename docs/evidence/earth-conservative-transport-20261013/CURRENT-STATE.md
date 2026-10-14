# Resume here after C1

The user asked to continue the earlier atmospheric repair. This round implemented a shared conservative pressure/momentum/sigma/water subsystem; it did NOT finish the complete climate-model repair. Read report.md and verification.json before continuing.

Candidate C1 source is frozen: conservative-core.jl SHA 3fb46467306d9deae796f771e3e87c60304380d870c8b449009981200069869d. The new manifest pins this entire package and the four previous manifests. Do not rerun scripts in place with existing run names or rewrite these results. Next development belongs to a new candidate/evidence prefix with fresh source archives.

Successful scope: original 3168 native Gaussian cells, 8 sigma levels; pressure and persistent physical-quadrature j; variational reconstructed angular D and adjoint divergence; 27330 shared pair transfers and implicit upwind water; complementary water/dry solve without clipping; local/global inventory and constant tracer; own-state restart. Native source-free 3-day runs at 1800/900/450 seconds completed with no rejection or subdivision. The 1800 run includes real/constant/sharp q. Three q cases have exactly the same pressure/j path. All prior evidence, installed source and formal defaults are unchanged.

Open gates: strong pointwise/polar accuracy, native coarse pressure time accuracy, lossless grid/spectral physics interface, full nonlinear momentum/Coriolis and baroclinic temperature/SI/source/diffusion/history coupling, and climate skill. No product default promotion, no new six-year run, no commit or push.

Important preserved failure: candidate-c1-analysis has code 1 because pressure adjacent-step RMS differences increase 11.783→16.678 Pa. Do not convert it to green. Exact-native-temporal-reference-v2 separately verifies pressure and momentum against exact BE to ~5e-11 Pa/~2.4e-12 m/s. True continuous-time error of the SAME spatial system improves 163.842→160.067→151.205 Pa, but remains substantial; this is not sufficient coarse-step accuracy. Modal 14.0625-second analysis still has 43.64 Pa error after 3 days. Full spatial truth is not supplied by this oracle.

Independent reviews: core-implementation-review.md, scheme-reconstruction-review.md, temporal-review.md. Review caught a q=1/mixed0/1 endpoint roundoff failure and missing terrain provenance; both fixed before C1. Two minor harness limitations remain documented (run-name reservation and invalid case/duration validation); harden the NEXT harness before reuse, preserving archived C1.

Next numerical work should choose an accuracy strategy with concrete phase/damping and polar benchmarks before integrating into native physics. Exact continuous-time modal solution is an inexpensive pressure-only oracle for this fixed linear system. It is not an alternative climate solver. First-order tracer diffusion remains large (native-shaped tilted-rotation relative error 0.2585 per rotation).

Native runtime: build/earth-speedyweather/runtime/julia-1.12.7/bin/julia.exe, project docs/evidence/earth-speedyweather-20261012/julia-env, JULIA_DEPOT_PATH=build/earth-speedyweather/depot, Julia2/BLAS1. run-core-julia.mjs gives each execution its own status/log/source archives and captures all six NetCDF assets plus105 native source files. Scope of old experimental smoke input coverage is narrower and retained honestly.
