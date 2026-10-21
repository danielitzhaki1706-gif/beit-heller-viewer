/* Screenshot comparisons preserve each complete source image. */
for(const comparison of document.querySelectorAll('[data-comparison]')){
 const frame=comparison.querySelector('[data-frame]'),range=comparison.querySelector('input[type=range]'),output=comparison.querySelector('[data-output]');
 let pointer=null;
 const paint=value=>{
  const number=Math.max(0,Math.min(100,Math.round(Number(value)||0)));range.value=String(number);comparison.style.setProperty('--split',`${number}%`);comparison.dataset.endpoint=number===0?'before':number===100?'after':'mixed';range.setAttribute('aria-valuetext',`${number}% מהתצוגה החדשה`);output.value=`${number}% אחרי`;output.textContent=output.value;
 };
 const at=clientX=>{const rect=frame.getBoundingClientRect();paint((clientX-rect.left)/Math.max(1,rect.width)*100);};
 range.addEventListener('input',()=>paint(range.value));
 frame.addEventListener('pointerdown',event=>{
  if(event.pointerType==='mouse'&&event.button!==0)return;
  pointer={id:event.pointerId,x:event.clientX,y:event.clientY,active:event.pointerType!=='touch'};
  if(pointer.active){frame.setPointerCapture(event.pointerId);at(event.clientX);event.preventDefault();}
 });
 frame.addEventListener('pointermove',event=>{
  if(!pointer||pointer.id!==event.pointerId)return;
  if(!pointer.active){const dx=Math.abs(event.clientX-pointer.x),dy=Math.abs(event.clientY-pointer.y);if(dx>8&&dx>dy*1.2){pointer.active=true;frame.setPointerCapture(event.pointerId);}else return;}
  at(event.clientX);event.preventDefault();
 });
 const release=event=>{if(!pointer||pointer.id!==event.pointerId)return;const active=pointer.active;pointer=null;if(frame.hasPointerCapture(event.pointerId))frame.releasePointerCapture(event.pointerId);if(active)range.dispatchEvent(new Event('change',{bubbles:true}));};
 frame.addEventListener('pointerup',release);frame.addEventListener('pointercancel',release);frame.addEventListener('lostpointercapture',()=>{pointer=null;});
 paint(range.value);
}
