using Pkg
Pkg.activate(joinpath(@__DIR__, "julia-env"))
Pkg.add([
    PackageSpec(name="SpeedyWeather", version="0.23.0"),
    PackageSpec(name="JSON3"),
    PackageSpec(name="NCDatasets"),
    PackageSpec(name="JLD2"),
])
Pkg.instantiate()
Pkg.precompile()
Pkg.status()
