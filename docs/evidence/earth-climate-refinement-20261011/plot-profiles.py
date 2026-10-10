"""Plot independent saved checkpoints; no interpolation or product imports.

Run from repository root with Python. Bundled task dependencies live in
build/plot-deps. The lines connect six saved observations only, not daily data.
"""
from pathlib import Path
import hashlib
import json
import sys

repo = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(repo / "build" / "plot-deps"))
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

folder = Path(__file__).resolve().parent
source = folder / "evidence-review.json"
data = json.loads(source.read_text(encoding="utf-8"))
records = data["records"]
assert [r["nominalDay"] for r in records] == [0, 24, 90, 180, 270, 365]
groups = [(323, "Himalaya"), (275, "Tibet"), (686, "Andes east"), (3, "Arctic coast")]
colors = {"low": "#b65c20", "high": "#206fba", "classic": "#424952"}
plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 10,
                     "axes.spines.top": False, "axes.spines.right": False,
                     "axes.grid": True, "grid.alpha": .18})
fig, axes = plt.subplots(4, 2, figsize=(11.7, 13.8), sharex=True,
                         layout="constrained")
days = [r["nominalDay"] for r in records]
for row, (parent, label) in enumerate(groups):
    fine = [next(p for p in r["balanced"]["profiles"] if p["parent"] == parent)
            for r in records]
    classic = [next(p for p in r["before"]["profiles"] if p["parent"] == parent)
               for r in records]
    h0, h1 = fine[0]["low"]["heightM"], fine[0]["high"]["heightM"]
    for col, (key, unit) in enumerate([("landC", "Land surface temperature (C)"),
                                       ("snowMm", "Land snow water equivalent (mm)")]):
        ax = axes[row, col]
        for kind in ("low", "high"):
            ax.plot(days, [p[kind][key] for p in fine], "o-",
                    color=colors[kind], ms=4, lw=1.5,
                    label=f"Balanced {kind} patch")
        ax.plot(days, [p[key] for p in classic], "s--", ms=3, lw=1.2,
                color=colors["classic"], label="Classic parent")
        ax.set_title(f"{label} | parent {parent} | low {h0:.0f} m / high {h1:.0f} m",
                     loc="left", fontsize=10)
        ax.set_ylabel(unit)
        ax.set_xticks(days)
        ax.set_xlim(-8, 373)
        if col == 1:
            maximum = max([p[kind][key] for p in fine for kind in ("low", "high")]
                          + [p[key] for p in classic])
            ax.set_ylim(0, max(1, maximum * 1.08))
        else:
            ax.axhline(0, color="#64748b", lw=.7, ls=":")
        if row == 0:
            ax.legend(loc="best", fontsize=8, framealpha=.85)
        if row == len(groups)-1:
            ax.set_xlabel("Model days since northern spring equinox")
fig.suptitle("Independent surface reservoirs: first-year checkpoint profiles\n"
             "Real patch means; lines only guide the eye between six saved checkpoints",
             fontsize=14)
output = folder / "profile-temperature-swe.png"
fig.savefig(output, dpi=160)
plt.close(fig)
(folder / "profile-plot-provenance.json").write_text(json.dumps({
    "source": "evidence-review.json",
    "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
    "output": output.name,
    "outputSha256": hashlib.sha256(output.read_bytes()).hexdigest(),
    "parents": [p for p, _ in groups],
    "days": days,
    "note": "Classic is one parent store; balanced low/high are actual same-parent patches. Six checkpoints only; not a daily time series or observed climate."
}, indent=2) + "\n", encoding="utf-8")
print(output)
