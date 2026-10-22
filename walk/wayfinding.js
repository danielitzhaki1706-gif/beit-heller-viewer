import {pointInPolygon} from './navigation.js';
// Follow the clear aisle beside the furnished reception counter.
export const routePoints=data=>[data.ground.spawn,data.ground.door.center,[26.425078,.121378],[26,3.5],[25.5,4.8]];
// Loop searched on the displayed surroundings with the walking physics itself:
// it clears parked cars and curbs and was simulated end to end (about 3 min).
export const exteriorRoute=data=>[data.ground.spawn,[53,1],[44,30],[4,34],[-8,24],[-3,-1],[13,-19],[18,-20],data.ground.spawn];
export function createMap(data,canvas){
 const ctx=canvas.getContext('2d');
 const groundView=data.ground.bounds.map((v,i)=>v+(i<2?-1:1)),officeView=(()=>{
 const p=data.office.boundary;return [Math.min(...p.map(p=>p[0]))-1,Math.min(...p.map(p=>p[1]))-1,Math.max(...p.map(p=>p[0]))+1,Math.max(...p.map(p=>p[1]))+1];})();
 function draw(mode,pos,yaw,doorProgress){
 const bounds=mode==='ground'?groundView:officeView,w=200,h=180;
 canvas.width=w*2;canvas.height=h*2;ctx.scale(2,2);
 const scale=Math.min((w-20)/(bounds[2]-bounds[0]),(h-20)/(bounds[3]-bounds[1]));
 const project=p=>[10+(p[0]-bounds[0])*scale,10+(p[1]-bounds[1])*scale];
 function path(poly,fill,stroke,closed=true){ctx.beginPath();poly.forEach((p,i)=>{const q=project(p);i?ctx.lineTo(...q):ctx.moveTo(...q);});if(closed)ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.stroke();}}
 ctx.lineWidth=1;
 if(mode==='ground'){
 data.ground.buildingFootprints.forEach(p=>path(p,'#d7ddd8','#a4b3aa'));
 data.ground.regions.forEach(p=>path(p,'#b1d9cd',null));
 ctx.setLineDash([3,3]);path(routePoints(data),null,'#247264',false);ctx.setLineDash([]);
 ctx.lineWidth=3;path([data.ground.door.axis[0],data.ground.door.axis[2]],null,doorProgress>.99?'#31865a':'#b37338',false);
 }else{
 path(data.office.boundary,'#dce7df','#8b9f93');
 [...data.office.obstacles,...data.office.closedRooms.map(r=>r.polygon)].forEach(p=>path(p,'#8fa39a',null));
 }
 const p=project(pos);ctx.save();ctx.translate(...p);ctx.rotate(-yaw);
 ctx.beginPath();ctx.moveTo(0,-9);ctx.lineTo(6,6);ctx.lineTo(0,3);ctx.lineTo(-6,6);ctx.closePath();ctx.fillStyle='#134f47';ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=1.5;ctx.stroke();ctx.restore();
 }
 return {draw};
}
export function zone(data,mode,p){
 if(mode==='office')return 'משרד מוצע · קומה נפרדת';
 return pointInPolygon(p,data.ground.regions[1])?'בפנים · חלל מסחרי':'בחוץ · כניסה לחלל המסחרי';
}
