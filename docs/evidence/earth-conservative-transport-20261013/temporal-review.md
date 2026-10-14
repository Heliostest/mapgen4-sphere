# Independent temporal-reference review

2026-10-13. This supplements the earlier reviews without editing them, the
candidate implementation, or any frozen result. The reviewed new calculation
is `exact-native-temporal-reference-v2.jl`, together with its
`candidate-c1-temporal-reference-v2.json`, log and runner status. The first
seven-check pressure-only calculation also remains preserved. V2 uses a dense
modal calculation, not another atmospheric integration.

## Conclusion

The independent modal reference is mathematically appropriate for this fixed
linear pressure/momentum subsystem. The saved candidate pressure matches its
exact backward-Euler solution to approximately 5e-11 Pa RMS. The continuously
evolved semidiscrete reference shows actual pressure errors decreasing under
the tested time-step halvings, even though the earlier adjacent-step
differences increased.

This verifies the pressure implementation and establishes an improving error
trend for this case. It does **not** make the failed adjacent-step gate pass,
establish acceptable 30-minute pressure accuracy, or clear the spatial,
thermodynamic or full coupled-model gates. The true three-day pressure error is
still 163.84 Pa RMS at 1800 s and 151.21 Pa at 450 s.

## Equations checked against the implementation

Let C be the actual pressure-momentum divergence, G the physical pressure
gradient and P the diagonal quadrature reference pressure. Define

```
M = diag(A*pref)
r = p/pref
jbar = sum_k ds_k*j_k
M*r_dot = -C*jbar
jbar_dot = c²*P*G*r
K = C*P*G
```

The core's G and C already contain the physical 1/R factors, so its stiffness
K already contains 1/R². The independent script correctly assembles the same
stiffness as `D'*diag(H*pref_face)*D/R²`, without reusing the core's pressure
factor, divergence matrix, transfer incidence or step routine. Here D is the
angular reconstructed gradient and H=L*d.

The small discrepancy between the core's transfer-built C and the exact
weighted adjoint of G is floating-point assembly error. The oracle's normalized
matrix has relative asymmetry `5.34383e-17`. Thus its symmetric eigensolve is
appropriate to the intended spatial operator, with actual core/oracle agreement
measured separately.

For `y=sqrt(M)*(r-rbar)`, the equation is

```
y_double_dot = -S*y
S = c²*M^(-1/2)*K*M^(-1/2)
y_dot(0) = -M^(-1/2)*C*jbar(0).
```

S is positive semidefinite, with one known constant-ratio null mode; it is not
strictly positive definite on the entire pressure space. The script finds
exactly one null mode among 3168. Its lowest computed eigenvalue is
`1.53819e-22`, and its largest is `4.2326160e-5 s^-2`.

In an orthonormal eigenbasis with modal initial values a and derivatives b,
the continuous-time solution is

```
y(T) = cos(omega*T)*a + sin(omega*T)/omega*b.
```

For n uniform backward-Euler steps h, set `z=(1+i*omega*h)^(-n)`:

```
y_BE(T) = real(z)*a - imag(z)/omega*b.
```

The sign is correct: at one step it gives `(a+h*b)/(1+omega²*h²)`. The null
limit is `a+T*b`; it must be handled analytically rather than divided by zero.
The code propagates the pressure anomaly around the known mass-weighted
constant ratio, which reduces roundoff from the large pressure background.
The zero-mode handling changes no saved authoritative pressure or water.

The corresponding derivative is `real(z)*b+omega*imag(z)*a`. V2 additionally
uses the modal integral

```
integral_BE = -imag(z)/omega*a + (1-real(z))/omega²*b
j_BE = j_initial + c²*P*G*M^(-1/2)*V*integral_BE.
```

Here V is the eigenvector matrix. Retaining the full initial j before adding
the common pressure impulse correctly preserves divergence-free momentum and
layer shear, which pressure alone cannot determine. V2 compares every saved
layer's quadrature momentum through the H/ds-weighted norm of j/pref_face.
Its RMS difference is only 2.35–2.36e-12 m/s across all three steps.

The three real-field runs take 144/288/576 accepted steps, respectively, with
zero rejections. Their fixed references, coefficients and original import
match, and each ends at 259200 s. Therefore the single rational modal factor
applies. With adaptive accepted steps the factor would instead be the product
over their actual step sizes. Time-varying coefficients or physical sources
would invalidate this fixed-matrix oracle.

## Observed comparison

The norm is the same Gaussian-area-weighted physical pressure RMS used in the
earlier adjacent-step analysis, not merely a modal-coordinate norm.

| Step | Core minus exact BE RMS | Continuous semidiscrete error RMS | Maximum temporal error | Maximum omega*step |
|---:|---:|---:|---:|---:|
| 1800 s | 4.05147e-11 Pa | 163.842070 Pa | 616.321538 Pa | 11.71054 |
| 900 s | 4.26938e-11 Pa | 160.066841 Pa | 601.226095 Pa | 5.85527 |
| 450 s | 5.06323e-11 Pa | 151.205113 Pa | 560.795524 Pa | 2.92764 |

The oracle's direct BE predictions have the same temporal errors to rounding.
Its cheap modal refinement curve gives RMS errors

```
step [s]   1800     900      450      225      112.5    56.25    28.125   14.0625
error [Pa] 163.842  160.067  151.205  134.838  113.492  89.6402  65.4785  43.6404
```

These all decrease, but the successive error ratios are not yet the factor of
two expected in the first-order asymptotic regime. Even the final listed ratio
is only about 1.50. Large omega*step and long elapsed time explain substantial
backward-Euler damping of faster spatial modes. Conservation and linear
stability do not control that error.

The V2 calculation completed **13/13 checks**, exit code 0. The runner confirms
unchanged source and inputs; the script also hashes and rechecks all bound
analysis inputs. Its output explicitly sets
`adjacentStepDifferenceGatePassed=false`. The relative eigenpair residual is
3.88248e-15, and the reported normalized orthogonality residual is 8.22350e-13.
The continuous semidiscrete final pressure minimum is 60747.8837 Pa. This is a
positive endpoint check, not a proof of positivity at every intermediate exact
time. These additional diagnostics address the checks absent from the first
pressure-only result.

## Why the previous adjacent-step failure is compatible with these results

The preserved adjacent-step pressure RMS differences are
`11.78316158 Pa` and `16.67810967 Pa`, ratio `.70650462`. Humidity adjacent-step
differences decrease, with ratio `1.15050350`. Neither adjacent-step ratio is
an exact error against a known continuous-time solution. Richardson-style
interpretation requires an asymptotic expansion whose leading term dominates
at the sampled steps and observation time.

A single stable acoustic mode already supplies a counterexample. Take

```
y'' = -1.4²*y, y(0)=1, y'(0)=0, T=1.
y_exact = cos(1.4).
y_BE(n) = (1+(1.4/n)²)^(-n/2)*cos(n*atan(1.4/n)).
```

| Steps n | BE endpoint | Absolute true error |
|---:|---:|---:|
| 8 | .162890787891345 | .007076355008896 |
| 16 | .163202729527441 | .006764413372800 |
| 32 | .165698286318095 | .004268856582146 |

The exact endpoint is `.169967142900241`. True errors decrease twice, while
adjacent differences increase from `.000311941636096` to `.002495556790654`,
approximately eightfold. Amplitude and phase errors partially cancel at this
particular observation time. No instability, mass adjustment or changed
equation is needed for this effect. This establishes that an increasing
adjacent pressure difference does not logically imply increasing true pressure
error; the native modal calculation determines what happened in the actual case.

## Acceptance boundary

| Claim | Supported result |
|---|---|
| Core pressure and quadrature momentum implement the stated fixed-system BE update | Yes, measured oracle agreement |
| Pressure time error decreases for 1800/900/450 s here | Yes, measured against the continuous semidiscrete reference |
| Earlier adjacent-step pressure gate passed | No; its RED evidence remains |
| These steps demonstrate first-order asymptotic convergence | No |
| 1800 s delivers a small or accepted physical pressure error | Not established; RMS error is 163.84 Pa |
| Humidity has an exact modal time-reference validation | No; this oracle is pressure-only |
| Spatial spherical accuracy or full native thermal coupling is fixed | No |

The word "exact" refers to evolution in time of this same finite-dimensional
fixed spatial system, subject to numerical eigensolve roundoff. It does not
mean an exact solution on the continuum sphere or a physically complete moist
atmosphere. The earlier strong spatial/polar failures, diagnostic spectral
projection losses and remaining full-model coupling work are unaffected.

The final `verification.json` was read and agrees with this boundary:
implementation/conservation and pressure/momentum agreement with exact BE are
accepted, while `nativeCoarsePressureTimeAccuracy`,
`originalAdjacentStepDifferenceGate`, `strongPointwisePolarAccuracy`,
`nativePrimitiveEquationCoupling`, `climateAcceptance` and promotion of the
formal default all remain false.
