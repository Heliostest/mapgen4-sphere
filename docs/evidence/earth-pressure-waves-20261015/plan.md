# C11 pressure-wave implementation plan

Use superpowers:executing-plans inline and one fresh independent reviewer.
Spec: protocol.md. Standing user authorization covers implementation and
Git integration; retain this numerical evidence ledger and existing runtime.

- [x] Task1: wave-core.jl linear midpoint diagnostic; test-wave.jl RED no-op
  oscillator then GREEN analytic phase/energy, stationary, invalid input,
  reversibility, frozen pressure-step linearization. No dynamical core edits.
- [x] Task2: waves.jl full216-case matrix; reference.jl dense24 modal oracle;
  nonlinear.jl ten actual C9 small-amplitude runs with full solver ledgers.
  Source-bound runner imports exact C10 graphs and C8/C9 frozen modules.
- [ ] Task3: report, all paired regressions, plots, continuation state,
  source-binding checks and project278/typecheck/build. Fresh independent
  review and exact archive. One-time seal, commit, Git-byte check, merge,
  merged checks, push and remote SHA confirmation.

Shared interfaces: wave-core consumes TransportCore and (r vector,v vector),
returns new vectors without mutation. Full nonlinear comparison uses the
same scalar r and duplicates edge v into three layers. The diagnostic v is
velocity, not pressure flux j. Reference evolves mass-normalized pressure
with the symmetric K operator and recovers integrated gradient velocity.

Review focus: signs and pref factors in the linearization; standing versus
traveling phase conventions; pressure/velocity reference independence;
constant-mode handling and finite/shape rejection; nonlinear normalization
versus Newton tolerance; complete trace/paired-regression provenance.

Execution ruling: use native Windows scripts in the existing checkout rather
than POSIX skill helper wrappers; preserve failed attempts and review evidence.
Reuse existing runner/sealer patterns but validate every C11-specific gate.

Task1 completed: c11-wave-red-v1 fails the two hand-solvable advance checks.
Expanded RED additionally exposed missing guards and the absent energy helper.
Ruling: stationary-state test used unjustified literal equality after a
floating sparse factorization; v1 differed by2.2e-16. Replace that assertion
with1e-14 roundoff tolerance, without changing any physical gate. Cost if
wrong: a stationary defect below roundoff scale would not be detected.
c11-wave-v2 passes18assertions, including reversibility and nonlinear limit.

Task2 completed: waves-v1 passes220assertions/216cases, reference-v1 passes20,
nonlinear-v1 passes26/10runs. Sources and inputs unchanged for all attempts.
Task3 numerical/project evidence:14source checks and278project tests,
typecheck/build pass; summary/CSV and plot have content bindings. Scientific
regressions remain reported rather than retuned away. Final review receipt,
seal and Git integration follow the document freeze; Git records completion
without mutating this evidence ledger.

Pre-seal tooling check exposed a legacy C2 manifest containing both local
evidence and external build/source bindings. Ruling: directory membership
compares only bindings inside that directory; every binding, including
external ones, still receives its full hash check. Cost if wrong: an
unexpected unbound external file is outside this directory inventory's scope;
the inherited C1/native checker retains its original scope. No numerical
source or result changes. Preserve both pre-seal tooling check attempts.
