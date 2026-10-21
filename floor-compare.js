/* Independent source plate: no registration, scene mutation or camera ownership. */
function node(tag,className,text){const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=text;return n;}
function control(className,text,label){const n=node('button',className,text);n.type='button';n.setAttribute('aria-label',label||text);return n;}
function sourceURL(value){if(typeof value!=='string'||!value.trim())return null;try{const url=new URL(value,document.baseURI);return ['http:','https:','file:'].includes(url.protocol)?url.href:null;}catch{return null;}}

export function mountFloorCompare({host,onClose}={}){
 if(!host)throw new Error('Floor comparison requires a stage host.');
 let opened=false,loaded=false,zoom=1,source=null,previousFocus=null,destroyed=false;
 const root=node('section','floor-compare');root.hidden=true;root.dir='rtl';root.setAttribute('aria-label','השוואת מקור ומודל');
 const panel=node('section','fc-source-panel');panel.setAttribute('aria-label','תוכנית המקור להשוואה');
 const header=node('header','fc-header'),copy=node('div','fc-heading'),title=node('h3','fc-title'),closeButton=control('fc-close','×','סגירת ההשוואה');
 copy.append(node('span','fc-eyebrow','תוכנית מקור'),title);header.append(copy,closeButton);
 const sourceNote=node('p','fc-source-note');
 const tools=node('div','fc-tools');tools.setAttribute('role','group');tools.setAttribute('aria-label','הגדלת תוכנית המקור');
 const decrease=control('fc-zoom','−','הקטנת תוכנית המקור'),increase=control('fc-zoom','+','הגדלת תוכנית המקור'),fit=control('fc-fit','התאמה','התאמת כל התוכנית למסגרת'),amount=node('output','fc-zoom-value','100%');amount.setAttribute('aria-label','הגדלה יחסית למסגרת');
 const sourceLink=node('a','fc-source-link','מקור מלא ↗');sourceLink.target='_blank';sourceLink.rel='noopener';
 tools.append(increase,amount,decrease,fit,sourceLink);
 const area=node('div','fc-image-area');area.tabIndex=0;area.setAttribute('aria-label','תוכנית המקור; לאחר הגדלה אפשר לגלול בתוכנית');
 const imageCanvas=node('div','fc-image-canvas'),image=node('img','fc-source-image');image.decoding='async';image.draggable=false;image.hidden=true;imageCanvas.append(image);
 const status=node('p','fc-image-status');status.setAttribute('role','status');area.append(imageCanvas,status);
 const footer=node('p','fc-alignment-note','התוכנית והמודל מוצגים זה לצד זה.');
 panel.append(header,sourceNote,tools,area,footer);
 const modelCaption=node('div','fc-model-caption');modelCaption.append(node('span','fc-eyebrow','מודל תלת־ממדי'),node('span','','ריהוט וחומרים להמחשה'));
 root.append(panel,modelCaption);host.append(root);

 function updateZoom(){
  amount.value=`${Math.round(zoom*100)}%`;amount.textContent=amount.value;decrease.disabled=!loaded||zoom<=1;increase.disabled=!loaded||zoom>=4;fit.disabled=!loaded||zoom===1;
  if(!opened||!loaded)return;
  const width=Math.max(1,area.clientWidth-24),height=Math.max(1,area.clientHeight-24),ratio=Math.min(width/image.naturalWidth,height/image.naturalHeight),scaledWidth=Math.max(1,image.naturalWidth*ratio*zoom),scaledHeight=Math.max(1,image.naturalHeight*ratio*zoom);
  image.style.width=`${scaledWidth}px`;image.style.height=`${scaledHeight}px`;imageCanvas.style.width=`${Math.max(area.clientWidth,scaledWidth+24)}px`;imageCanvas.style.height=`${Math.max(area.clientHeight,scaledHeight+24)}px`;
 }
 function changeZoom(value){zoom=Math.max(1,Math.min(4,value));updateZoom();area.scrollLeft=Math.max(0,(area.scrollWidth-area.clientWidth)/2);area.scrollTop=Math.max(0,(area.scrollHeight-area.clientHeight)/2);}
 increase.onclick=()=>changeZoom(zoom+.5);decrease.onclick=()=>changeZoom(zoom-.5);fit.onclick=()=>changeZoom(1);
 image.onload=()=>{if(!opened)return;loaded=image.naturalWidth>0;image.hidden=!loaded;status.hidden=loaded;updateZoom();};
 image.onerror=()=>{loaded=false;image.hidden=true;status.hidden=false;status.textContent='לא ניתן להציג כאן את התוכנית. אפשר לפתוח את המקור המלא.';updateZoom();};
 const observer=new ResizeObserver(()=>{if(opened)updateZoom();});observer.observe(area);
 function close(){if(!opened)return;const restoreFocus=root.contains(document.activeElement);opened=false;root.hidden=true;document.body.classList.remove('floor-compare-active');if(restoreFocus&&previousFocus?.isConnected)previousFocus.focus({preventScroll:true});}
 function closeFromControl(){close();onClose?.();}
 closeButton.onclick=closeFromControl;
 const onKey=event=>{if(opened&&event.key==='Escape'&&!document.querySelector('dialog[open]')){event.preventDefault();closeFromControl();}};document.addEventListener('keydown',onKey);
 function modelBounds(){const target=document.getElementById('viewport');if(!target)return null;const r=target.getBoundingClientRect(),h=host.getBoundingClientRect();return{x:r.left-h.left,y:r.top-h.top,width:r.width,height:r.height};}
 function relativeBounds(element){const r=element.getBoundingClientRect(),h=host.getBoundingClientRect();return{x:r.left-h.left,y:r.top-h.top,width:r.width,height:r.height};}
 updateZoom();
 return{
  open({href,label='תוכנית המקור',note=''}={}){
   if(destroyed)return false;const url=sourceURL(href);if(!url)return false;
   const first=!opened;source={href:url,label:String(label),note:String(note||'')};if(first)previousFocus=document.activeElement;
   opened=true;loaded=false;zoom=1;root.hidden=false;document.body.classList.add('floor-compare-active');title.textContent=source.label;sourceNote.textContent=source.note;sourceNote.hidden=!source.note;sourceLink.href=url;image.alt=`${source.label} · מסמך המקור`;image.hidden=true;imageCanvas.style.width='100%';imageCanvas.style.height='100%';status.hidden=false;status.textContent='טוענים את תוכנית המקור…';area.scrollTo(0,0);
   if(/\.pdf(?:[?#]|$)/i.test(url)){image.removeAttribute('src');status.textContent='את המסמך הזה אפשר לקרוא דרך הקישור למקור המלא.';}else image.src=url;
   updateZoom();if(first)closeButton.focus({preventScroll:true});return true;
  },
  close,
  get isOpen(){return opened;},
  getModelBounds:modelBounds,
  resize:updateZoom,
  snapshot(){return{open:opened,loaded,zoom,source:source?{...source}:null,bounds:{source:relativeBounds(panel),model:modelBounds(),image:relativeBounds(area)}};},
  destroy(){destroyed=true;close();observer.disconnect();document.removeEventListener('keydown',onKey);image.onload=null;image.onerror=null;root.remove();}
 };
}
