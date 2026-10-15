/** Neutral bulk water-vapor exchange, kg/m²/s of open ocean.
 * E = C_E |U| rho_air (q_sat(T_sea) - q_air).
 * The dilute-vapor ideal-gas approximation cancels surface pressure. Relative
 * humidity is supplied by the column model; it is not an observed 2 m humidity.
 * Saturation pressure uses the FAO-56 Tetens relation, bounded outside its
 * terrestrial working range. No stability, gustiness, dew or spray scheme.
 * https://www.fao.org/4/X0490E/x0490e07.htm
 * https://pmel.noaa.gov/ocs/flux-documentation
 */
export function bulkOceanEvaporation(airK:number,seaK:number,relativeHumidity:number,windMps:number,coefficient:number):number {
    const vaporPressure=(t:number)=>{
        const c=Math.max(-80,Math.min(60,t-273.15));
        return 610.8*Math.exp(17.27*c/(c+237.3));
    };
    const deficit=Math.max(0,vaporPressure(seaK)-Math.max(0,relativeHumidity)*vaporPressure(airK));
    return coefficient*Math.abs(windMps)*.622*deficit/(287.05*Math.max(180,airK));
}
