# C8 independent native and provenance review

Status: numerical and provenance checks pass with no remaining actionable
finding. Final completion binding is held only for final report text.
This reviewer changed only `build/c8-independent-review`.

## Independent native checks

- Rebuilt separate models from the frozen native graph/reference/layer data,
  loaded all three 1800-second checkpoints, and advanced four more steps.
  Pressure, every edge/layer velocity, water inventory and time match the saved
  final states with literal UInt64 equality: 10 assertions pass.
- Recomputed native final-state energies and inventories using 160-bit
  arithmetic and explicit loops. All six final states pass original humidity,
  pressure and inventory gates. The four real-run final relative energy drifts
  are 2.86e-18, 1.65e-17, 4.02e-16, 2.02e-17. These are endpoint drifts, distinct
  from the author-recorded maximum accumulated drift over each trajectory.
- Largest independently summed absolute drifts across finals are air
  2.68e-13 kg/m2, water 4.47e-13 mm and dry mass 6.17e-13 kg/m2. Float64 aggregate
  subtraction explains the slightly different author-recorded roundoff values.
- Independently recomputed the adjacent and finest-reference temporal metrics
  using 160-bit loops. Adjacent pressure differences are 76.1111, 27.7223 and
  7.63484 Pa; velocity differences .151347, .0571244 and .0160137 m/s; humidity
  differences 3.68091e-7, 1.19430e-7 and 3.20332e-8 kg/kg. Every adjacent and
  reference sequence decreases and matches the author results. The final-state
  inventory/energy/temporal suite passes 75 assertions.

## Independent provenance checks

The audit reads every status and independently traverses each selected Julia
literal-include closure. All selected runs are successful, use current closure
bytes, and bind unchanged inputs/outputs. Failed and superseded runs retain
hash-matching source archives. The completed selected matrix has 365 assertions
across 15 selected runs and 31 total attempts, including iteration replays;
278 project tests and seven source-verifier checks are separately recorded.

The exact sealed directory memberships and all bound bytes were checked for
C1 through C7: 222, 148, 93, 133, 102, 110 and 151 bindings respectively.
The formal application default matches base commit
6a7589687ec075cde17d7d79ef622f96c5520378. The only tracked change outside the
new C8 directory is its binary-preserving `.gitattributes` entry.

Runner and sealer review found no additional actionable issue. The runner
captures literal source closure, protocol, inputs and PW parameters; selected
runs must match current source. The sealer checks completed attempts, archives,
ancestry, acceptance, source/project/plot/review bindings and refuses a second
seal. The runtime executable is intentionally not content-pinned, as disclosed
in README; literal-bit claims are limited to the measured environment.

## Resolved recording finding

The predeclared protocol requests all nonlinear iteration counts. The original
native output retained totals/maxima and only sparse progress lines. Four
dedicated pressure-only replays now retain every step without changing selected
native sources. Each matches aggregate counts, residual/equation maxima and all
final pressure/velocity bits, and binds selected native JSON/binaries. Water has
no feedback on this subsystem, so the coarse trace covers all three humidity
cases after verifying their final dynamics identity. The traces have
12/24/48/96 records and iteration totals 36/72/101/192, with per-step ranges
3/3/2-3/2. Sealer checks explicitly validate these records and their inputs.

The convergence plot was independently viewed and checked against its bound
source/input/output hashes. Its labels distinguish sampled spatial errors,
adjacent temporal differences and maximum relative barotropic energy drift.

Final source/report bindings will be issued after final text is reviewed.
No predeclared numerical gate was relaxed to resolve a finding.
