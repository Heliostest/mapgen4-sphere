# Evolving circulation implementation

Spec: docs/superpowers/specs/2026-10-09-circulation-design.md. Execute inline under existing phased authorization.

- [x] Kernel tests RED then bounded atmospheric perturbations and closed ocean-loop memory GREEN.
- [x] Environment/runtime/checkpoint/schema integration, exact resume and rollback, legacy and corruption tests.
- [x] Mode controls, diagnostics, documentation and browser acceptance with actual saved vectors and budgets.
- [x] Independent fresh-context review, fixes and full checks, evidence and local commit.

Interfaces: EnvironmentModel owns atmosphere and ocean memory. Runtime snapshots and presented checkpoints include EnvironmentCheckpoint; WaterCheckpoint keeps actual winds. Hydration reconstructs memory without stepping; zero-duration diagnostics never change it. UI mode changes use existing climate reset.

Review focus: Coriolis sign and date-line/polar distances; closure versus claimed physics; diagnostics accidentally advancing memory; save consistency with actual moisture winds; finite donor limits; disabled/legacy states and rollback restoration.
