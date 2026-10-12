// A navigation destination owns its initial reveal mode. Orbiting never resets it.
const denseRegion = /(?:stair|elevator|lift|pump|plant|reservoir|storage|transformer|electrical|machine)/i;
export function revealDefault({tab='building',mode='exterior',region=null,view=null}={}) {
  if(tab==='building'||tab==='tour'&&mode==='exterior') return 'solid';
  if(region?.revealDefault) return region.revealDefault;
  if(view?.revealDefault) return view.revealDefault;
  if(region?.id==='overview') return 'solid';
  if(denseRegion.test(`${region?.id||''} ${mode}`)) return 'auto';
  // Every ordinary floor destination starts with full walls, including close,
  // low-angle office and retail views. Camera angle is not a reveal preference.
  if(tab==='floors') return 'solid';
  if(['services','meeting-full','core-full','deck','upper-core','systems-full'].includes(region?.id)) return 'solid';
  if(region?.kind==='3d') return 'solid';
  if(view?.position&&view?.target) {
    const [x,y,z]=view.position.map((n,i)=>n-view.target[i]);
    if(y>5&&y/Math.hypot(x,y,z)>.45) return 'solid';
  }
  return 'auto';
}
