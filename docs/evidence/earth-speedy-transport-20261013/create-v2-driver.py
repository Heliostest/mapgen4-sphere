from pathlib import Path

p = Path('docs/evidence/earth-speedy-transport-20261013')
targets = ['run-v2.jl', 'run-v2-julia.mjs', 'audit-v2-candidate.jl']
assert not any((p / name).exists() for name in targets), 'Do not overwrite frozen drivers'
s = (p / 'run.jl').read_text(encoding='utf8').replace('include("transport-model.jl")', 'include("transport-v2-model.jl")')
s = s.replace('key in ("convection","radiation")&&continue', 'key in ("convection","radiation","surface_humidity_flux")&&continue\n        key=="implicit" && FIX_IMPLICIT && continue')
needle = '    model.output.active=false\n    SW.initialize!(observer,simulation.variables,model)'
replacement = '''    if FIX_IMPLICIT
        # Preserve the frozen linearization profile and timestep on the branch.
        # Rebuild repaired matrices instead of copying the old L and S inverse.
        previous=saved["components"]["implicit"]
        SW.initialize!(model.implicit,previous.Δt[]/simulation.variables.prognostic.scale[],
            previous.temp_profile,model.geometry,model.geopotential,model.atmosphere,model.adiabatic_conversion)
        model.implicit.Δt[]=previous.Δt[]
    end
    model.output.active=false
    SW.initialize!(observer,simulation.variables,model)'''
assert needle in s
s = s.replace(needle, replacement)
(p / 'run-v2.jl').write_text(s, encoding='utf8')
s = (p / 'run-julia.mjs').read_text(encoding='utf8')
s = s.replace('`${folder}/protocol.md`,`${folder}/run-julia.mjs`', '`${folder}/protocol.md`,`${folder}/v2-protocol.md`,`${folder}/run-v2-julia.mjs`')
(p / 'run-v2-julia.mjs').write_text(s, encoding='utf8')
s = (p / 'audit-candidate.jl').read_text(encoding='utf8').replace('include("transport-model.jl")', 'include("transport-v2-model.jl")')
s = s.replace('        a=air_stocks(v,m,w)', '''        a=air_stocks(v,m,w)
        @assert all(isfinite,SW.get_step(v.grid.temperature,2).data)
        @assert minimum(SW.get_step(v.grid.temperature,2).data)>0
        @assert all(isfinite,SW.get_step(v.grid.humidity,2).data)''')
(p / 'audit-v2-candidate.jl').write_text(s, encoding='utf8')
print('Created separate v2 driver, launcher, and audit; nothing launched yet.')
