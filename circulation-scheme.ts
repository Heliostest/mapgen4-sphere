/** Explicit experimental schemes; absence retains every legacy equation. */
const schemes=['signed-pressure','full-drag','thermal-pressure','balanced-pressure','boundary-pressure'] as const;
export type CirculationScheme=typeof schemes[number];
export function isCirculationScheme(value:unknown):value is CirculationScheme {
    return typeof value==='string'&&(schemes as readonly string[]).includes(value);
}
export function fullWindDrag(scheme:CirculationScheme|undefined) {
    return scheme!==undefined&&scheme!=='signed-pressure';
}
/** Applied components are bounded by W; offsets from the old template need
 * up to sqrt((2W)²+(1.35W)²), including legitimate seasonal reversals. */
export function circulationOffsetFactor(scheme:CirculationScheme|undefined,modern:boolean) {
    return fullWindDrag(scheme)?2.5:modern?1.5:.5;
}
