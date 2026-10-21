/* UI for viewing the four source levels together. Model transforms belong to app. */
const LEVELS=['B01','B02','B03','B04'];
function element(tag,className,text){const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=text;return n;}
function button(className,text,label){const b=element('button',className,text);b.type='button';if(label)b.setAttribute('aria-label',label);return b;}

export function mountBasementControls({host,onLayout,onFocus,onGap}={}){
 if(!host)throw new Error('Basement controls require a stage host.');
 let visible=false,selected=null,layout='exploded',gap=4,busy=false,expanded=false,destroyed=false;
 const root=element('section','basement-controls');root.hidden=true;root.dir='rtl';root.setAttribute('aria-label','בקרי ארבעת מפלסי המרתף');
 const panel=element('aside','bc-panel'),header=element('header','bc-header'),copy=element('div','bc-heading'),title=element('h3','bc-title');
 copy.append(element('span','bc-eyebrow','מרחב המרתפים'),title,element('span','bc-peek-note','הפרדה לצפייה בלבד'));
 const toggle=button('bc-sheet-toggle','התאמה','פתיחת בקרי המרתפים');toggle.setAttribute('aria-controls','basement-controls-body');toggle.setAttribute('aria-expanded','false');header.append(copy,toggle);
 const body=element('div','bc-body');body.id='basement-controls-body';
 const layoutLabel=element('p','bc-section-label','אופן ההצגה'),layoutGroup=element('div','bc-layout');layoutGroup.setAttribute('role','group');layoutGroup.setAttribute('aria-label','אופן הצגת המרתפים');
 const layoutButtons=new Map();for(const [id,label]of [['assembled','מורכב'],['exploded','מפורק']]){const b=button('bc-layout-button',label);b.dataset.layout=id;b.onclick=()=>{setLayout(id);onLayout?.(id);};layoutGroup.append(b);layoutButtons.set(id,b);}
 const floorLabel=element('p','bc-section-label','התמקדות במפלס'),floorHeading=element('div','bc-floor-heading'),allFloors=button('bc-all-levels','כל המפלסים'),floorGroup=element('div','bc-levels');floorGroup.setAttribute('role','group');floorGroup.setAttribute('aria-label','בחירת מפלס במבט המשותף');floorHeading.append(floorLabel,allFloors);allFloors.onclick=()=>chooseFocus(null);
 const floorButtons=new Map();LEVELS.forEach((id,index)=>{const b=button('bc-level',id,`התמקדות במפלס ${id}`);b.dir='ltr';b.dataset.floorId=id;b.onclick=()=>chooseFocus(id);b.addEventListener('keydown',event=>{const delta=event.key==='ArrowLeft'?1:event.key==='ArrowRight'?-1:0;if(delta){event.preventDefault();floorButtons.get(LEVELS[(index+delta+LEVELS.length)%LEVELS.length])?.focus();}});floorGroup.append(b);floorButtons.set(id,b);});
 const gapBox=element('div','bc-gap'),gapHeading=element('div','bc-gap-heading'),gapLabel=element('label','','מרווח תצוגה'),gapValue=element('output','bc-gap-value');gapLabel.htmlFor='basement-display-gap';gapValue.setAttribute('for','basement-display-gap');gapValue.dir='ltr';gapHeading.append(gapLabel,gapValue);
 const slider=element('input','bc-gap-slider');slider.type='range';slider.min='0';slider.max='8';slider.step='.5';slider.value=String(gap);slider.id='basement-display-gap';slider.dir='ltr';slider.setAttribute('aria-label','מרווח תצוגה בין המפלסים במטרים');slider.oninput=()=>{gap=Number(slider.value);renderGap();onGap?.(gap);};
 const gapEnds=element('div','bc-gap-ends');gapEnds.dir='ltr';gapEnds.append(element('span','','0'),element('span','','8 מ׳'));gapBox.append(gapHeading,slider,gapEnds);
 const note=element('p','bc-source-note','ההפרדה אנכית לצפייה; גבהי המקור נשמרים במצב מורכב.'),loading=element('p','bc-busy','טוענים את ארבעת המפלסים…');loading.setAttribute('role','status');loading.hidden=true;
 body.append(layoutLabel,layoutGroup,floorHeading,floorGroup,gapBox,note,loading);panel.append(header,body);root.append(panel);host.append(root);

 function setExpanded(value){expanded=!!value;root.dataset.expanded=String(expanded);toggle.setAttribute('aria-expanded',String(expanded));toggle.textContent=expanded?'סגירה ×':'התאמה';toggle.setAttribute('aria-label',expanded?'סגירת בקרי המרתפים':'פתיחת בקרי המרתפים');}
 toggle.onclick=()=>setExpanded(!expanded);
 function chooseFocus(id){const restoreFocus=expanded&&toggle.offsetParent!==null;selected=id;setExpanded(false);render();if(restoreFocus)toggle.focus({preventScroll:true});onFocus?.(id);}
 function renderGap(){slider.value=String(gap);gapValue.value=`${gap.toFixed(1)} מ׳`;gapValue.textContent=gapValue.value;slider.setAttribute('aria-valuetext',`${gap.toFixed(1)} מטר מרווח תצוגה`);}
 function render(){
  title.textContent=`ארבעה מפלסים · מבט ${layout==='exploded'?'מפורק':'מורכב'}`;root.dataset.layout=layout;root.setAttribute('aria-busy',String(busy));
  for(const [id,b]of layoutButtons){b.setAttribute('aria-pressed',String(layout===id));b.disabled=busy;}
  allFloors.setAttribute('aria-pressed',String(selected===null));allFloors.disabled=busy;floorGroup.dataset.focused=String(selected!==null);
  for(const [id,b]of floorButtons){b.setAttribute('aria-pressed',String(selected===id));b.disabled=busy;}
  slider.disabled=busy||layout==='assembled';gapBox.dataset.disabled=String(slider.disabled);loading.hidden=!busy;renderGap();
 }
 function setLayout(value){if(!['assembled','exploded'].includes(value))return;layout=value;render();}
 const onKey=event=>{if(visible&&expanded&&event.key==='Escape'&&!document.querySelector('dialog[open]')){setExpanded(false);toggle.focus({preventScroll:true});}};document.addEventListener('keydown',onKey);
 setExpanded(false);render();
 return{
  setVisible(value){if(destroyed)return;visible=!!value;root.hidden=!visible;document.body.classList.toggle('floor-stack-active',visible);if(!visible)setExpanded(false);},
  setSelection(id){if(id!==null&&!LEVELS.includes(id))return;selected=id;render();},
  setLayout,
  setGap(value){if(!Number.isFinite(Number(value)))return;gap=Math.round(Math.min(8,Math.max(0,Number(value)))*2)/2;renderGap();},
  setBusy(value){busy=!!value;render();},
  snapshot(){const r=panel.getBoundingClientRect();return{visible,selected,layout,gap,busy,expanded,bounds:{x:r.x,y:r.y,width:r.width,height:r.height}};},
  destroy(){destroyed=true;document.removeEventListener('keydown',onKey);document.body.classList.remove('floor-stack-active');root.remove();}
 };
}
