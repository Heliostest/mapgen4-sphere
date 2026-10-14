using SpeedyWeather, Test, LinearAlgebra, JSON3, Dates
const SW = SpeedyWeather
BLAS.set_num_threads(1)
implementation = get(ENV, "VERTICAL_DIFFUSION_IMPLEMENTATION", "native")
surface_implementation = get(ENV, "VERTICAL_SURFACE_IMPLEMENTATION", "skip")
surface_implementation == "fixed" && include("boundary-layer.jl")
if implementation == "fixed"
    include("vertical-diffusion.jl")
    using .ConservativeVerticalMixing
end

@testset "nonuniform native column must exchange between layers" begin
    sg = SpectralGrid(NF=Float64, truncation=5, nlayers=4)
    native = SW.BulkRichardsonDiffusion(sg)
    # Uniform sigma spacing: 1 / (2 * centre_spacing * cell_mass).
    native.∇²_above .= [0.0, 8.0, 8.0, 8.0]
    native.∇²_below .= [8.0, 8.0, 8.0, 0.0]
    q = reshape([0.001, 0.004, 0.010, 0.020], 1, :)
    K = fill(10.0, 1, 4)
    tend = zeros(1, 4)
    if implementation == "native"
        SW._vertical_diffusion!(1, tend, q, K, 1, native)
    else
        half = collect(0.0:0.25:1.0)
        sigma = (half[1:end-1] + half[2:end]) / 2
        c = sigma_conductance(vec(K), sigma, half, fill(280.0, 4), 9.81, 287.0)
        implicit_column_diffusion!(vec(tend), vec(q), c, diff(half), 1800.0)
    end
    println(JSON3.write((; implementation, tracerTendency=vec(tend), Kz=vec(K))))
    @test maximum(abs, tend) > 0
end

if implementation == "fixed"
@testset "sigma units and analytic two-layer exchange" begin
    half = [0.0, 0.2, 1.0]
    sigma = [0.1, 0.6]
    mass = diff(half)
    c = sigma_conductance(fill(12.0, 2), sigma, half, fill(300.0, 2), 10.0, 300.0)
    expected_c = (10.0 * 0.2 / (300.0 * 300.0))^2 * 12.0 / 0.5
    @test c[1] ≈ expected_c rtol=1e-14
    q = [0.0, 0.02]
    for dt in (1800.0, 3600.0)
        dq = zeros(2)
        implicit_column_diffusion!(dq, q, c, mass, dt)
        difference = (q[2] - q[1]) / (1 + dt * expected_c * sum(inv, mass))
        mean = dot(mass, q)
        expected = [mean - mass[2] * difference, mean + mass[1] * difference]
        @test q + dt * dq ≈ expected rtol=1e-14 atol=1e-17
    end
end

@testset "nonuniform-grid conservative bounded implicit exchange" begin
    half = [0.0, 0.05, 0.17, 0.50, 0.85, 0.97, 1.0]
    sigma = (half[1:end-1] + half[2:end]) / 2
    mass = diff(half)
    Tv = [220.0, 240.0, 260.0, 280.0, 290.0, 300.0]
    for scale in (1.0, 1e6), dt in (1800.0, 3600.0)
        c = sigma_conductance(scale .* [1.0, 10.0, 50.0, 100.0, 80.0, 30.0], sigma, half, Tv, 9.81, 287.0)
        for (label, x) in (("water", [0.0, .001, .002, .009, .018, .025]),
                           ("u", [-30.0, -5.0, 0.0, 10.0, 40.0, 80.0]),
                           ("v", [20.0, -10.0, 30.0, -40.0, 0.0, 5.0]),
                           ("dry static energy", [350000.0, 340000.0, 335000.0, 320000.0, 310000.0, 300000.0]))
            tend = zeros(6)
            implicit_column_diffusion!(tend, x, c, mass, dt)
            result = x + dt * tend
            tolerance = 1e-10 * maximum(abs, x)
            @test all(isfinite, result)
            @test minimum(result) >= minimum(x) - tolerance
            @test maximum(result) <= maximum(x) + tolerance
            @test dot(mass, result) ≈ dot(mass, x) rtol=1e-12 atol=tolerance
            @test abs(dot(mass, tend)) <= 1e-13 * max(1.0, maximum(abs, tend))
            @test maximum(abs, tend) > 0
            @test sum(mass .* (result .- dot(mass, x)).^2) < sum(mass .* (x .- dot(mass, x)).^2)
            if label == "water"
                @test minimum(result) >= 0
                @test all(diff(result) .>= -tolerance)
            end
            println(JSON3.write((; label, dt, K_multiplier=scale, weightedResidual=dot(mass,tend), minimum=minimum(result), maximum=maximum(result))))
        end
        for constant in (0.0, 0.01, 300000.0)
            tend = zeros(6)
            implicit_column_diffusion!(tend, fill(constant, 6), c, mass, dt)
            @test maximum(abs, tend) < 1e-11 * max(1.0, abs(constant))
        end
    end
    c = sigma_conductance(fill(100.0, 6), sigma, half, Tv, 9.81, 287.0; k_top=4)
    @test c[1:3] == zeros(3)
    tend = zeros(6)
    implicit_column_diffusion!(tend, collect(1.0:6.0), c, mass, 3600.0)
    @test tend[1:3] == zeros(3)
    @test abs(dot(mass[4:6], tend[4:6])) < 1e-17
    for k_top in (6, 7)
        @test sigma_conductance(fill(100.0, 6), sigma, half, Tv, 9.81, 287.0; k_top) == zeros(5)
    end
    one_tend = [0.0]
    implicit_column_diffusion!(one_tend, [0.02], Float64[], [1.0], 3600.0)
    @test one_tend == [0.0]
end

@testset "native model integration preserves diagnostics and column budgets" begin
    sg = SpectralGrid(NF=Float64, truncation=5, nlayers=8)
    half = [0.0, 0.08, 0.22, 0.50, 0.75, 0.88, 0.94, 0.98, 1.0]
    geometry = Geometry(sg; vertical_coordinates=SigmaCoordinates(sg, half))
    scheme = ConservativeVerticalDiffusion(sg)
    model = PrimitiveWetModel(sg; vertical_diffusion=scheme, geometry, feedback=nothing)
    sim = initialize!(model)
    vars = sim.variables
    SW.set!(model.time_stepping, Second(1800), model)
    model.orography.orography[1] = 0
    mass = diff(half)
    for counter in (0, 1, 2)
        vars.prognostic.clock.step_counter = counter
        dt = SW.time_step(model.time_stepping, vars.prognostic.clock)
        @test dt == (900.0, 1800.0, 3600.0)[counter+1]
        T = SW.get_prognostic_step(vars.grid.temperature, model.time_stepping, scheme)
        q = SW.get_prognostic_step(vars.grid.humidity, model.time_stepping, scheme)
        u = SW.get_prognostic_step(vars.grid.u, model.time_stepping, scheme)
        v = SW.get_prognostic_step(vars.grid.v, model.time_stepping, scheme)
        T[1,:] .= [215.0, 235.0, 255.0, 273.0, 285.0, 291.0, 296.0, 299.0]
        q[1,:] .= [0.0001, 0.001, 0.002, 0.004, 0.008, 0.012, 0.016, 0.02]
        u[1,:] .= [10.0, 15.0, 20.0, 25.0, 30.0, 35.0, 40.0, 45.0]
        v[1,:] .= [-5.0, -2.0, 2.0, 5.0, 9.0, 13.0, 17.0, 20.0]
        vars.dynamics.geopotential[1,:] .= -model.atmosphere.R_dry * 280.0 .* log.(model.geometry.σ_levels_full)
        K, k_top = SW.get_diffusion_coefficients!(1, vars, scheme.inner, model.time_stepping,
            model.atmosphere, model.planet, model.orography, model.geopotential)
        nativeK = copy(K[1,:])
        nativeRi = copy(vars.scratch.grid.a[1,:])
        @test maximum(nativeK) > 0
        @test k_top < 8
        SW.reset_tendencies!(vars, model.time_stepping)
        SW.parameterization!(1, vars, scheme, model)
        @test vars.parameterizations.vertical_mixing_active[1] == 1
        @test vars.parameterizations.boundary_layer_height[1] == k_top
        @test vars.scratch.grid.b[1,:] == nativeK
        @test vars.scratch.grid.a[1,:] == nativeRi
        for (name, source, conversion) in ((:humidity, q, 1.0), (:u, u, 1.0), (:v, v, 1.0),
                                          (:temperature, T, model.atmosphere.heat_capacity))
            tend = SW.get_tendency_step(getproperty(vars.tendencies.grid, name), model.time_stepping, scheme)[1,:]
            old = conversion .* source[1,:]
            name == :temperature && (old .+= vars.dynamics.geopotential[1,:])
            result = old + dt * conversion * tend
            @test maximum(abs, tend) > 0
            @test abs(dot(mass, conversion * tend)) < 1e-12
            @test minimum(result) >= minimum(old) - 1e-9
            @test maximum(result) <= maximum(old) + 1e-9
            name == :humidity && @test minimum(result) >= 0
            println(JSON3.write((; name, dt, k_top, maxKz=maximum(nativeK), maxTendency=maximum(abs,tend), weightedResidual=dot(mass,conversion*tend))))
        end
    end
    if surface_implementation != "skip"
    @testset "surface-aware K responds to warm surface and is terrain invariant" begin
        candidate = surface_implementation == "fixed" ?
            ConservativeVerticalDiffusion(sg; surface_aware=true) : scheme
        SW.initialize!(candidate, model)
        model.land_sea_mask.land_fraction[1] = 0
        model.orography.orography[1] = 0
        vars.parameterizations.surface_pressure[1] = 100000.0
        cp, g = model.atmosphere.heat_capacity, model.planet.gravity
        phi = g .* [1000.0, 800.0, 650.0, 500.0, 350.0, 200.0, 100.0, 50.0]
        SW.get_step(vars.grid.temperature, 1)[1,:] .= 300.0 .- phi ./ cp .+ [0.0, 0.0, 0.0, 0.05, 0.1, 0.2, 0.3, 0.4]
        SW.get_step(vars.grid.humidity, 1)[1,:] .= [0.0005, 0.001, 0.002, 0.004, 0.006, 0.008, 0.009, 0.01]
        SW.get_step(vars.grid.u, 1)[1,:] .= [6.0, 5.0, 4.0, 3.0, 2.5, 2.2, 2.1, 2.0]
        SW.get_step(vars.grid.v, 1)[1,:] .= [0.0, 1.0, 3.0, 5.0, 3.0, 1.0, -1.0, 0.0]
        vars.dynamics.geopotential[1,:] .= phi
        sst = SW.get_step(vars.prognostic.ocean.sea_surface_temperature)
        sst[1] = 260.0
        SW.reset_tendencies!(vars, model.time_stepping)
        SW.parameterization!(1, vars, candidate, model)
        @test vars.parameterizations.vertical_mixing_active[1] == 0
        cold_top = vars.parameterizations.boundary_layer_height[1]
        cold_Ri = vars.scratch.grid.a[1,8]
        sst[1] = 315.0
        SW.reset_tendencies!(vars, model.time_stepping)
        SW.parameterization!(1, vars, candidate, model)
        @test vars.parameterizations.vertical_mixing_active[1] == 1
        warm_top = vars.parameterizations.boundary_layer_height[1]
        warm_Ri = vars.scratch.grid.a[1,8]
        warm_K = copy(vars.scratch.grid.b[1,:])
        warm_Ris = copy(vars.scratch.grid.a[1,:])
        @test cold_Ri > 0
        @test warm_Ri < 0
        @test warm_top < cold_top
        @test maximum(warm_K) > 0
        for name in (:humidity, :u, :v, :temperature)
            conversion = name == :temperature ? cp : 1.0
            tend = SW.get_step(getproperty(vars.tendencies.grid, name))[1,:]
            old = conversion .* SW.get_step(getproperty(vars.grid, name), 1)[1,:]
            name == :temperature && (old .+= phi)
            result = old + 3600.0 * conversion * tend
            @test maximum(abs, tend) > 0
            @test abs(dot(mass, conversion * tend)) < 1e-12
            @test minimum(result) >= minimum(old) - 1e-9
            @test maximum(result) <= maximum(old) + 1e-9
        end
        model.orography.orography[1] = 3000.0
        vars.dynamics.geopotential[1,:] .= phi .+ g * 3000.0
        SW.reset_tendencies!(vars, model.time_stepping)
        SW.parameterization!(1, vars, candidate, model)
        @test vars.scratch.grid.a[1,:] ≈ warm_Ris rtol=1e-12 atol=1e-12
        @test vars.scratch.grid.b[1,:] ≈ warm_K rtol=1e-12 atol=1e-12
        @test vars.parameterizations.boundary_layer_height[1] == warm_top
        println(JSON3.write((; surface_implementation, cold_Ri, warm_Ri, cold_top, warm_top, maxWarmKz=maximum(warm_K))))
    end
    end
    disabled = ConservativeVerticalDiffusion(sg; diffuse_momentum=false,
        diffuse_humidity=false, diffuse_static_energy=false)
    vars.parameterizations.vertical_mixing_active[1] = 1
    SW.parameterization!(1, vars, disabled, model)
    @test vars.parameterizations.vertical_mixing_active[1] == 0
end
end
