# C9 continuation state

Base 0041b1eebc24aafdcf784fcf50afb12bbf219819, branch
codex/rotating-sigma-momentum. Consult Git for later integration status.
Once manifest.json exists preserve the entire evidence directory byte for
byte. Continue future numerical changes in a new experiment.

Implemented: actual-pressure metric adjoint, weak relative curl plus Coriolis,
paired layer kinetic-gradient correction and centered sigma vertical
advection of horizontal momentum. The latter two terms exchange opposite
work; rotation/vorticity have zero work individually. Combine their nonlinear
midpoint substeps symmetrically around frozen C8 pressure_step. Its same
integrated flux drives water FCT, followed by atomic all-field commit.

Every native step records both midpoint and pressure iteration counts,
residuals, budgets and energy guards. Checkpoints bind version9 geometry,
interpolation, rotation and C8 core. The complete barotropic p/v ODE is
formally second order; sharp limited humidity transport is not claimed so.
Vertical spatial refinement uses uniform layer thicknesses. Unequal-layer
tests verify the energy pairing and algebra; arithmetic interface averaging
does not establish second-order spatial accuracy on arbitrary unequal layers.

The degree3 paired audit deliberately repeats C8's harder potential-flow
benchmark. Its small reduction of total polar error is accompanied by a
nonzero spurious weak-curl force: do not describe it as an exact curl-grad
sequence or a solved polar metric problem. The primary rotation/mixed/shear
matrix uses different fields and cannot be compared directly to C8's 13.5%.

Next: improve the spatial metric/curl compatibility and polar force accuracy;
then derive thermal energy, pressure/geopotential and physical water sources.
No prognostic vertical velocity, nonhydrostatic closure, thermodynamic heat,
exact PV/angular momentum, long-climate or production-performance acceptance.
Preserve all inherited C1-C8 bytes and the formal default.
