export const uid=()=>globalThis.crypto?.randomUUID?.()??('natie-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));
export const W = 827, H = 1217;
export const PHOTO_ZOOM_MIN=.5,PHOTO_ZOOM_MAX=50,PHOTO_PAN_LIMIT=100000;
export function clampPhotoZoom(value,fallback=1){const n=Number(value);return clamp(Number.isFinite(n)?n:fallback,PHOTO_ZOOM_MIN,PHOTO_ZOOM_MAX);}
export const FRAMES = [{x:16,y:281,w:386,h:586,r:68},{x:424,y:281,w:386,h:586,r:68}];
export const FIELD_DEFS = [
  {key:'beforeCaption',x:40,y:872,w:338,h:32,size:23,color:'#82792f',align:'center',max:40},
  {key:'afterCaption',x:448,y:872,w:338,h:32,size:23,color:'#82792f',align:'center',max:40},
  {key:'operator',x:51,y:928,w:209,h:35,size:22,color:'#171a12',align:'center',max:35},
  {key:'member',x:310,y:928,w:209,h:35,size:22,color:'#171a12',align:'center',max:35},
  {key:'duration',x:569,y:928,w:209,h:35,size:22,color:'#171a12',align:'center',max:35},
  {key:'module',x:63,y:988,w:700,h:35,size:22,color:'#171a12',align:'center',max:65},
  {key:'improvement',x:69,y:1057,w:689,h:73,size:21,color:'#171a12',align:'left',max:180,multi:true},
];
export const TYPE_NAMES={line:'直线',dashed:'虚线',arrow:'箭头',doubleArrow:'双向箭头',curve:'弧线',angle:'角度',ellipse:'圆圈',rect:'矩形',brush:'画笔',text:'文字'};
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export const coverScale=(iw,ih,fw,fh)=>Math.max(fw/iw,fh/ih);
export function snapDirection(a,b,{enabled=true,force=false,disabled=false,tolerance=4,stepDegrees=22.5}={}){
  const length=distance(a,b),raw=Math.atan2(b.y-a.y,b.x-a.x),step=stepDegrees*Math.PI/180;
  const target=Math.round(raw/step)*step,difference=Math.abs(Math.atan2(Math.sin(raw-target),Math.cos(raw-target)));
  const snapped=length>2&&!disabled&&(force||(enabled&&difference<=tolerance*Math.PI/180));
  const end=snapped?{x:a.x+length*Math.cos(target),y:a.y+length*Math.sin(target)}:{...b};
  const direction=((target*180/Math.PI)%180+180)%180;
  return{point:end,snapped,degrees:Math.round(Math.min(direction,180-direction)*10)/10};
}
export function snapEnd(a,b,stepDegrees=22.5){return snapDirection(a,b,{force:true,stepDegrees}).point;}
export function translateMark(mark,dx,dy){return{...mark,points:mark.points.map(p=>({x:p.x+dx,y:p.y+dy}))};}
export function moveSelection(state,{markId=null,photoIndex=null},dx,dy){
  if(markId){const index=state.marks.findIndex(m=>m.id===markId);if(index<0)return false;state.marks[index]=translateMark(state.marks[index],dx,dy);return true;}
  if(Number.isInteger(photoIndex)&&state.photos[photoIndex]){const photo=state.photos[photoIndex];photo.dx=clamp(photo.dx+dx,-PHOTO_PAN_LIMIT,PHOTO_PAN_LIMIT);photo.dy=clamp(photo.dy+dy,-PHOTO_PAN_LIMIT,PHOTO_PAN_LIMIT);return true;}
  return false;
}
export function segmentDistance(p,a,b){const den=(b.x-a.x)**2+(b.y-a.y)**2;if(!den)return distance(p,a);const t=clamp(((p.x-a.x)*(b.x-a.x)+(p.y-a.y)*(b.y-a.y))/den,0,1);return distance(p,{x:a.x+t*(b.x-a.x),y:a.y+t*(b.y-a.y)});}
export function quadratic(a,c,b,t){return{x:(1-t)**2*a.x+2*(1-t)*t*c.x+t*t*b.x,y:(1-t)**2*a.y+2*(1-t)*t*c.y+t*t*b.y};}
export function angleInfo(points){const[a,v,b]=points;let start=Math.atan2(a.y-v.y,a.x-v.x),delta=Math.atan2(b.y-v.y,b.x-v.x)-start;while(delta>Math.PI)delta-=2*Math.PI;while(delta< -Math.PI)delta+=2*Math.PI;return{start,delta,degrees:Math.abs(delta)*180/Math.PI};}
export function markBounds(m){const xs=m.points.map(p=>p.x),ys=m.points.map(p=>p.y);let x=Math.min(...xs),y=Math.min(...ys),w=Math.max(...xs)-x,h=Math.max(...ys)-y;if(m.type==='text'){w=Math.max(30,(m.text||'标记').length*(m.fontSize||26)*.86);h=(m.fontSize||26)*1.4;}return{x,y,w,h};}
export function hitMark(m,p,tolerance=10){
  const a=m.points[0],b=m.points.at(-1);
  if(m.type==='text'){const r=markBounds(m);return p.x>=r.x-tolerance&&p.x<=r.x+r.w+tolerance&&p.y>=r.y-tolerance&&p.y<=r.y+r.h+tolerance;}
  if(m.type==='rect'){const r=markBounds(m);return p.x>=r.x-tolerance&&p.x<=r.x+r.w+tolerance&&p.y>=r.y-tolerance&&p.y<=r.y+r.h+tolerance;}
  if(m.type==='ellipse'){const r=markBounds(m),rx=Math.max(1,r.w/2)+tolerance,ry=Math.max(1,r.h/2)+tolerance;return ((p.x-r.x-r.w/2)/rx)**2+((p.y-r.y-r.h/2)/ry)**2<=1;}
  if(m.type==='curve'){let prev=a;for(let i=1;i<=32;i++){const next=quadratic(a,m.points[1],b,i/32);if(segmentDistance(p,prev,next)<=tolerance)return true;prev=next;}return false;}
  for(let i=1;i<m.points.length;i++)if(segmentDistance(p,m.points[i-1],m.points[i])<=tolerance)return true;
  return false;
}
export function defaultState(){return{version:1,fields:{beforeCaption:'身体不对称明显',afterCaption:'明显改善',operator:'操作者：若芳教练',member:'被操作者：某某某',duration:'有效时长：45分钟',module:'操作模块：某某某',improvement:''},photos:[null,null],marks:[],styles:{color:'#e64d3e',width:3,dash:'solid',arrow:'none',fontSize:26}};}
export function copyState(s){return{version:1,fields:{...s.fields},photos:s.photos.map(p=>p?{...p}:null),marks:s.marks.map(m=>({...m,points:m.points.map(p=>({...p}))})),styles:{...s.styles}};}
export function validateProject(input){
  if(!input||input.version!==1||!Array.isArray(input.photos)||input.photos.length!==2||!Array.isArray(input.marks)||input.marks.length>500)throw Error('这不是有效的拿铁编辑器项目文件');
  const s=defaultState();for(const d of FIELD_DEFS)s.fields[d.key]=String(input.fields?.[d.key]??s.fields[d.key]).slice(0,d.max);
  if(input.styles){const st=input.styles;if(/^#[0-9a-f]{6}$/i.test(st.color))s.styles.color=st.color;s.styles.width=clamp(Number(st.width)||3,1,12);s.styles.fontSize=clamp(Number(st.fontSize)||26,14,64);if(['solid','dashed','dotted'].includes(st.dash))s.styles.dash=st.dash;if(['none','end','both'].includes(st.arrow))s.styles.arrow=st.arrow;}
  s.photos=input.photos.map(p=>{if(!p)return null;if(typeof p.src!=='string'||!/^data:image\/(png|jpeg|webp);base64,/.test(p.src)||p.src.length>40e6||!Number.isFinite(p.width)||!Number.isFinite(p.height)||p.width<1||p.height<1||p.width>12000||p.height>12000)throw Error('项目中的照片数据无效');return{id:uid(),src:p.src,name:String(p.name||'照片').slice(0,200),width:p.width,height:p.height,zoom:clampPhotoZoom(p.zoom),dx:clamp(Number(p.dx)||0,-PHOTO_PAN_LIMIT,PHOTO_PAN_LIMIT),dy:clamp(Number(p.dy)||0,-PHOTO_PAN_LIMIT,PHOTO_PAN_LIMIT),rotation:clamp(Number(p.rotation)||0,-20,20)};});
  s.marks=input.marks.map(m=>{if(!Object.hasOwn(TYPE_NAMES,m.type)||!Array.isArray(m.points)||m.points.length<1||m.points.length>5000||m.points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))throw Error('项目中的标记数据无效');const required=m.type==='text'?1:(m.type==='curve'||m.type==='angle'?3:2);if(m.points.length<required)throw Error('标记缺少控制点');return{id:uid(),type:m.type,points:m.points.map(p=>({x:clamp(p.x,-5000,6000),y:clamp(p.y,-5000,6000)})),color:/^#[0-9a-f]{6}$/i.test(m.color)?m.color:'#e64d3e',width:clamp(Number(m.width)||3,1,12),dash:['solid','dashed','dotted'].includes(m.dash)?m.dash:'solid',arrow:['none','end','both'].includes(m.arrow)?m.arrow:'none',text:String(m.text??'标记').slice(0,60),fontSize:clamp(Number(m.fontSize)||26,14,64)};});
  return s;
}
