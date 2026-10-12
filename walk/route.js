import {createNavigator,pointInPolygon} from './navigation.js';
export function navigators(data){
 const g=data.ground,b=g.bounds;
 return {
  ground:createNavigator({radius:data.radius,isAllowedPoint:p=>g.regions.some(poly=>pointInPolygon(p,poly))||(p[0]>b[0]&&p[0]<b[2]&&p[1]>b[1]&&p[1]<b[3]&&!g.buildingFootprints.some(poly=>pointInPolygon(p,poly)))}),
  office:createNavigator({radius:data.radius,isAllowedPoint:p=>pointInPolygon(p,data.office.boundary),obstacles:[...data.office.obstacles,...data.office.closedRooms.map(r=>r.polygon)]})
 };
}
export function doorSegments(door,progress){
 const shift=(p,s)=>p.map((v,i)=>v+door.tangent[i]*door.travel*progress*s);
 const [a,c,b]=door.axis;
 return progress<.999?[[a,b]]:[[shift(a,-1),shift(c,-1)],[shift(c,1),shift(b,1)]];
}
