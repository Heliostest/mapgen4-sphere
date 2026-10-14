# C4 work state (unsealed)

Base main/origin/main: c483edab5127103866384ef385bd7ca5c7ef3d03.
Working branch: codex/native-graph-wind. All implementation/evidence is new C4;
C1/C2/C3 and formal default are unchanged. C3 manifest SHA remains
cb95e9a55efac60795367edebe119e601bc984d941c2f7b76f595f483070eb8e.

Completed: c4-inspect-v1, c4-graphs-v1, c4-import-v2 (18),
c4-analytic-v1 (234), c4-rotation-v1 (36), c4-covariance-v1 (8),
c4-native-1800-v3 (39; real/constant/sharp), c4-native-900-v1 (18),
c4-binding-v1 (5), project tests 278/typecheck/build.
Parenthesized counts are successful checks, not physical acceptance flags.

Running native real humidity: c4-native-450-v1 (192 explicit steps),
c4-native-225-v1 (384 explicit steps), one day each. Their source bytes must
remain unchanged until their run status records finish. Existing processes
were launched with run.mjs and log under build/earth-native-graph-wind.

Next: finish these runs; fix the minor test-import.jl comment ("line integral"
means the declared chord-based formula) and rerun import under a fresh name;
run compare-time.jl with the four native runs and explicit input SHA declarations.
Finish report/current state, selected-runs.json, final frozen verification,
then seal.mjs. Check the final manifest and commit the C4 checkpoint on this
branch. No application default upgrade or full climate claim.

Independent review found no numerical blocker. Its P2 stale-source sealing
gap was fixed with source-bindings.mjs, proven RED -> GREEN using real files;
selected script/include closure plus runner must match delivered sources.
Review file has the disposition. Do not dispatch a redundant re-review.

Failed attempts are intentionally retained: c4-import-red-v1 missing-feature
test, c4-import-v1 cancellation-sensitive test tolerance, native-1800-v1 parse
typo, native-1800-v2 Base.split shadowing, c4-binding-red-v1 missing validator.
No numerical algorithm adjustment or clipping was used to pass the gates.
