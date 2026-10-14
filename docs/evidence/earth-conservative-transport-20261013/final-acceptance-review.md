# C1 final evidence consistency review

Reviewed 2026-10-13, after completion of all three-day native runs. Scope: `report.md`, `verification.json`, `temporal-review.md`, and `CURRENT-STATE.md`, checked against the retained run JSON, logs, status records, verification scripts, and archived sources. This review ran no new numerical experiment and changed no existing file.

## Verdict

**The C1 evidence is internally consistent and ready to seal as a limited implementation-and-conservation result.** No material contradiction or concealed failure was found. The completed evidence supports the shared pressure/momentum/sigma/water implementation, inventory and bound checks, own-state restart, and agreement with the stated fixed-system backward-Euler equations. It does not support acceptance of native coarse-step pressure accuracy, strong pointwise polar accuracy, full native primitive-equation coupling, or climate performance.

The complete atmospheric repair remains unfinished. Continuing accuracy work in a new C2 directory is consistent with every reviewed acceptance flag. The prospective manifest statement in `CURRENT-STATE.md` becomes fulfilled only when the pending seal operation succeeds; this review does not claim that the seal already exists.

## Completed native evidence

The three native execution statuses are code 0 with unchanged source/input hashes. The native JSON records end at 259200 seconds on the original 3168 cells and eight sigma levels. The five cases match `verification.json` exactly, including all global drifts and local relative residuals:

| Nominal step | Case | Accepted steps | Rejections | Water drift, mm |
| ---: | --- | ---: | ---: | ---: |
| 1800 s | Real | 144 | 0 | `-7.105427357601002e-15` |
| 1800 s | Constant | 144 | 0 | `-5.684341886080802e-14` |
| 1800 s | Sharp | 144 | 0 | `-1.4210854715202004e-14` |
| 900 s | Real | 288 | 0 | `-7.887024366937112e-13` |
| 450 s | Real | 576 | 0 | `-1.3500311979441904e-12` |

All five cases have zero recorded global air drift and bitwise-equal own-state restart. Maximum local relative air and dry residuals are approximately `1.6075e-13`, and maximum local relative water residual is `3.81752e-17`; these satisfy the explicit `5e-12` final verification threshold. The maximum bottom residual is `1.99586e-12 Pa sr`. The final verification script explicitly checks local residuals, closing the outstanding native evidence gate noted in the earlier implementation review.

The constant-tracer error `7.752479214140351e-15`, sharp upper-bound roundoff, and read-only spectral projection failures agree with the report. In particular, the sharp projected minimum `-0.002106582172424327` and hypothetical clipping addition `0.19428635659301108 mm` remain visible; no claim of a lossless grid/spectral interface is made.

`candidate-c1-analysis.json` records identical imports and equal final p/j for the three 1800-second tracer cases. The analysis code checks those saved arrays explicitly. With identical initial p/j, a fixed pressure operator, and zero rejections in all three cases, the implementation also supports identical pressure paths by induction; the statement is not based on comparing different adaptive schedules.

## Temporal failure and independent reference

The original adjacent-step pressure gate remains RED: its status is code 1 and the log records four passing checks and one failed check. The retained differences are `11.783161578878467` and `16.678109667905026 Pa`, ratio `0.7065046227363353`. The new modal reference has not replaced or relabeled that run.

The separate V2 temporal-reference run has code 0, unchanged source/inputs, and 13/13 checks. Its JSON, the report, and the temporal review agree:

| Step | Core minus exact BE pressure RMS, Pa | Momentum/pref RMS difference, m/s | Continuous-time semidiscrete pressure RMS error, Pa |
| ---: | ---: | ---: | ---: |
| 1800 s | `4.051469814842407e-11` | `2.3599661606506264e-12` | `163.8420700471608` |
| 900 s | `4.269375871577283e-11` | `2.354660892710327e-12` | `160.06684105062197` |
| 450 s | `5.0632260038042434e-11` | `2.352901505381659e-12` | `151.20511264445076` |

The improving true-error trend is correctly distinguished from acceptable accuracy or first-order asymptotic convergence. The modal 14.0625-second value `43.64041820665044 Pa` is labeled an analytic fixed-spatial-system calculation rather than a new atmospheric integration. The large nonpropagating momentum component is not used to disguise pressure-wave damping.

The following flags remain false in the machine verification and agree with the prose: `fullPhysicalSphereAcceptance`, `strongPointwisePolarAccuracy`, `nativeCoarsePressureTimeAccuracy`, `originalAdjacentStepDifferenceGate`, `nativePrimitiveEquationCoupling`, `climateAcceptance`, and `formalDefaultPromoted`. Only the appropriately limited implementation/conservation and exact-BE implementation claims are accepted. The temporal oracle includes pressure and quadrature momentum; it provides no exact humidity reference.

## Read-only integrity cross-check

A fresh read-only integrity pass completed at `2026-10-13T11:41:05.503Z`. It compared every available run status against the execution table, checked before/after hashes, checked source archives and current input hashes, compared all native verification fields with their original run results, and checked every temporal-reference input hash. Results exactly match the published counts:

- 237 executed-source bindings and 55 distinct source archives.
- 2409 input bindings and 115 distinct input paths.
- 1352 bindings in the four preceding frozen manifests, freshly read and verified after the native runs.
- 105 installed native source files and the formal default file unchanged.

This pass performed only reads and comparisons; it did not regenerate `verification.json` or any evidence output. The reviewed numerical core remains SHA-256 `3fb46467306d9deae796f771e3e87c60304380d870c8b449009981200069869d`.

| Reviewed document | SHA-256 |
| --- | --- |
| `report.md` | `087060d8f7764934773645900b8c0c51038e35fc22a11254760892b355607ff2` |
| `verification.json` | `cec4af28c4a9b31fc3997f8e68719101cf54614e17b9e5a9d4838bfdbf65fb3f` |
| `temporal-review.md` | `4910b6a41bb411b19dd44cc83050e8675b16f6c10f68c91bcf5b4d4e6da7f8db` |
| `CURRENT-STATE.md` | `a2849cc898ae40a4f79488281a4e944c86fbb20a1759db43d49a734ded5f797e` |

## Non-blocking wording notes and remaining scope

The report's combined list of reproduced/repaired review topics includes late-rejection atomicity. For precision, the independent review **verified** that atomicity; the reproduced defects were wet/dry endpoint handling, terrain provenance coverage, and the native `Geometry` naming ambiguity. There was no demonstrated late-rejection mutation bug. The temporal review's humidity row uses “pressure-only” as shorthand for excluding humidity; its equations and results explicitly also validate quadrature momentum. These small wording ambiguities do not change the numerical evidence or acceptance boundary, and the original documents were left untouched.

The two known harness limitations remain disclosed: no atomic reservation of an in-flight run name, and incomplete invalid-case/zero-duration argument validation. They do not affect the recorded unique, valid C1 invocations and should be addressed in the new C2 harness without rewriting C1.

This review does not re-judge the spatial adapter's mathematical accuracy, rerun a numerical benchmark, approve a product default change, or declare the user's complete repair finished. It closes the C1 evidence-consistency review so that C1 can be sealed and further accuracy work can proceed separately.
