# C5 review record

Independent review was attempted four times using fresh contexts under the
requesting-code-review skill. gpt-6-astra, gpt-6.1-sol, an inherited-model
attempt and gpt-6-sol each returned `Selected model is at capacity. Please try
a different model.` No reviewer inspected the code. This is NOT independent
review approval. Keep this as an experimental branch checkpoint; fresh review
remains outstanding before merge/default consideration.

The author performed a separate source/evidence audit after the runs:

- Matrix placement checked explicitly: H C = H P J M^-1 P' H transposes to
  its negative because J'=-J and repeated nodal mass M commutes with J.
  R is not advertised as a true inverse and j is not replaced by P R j.
- East/north J gives east acceleration f*v and north acceleration -f*u.
  f uses Cartesian Omega dot x. No extraneous radius or sigma thickness:
  radius belongs to acoustic spatial derivatives; frozen transport applies ds.
- The nodal midpoint solve follows z=R(j_old+j_new)/2. Substitution gives
  (I-h R P J/2)z=R j_old, followed by j_new=j_old+h P J z. The original edge
  equation is checked after solving, and independent dense edge solves agree.
- Coupled step operates on a deep copy and commits four authoritative fields
  only after both rotations and FCT succeed. Factor caches are not State.
- Checkpoint identity includes the frozen FCT identity, Omega and actual P/R/PJ
  matrices. Rebuilding from inputs reproduces it and actual next four steps.
- C4 real-pressure import remains unchanged. R j is reference velocity; report
  explicitly distinguishes it from actual wind when p differs from pref.
- Native timestep comparison binds all four result JSONs and final binaries,
  checks equal core identity and uses common humidity weights.
- Sealer verifies passed status, immutable execution sources/inputs, archived
  failed sources, selected-to-current source closure and numerical gates.
- Test counts, native metrics and figure match result files. Source checks
  reject stale entry/include/runner/protocol, an unbound include and failed run.

No blocker was found in this self-review for preserving the numerical
checkpoint. Its assurance is weaker than an independent review.

Declined to judge as unimplemented/outside this checkpoint: nonlinear momentum
advection and vertical momentum exchange; thermodynamic/source integration;
continuous PV/vorticity and angular momentum conservation; exact geostrophic
balance under time splitting; high-frequency representational kernel quality;
long climate realism; production performance. These remain explicit limitations
and are not waived by passing the linear subsystem tests.
