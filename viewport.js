import {W,H,clamp} from './core.js';

/** Canvas view changes never change photo transforms or exported dimensions. */
export function createViewport({canvas,poster,area,stage,redraw,repositionText}){
  let zoomMode='width',expanded=false,spaceHeld=false,pan=null;
  const workspace=document.querySelector('.workspace');
  const number=document.getElementById('canvasZoomNumber'),slider=document.getElementById('canvasZoom');
  const fitButton=document.getElementById('fitCanvas'),widthButton=document.getElementById('fitWidth');
  function dimensions(){const s=getComputedStyle(area);return{width:area.clientWidth-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight),height:area.clientHeight-parseFloat(s.paddingTop)-parseFloat(s.paddingBottom)};}
  function fit(){
    const d=dimensions();
    let width=typeof zoomMode==='number'?W*zoomMode:zoomMode==='width'?d.width:Math.min(d.width,Math.max(150,d.height)*W/H);
    width=clamp(width,W*.25,W*4);
    poster.style.width=`${width}px`;poster.style.height=`${width*H/W}px`;
    stage.style.width=`${Math.max(width,d.width)}px`;
    const percent=Math.round(width/W*100);slider.value=percent;number.value=percent;
    fitButton.classList.toggle('active',zoomMode===null);widthButton.classList.toggle('active',zoomMode==='width');
    const factor=clamp(width/W*(window.devicePixelRatio||1),1,3),bw=Math.round(W*factor),bh=Math.round(H*factor);
    if(canvas.width!==bw||canvas.height!==bh){canvas.width=bw;canvas.height=bh;}
    repositionText();redraw();
  }
  function focusPoint(client){
    const a=area.getBoundingClientRect(),r=poster.getBoundingClientRect();
    const px=client?.x??a.left+area.clientWidth/2,py=client?.y??a.top+area.clientHeight/2;
    return{x:clamp((px-r.left)/r.width,0,1),y:clamp((py-r.top)/r.height,0,1),clientX:px,clientY:py};
  }
  function setZoom(value,client){
    const anchor=focusPoint(client);zoomMode=clamp(value,.25,4);fit();
    const r=poster.getBoundingClientRect();
    area.scrollLeft+=r.left+anchor.x*r.width-anchor.clientX;
    area.scrollTop+=r.top+anchor.y*r.height-anchor.clientY;
  }
  function fitMode(mode){zoomMode=mode;fit();area.scrollLeft=0;area.scrollTop=0;}
  function toggleExpanded(value=!expanded){
    expanded=value;workspace.classList.toggle('is-expanded',expanded);document.body.classList.toggle('editor-expanded',expanded);
    document.getElementById('expandWorkspace').setAttribute('aria-pressed',String(expanded));
    document.getElementById('expandLabel').textContent=expanded?'退出大图':'大图编辑';fit();
  }
  function inputPercent(){const value=Number(number.value);if(!Number.isFinite(value)||number.value===''){number.value=Math.round(poster.clientWidth/W*100);return;}setZoom(value/100);}
  slider.addEventListener('input',()=>setZoom(Number(slider.value)/100));
  number.addEventListener('change',inputPercent);
  number.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();inputPercent();canvas.focus({preventScroll:true});}});
  document.getElementById('zoomIn').onclick=()=>{setZoom(poster.clientWidth/W+.1);canvas.focus({preventScroll:true});};
  document.getElementById('zoomOut').onclick=()=>{setZoom(poster.clientWidth/W-.1);canvas.focus({preventScroll:true});};
  fitButton.onclick=()=>{fitMode(null);canvas.focus({preventScroll:true});};
  widthButton.onclick=()=>{fitMode('width');canvas.focus({preventScroll:true});};
  document.getElementById('expandWorkspace').onclick=()=>{toggleExpanded();canvas.focus({preventScroll:true});};
  area.addEventListener('wheel',e=>{if(!e.ctrlKey&&!e.metaKey)return;e.preventDefault();setZoom(poster.clientWidth/W*Math.exp(-e.deltaY*.003),{x:e.clientX,y:e.clientY});},{passive:false});
  function releaseSpace(){spaceHeld=false;area.classList.remove('pan-ready');}
  document.addEventListener('keydown',e=>{
    if(e.code!=='Space'||/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)||document.activeElement?.isContentEditable||document.querySelector('dialog[open]'))return;
    if(document.activeElement?.tagName==='BUTTON'&&!workspace.contains(document.activeElement))return;
    e.preventDefault();spaceHeld=true;area.classList.add('pan-ready');
  });
  document.addEventListener('keyup',e=>{if(e.code==='Space')releaseSpace();});window.addEventListener('blur',releaseSpace);
  area.addEventListener('pointerdown',e=>{
    if(!spaceHeld&&e.button!==1)return;e.preventDefault();e.stopPropagation();
    pan={x:e.clientX,y:e.clientY,left:area.scrollLeft,top:area.scrollTop,pointerId:e.pointerId};
    area.classList.add('panning');area.setPointerCapture(e.pointerId);
  },true);
  area.addEventListener('pointermove',e=>{if(!pan)return;e.preventDefault();e.stopPropagation();area.scrollLeft=pan.left+pan.x-e.clientX;area.scrollTop=pan.top+pan.y-e.clientY;});
  function endPan(e){if(!pan)return;e.preventDefault();e.stopPropagation();if(area.hasPointerCapture(pan.pointerId))area.releasePointerCapture(pan.pointerId);pan=null;area.classList.remove('panning');}
  area.addEventListener('pointerup',endPan);area.addEventListener('pointercancel',endPan);
  const observer=new ResizeObserver(fit);observer.observe(area);window.addEventListener('resize',fit);
  return{fit,setZoom,toggleExpanded,isExpanded:()=>expanded,isPanning:()=>!!pan};
}
