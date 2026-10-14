# C11 integrated pressure waves

Read protocol.md for frozen criteria and report.md for outcomes and limits.
This experiment validates the C10 graph and exact C8/C9 physical sources;
wave-core.jl is a diagnostic linearization, not a production replacement.

All Julia acceptance runs use the existing Julia1.12.7 runtime/depot/project
through run.mjs. Before the seal, use a fresh c11 run name for every attempt:

```powershell
node docs/evidence/earth-pressure-waves-20261015/run.mjs docs/evidence/earth-pressure-waves-20261015/test-wave.jl c11-replay-unit-01
```

The runner binds recursive includes, protocol, frozen C10 graph JSON and
inherited input manifests before/after execution. It refuses mutation after
manifest.json exists. All runs, failures, exact source versions, full traces
and endpoint fields are archived. Selected names are in selected-runs.json.
The derived summary and plot have explicit source/input/output hashes.
Runtime executables are path/version identified, not content-pinned.

```powershell
node docs/evidence/earth-pressure-waves-20261015/verify-seal.mjs EXPECTED_SHA HEAD
```

After the one-time seal, clone this as a new experiment for further work;
do not rewrite raw, source archives or documentation. Reviewer scripts keep
their original build/c11-independent-review execution paths in their hash
records; restore exact archived bytes there to replay them. The formal
application default and all C1-C10 evidence remain unchanged.
