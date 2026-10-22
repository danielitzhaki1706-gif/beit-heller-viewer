/* Organized render library. Independent of the WebGL viewer. */
import {thumbImage,displayImage,imageSrcset} from './image-derivatives.js?v=20261022-r7';
const CATEGORIES = [
  {id:'exterior', label:'חוץ וחזיתות', short:'חוץ', description:'המבנה השלם והמפגש עם סביבתו הקרובה.', cover:'revision3-site-aerial-ai.png'},
  {id:'offices', label:'משרדים ועיצוב פנים', short:'משרדים', description:'סביבת עבודה, חללים משותפים, מעליות ומדרגות.', cover:'revision3-office-teams-ai.png'},
  {id:'ground', label:'כניסה ומסחר', short:'קרקע', description:'מהרחבה והכניסה אל הלובי והחנויות.', cover:'lower-arrival-lobby.png'},
  {id:'roof', label:'הגג', short:'גג', description:'המבואות, המטבחון וחדרי השירות במפלסי הגג.', cover:'roof-kitchen.png'},
  {id:'basements', label:'חניונים ומרתפים', short:'מרתפים', description:'מהמבט הכולל בכל מרתף אל החניה, הרמפות וחדרי השירות.', cover:'B03-overview.png'}
];
const element = (tag, className, text) => {
  const node=document.createElement(tag); if(className)node.className=className;
  if(text!==undefined)node.textContent=text; return node;
};
const basename = path => String(path||'').split('/').pop().split('?')[0];
const localizedTitle = title => String(title||'').replace(/\bB0([1-4])\b/g,'מרתף 0$1').replace(/משרדים 0?(\d)/g,'משרדים · קומה 0$1').replace('מרתף 04 · מבט משולב במרתף 04','מרתף 04 · מבט כולל');
const isolateInline = value => String(value||'').replace(/(?:[A-Za-z0-9]+(?:-[A-Za-z0-9]+)+|\d+[A-Za-z]+|[A-Za-z][A-Za-z0-9_-]*|[+\-−]?\d+(?:[.,]\d+)*(?:[×–]\d+(?:[.,]\d+)*)?\+?)/g,token=>`\u2066${token}\u2069`);
const viewCount = count => count===1?'מבט אחד':`${count} מבטים`;
const DEFAULT_PRIMARY_MODELS = [
  'whole_front.png','whole_aerial.png',
  'office-floor-02-interior.png','office-floor-02-overview.png',
  'lower-ground-full-overview.png','upper-ground-full-overview.png',
  'roof-full.png','roof-kitchen.png',
  'B02-overview.png','B04_parking.png'
];
const assetIdentity = row => row.contentId||row.sha256||String(row.fullSrc||row.src).split(/[?#]/)[0].replace(/^\.\//,'');
function inferCategory(row){
  const source=`${row.mode||''} ${row.src||''}`;
  if(/B0[1-4]/i.test(source))return 'basements';
  if(/roof/i.test(source))return 'roof';
  if(/ground|upper-.*shop|lower-arrival/i.test(source))return 'ground';
  if(/office|interior|stair-west/i.test(source))return 'offices';
  return 'exterior';
}
function inferGroup(row,category){
  const value=`${row.mode||''} ${row.src||''}`;
  if(category==='basements')return (value.match(/B0[1-4]/i)||['basements'])[0].toUpperCase();
  if(category==='ground')return /upper/i.test(value)?'upper-ground':'lower-ground';
  if(category==='offices'){
    if(/interior/i.test(value))return 'interior';
    const n=(value.match(/office-(?:floor-|stair-(?:east|west)-)?0?(\d)/)||[])[1];
    return n?`office-${n}`:'office-1';
  }
  return category;
}
function groupLabel(id){
  const labels={exterior:'מבטי חוץ',interior:'חלופת עיצוב למשרד',roof:'גג וחדרי שירות','lower-ground':'קרקע תחתונה','upper-ground':'קרקע עליונה'};
  return labels[id]||(/^B0\d$/.test(id)?`מרתף ${id.slice(1)}`:/^office-\d$/.test(id)?`משרדים · קומה 0${id.slice(-1)}`:id);
}
function groupOrder(id){
  if(id==='interior')return 0;
  if(id==='lower-ground')return 0;
  if(id==='upper-ground')return 1;
  return Number((id.match(/\d+/)||[0])[0])+1;
}
function normalize(row,index){
  const category=row.category||inferCategory(row), group=row.group||inferGroup(row,category);
  const caption=row.summary||String(row.caption||'').split(/(?<=[.!?])\s+/)[0];
  return {...row,id:row.id||`${category}-${index}`,category,group,kind:row.kind==='concept'?'concept':'model',
    title:localizedTitle(row.title),caption:row.caption||'',summary:caption,
    order:row.order??(/overview|whole_front/.test(row.src)?0:row.kind==='concept'?1:10+index),
    alt:row.alt||localizedTitle(row.title)};
}
export function prepareGalleryItems(renders,metadata={}){
  const overrides=metadata.overrides||[];
  const seen=new Set();
  return [...renders.map(row=>({...row,...overrides.find(x=>x.match===row.src||x.match===basename(row.src)||x.match===row.mode)})),...(metadata.additions||[])]
    .filter(row=>row.src&&row.title).map(normalize).filter(row=>{
      const key=assetIdentity(row);if(seen.has(key))return false;seen.add(key);return true;
    });
}
export function prepareGalleryCollections(items,options={}){
  const concepts=items.filter(row=>row.kind==='concept'),models=items.filter(row=>row.kind==='model');
  const selected=[],requested=options.primaryModelIds||DEFAULT_PRIMARY_MODELS;
  for(const id of requested){
    const row=models.find(item=>item.id===id||item.src===id||basename(item.src)===id);
    if(row&&!selected.includes(row))selected.push(row);
    if(selected.length===10)break;
  }
  const studio=models.filter(row=>row.studio);
  return {
    ...(studio.length?{studio:{id:'studio',title:'רינדורי הסטודיו',items:studio,aiCount:0,modelCount:studio.length}}:{}),
    primary:{id:'primary',title:'גלריה ראשית',items:[...concepts,...selected],aiCount:concepts.length,modelCount:selected.length},
    technical:{id:'technical',title:'מבטי מודל טכניים',items:models,aiCount:0,modelCount:models.length}
  };
}
export async function mountRenderGallery(root,renders,options={}){
  if(!root)return null;
  if(root.galleryController)root.galleryController.destroy();
  let metadata=options.metadata||{};
  if(!options.metadata){try{const response=await fetch(options.metadataUrl||'./assets/gallery-metadata.json',{cache:'no-cache'});if(response.ok)metadata=await response.json();}catch{/* The model render library remains available offline. */}}
  const allItems=prepareGalleryItems(renders,metadata),collections=prepareGalleryCollections(allItems,metadata.collections||{});
  let collection=collections.studio?'studio':'primary',items=collections[collection].items,categories=CATEGORIES.filter(c=>items.some(r=>r.category===c.id));
  let category='all',group='all',kind='all',visible=[],activeIndex=-1,returnFocus=null;
  root.classList.add('bh-gallery');root.replaceChildren();
  const collectionNav=element('nav','bh-gallery-collections');collectionNav.setAttribute('aria-label','בחירת ספריית תמונות');
  const toolbar=element('div','bh-gallery-toolbar'),nav=element('nav','bh-gallery-categories');nav.setAttribute('aria-label','אזורי ההדמיה');
  const content=element('div','bh-gallery-content'),status=element('p','bh-gallery-status');status.setAttribute('aria-live','polite');
  const groups=element('div','bh-gallery-groups');groups.setAttribute('role','group');groups.setAttribute('aria-label','בחירת מפלס');
  const kindSelect=element('select','bh-gallery-kind');kindSelect.setAttribute('aria-label','סוג ההדמיה');
  [['all','כל סוגי ההדמיות'],['concept','המחשות AI'],['model','מבטי מודל נבחרים']].forEach(([value,label])=>{const option=element('option','',label);option.value=value;kindSelect.append(option);});
  kindSelect.hidden=!items.some(r=>r.kind==='concept');kindSelect.onchange=()=>{kind=kindSelect.value;renderContent();};
  const tools=element('div','bh-gallery-tools');tools.append(groups,kindSelect);toolbar.append(nav,tools,status);root.append(collectionNav,toolbar,content);
  const dialog=element('dialog','bh-gallery-dialog');dialog.setAttribute('aria-label','תצוגה מלאה של ההדמיה');
  const dialogBar=element('div','bh-gallery-dialog-bar'),dialogTitle=element('h2'),close=element('button','bh-gallery-close','סגירה ×');close.type='button';close.setAttribute('aria-label','סגירת ההדמיה');
  dialogBar.append(dialogTitle,close);const imageWrap=element('div','bh-gallery-full-image'),large=element('img');large.alt='';
  const previous=element('button','bh-gallery-previous','→'),next=element('button','bh-gallery-next','←');previous.type=next.type='button';previous.setAttribute('aria-label','ההדמיה הקודמת');next.setAttribute('aria-label','ההדמיה הבאה');imageWrap.append(previous,large,next);
  const dialogMeta=element('div','bh-gallery-dialog-meta'),badge=element('span','bh-gallery-badge'),position=element('span','bh-gallery-position'),fullLink=element('a','bh-gallery-full-link','פתיחת קובץ התמונה ↗');fullLink.target='_blank';fullLink.rel='noopener';dialogMeta.append(badge,position,fullLink);
  const description=element('p','bh-gallery-description'),evidence=element('details','bh-gallery-evidence'),summary=element('summary','','בסיס ההדמיה וההשלמות'),evidenceText=element('p');evidence.append(summary,evidenceText);dialog.append(dialogBar,imageWrap,dialogMeta,description,evidence);document.body.append(dialog);
  function badgeText(row){return row.kind==='concept'?'המחשת AI · עיצוב מוצע':'מתוך המודל';}
  function showImage(index,trigger){
    if(!visible.length)return;activeIndex=(index+visible.length)%visible.length;const row=visible[activeIndex];
    if(trigger)returnFocus=trigger;dialogTitle.textContent=row.title;large.src=displayImage(row.fullSrc||row.src);large.alt=row.alt;
    badge.textContent=badgeText(row);badge.dataset.kind=row.kind;position.textContent=`${activeIndex+1} / ${visible.length}`;fullLink.href=row.fullSrc||row.src;
    description.textContent=isolateInline(row.summary||row.caption);evidenceText.textContent=isolateInline(row.caption);evidence.hidden=!row.caption||row.caption===row.summary;evidence.open=false;
    previous.hidden=next.hidden=visible.length<2;if(!dialog.open)dialog.showModal();
  }
  const closeDialog=()=>dialog.close();close.onclick=closeDialog;previous.onclick=()=>showImage(activeIndex-1);next.onclick=()=>showImage(activeIndex+1);
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
  dialog.addEventListener('close',()=>returnFocus?.focus());
  dialog.addEventListener('keydown',event=>{if(event.key==='ArrowLeft'){event.preventDefault();showImage(activeIndex+1);}if(event.key==='ArrowRight'){event.preventDefault();showImage(activeIndex-1);}});
  function renderCollections(){
    collectionNav.replaceChildren();
    Object.values(collections).forEach(entry=>{
      const button=element('button','bh-gallery-collection');button.type='button';button.dataset.galleryCollection=entry.id;
      button.setAttribute('aria-pressed',String(collection===entry.id));
      const title=element('strong','',entry.title),counts=element('span','bh-gallery-collection-count');
      counts.textContent=entry.id==='studio'?`${entry.items.length} מבטי אדריכלות · מתוך המודל`:entry.id==='primary'?isolateInline(`${entry.items.length} תמונות · ${entry.aiCount} AI · ${entry.modelCount} מבטי מודל נבחרים`):`${entry.items.length} מבטי מודל · ספריית הייחוס המלאה`;
      button.append(title,counts);button.onclick=()=>chooseCollection(entry.id);collectionNav.append(button);
    });
    root.dataset.galleryCollection=collection;root.dataset.galleryTotal=String(items.length);
    root.dataset.galleryAiCount=String(collections[collection].aiCount);root.dataset.galleryModelCount=String(collections[collection].modelCount);
  }
  function navButton(id,label,count){const b=element('button','bh-gallery-nav',label);b.type='button';b.dataset.galleryCategory=id;b.setAttribute('aria-pressed',String(category===id));if(count!==undefined)b.append(element('span','bh-gallery-count',String(count)));b.onclick=()=>chooseCategory(id);return b;}
  function renderNav(){nav.replaceChildren(navButton('home','בחירת אזור'));categories.forEach(c=>nav.append(navButton(c.id,c.short,items.filter(r=>r.category===c.id).length)));nav.append(navButton('all','הכול',items.length));}
  function renderGroups(){groups.replaceChildren();const available=[...new Set(items.filter(r=>category==='all'||r.category===category).map(r=>r.group))].sort((a,b)=>CATEGORIES.findIndex(c=>c.id===items.find(r=>r.group===a).category)-CATEGORIES.findIndex(c=>c.id===items.find(r=>r.group===b).category)||groupOrder(a)-groupOrder(b));
    groups.hidden=category==='home'||available.length<2;
    if(groups.hidden)return;
    [['all','כל המפלסים'],...available.map(id=>[id,groupLabel(id)])].forEach(([id,label])=>{const b=element('button','bh-gallery-group-button',label);b.type='button';b.dataset.galleryGroup=id;b.setAttribute('aria-pressed',String(group===id));b.onclick=()=>{group=id;renderGroups();renderContent();};groups.append(b);});
  }
  function renderCard(row){const card=element('button','bh-gallery-card');card.type='button';card.dataset.galleryId=row.id;card.dataset.galleryKind=row.kind;card.setAttribute('aria-label',`הגדלת ${row.title}`);
    const media=element('span','bh-gallery-card-media'),img=element('img');img.loading='lazy';img.decoding='async';img.alt=row.alt;img.sizes='(max-width:760px) 92vw, 46vw';img.srcset=imageSrcset(row.src);img.src=thumbImage(row.src); // lazy before src: hidden cards must not fetch
    const enlarge=element('span','bh-gallery-enlarge','הגדלה ↗');media.append(img,enlarge);
    const info=element('span','bh-gallery-card-info'),label=element('span','bh-gallery-badge',badgeText(row));label.dataset.kind=row.kind;
    info.append(label,element('strong','bh-gallery-card-title',row.title),element('span','bh-gallery-card-summary',isolateInline(row.summary)));card.append(media,info);card.onclick=()=>showImage(visible.indexOf(row),card);return card;
  }
  function renderHome(){
    const heading=element('header','bh-gallery-intro');heading.append(element('span','bh-gallery-eyebrow',collections[collection].title),element('h2','','מאיפה תרצו להתחיל?'),element('p','','בחרו אזור. בכל אזור ההדמיות מסודרות לפי מפלס, מהמבט הכולל אל החללים הפנימיים.'));content.append(heading);
    const covers=element('div','bh-gallery-covers');categories.forEach(c=>{const rows=items.filter(r=>r.category===c.id),cover=rows.filter(r=>r.cover).sort((a,b)=>a.order-b.order)[0]||rows.find(r=>basename(r.src)===c.cover)||rows[0],button=element('button','bh-gallery-cover');button.type='button';button.dataset.galleryCover=c.id;
      const img=element('img');img.loading='lazy';img.decoding='async';img.alt='';img.sizes='(max-width:760px) 92vw, 34vw';img.srcset=imageSrcset(cover.src);img.src=thumbImage(cover.src);const copy=element('span','bh-gallery-cover-copy');copy.append(element('span','bh-gallery-cover-count',viewCount(rows.length)),element('strong','',c.label),element('span','bh-gallery-cover-description',c.description),element('span','bh-gallery-cover-open','לצפייה באזור ←'));button.append(img,copy);button.onclick=()=>chooseCategory(c.id);covers.append(button);
    });content.append(covers);status.textContent=`${items.length} תמונות בספרייה זו · ${categories.length} אזורים`;kindSelect.hidden=true;root.dataset.galleryVisible='0';
  }
  function renderContent(){content.replaceChildren();if(category==='home'){visible=[];renderHome();return;}
    kindSelect.hidden=!items.some(r=>r.kind==='concept');
    visible=items.filter(r=>(category==='all'||r.category===category)&&(group==='all'||r.group===group)&&(kind==='all'||r.kind===kind));
    const cat=categories.find(c=>c.id===category),entry=collections[collection],heading=element('header','bh-gallery-section-intro');
    heading.append(element('span','bh-gallery-eyebrow',entry.title),element('h2','',cat?.label||(collection==='studio'?'המבנה. באור חדש.':collection==='primary'?'המחשות של בית הלר':'מבטי מודל טכניים')));
    const collectionSummary=collection==='studio'?'רינדורים חדשים מהגאומטריה התלת־ממדית של הפרויקט. חומרים, שמיים ותאורה מעוצבים להמחשה; סביבת הבניין מקורבת.':collection==='primary'
      ?`${entry.aiCount} מתוך ${entry.items.length} התמונות בגלריה הראשית הן המחשות AI. לצדן ${entry.modelCount} מבטי מודל נבחרים. כל ${collections.technical.items.length} מבטי המודל זמינים בספרייה הטכנית הנפרדת.`
      :`${entry.items.length} מבטי מודל מלאים להשוואה ולבחינת המבנה, הקומות והפרטים.`;
    heading.append(element('p','',isolateInline(collectionSummary)));
    if(cat)heading.append(element('p','bh-gallery-category-description',cat.description));
    if(collection==='primary')heading.append(element('p','bh-gallery-ai-note',isolateInline('תמונות AI מסומנות בכל כרטיס. הן מציעות אווירה וגמרים ועשויות לכלול השלמות ביחס למודל.')));
    content.append(heading);
    // AI imagery leads the actual default grid; the selected model references follow it.
    const splitByKind=collection==='primary'&&kind==='all';
    const groupIds=[...new Set(visible.map(r=>`${splitByKind?r.kind:'all'}/${r.category}/${r.group}`))].sort((a,b)=>{
      const [ka,ca,ga]=a.split('/'),[kb,cb,gb]=b.split('/');
      return (ka===kb?0:ka==='concept'?-1:1)||CATEGORIES.findIndex(c=>c.id===ca)-CATEGORIES.findIndex(c=>c.id===cb)||groupOrder(ga)-groupOrder(gb);
    });
    let lastKind=null;
    const ordered=[];groupIds.forEach(key=>{const [rowKind,catId,id]=key.split('/');
      if(splitByKind&&rowKind!==lastKind){const sectionTitle=element('h2','bh-gallery-kind-heading',rowKind==='concept'?'המחשות AI':'מבטי מודל נבחרים');content.append(sectionTitle);lastKind=rowKind;}
      const section=element('section','bh-gallery-section'),sectionHeader=element('header','bh-gallery-section-header'),rows=visible.filter(r=>r.group===id&&r.category===catId&&(rowKind==='all'||r.kind===rowKind)).sort((a,b)=>a.order-b.order);ordered.push(...rows);
      const code=/^B0\d$/.test(id)?id:/^office-\d$/.test(id)?`0${id.slice(-1)}`:'';
      if(code){const token=element('span','bh-gallery-floor-code',code);token.setAttribute('aria-hidden','true');sectionHeader.append(token);}
      sectionHeader.append(element('h3','',groupLabel(id)),element('span','bh-gallery-group-count',viewCount(rows.length)));const grid=element('div','bh-gallery-grid');rows.forEach(row=>grid.append(renderCard(row)));section.append(sectionHeader,grid);content.append(section);
    });visible=ordered;root.dataset.galleryVisible=String(visible.length);status.textContent=`מוצגות ${visible.length} מתוך ${items.length} תמונות · ${entry.title}`;
    if(!visible.length)content.append(element('p','bh-gallery-empty','אין הדמיות מהסוג הזה באזור הנבחר. בחרו ״כל סוגי ההדמיות״ או אזור אחר.'));
  }
  function chooseCategory(id){category=id;group='all';kind='all';kindSelect.value='all';renderNav();renderGroups();renderContent();root.scrollTop=0;}
  function chooseCollection(id){
    if(!collections[id])return;
    if(dialog.open)dialog.close();
    collection=id;items=collections[id].items;categories=CATEGORIES.filter(c=>items.some(r=>r.category===c.id));
    renderCollections();chooseCategory('all');
  }
  const workspace=root.closest('.workspace');const updateMode=()=>workspace?.classList.toggle('gallery-mode',!root.hidden);
  const observer=new MutationObserver(updateMode);observer.observe(root,{attributes:true,attributeFilter:['hidden']});updateMode();renderCollections();renderNav();renderGroups();renderContent();
  const controller={items:allItems,collections,get collection(){return collection;},get visibleItems(){return [...visible];},selectCategory:chooseCategory,selectCollection:chooseCollection,destroy(){observer.disconnect();dialog.remove();workspace?.classList.remove('gallery-mode');delete root.galleryController;}};root.galleryController=controller;return controller;
}
