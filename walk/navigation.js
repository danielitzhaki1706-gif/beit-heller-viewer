// Metre-scale 2D capsule-footprint navigation. No Three.js dependency.
const valid=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite);
export function segmentDistance(p,a,b){const dx=b[0]-a[0],dz=b[1]-a[1],l=dx*dx+dz*dz,t=l?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/l)):0;return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dz);}
export function pointInPolygon(p,poly){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if(segmentDistance(p,a,b)<1e-8)return true;if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
export function createNavigator({isAllowedPoint,obstacles=[],radius=.25,step=.04}){
 if(typeof isAllowedPoint!=='function'||!(radius>0)||!(step>0)||!Number.isFinite(radius+step))throw Error('Invalid navigator');
 const edges=obstacles.flatMap(poly=>poly.map((a,i)=>[a,poly[(i+1)%poly.length]]));
 function canOccupy(p,extraSegments=[]){
  if(!valid(p)||!isAllowedPoint(p))return false;
  // Union evaluated before circle samples: adjacent regions do not create false seams.
  // Boundary sampling is an interaction approximation, not a certified clearance test.
  for(const ring of [radius*.5,radius+.001])for(let i=0;i<48;i++){const a=i*Math.PI/24;if(!isAllowedPoint([p[0]+Math.cos(a)*ring,p[1]+Math.sin(a)*ring]))return false;}
  if(obstacles.some(poly=>pointInPolygon(p,poly)))return false;
  return !edges.concat(extraSegments).some(([a,b])=>segmentDistance(p,a,b)<radius-1e-7);
 }
 function move(position,delta,extraSegments=[]){
  if(!valid(position)||!valid(delta))throw Error('Finite position and delta required');
  const length=Math.hypot(...delta);if(length>20)throw Error('Movement must be a bounded frame step');
  const count=Math.max(1,Math.ceil(length/step)),d=delta.map(v=>v/count);let p=[...position],blocked=false;
  for(let i=0;i<count;i++){
   const next=[p[0]+d[0],p[1]+d[1]];
   if(canOccupy(next,extraSegments)){p=next;continue;}
   blocked=true;
   // Prefer the longer component when sliding; never move through the obstacle.
   const axes=Math.abs(d[0])>=Math.abs(d[1])?[0,1]:[1,0];
   for(const axis of axes){const candidate=[...p];candidate[axis]+=d[axis];if(canOccupy(candidate,extraSegments))p=candidate;}
  }
  return {position:p,blocked};
 }
 return {canOccupy,move};
}
