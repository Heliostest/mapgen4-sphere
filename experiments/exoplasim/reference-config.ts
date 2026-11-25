/** Keep reference-run configuration in one place for the runner and its
 * actual-WASM initialization regression. Native initialization has side effects
 * independent of the glacier evolution switch. */
export function referenceConfig<T extends {glaciers:{enabled:boolean;minDepthM:number;initialHeightM:number}}>(defaults:T,input:object):T {
 return {...defaults,...input,timestepMinutes:45,earthSurfaceClimatology:false,targetTemperatureK:null,
  // Native glacierini tests ICESHEETH >= 0 before NGLACIER; zero still seeds
  // glacier flags on nonzero terrain. -1 is the native no-forced-sheet sentinel.
  glaciers:{enabled:false,minDepthM:2,initialHeightM:-1}};
}
