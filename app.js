import {W,H,PHOTO_ZOOM_MIN,PHOTO_ZOOM_MAX,PHOTO_PAN_LIMIT,clampPhotoZoom,FRAMES,FIELD_DEFS,TYPE_NAMES,clamp,distance,coverScale,snapEnd,snapDirection,moveSelection,angleInfo,markBounds,hitMark,defaultState,copyState,validateProject,uid} from './core.js';
import {createViewport} from './viewport.js';

const $=id=>document.getElementById(id);
const ICONS={
  undo:'M9 5 4 10l5 5M4 10h10a6 6 0 0 1 0 12',redo:'m15 5 5 5-5 5m5-5H10a6 6 0 0 0 0 12',folder:'M3 7V5a1 1 0 0 1 1-1h5l2 3h9a1 1 0 0 1 1 1v11H3Z',save:'M5 3h12l4 4v14H3V3Zm2 0v6h9V3M7 21v-8h10v8',download:'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',image:'M3 3h18v18H3ZM3 16l5-5 4 4 4-6 5 7M9 7h.01',plus:'M12 5v14M5 12h14',minus:'M5 12h14',fit:'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M8 8h8v8H8Z',trash:'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',hand:'M8 12V5a2 2 0 0 1 4 0v7-9a2 2 0 0 1 4 0v9-6a2 2 0 0 1 4 0v10c0 4-3 6-7 6-3 0-5-2-7-5l-3-4a2 2 0 0 1 3-3l2 2',shield:'M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6Zm-4 9 3 3 5-6',cursor:'M5 3v17l5-5 4 7 3-2-4-7h7Z',line:'M4 20 20 4',dashed:'m4 20 3-3m3-3 4-4m3-3 3-3',arrow:'M4 20 20 4M10 4h10v10',doubleArrow:'M4 20 20 4M10 4h10v10M4 10v10h10',curve:'M4 20C4 5 10 4 20 4M14 1l6 3-3 6',angle:'M3 5v15h18M3 12a8 8 0 0 1 8 8',ellipse:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18',rect:'M4 4h16v16H4Z',brush:'m14 5 4-3 4 4-11 11-4-4 7-8M7 13c-4 0-4 5-5 8 4 0 8-1 8-5',text:'M4 4h16M12 4v17M7 21h10M4 7V4m16 3V4',palette:'M12 3a9 9 0 0 0 0 18h2c3 0 3-4 1-4-1-2 0-3 2-3h1c6 0 3-11-6-11ZM7 10h.01M10 6h.01M16 7h.01M6 15h.01',spark:'m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z',close:'m6 6 12 12M6 18 18 6'};
function icon(name){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.65');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('width','20');svg.setAttribute('height','20');const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',ICONS[name]||ICONS.image);svg.append(path);return svg;}
document.querySelectorAll('[data-icon]').forEach(el=>el.append(icon(el.dataset.icon)));

let state=defaultState(),activePhoto=0,tool='select',selected=null,selectedPhoto=null,activeTab='photos',guides=true;
let autoSnap=true,snapHint=null,nudgeToken=null;
let undoStack=[],redoStack=[],drag=null,draft=null,anglePoints=[],hoverPoint=null,overlayKey=null;
let db=null,saveTimer=null,toastTimer=null,loading=false,saveFailed=false;
const imageCache=new Map(),canvas=$('canvas'),ctx=canvas.getContext('2d'),poster=$('poster');
const baseImage=new Image();
const fieldPlaceholders={improvement:'改善：填写本次调整的部位、变化与记录'};
const toolHints={select:['选择 / 移动','拖动照片调整构图 · 点击模板文字编辑'],line:['绘制直线','自动吸附水平、垂直及每隔 22.5° 的方向 · Alt 暂时自由调整'],dashed:['绘制虚线','自动吸附标准方向 · 选择后可用方向键微调'],arrow:['绘制箭头','拖动时自动吸附 22.5° 方向 · Alt 自由调整'],doubleArrow:['绘制双向箭头','拖动时自动吸附标准方向 · 调整端点同样生效'],curve:['绘制弧线','拖出弧线两端 · 完成后拖动中间控制点调整弯曲'],angle:['绘制角度','依次点击起点、顶点、终点 · Esc 取消'],ellipse:['绘制圆圈','拖动框选关注部位 · 按住 Shift 绘制正圆'],rect:['绘制矩形','拖动框选关注部位 · 按住 Shift 绘制正方形'],brush:['自由画笔','按住拖动自由绘制 · 选择后可移动整条笔迹'],text:['添加标记文字','点击画布放置文字 · 在左侧修改内容和字号']};

function toast(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').classList.add('show');toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3200);}
function fingerprint(s){return JSON.stringify({...s,photos:s.photos.map(p=>p?{...p,src:p.id}:null)});}
function checkpoint(){const snap=copyState(state);if(!undoStack.length||fingerprint(undoStack.at(-1))!==fingerprint(snap)){undoStack.push(snap);if(undoStack.length>25)undoStack.shift();}redoStack=[];syncHistory();}
function syncHistory(){$('undo').disabled=!undoStack.length;$('redo').disabled=!redoStack.length;}
function reconcileSelection(){if(selected&&!state.marks.some(m=>m.id===selected))selected=null;if(selectedPhoto!==null&&!state.photos[selectedPhoto])selectedPhoto=null;}
async function undo(){if(!undoStack.length)return;finishOverlay();redoStack.push(copyState(state));state=undoStack.pop();reconcileSelection();draft=null;anglePoints=[];clearSnap();await loadAllImages();syncAll();changed();}
async function redo(){if(!redoStack.length)return;finishOverlay();undoStack.push(copyState(state));state=redoStack.pop();reconcileSelection();clearSnap();await loadAllImages();syncAll();changed();}
function changed(){syncInteractionHint();render();syncHistory();scheduleSave();}
function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open('natie-posture-editor',1);r.onupgradeneeded=()=>r.result.createObjectStore('drafts');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function dbRead(){return new Promise((resolve,reject)=>{const r=db.transaction('drafts').objectStore('drafts').get('current');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function dbWrite(data){return new Promise((resolve,reject)=>{const t=db.transaction('drafts','readwrite');t.objectStore('drafts').put(data,'current');t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error);});}
function scheduleSave(){if(!db)return;clearTimeout(saveTimer);$('saveState').classList.add('dirty');$('saveState').lastChild.textContent=' 正在保存…';saveTimer=setTimeout(async()=>{try{await dbWrite(copyState(state));$('saveState').classList.remove('dirty');$('saveState').lastChild.textContent=' 已自动保存';saveFailed=false;}catch(e){$('saveState').lastChild.textContent=' 请另存项目';if(!saveFailed)toast('浏览器存储空间不足，请使用「保存项目」备份');saveFailed=true;}},550);}
function loadImage(src){return new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error('图片格式暂不支持，请转换为 JPG 或 PNG'));im.src=src;});}
async function loadAllImages(){for(const p of state.photos){if(p&&!imageCache.has(p.id))imageCache.set(p.id,await loadImage(p.src));}}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),20000);}
async function loadPhoto(file,index){
  if(!file)return;if(file.size>35e6){toast('照片过大，请选择小于 35 MB 的图片');return;}
  if(!file.type.startsWith('image/')){toast('请选择 JPG、PNG 或 WebP 图片');return;}
  loading=true;
  try{const fileURL=URL.createObjectURL(file);let im;try{im=await loadImage(fileURL);}finally{URL.revokeObjectURL(fileURL);}
    const size=Math.min(1,2400/Math.max(im.naturalWidth,im.naturalHeight)),c=document.createElement('canvas');c.width=Math.round(im.naturalWidth*size);c.height=Math.round(im.naturalHeight*size);const cx=c.getContext('2d');cx.fillStyle='#ffffff';cx.fillRect(0,0,c.width,c.height);cx.drawImage(im,0,0,c.width,c.height);const src=c.toDataURL('image/jpeg',.95),id=uid(),normalized=await loadImage(src);
    checkpoint();state.photos[index]={id,src,name:file.name,width:c.width,height:c.height,zoom:1,dx:0,dy:0,rotation:0};imageCache.set(id,normalized);selectPhoto(index);syncPhotos();changed();toast(index===0?'前照片已插入，可拖动调整构图':'后照片已插入，可拖动调整构图');
  }catch(e){toast(e.message||'无法读取照片，请换一张试试');}finally{loading=false;$(`file${index}`).value='';}
}
function selectPhoto(i){finishOverlay();activePhoto=i;selected=null;selectedPhoto=state.photos[i]?i:null;setTool('select',false);switchTab('photos');syncPhotos();syncInteractionHint();render();canvas.focus({preventScroll:true});}
function syncPhotos(){
  document.querySelectorAll('.photo-card').forEach(el=>el.classList.toggle('active',Number(el.dataset.photo)===activePhoto));
  state.photos.forEach((p,i)=>{const thumb=$(`thumb${i}`);thumb.replaceChildren();if(p){const image=document.createElement('img');image.src=p.src;image.alt=i?'后照片缩略图':'前照片缩略图';thumb.append(image);}else thumb.append(icon('image'));$(`photoName${i}`).textContent=p?p.name:'点击上传，或拖入图片';});
  $('activePhotoName').textContent=activePhoto?'后':'前';const p=state.photos[activePhoto];$('photoZoom').value=p?Math.round(p.zoom*100):100;$('photoZoomNumber').value=p?Math.round(p.zoom*100):100;$('photoZoomValue').textContent=`${p?Math.round(p.zoom*100):100}%`;$('photoRotation').value=p?.rotation||0;$('photoRotationValue').textContent=`${Number(p?.rotation||0).toFixed(1).replace('.0','')}°`;
  ['photoZoom','photoZoomNumber','photoRotation','resetPhoto','removePhoto'].forEach(id=>$(id).disabled=!p);$('photoZoomOut').disabled=!p||p.zoom<=PHOTO_ZOOM_MIN;$('photoZoomIn').disabled=!p||p.zoom>=PHOTO_ZOOM_MAX;
}
function switchTab(tab){activeTab=tab;document.querySelectorAll('[data-tab]').forEach(el=>{const active=el.dataset.tab===tab;el.classList.toggle('active',active);el.setAttribute('aria-selected',String(active));});['photos','text','marks'].forEach(t=>$('panel'+t[0].toUpperCase()+t.slice(1)).hidden=t!==tab);}
function syncFields(){for(const d of FIELD_DEFS)$('field-'+d.key).value=state.fields[d.key];$('improvementCount').textContent=`${state.fields.improvement.length} / 180`;}
function selectedMark(){return state.marks.find(m=>m.id===selected);}
function syncInteractionHint(){
  if(tool==='angle'&&anglePoints.length)return;
  let hint=toolHints[tool][1];
  if(tool==='select'){
    const mark=selectedMark();
    hint=mark?`已选${TYPE_NAMES[mark.type]} · 方向键 1 px · Shift + 方向键 10 px`:selectedPhoto!==null&&state.photos[selectedPhoto]?`已选${selectedPhoto?'后':'前'}照片 · 方向键 1 px · Shift + 方向键 10 px`:'选择图片或标记后用方向键微调 · Ctrl + 滚轮缩放 · 空格拖动画布';
  }
  if($('interactionHint').textContent!==hint)$('interactionHint').textContent=hint;
}
function clearSnap(){snapHint=null;$('snapStatus').hidden=true;}
function alignEnd(anchor,p,event){
  const result=snapDirection(anchor,p,{enabled:autoSnap,force:event.shiftKey,disabled:event.altKey});
  snapHint=result.snapped?{anchor:{...anchor},end:result.point,degrees:result.degrees}:null;
  const status=$('snapStatus');status.hidden=!result.snapped;
  if(result.snapped){const label=`已吸附 · ${result.degrees===0?'水平 0°':result.degrees===90?'垂直 90°':result.degrees+'°'}`;if(status.textContent!==label)status.textContent=label;}
  return result.point;
}
function syncStyles(){const m=selectedMark(),s=m||state.styles;$('markColor').value=s.color;$('markWidth').value=s.width;$('markWidthValue').textContent=`${s.width} px`;$('markArrow').value=s.arrow||'none';$('markFontSize').value=s.fontSize||26;$('markFontSizeValue').textContent=`${s.fontSize||26} px`;document.querySelectorAll('[data-color]').forEach(el=>el.classList.toggle('chosen',el.dataset.color===s.color));document.querySelectorAll('[data-dash]').forEach(el=>el.classList.toggle('active',el.dataset.dash===s.dash));$('selectedMarkLabel').textContent=m?`已选择 · ${TYPE_NAMES[m.type]}`:'应用于新标记';$('markTextField').hidden=m?.type!=='text';$('markFontControl').hidden=m?.type!=='text';if(m?.type==='text')$('markText').value=m.text||'';$('deleteMark').disabled=!m;if(m?.type==='curve'&&tool==='select'){$('toolTipTitle').textContent='调整弧线';$('toolTipText').textContent='拖动黄色控制点调整弯曲程度，拖动两端白色控制点调整方向。';}}
function syncMarks(){
  $('markCount').textContent=state.marks.length;const list=$('markList');list.replaceChildren();if(!state.marks.length){const e=document.createElement('div');e.className='empty';e.textContent='还没有标记\n选择上方工具，在画布上绘制';e.style.whiteSpace='pre-line';list.append(e);}
  state.marks.forEach((m,i)=>{const row=document.createElement('div');row.className='mark-row'+(m.id===selected?' active':'');const dot=document.createElement('span');dot.className='mark-dot';dot.style.background=m.color;const choose=document.createElement('button');choose.textContent=`${String(i+1).padStart(2,'0')}  ${m.type==='text'?m.text||'文字':TYPE_NAMES[m.type]}`;choose.onclick=()=>{selected=m.id;selectedPhoto=null;setTool('select',false);syncStyles();syncMarks();syncInteractionHint();render();canvas.focus({preventScroll:true});};const del=document.createElement('button');del.title='删除这个标记';del.setAttribute('aria-label','删除'+TYPE_NAMES[m.type]);del.append(icon('close'));del.onclick=()=>{checkpoint();state.marks=state.marks.filter(x=>x.id!==m.id);if(selected===m.id)selected=null;syncStyles();syncMarks();changed();};row.append(dot,choose,del);list.append(row);});
}
function syncAll(){syncPhotos();syncFields();syncStyles();syncMarks();syncHistory();syncInteractionHint();render();}
function setTool(t,tab=true){finishOverlay();tool=t;draft=null;anglePoints=[];clearSnap();if(t!=='select')selectedPhoto=null;document.querySelectorAll('[data-tool]').forEach(el=>{const on=el.dataset.tool===t;el.classList.toggle('active',on);el.setAttribute('aria-pressed',String(on));});canvas.style.cursor=t==='select'?'default':'crosshair';$('interactionHint').replaceChildren(icon(t==='select'?'hand':t));$('interactionHint').append(document.createTextNode(toolHints[t][1]));$('toolTipTitle').textContent=toolHints[t][0];$('toolTipText').textContent=toolHints[t][1];if(t!=='select'&&tab)switchTab('marks');if(t==='dashed'&&!selected)state.styles.dash='dashed';if((t==='arrow'||t==='curve')&&!selected)state.styles.arrow='end';if(t==='doubleArrow'&&!selected)state.styles.arrow='both';if(t==='line'&&!selected){state.styles.dash='solid';state.styles.arrow='none';}syncStyles();syncInteractionHint();render();}

function rounded(c,r){c.beginPath();c.roundRect(r.x,r.y,r.w,r.h,r.r||0);}
function drawPlaceholder(c,frame,index){
  c.save();rounded(c,frame);c.clip();c.fillStyle='#f6f5e7';c.fillRect(frame.x,frame.y,frame.w,frame.h);const step=18;c.fillStyle='#efeee0';for(let y=0;y<Math.ceil(frame.h/step);y++)for(let x=0;x<Math.ceil(frame.w/step);x++)if((x+y)%2===0)c.fillRect(frame.x+x*step,frame.y+y*step,step,step);
  const midx=frame.x+frame.w/2,midy=frame.y+frame.h/2;c.fillStyle='#fffffff2';c.beginPath();c.arc(midx,midy-20,33,0,Math.PI*2);c.fill();c.strokeStyle='#a4ac87';c.lineWidth=2;c.beginPath();c.moveTo(midx-10,midy-20);c.lineTo(midx+10,midy-20);c.moveTo(midx,midy-30);c.lineTo(midx,midy-10);c.stroke();c.textAlign='center';c.textBaseline='middle';c.fillStyle='#8e9875';c.font='19px "Microsoft YaHei", sans-serif';c.fillText(index?'点击上传后':'点击上传前',midx,midy+38);c.font='12px "Microsoft YaHei", sans-serif';c.fillStyle='#b1b79f';c.fillText('或将图片拖入此处',midx,midy+65);c.restore();
}
function drawPhoto(c,p,f){const im=imageCache.get(p.id);if(!im)return;const scale=coverScale(p.width,p.height,f.w,f.h)*p.zoom;c.save();rounded(c,f);c.clip();c.translate(f.x+f.w/2+p.dx,f.y+f.h/2+p.dy);c.rotate(p.rotation*Math.PI/180);c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';c.drawImage(im,-p.width*scale/2,-p.height*scale/2,p.width*scale,p.height*scale);c.restore();}
function wrapText(c,text,maxWidth){const lines=[];let line='';for(const char of text){if(char==='\n'){lines.push(line);line='';continue;}if(c.measureText(line+char).width>maxWidth&&line){lines.push(line);line=char;}else line+=char;}lines.push(line);return lines;}
function drawField(c,d){let value=state.fields[d.key]||fieldPlaceholders[d.key]||'';c.save();c.fillStyle=state.fields[d.key]?d.color:'#a9a67d';c.textBaseline='middle';c.textAlign=d.align;let size=d.size;c.font=`${size}px PosterText,"Microsoft YaHei",sans-serif`;
  if(d.multi){let lines=wrapText(c,value,d.w);while(lines.length*size*1.65>d.h&&size>12){size-=.5;c.font=`${size}px PosterText,"Microsoft YaHei",sans-serif`;lines=wrapText(c,value,d.w);}const lh=size*1.65,start=d.y+(d.h-lines.length*lh)/2+lh/2;lines.forEach((line,i)=>c.fillText(line,d.x,start+i*lh));}
  else{while(c.measureText(value).width>d.w&&size>10){size-=.5;c.font=`${size}px PosterText,"Microsoft YaHei",sans-serif`;}c.fillText(value,d.align==='center'?d.x+d.w/2:d.x,d.y+d.h/2);}
  c.restore();
}
function arrowHead(c,a,b,width,color){const theta=Math.atan2(b.y-a.y,b.x-a.x),len=Math.max(12,width*4),wing=Math.max(5,width*1.8);c.save();c.setLineDash([]);c.fillStyle=color;c.beginPath();c.moveTo(b.x,b.y);c.lineTo(b.x-len*Math.cos(theta)+wing*Math.sin(theta),b.y-len*Math.sin(theta)-wing*Math.cos(theta));c.lineTo(b.x-len*Math.cos(theta)-wing*Math.sin(theta),b.y-len*Math.sin(theta)+wing*Math.cos(theta));c.closePath();c.fill();c.restore();}
function drawMark(c,m){
  const p=m.points,a=p[0],b=p.at(-1);c.save();c.strokeStyle=m.color;c.fillStyle=m.color;c.lineWidth=m.width;c.lineCap='round';c.lineJoin='round';c.setLineDash(m.dash==='dashed'?[m.width*3.2,m.width*2.4]:m.dash==='dotted'?[.1,m.width*2.5]:[]);c.beginPath();
  if(m.type==='text'){c.setLineDash([]);c.font=`500 ${m.fontSize||26}px PosterText,"Microsoft YaHei",sans-serif`;c.textBaseline='top';c.fillText(m.text||'标记',a.x,a.y);c.restore();return;}
  if(m.type==='curve'){c.moveTo(a.x,a.y);c.quadraticCurveTo(p[1].x,p[1].y,b.x,b.y);}
  else if(m.type==='ellipse'){const r=markBounds(m);c.ellipse(r.x+r.w/2,r.y+r.h/2,Math.max(.1,r.w/2),Math.max(.1,r.h/2),0,0,Math.PI*2);}
  else if(m.type==='rect'){const r=markBounds(m);c.rect(r.x,r.y,r.w,r.h);}
  else if(m.type==='brush'){c.moveTo(a.x,a.y);for(let i=1;i<p.length-1;i++)c.quadraticCurveTo(p[i].x,p[i].y,(p[i].x+p[i+1].x)/2,(p[i].y+p[i+1].y)/2);c.lineTo(b.x,b.y);}
  else{c.moveTo(a.x,a.y);for(let i=1;i<p.length;i++)c.lineTo(p[i].x,p[i].y);}
  c.stroke();
  if(m.type==='angle'&&p.length===3){const v=p[1],info=angleInfo(p),r=Math.min(36,distance(a,v)*.35,distance(b,v)*.35);c.setLineDash([]);c.beginPath();c.arc(v.x,v.y,r,info.start,info.start+info.delta,info.delta<0);c.stroke();const theta=info.start+info.delta/2,label=`${info.degrees.toFixed(1)}°`;c.font='20px PosterText,"Microsoft YaHei",sans-serif';c.textAlign='center';c.textBaseline='middle';const lx=v.x+Math.cos(theta)*(r+25),ly=v.y+Math.sin(theta)*(r+25);c.save();c.strokeStyle='#ffffff';c.lineWidth=3;c.strokeText(label,lx,ly);c.restore();c.fillText(label,lx,ly);}
  if(!['angle','rect','ellipse','brush'].includes(m.type)){if(m.arrow==='end'||m.arrow==='both')arrowHead(c,m.type==='curve'?p[1]:a,b,m.width,m.color);if(m.arrow==='both')arrowHead(c,m.type==='curve'?p[1]:b,a,m.width,m.color);}
  c.restore();
}
function drawSelection(c,m){const r=markBounds(m);c.save();c.strokeStyle='#6f9059';c.fillStyle='#ffffff';c.lineWidth=1.5;c.setLineDash([5,4]);c.strokeRect(r.x-9,r.y-9,r.w+18,r.h+18);if(m.type==='curve'){c.beginPath();c.moveTo(m.points[0].x,m.points[0].y);c.lineTo(m.points[1].x,m.points[1].y);c.lineTo(m.points[2].x,m.points[2].y);c.stroke();}c.setLineDash([]);if(m.type!=='brush'){m.points.forEach((p,i)=>{c.beginPath();c.arc(p.x,p.y,6.5,0,Math.PI*2);c.fillStyle=m.type==='curve'&&i===1?'#f7ef7c':'#fff';c.fill();c.stroke();});}c.restore();}
function draw(c,preview=false){
  c.clearRect(0,0,W,H);c.fillStyle='#f7ef7c';c.fillRect(0,0,W,H);
  FRAMES.forEach((f,i)=>state.photos[i]?drawPhoto(c,state.photos[i],f):drawPlaceholder(c,f,i));
  if(baseImage.complete&&baseImage.naturalWidth)c.drawImage(baseImage,0,0,W,H);FIELD_DEFS.forEach(d=>drawField(c,d));state.marks.forEach(m=>drawMark(c,m));
  if(preview){if(guides){c.save();c.strokeStyle='#3d9bac9c';c.lineWidth=1;c.setLineDash([7,6]);[360,456,550,666,780].forEach(y=>{c.beginPath();c.moveTo(16,y);c.lineTo(810,y);c.stroke();});[209,617].forEach(x=>{c.beginPath();c.moveTo(x,281);c.lineTo(x,867);c.stroke();});c.restore();}
    if(draft)drawMark(c,draft);if(anglePoints.length){c.save();c.strokeStyle=state.styles.color;c.fillStyle=state.styles.color;c.lineWidth=state.styles.width;c.setLineDash([6,5]);c.beginPath();c.moveTo(anglePoints[0].x,anglePoints[0].y);anglePoints.slice(1).forEach(p=>c.lineTo(p.x,p.y));if(hoverPoint)c.lineTo(hoverPoint.x,hoverPoint.y);c.stroke();c.setLineDash([]);anglePoints.forEach(p=>{c.beginPath();c.arc(p.x,p.y,5,0,Math.PI*2);c.fill();});c.restore();}
    const m=selectedMark();if(m)drawSelection(c,m);
    if(selectedPhoto!==null&&state.photos[selectedPhoto]){const f=FRAMES[selectedPhoto];c.save();c.strokeStyle='#7d9359';c.lineWidth=2*W/poster.clientWidth;c.setLineDash([8,5]);rounded(c,f);c.stroke();c.restore();}
    if(snapHint){const {anchor,end,degrees}=snapHint;c.save();const label=degrees===0?'水平 0°':degrees===90?'垂直 90°':`${degrees}°`;c.font='15px sans-serif';const tw=c.measureText(label).width+20,lx=clamp((anchor.x+end.x)/2,tw/2+6,W-tw/2-6),ly=clamp((anchor.y+end.y)/2-25,18,H-18);c.fillStyle='#edf5e4';c.strokeStyle='#a4bc8b';c.lineWidth=1;c.beginPath();c.roundRect(lx-tw/2,ly-13,tw,26,5);c.fill();c.stroke();c.fillStyle='#56713d';c.textAlign='center';c.textBaseline='middle';c.fillText(label,lx,ly);c.restore();}
  }
}
let renderQueued=false;function render(){if(renderQueued)return;renderQueued=true;requestAnimationFrame(()=>{renderQueued=false;ctx.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);draw(ctx,true);});}
const viewport=createViewport({canvas,poster,area:$('canvasScroll'),stage:$('canvasStage'),redraw:render,repositionText:()=>{if(overlayKey)positionOverlay(overlayKey);}});
function fit(){viewport.fit();}
function point(event){const r=canvas.getBoundingClientRect();return{x:clamp((event.clientX-r.left)/r.width*W,0,W),y:clamp((event.clientY-r.top)/r.height*H,0,H)};}
function frameAt(p){return FRAMES.findIndex(f=>p.x>=f.x&&p.x<=f.x+f.w&&p.y>=f.y&&p.y<=f.y+f.h);}
function fieldAt(p){return FIELD_DEFS.find(d=>p.x>=d.x-5&&p.x<=d.x+d.w+5&&p.y>=d.y-4&&p.y<=d.y+d.h+4);}
function newMark(type,points){return{id:uid(),type,points:points.map(p=>({...p})),...state.styles,arrow:type==='arrow'?'end':type==='doubleArrow'?'both':type==='curve'?state.styles.arrow:'none',dash:type==='dashed'?'dashed':state.styles.dash,text:type==='text'?'标记':''};}
function positionOverlay(key){const d=FIELD_DEFS.find(x=>x.key===key),el=$('textOverlay');el.style.left=`${d.x/W*100}%`;el.style.top=`${d.y/H*100}%`;el.style.width=`${d.w/W*100}%`;el.style.height=`${d.h/H*100}%`;el.style.fontSize=`${Math.max(11,d.size*poster.clientWidth/W)}px`;el.style.textAlign=d.align;}
function startOverlay(key){finishOverlay();checkpoint();selected=null;selectedPhoto=null;overlayKey=key;switchTab('text');positionOverlay(key);const el=$('textOverlay');el.value=state.fields[key];el.maxLength=FIELD_DEFS.find(d=>d.key===key).max;el.placeholder=fieldPlaceholders[key]||'';el.hidden=false;el.focus();el.select();render();}
function finishOverlay(){if(!overlayKey)return;const el=$('textOverlay');state.fields[overlayKey]=el.value;overlayKey=null;el.hidden=true;syncFields();changed();}
$('textOverlay').addEventListener('input',()=>{if(!overlayKey)return;state.fields[overlayKey]=$('textOverlay').value;syncFields();changed();});
$('textOverlay').addEventListener('blur',()=>finishOverlay());
$('textOverlay').addEventListener('keydown',e=>{if(e.key==='Escape'||(e.key==='Enter'&&overlayKey!=='improvement'&&!e.isComposing)){e.preventDefault();finishOverlay();canvas.focus({preventScroll:true});}});


const touches=new Map();let pinch=null;
function beginPinch(){const [a,b]=[...touches.values()],ph=state.photos[activePhoto];if(!a||!b||!ph)return;pinch={index:activePhoto,start:distance(a,b),zoom:ph.zoom,dx:ph.dx,dy:ph.dy,center:{x:(a.x+b.x)/2,y:(a.y+b.y)/2}};drag=null;draft=null;clearSnap();}
canvas.addEventListener('pointerdown',e=>{if(e.pointerType!=='touch'||tool!=='select'||loading)return;touches.set(e.pointerId,point(e));if(touches.size<2)return;e.preventDefault();e.stopImmediatePropagation();canvas.setPointerCapture(e.pointerId);if(touches.size===2&&selectedPhoto!==null)beginPinch();},true);
canvas.addEventListener('pointermove',e=>{if(!touches.has(e.pointerId))return;touches.set(e.pointerId,point(e));if(!pinch)return;e.preventDefault();e.stopImmediatePropagation();const [a,b]=[...touches.values()];if(!a||!b)return;const ph=state.photos[pinch.index],f=FRAMES[pinch.index],center={x:(a.x+b.x)/2,y:(a.y+b.y)/2},zoom=clampPhotoZoom(pinch.zoom*distance(a,b)/Math.max(1,pinch.start)),ratio=zoom/pinch.zoom;ph.zoom=zoom;ph.dx=clamp(center.x-f.x-f.w/2-(pinch.center.x-f.x-f.w/2-pinch.dx)*ratio,-PHOTO_PAN_LIMIT,PHOTO_PAN_LIMIT);ph.dy=clamp(center.y-f.y-f.h/2-(pinch.center.y-f.y-f.h/2-pinch.dy)*ratio,-PHOTO_PAN_LIMIT,PHOTO_PAN_LIMIT);syncPhotos();changed();},true);
function endTouch(e){if(!touches.has(e.pointerId))return;touches.delete(e.pointerId);if(!pinch)return;e.preventDefault();e.stopImmediatePropagation();if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);if(touches.size>=2){beginPinch();return;}pinch=null;const remaining=[...touches.values()][0];drag=remaining?{kind:'photo',start:remaining,dx:state.photos[activePhoto].dx,dy:state.photos[activePhoto].dy}:null;changed();}
canvas.addEventListener('pointerup',endTouch,true);canvas.addEventListener('pointercancel',endTouch,true);
canvas.addEventListener('pointerdown',e=>{
  if(e.button!==0||loading)return;e.preventDefault();finishOverlay();canvas.focus({preventScroll:true});clearSnap();const p=point(e),m=selectedMark(),tol=10*W/canvas.clientWidth;
  if(tool==='select'&&m&&m.type!=='brush'){const idx=m.points.findIndex(q=>distance(p,q)<tol);if(idx>=0){checkpoint();drag={kind:'handle',id:m.id,index:idx,start:p};canvas.setPointerCapture(e.pointerId);return;}}
  if(tool==='select'){
    const hit=[...state.marks].reverse().find(x=>hitMark(x,p,7*W/canvas.clientWidth));if(hit){selected=hit.id;selectedPhoto=null;checkpoint();drag={kind:'mark',id:hit.id,start:p,initial:hit.points.map(q=>({...q}))};switchTab('marks');syncStyles();syncMarks();syncInteractionHint();render();canvas.setPointerCapture(e.pointerId);return;}
    const field=fieldAt(p);if(field){startOverlay(field.key);return;}
    const fi=frameAt(p);selected=null;selectedPhoto=null;syncStyles();syncMarks();if(fi>=0){selectPhoto(fi);if(!state.photos[fi]){$(`file${fi}`).click();return;}checkpoint();drag={kind:'photo',start:p,dx:state.photos[fi].dx,dy:state.photos[fi].dy};canvas.style.cursor='grabbing';canvas.setPointerCapture(e.pointerId);}syncInteractionHint();render();return;
  }
  if(tool==='angle'){anglePoints.push(anglePoints.length?alignEnd(anglePoints.at(-1),p,e):p);if(anglePoints.length===3){if(distance(anglePoints[0],anglePoints[1])<5||distance(anglePoints[2],anglePoints[1])<5){anglePoints=[];clearSnap();toast('角度的三点请保持一定距离');render();return;}checkpoint();const mk=newMark('angle',anglePoints);state.marks.push(mk);selected=mk.id;selectedPhoto=null;anglePoints=[];setTool('select',false);syncMarks();syncStyles();changed();}else{$('interactionHint').textContent=anglePoints.length===1?'接下来点击角度的顶点':'最后点击终点，完成角度标记';render();}return;}
  if(tool==='text'){checkpoint();const mk=newMark('text',[p]);state.marks.push(mk);selected=mk.id;selectedPhoto=null;setTool('select',false);syncMarks();syncStyles();changed();$('markText').focus();$('markText').select();return;}
  selected=null;selectedPhoto=null;draft=newMark(tool,[p,p]);drag={kind:'draw',start:p,type:tool};canvas.setPointerCapture(e.pointerId);render();
});
canvas.addEventListener('pointermove',e=>{
  const p=point(e);hoverPoint=p;if(!drag){if(tool==='angle'&&anglePoints.length){hoverPoint=alignEnd(anglePoints.at(-1),p,e);render();}if(tool==='select'){const hit=[...state.marks].reverse().find(m=>hitMark(m,p,7*W/canvas.clientWidth));canvas.style.cursor=hit?'move':fieldAt(p)?'text':frameAt(p)>=0?'grab':'default';}return;}
  if(drag.kind==='photo'){const ph=state.photos[activePhoto];ph.dx=clamp(drag.dx+p.x-drag.start.x,-PHOTO_PAN_LIMIT,PHOTO_PAN_LIMIT);ph.dy=clamp(drag.dy+p.y-drag.start.y,-PHOTO_PAN_LIMIT,PHOTO_PAN_LIMIT);}
  else if(drag.kind==='mark'){const mk=state.marks.find(m=>m.id===drag.id);mk.points=drag.initial.map(q=>({x:q.x+p.x-drag.start.x,y:q.y+p.y-drag.start.y}));}
  else if(drag.kind==='handle'){const mk=state.marks.find(m=>m.id===drag.id);if(['line','dashed','arrow','doubleArrow'].includes(mk.type))mk.points[drag.index]=alignEnd(mk.points[1-drag.index],p,e);else if(mk.type==='curve'&&drag.index!==1)mk.points[drag.index]=alignEnd(mk.points[drag.index===0?2:0],p,e);else if(mk.type==='angle'&&drag.index!==1)mk.points[drag.index]=alignEnd(mk.points[1],p,e);else{clearSnap();mk.points[drag.index]=e.shiftKey&&mk.points.length===2?snapEnd(mk.points[1-drag.index],p,45):p;}}
  else if(drag.kind==='draw'){
    let end=['line','dashed','arrow','doubleArrow','curve'].includes(drag.type)?alignEnd(drag.start,p,e):p;if(e.shiftKey&&['ellipse','rect'].includes(drag.type)){const dx=p.x-drag.start.x,dy=p.y-drag.start.y,d=Math.max(Math.abs(dx),Math.abs(dy));end={x:drag.start.x+Math.sign(dx||1)*d,y:drag.start.y+Math.sign(dy||1)*d};}
    if(drag.type==='brush'){if(distance(draft.points.at(-1),p)>1.5)draft.points.push(p);}
    else if(drag.type==='curve'){const a=drag.start,dx=end.x-a.x,dy=end.y-a.y;draft.points=[a,{x:(a.x+end.x)/2+dy*.25,y:(a.y+end.y)/2-dx*.25},end];}
    else draft.points=[drag.start,end];
  }render();
});
function pointerEnd(e,cancel=false){if(!drag)return;const previous=drag;if(previous.kind==='draw'){if(!cancel&&draft&&distance(draft.points[0],draft.points.at(-1))>4){checkpoint();state.marks.push(draft);selected=draft.id;selectedPhoto=null;setTool('select',false);syncMarks();syncStyles();}draft=null;}drag=null;clearSnap();canvas.style.cursor=tool==='select'?'default':'crosshair';if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);changed();}
canvas.addEventListener('pointerup',e=>pointerEnd(e));canvas.addEventListener('pointercancel',e=>pointerEnd(e,true));
canvas.addEventListener('dragover',e=>{e.preventDefault();poster.classList.add('drag-highlight');});canvas.addEventListener('dragleave',()=>poster.classList.remove('drag-highlight'));canvas.addEventListener('drop',e=>{e.preventDefault();poster.classList.remove('drag-highlight');const fi=frameAt(point(e)),files=Array.from(e.dataTransfer.files);if(files.length>=2){loadPhoto(files[0],0).then(()=>loadPhoto(files[1],1));}else loadPhoto(files[0],fi<0?activePhoto:fi);});

function changeStyle(key,value){state.styles[key]=value;const m=selectedMark();if(m)m[key]=value;syncStyles();syncMarks();changed();}
document.querySelectorAll('[data-tab]').forEach(el=>el.onclick=()=>{finishOverlay();switchTab(el.dataset.tab);});
document.querySelectorAll('[data-tool]').forEach(el=>el.onclick=()=>setTool(el.dataset.tool));
document.querySelectorAll('[data-upload]').forEach(el=>el.onclick=e=>{e.stopPropagation();$(`file${el.dataset.upload}`).click();});
document.querySelectorAll('[data-photo]').forEach(el=>{const i=Number(el.dataset.photo);el.onclick=()=>state.photos[i]?selectPhoto(i):$(`file${i}`).click();el.onkeydown=e=>{if(e.target===el&&(e.key==='Enter'||e.key===' ')){e.preventDefault();el.click();}};el.ondragover=e=>{e.preventDefault();el.classList.add('dragover');};el.ondragleave=()=>el.classList.remove('dragover');el.ondrop=e=>{e.preventDefault();el.classList.remove('dragover');loadPhoto(e.dataTransfer.files[0],i);};});
[0,1].forEach(i=>$(`file${i}`).onchange=e=>loadPhoto(e.target.files[0],i));
['photoZoom','photoRotation'].forEach(id=>{$(id).onpointerdown=()=>checkpoint();$(id).onkeydown=e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key))checkpoint();};$(id).oninput=()=>{const p=state.photos[activePhoto];if(!p)return;if(id==='photoZoom'){setPhotoZoom(Number($(id).value));return;}p.rotation=Number($(id).value);syncPhotos();changed();};});
function setPhotoZoom(percent,record=false){
  const photo=state.photos[activePhoto];if(!photo)return;
  const next=clampPhotoZoom(Number(percent)/100,photo.zoom);
  if(next===photo.zoom){syncPhotos();return;}if(record)checkpoint();
  photo.zoom=next;syncPhotos();changed();
}
$('photoZoomNumber').onchange=e=>{if(e.target.value.trim()===''){syncPhotos();return;}setPhotoZoom(e.target.value,true);};
$('photoZoomNumber').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();if(e.target.value.trim()!=='')setPhotoZoom(e.target.value,true);else syncPhotos();canvas.focus({preventScroll:true});}else if(e.key==='Escape'){e.preventDefault();syncPhotos();canvas.focus({preventScroll:true});}};
$('photoZoomOut').onclick=()=>{const photo=state.photos[activePhoto];if(photo)setPhotoZoom(Math.round(photo.zoom*100)-10,true);};
$('photoZoomIn').onclick=()=>{const photo=state.photos[activePhoto];if(photo)setPhotoZoom(Math.round(photo.zoom*100)+10,true);};
$('resetPhoto').onclick=()=>{const p=state.photos[activePhoto];if(!p)return;checkpoint();Object.assign(p,{zoom:1,rotation:0,dx:0,dy:0});syncPhotos();changed();};
$('removePhoto').onclick=()=>{checkpoint();state.photos[activePhoto]=null;selectedPhoto=null;syncPhotos();changed();};
$('guides').onchange=e=>{guides=e.target.checked;render();};
$('angleSnap').onchange=e=>{autoSnap=e.target.checked;clearSnap();render();};
document.querySelectorAll('[data-field]').forEach(el=>{el.onfocus=()=>checkpoint();el.oninput=()=>{state.fields[el.dataset.field]=el.value;$('improvementCount').textContent=`${state.fields.improvement.length} / 180`;changed();};});
document.querySelectorAll('[data-color]').forEach(el=>el.onclick=()=>{checkpoint();changeStyle('color',el.dataset.color);});
$('markColor').onfocus=()=>checkpoint();$('markColor').oninput=e=>changeStyle('color',e.target.value);
document.querySelectorAll('[data-dash]').forEach(el=>el.onclick=()=>{checkpoint();changeStyle('dash',el.dataset.dash);});
for(const[id,key,transform]of [['markWidth','width',Number],['markArrow','arrow',String],['markFontSize','fontSize',Number]]){$(id).onfocus=()=>checkpoint();$(id).onpointerdown=()=>checkpoint();$(id).oninput=e=>changeStyle(key,transform(e.target.value));}
$('markText').onfocus=()=>checkpoint();$('markText').oninput=e=>{const m=selectedMark();if(!m||m.type!=='text')return;m.text=e.target.value;syncMarks();changed();};
function deleteSelected(){if(!selected)return;checkpoint();state.marks=state.marks.filter(m=>m.id!==selected);selected=null;syncMarks();syncStyles();changed();}
$('deleteMark').onclick=deleteSelected;$('clearMarks').onclick=()=>{if(!state.marks.length)return;checkpoint();state.marks=[];selected=null;syncMarks();syncStyles();changed();toast('标记已清除，可撤销恢复');};
$('undo').onclick=undo;$('redo').onclick=redo;
$('showHelp').onclick=()=>$('helpDialog').showModal();$('closeHelp').onclick=()=>$('helpDialog').close();
$('newProject').onclick=()=>$('newDialog').showModal();$('cancelNew').onclick=()=>$('newDialog').close();$('confirmNew').onclick=()=>{finishOverlay();checkpoint();state=defaultState();selected=null;selectedPhoto=null;activePhoto=0;setTool('select',false);syncAll();changed();$('newDialog').close();toast('新的对比图已准备好');};
$('saveProject').onclick=()=>{finishOverlay();const data=JSON.stringify({...state,savedAt:new Date().toISOString()},null,2);download(new Blob([data],{type:'application/json'}),`拿铁_体态对比_${new Date().toLocaleDateString('sv-SE')}.latte.json`);toast('已保存可继续编辑的项目文件');};
$('openProject').onclick=()=>$('projectFile').click();$('projectFile').onchange=async e=>{const file=e.target.files[0];if(!file)return;if(file.size>60e6){toast('项目文件过大，暂不支持超过 60 MB');e.target.value='';return;}try{const data=validateProject(JSON.parse(await file.text()));const images=await Promise.all(data.photos.map(p=>p?loadImage(p.src):null));checkpoint();state=data;state.photos.forEach((p,i)=>{if(p)imageCache.set(p.id,images[i]);});selected=null;selectedPhoto=null;activePhoto=0;setTool('select',false);syncAll();changed();toast('项目已打开，可以继续编辑');}catch(error){toast(error.message||'无法读取项目文件');}finally{e.target.value='';}};
$('mobileOpen').onclick=()=>$('openProject').click();$('mobileSave').onclick=()=>$('saveProject').click();

let exportURL=null;
function showImageExport(blob,name,out){if(exportURL)URL.revokeObjectURL(exportURL);const file=new File([blob],name,{type:blob.type});exportURL=URL.createObjectURL(file);$('exportPreview').src=exportURL;$('exportResultName').textContent=name+' · '+out.width+' × '+out.height;const link=$('downloadImage');link.href=exportURL;link.download=name;$('shareImage').hidden=!(navigator.canShare&&navigator.canShare({files:[file]}));$('shareImage').onclick=async()=>{try{await navigator.share({files:[file]});}catch(e){if(e.name!=='AbortError')toast('请使用下载或长按图片保存');}};$('exportResult').showModal();if(!matchMedia('(pointer:coarse)').matches)link.click();}
$('closeExportResult').onclick=()=>$('exportResult').close();
$('exportButton').onclick=()=>{finishOverlay();if(state.photos.some(p=>!p)){toast('请先插入前和后两张照片');switchTab('photos');return;}$('exportDialog').showModal();};
$('confirmExport').onclick=async()=>{const btn=$('confirmExport');btn.disabled=true;try{await document.fonts.ready;const scale=Number($('exportScale').value),type=$('exportFormat').value,out=document.createElement('canvas');out.width=W*scale;out.height=H*scale;const oc=out.getContext('2d');oc.scale(scale,scale);draw(oc,false);const blob=await new Promise(resolve=>out.toBlob(resolve,'image/'+type,.96));if(!blob)throw Error('图片导出失败，请重试');const name=($('exportName').value.trim()||'拿铁_体态前后对比').replace(/[<>:"/\\|?*]/g,'_');$('exportDialog').close();showImageExport(blob,name.replace(/\.(png|jpe?g|app)$/i,'')+'.'+(type==='jpeg'?'jpg':'png'),out);toast(`成品图片已导出 · ${out.width} × ${out.height}`);}catch(e){toast(e.message||'图片导出失败，请重试');}finally{btn.disabled=false;}};
document.addEventListener('keydown',e=>{
  const typing=/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)||document.activeElement?.isContentEditable;if(typing)return;
  if(document.querySelector('dialog[open]'))return;
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();return;}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redo();return;}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();$('saveProject').click();return;}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='o'){e.preventDefault();$('openProject').click();return;}
  const arrowDelta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];
  if(arrowDelta&&!e.ctrlKey&&!e.metaKey&&!e.altKey){
    const mark=selectedMark(),photo=selectedPhoto!==null&&state.photos[selectedPhoto];
    if((mark||photo)&&!drag&&!viewport.isPanning()&&!anglePoints.length){e.preventDefault();const step=e.shiftKey?10:1,target=mark?`mark:${mark.id}:${step}`:`photo:${photo.id}:${step}`;if(!e.repeat||nudgeToken!==target)checkpoint();nudgeToken=target;moveSelection(state,{markId:mark?.id,photoIndex:mark?null:selectedPhoto},arrowDelta[0]*step,arrowDelta[1]*step);changed();}
    return;
  }
  if(e.key==='Delete'||e.key==='Backspace'){if(selected){e.preventDefault();deleteSelected();}return;}if(e.key==='Escape'){e.preventDefault();if(viewport.isExpanded()&&!drag&&!anglePoints.length){viewport.toggleExpanded(false);return;}draft=null;drag=null;anglePoints=[];selected=null;selectedPhoto=null;setTool('select',false);syncMarks();syncStyles();syncInteractionHint();render();return;}
  if(e.ctrlKey||e.metaKey||e.altKey)return;const key={v:'select',l:'line',a:'arrow',c:'curve',o:'ellipse',r:'rect',b:'brush',t:'text'}[e.key.toLowerCase()];if(key){e.preventDefault();setTool(key);}
});
document.addEventListener('keyup',e=>{if(e.key.startsWith('Arrow'))nudgeToken=null;});window.addEventListener('blur',()=>{nudgeToken=null;});

async function init(){
  try{baseImage.src='assets/template-base.png';await baseImage.decode();try{db=await openDB();const saved=await dbRead();if(saved){state=validateProject(saved);await loadAllImages();toast('已恢复当前浏览器中的编辑草稿');}}catch(e){if(db){state=defaultState();toast('上次草稿无法恢复，请打开备份项目');}else{$('saveState').lastChild.textContent=' 可保存项目备份';}}
    document.fonts.load('22px PosterText').then(()=>render()).catch(()=>{});syncAll();setTool('select',false);fit();$('loadingCover').hidden=true;
  }catch(e){$('loadingCover').textContent='模板加载失败，请刷新页面重试';toast('模板加载失败，请刷新页面重试');}
}
init();
