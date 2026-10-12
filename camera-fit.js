// Preserve the source view's horizontal extent on portrait displays.
// Never narrow the original vertical field of view on wide screens.
export function responsiveFov(verticalDegrees, referenceAspect, actualAspect) {
  if (![verticalDegrees, referenceAspect, actualAspect].every(Number.isFinite) || actualAspect <= 0 || referenceAspect <= 0) throw new RangeError('Invalid camera framing');
  const tangent = Math.tan(verticalDegrees * Math.PI / 360);
  return 360 / Math.PI * Math.atan(tangent * Math.max(1, referenceAspect / actualAspect));
}
