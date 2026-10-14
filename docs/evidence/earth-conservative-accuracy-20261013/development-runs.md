# Preserved development outcomes

- `c2-acoustic-red`: three intentional failures show C1 BE does not reproduce
  the continuous two-cell oscillator or retain its energy.
- `c2-transport-red`: intentional failure, smooth ring rotation error0.369873
  exceeds0.03. Final FCT error is0.0121067 on the same fixture.
- `c2-native-1800-01`: manually stopped after detecting a harness variable
  shadowing error (`first` state versus `first(trajectories)`). A first stop
  command did not match Julia's shortened Windows command line; the process
  was then identified by the runner parent PID and terminated. Its source
  changed before termination, so sourceUnchanged=false is preserved. Excluded
  from all accepted evidence.
- `c2-native-1800-02`, `c2-native-900-01`, `c2-native-450-01`: development
  modal/upwind runs passed their within-operator checks but used c2=82667.52
  rather than native82671.64740772452. They do not establish a same-parameter
  C1 comparison. Final v2 scripts read c2 from authenticated frozen C1 output.
- `c2-fct-native-1800-01`, `c2-fct-native-900-01`, `c2-fct-native-450-01`:
  manually stopped to correct that parameter and remove direct centered-LU
  fill-in cost. Neither completed native acceptance. Their archived source
  remains available. GMRES is verified against direct LU in the final tests.
- `c2-harness-invalid-case` and `c2-harness-zero-days`: intentional invalid-input
  failures. The duplicate-name probe also verifies that an existing status
  cannot be overwritten. See harness-tests.json.

No failure was changed into a successful run. Final names are unique, and all
source versions have content-addressed snapshots. Old C1 adjacent-step and
polar-pressure failure flags remain unchanged.

Method references: [Hochbruck and Ostermann, Exponential Integrators (2010)](https://na.math.kit.edu/download/papers/acta-final.pdf)
motivates exact treatment of the declared linear subsystem; it does not imply
correct nonlinear coupling. [Zalesak, FCT (1979)](https://www.sciencedirect.com/science/article/pii/0021999179900512)
motivates shared-flux limiting; this implementation is an explicitly tested
experiment, not a reproduction of the entire published method.
