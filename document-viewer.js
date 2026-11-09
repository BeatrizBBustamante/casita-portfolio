/* Visor continuo: solo contenido y cierre. Los originales no se modifican. */
(() => {
  'use strict';
  const base=new URL('.',document.currentScript.src),clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  let active=null,generic,pdfModule;
  const make=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text)e.textContent=text;return e;};
  const pdfURL=href=>{try{return /\.pdf$/i.test(decodeURIComponent(new URL(href,location.href).pathname));}catch{return false;}};
  const library=()=>pdfModule ||= import(new URL('vendor/pdfjs/pdf.min.mjs',base).href).then(lib=>{lib.GlobalWorkerOptions.workerSrc=new URL('vendor/pdfjs/pdf.worker.min.mjs',base).href;return lib;});
  class DocumentView {
    constructor(modal,frame,viewport,close,images=[]) {
      Object.assign(this,{modal,frame,viewport,closeButton:close,images,records:[],points:new Map(),serial:0,zoom:1,page:1,count:0});
      modal.classList.add('document-modal');frame.classList.add('document-shell');viewport.classList.add('dv-viewport');viewport.tabIndex=0;viewport.removeAttribute('oncontextmenu');
      close.classList.add('dv-close');this.world=make('div','dv-world');this.message=make('div','dv-message');this.message.setAttribute('role','status');this.message.hidden=true;
      viewport.replaceChildren(this.world,this.message);frame.replaceChildren(viewport,close);
      this.resizeObserver=new ResizeObserver(()=>{if(active===this){this.layout(this.anchor());this.queue();}});this.resizeObserver.observe(viewport);
      viewport.addEventListener('scroll',()=>this.queue(),{passive:true});this.bindGestures();
      this.observer=new MutationObserver(()=>this.sync());this.observer.observe(modal,{attributes:true,attributeFilter:['class']});
    }
    sync(){if(this.modal.classList.contains('visible')){if(active!==this)this.activate();}else if(active===this)this.deactivate();}
    activate(){
      if(active&&active!==this)active.close();this.previousFocus=document.activeElement;active=this;this.serial++;this.zoom=1;this.page=1;this.points.clear();this.tap=null;this.lastTouch=0;this.error=false;
      this.modal.setAttribute('aria-hidden','false');this.modal.setAttribute('aria-label',this.label||this.modal.getAttribute('aria-label')||'Documento');
      dispatchEvent(new CustomEvent('portfolio-document-open'));this.notice('Cargando documento…');
      if(this.source)this.loadPdf();else this.prepare(this.images.length,this.images[0]?.width||1000,this.images[0]?.height||1414);
      this.closeButton.focus({preventScroll:true});
    }
    deactivate(){
      if(active===this)active=null;this.serial++;this.pause();this.points.clear();
      for(const r of this.records){r.task?.cancel();if(r.canvas)r.canvas.width=r.canvas.height=0;}
      this.loadingTask?.destroy().catch(()=>{});this.loadingTask=null;this.pdf?.destroy().catch(()=>{});this.pdf=null;this.records=[];this.world.replaceChildren();
      this.modal.setAttribute('aria-hidden','true');this.viewport.classList.remove('dv-dragging');
      const target=this.previousFocus?.isConnected&&!this.modal.contains(this.previousFocus)?this.previousFocus:document.getElementById('c');target?.focus({preventScroll:true});dispatchEvent(new CustomEvent('portfolio-document-close'));
    }
    close(){this.closeButton.click();if(this.modal.classList.contains('visible'))this.modal.classList.remove('visible');this.sync();}
    notice(text,fallback=false){
      this.message.replaceChildren();this.message.hidden=!text;if(!text)return;this.message.append(document.createTextNode(text));
      // Solo aparece ante un fallo de un PDF; no hay descargas ni enlaces a imágenes.
      if(fallback&&this.source){const a=make('a','','Abrir PDF en otra pestaña');a.href=this.source;a.target='_blank';a.rel='noopener noreferrer';a.dataset.documentNative='true';this.message.append(document.createElement('br'),a);}
    }
    async loadPdf(){
      const token=this.serial;this.count=0;this.records=[];this.world.replaceChildren();
      try{
        this.stage='module';const lib=await library();if(token!==this.serial)return;
        this.stage='document';this.loadingTask=lib.getDocument({url:this.source,docBaseUrl:this.source,rangeChunkSize:262144,disableAutoFetch:true,disableStream:true,cMapUrl:new URL('vendor/pdfjs/cmaps/',base).href,cMapPacked:true,standardFontDataUrl:new URL('vendor/pdfjs/standard_fonts/',base).href,wasmUrl:new URL('vendor/pdfjs/wasm/',base).href,iccUrl:new URL('vendor/pdfjs/iccs/',base).href,isEvalSupported:false});
        this.loadingTask.onProgress=e=>{this.progress={loaded:e.loaded,total:e.total};if(token===this.serial&&!this.records.length)this.notice('Cargando PDF…'+(e.total?' '+Math.min(100,Math.round(e.loaded/e.total*100))+'%':''));};const pdf=await this.loadingTask.promise;if(token!==this.serial){pdf.destroy();return;}this.pdf=pdf;
        this.stage='first-page';const first=await pdf.getPage(1);if(token!==this.serial)return;const size=first.getViewport({scale:1});
        this.prepare(pdf.numPages,size.width,size.height);this.records[0].pdfPage=first;this.stage='pages';this.queue();
      }catch(e){if(token===this.serial){this.error=true;this.lastError=String(e?.message||e);this.notice('No se puede mostrar este PDF aquí. El alojamiento puede restringir el acceso.',true);}}
    }
    prepare(count,width,height){
      this.count=count;this.records=Array.from({length:count},(_,i)=>{
        const image=this.images[i],el=make('div','dv-page');el.setAttribute('role','group');el.setAttribute('aria-label','Página '+(i+1));el.setAttribute('aria-busy','true');this.world.append(el);
        return {index:i,width:!this.source&&image?.width||width,height:!this.source&&image?.height||height,el,ready:false,loading:false,renderSerial:0};
      });
      this.layout();this.viewport.scrollTop=this.viewport.scrollLeft=0;this.queue();
    }
    anchor(point){
      if(!this.records.length)return null;const v=this.viewport,b=v.getBoundingClientRect();point ||= {x:b.left+b.width/2,y:b.top+b.height/2};
      const local={x:point.x-b.left,y:point.y-b.top},y=v.scrollTop+local.y;
      const r=this.records.find(r=>r.top+r.drawHeight>=y)||this.records.at(-1);
      if(!r?.drawWidth)return null;return {index:r.index,x:(local.x+v.scrollLeft-r.left)/r.drawWidth,y:(y-r.top)/r.drawHeight,local};
    }
    layout(anchor){
      if(!this.records.length)return;const v=this.viewport,width=Math.max(1,v.clientWidth-16),height=Math.max(1,v.clientHeight-16);
      // Las páginas verticales de Abismo (1240 × 1754) fijan el ancho de toda la colección.
      const abismoWidth = this.modal.id === 'abismo-modal' ? Math.min(width, height * 1240 / 1754) : null;
      for (const r of this.records) {
        r.fit = abismoWidth === null ? Math.min(width / r.width, height / r.height) : abismoWidth / r.width;
        r.drawWidth = (abismoWidth ?? r.width * r.fit) * this.zoom;
        r.drawHeight = r.height * r.fit * this.zoom;
      }
      const worldWidth=Math.max(v.clientWidth,...this.records.map(r=>r.drawWidth+16));let top=8;
      for(const r of this.records){r.left=(worldWidth-r.drawWidth)/2;r.top=top;
        Object.assign(r.el.style,{width:r.drawWidth+'px',height:r.drawHeight+'px',left:r.left+'px',top:r.top+'px'});top+=r.drawHeight+12;}
      Object.assign(this.world.style,{width:worldWidth+'px',height:Math.max(v.clientHeight,top-4)+'px'});
      if(anchor){const r=this.records[anchor.index];if(r){v.scrollLeft=r.left+r.drawWidth*anchor.x-anchor.local.x;v.scrollTop=r.top+r.drawHeight*anchor.y-anchor.local.y;}}
    }
    queue(){if(active!==this||document.hidden||this.visibleFrame)return;this.visibleFrame=requestAnimationFrame(()=>{this.visibleFrame=0;this.refreshVisible();});}
    near(r,extra=.8){const v=this.viewport;return r.top+r.drawHeight>=v.scrollTop-v.clientHeight*extra&&r.top<=v.scrollTop+v.clientHeight*(1+extra);}
    refreshVisible(){
      if(active!==this||!this.records.length)return;const marker=this.viewport.scrollTop+Math.min(80,this.viewport.clientHeight/3);
      this.page=(this.records.find(r=>r.top+r.drawHeight>marker)||this.records.at(-1)).index+1;
      for(const r of this.records){
        if(this.near(r)){const changed=this.source&&(r.renderedZoom!==this.zoom||Math.abs((r.renderedWidth||0)-r.drawWidth)>.5);if(!r.ready||changed&&performance.now()>=(this.zoomSettlesAt||0))this.loadRecord(r);}
        else if(!this.near(r,3)&&!r.loading&&r.ready){r.task?.cancel();r.renderSerial++;if(r.canvas)r.canvas.width=r.canvas.height=0;r.el.replaceChildren();r.canvas=r.img=null;r.ready=false;r.renderedZoom=0;r.el.setAttribute('aria-busy','true');r.pdfPage?.cleanup();}
      }
    }
    async loadRecord(r){
      if(r.loading||r.failed)return;r.loading=true;const token=this.serial;
      try{
        if(this.source){
          r.pdfPage ||= await this.pdf.getPage(r.index+1);if(token!==this.serial)return;
          const size=r.pdfPage.getViewport({scale:1});this.measure(r,size.width,size.height);if(!this.near(r))return;
          if(!r.canvas){r.canvas=make('canvas');r.canvas.setAttribute('role','img');r.canvas.setAttribute('aria-label','Página '+(r.index+1));r.el.append(r.canvas);await this.annotations(r,token);r.canvas.addEventListener('contextrestored',()=>{r.ready=false;r.renderedZoom=0;this.queue();});}
          await this.render(r,token);
        }else{
          const source=this.images[r.index],img=new Image();img.alt=source.alt||'Página '+(r.index+1);img.draggable=false;img.decoding='async';
          await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=source.src;});if(token!==this.serial)return;
          this.measure(r,img.naturalWidth,img.naturalHeight);source.width=img.naturalWidth;source.height=img.naturalHeight;r.img=img;r.el.replaceChildren(img);r.ready=true;
        }
        if(token===this.serial&&r.ready){r.el.setAttribute('aria-busy','false');this.notice('');}
      }catch(e){if(token===this.serial&&e.name!=='RenderingCancelledException'){r.failed=true;r.error=String(e?.message||e);r.el.setAttribute('aria-busy','false');r.el.append(make('p','dv-page-error','No se ha podido cargar esta página.'));this.notice('');}}
      finally{r.loading=false;if(token===this.serial&&this.source&&r.ready&&(r.renderedZoom!==this.zoom||Math.abs((r.renderedWidth||0)-r.drawWidth)>.5))this.queue();}
    }
    measure(r,width,height){if(width===r.width&&height===r.height)return;const atStart=this.zoom===1&&this.viewport.scrollTop===0,anchor=atStart?null:this.anchor();r.width=width;r.height=height;this.layout(anchor);this.queue();}
    async render(r,token){
      r.task?.cancel();const version=++r.renderSerial,zoom=this.zoom,drawWidth=r.drawWidth;
      const ratio=Math.min(devicePixelRatio||1,2,8192/r.drawWidth,8192/r.drawHeight,Math.sqrt(12000000/(r.drawWidth*r.drawHeight)));
      const view=r.pdfPage.getViewport({scale:r.fit*zoom*ratio}),buffer=document.createElement('canvas');buffer.width=Math.max(1,Math.ceil(view.width));buffer.height=Math.max(1,Math.ceil(view.height));
      const task=r.pdfPage.render({canvasContext:buffer.getContext('2d'),viewport:view,background:'#ffffff'});r.task=task;
      try{await task.promise;if(token!==this.serial||version!==r.renderSerial||!r.canvas)return;r.canvas.width=buffer.width;r.canvas.height=buffer.height;r.canvas.getContext('2d').drawImage(buffer,0,0);r.ready=true;r.renderedZoom=zoom;r.renderedWidth=drawWidth;}
      catch(e){if(e.name!=='RenderingCancelledException')throw e;}
    }
    async annotations(r,token){
      const items=await r.pdfPage.getAnnotations({intent:'display'});if(token!==this.serial)return;const layer=make('div','dv-annotations'),view=r.pdfPage.getViewport({scale:1});
      for(const item of items){
        if(item.subtype!=='Link'||!item.rect)continue;const a=make('a');a.setAttribute('aria-label',item.url||'Ir a la sección enlazada');
        const rect=view.convertToViewportRectangle(item.rect);Object.assign(a.style,{left:Math.min(rect[0],rect[2])/view.width*100+'%',top:Math.min(rect[1],rect[3])/view.height*100+'%',width:Math.abs(rect[2]-rect[0])/view.width*100+'%',height:Math.abs(rect[3]-rect[1])/view.height*100+'%'});
        if(item.url){const url=new URL(item.url,this.source);if(!['http:','https:','mailto:','tel:'].includes(url.protocol))continue;a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';}
        else if(item.dest||item.action){a.href=this.source;a.dataset.documentNative='true';a.addEventListener('click',async e=>{e.preventDefault();e.stopPropagation();const token=this.serial;try{if(item.action){const pages={NextPage:this.page+1,PrevPage:this.page-1,FirstPage:1,LastPage:this.count};if(pages[item.action])this.go(pages[item.action]);return;}const dest=typeof item.dest==='string'?await this.pdf.getDestination(item.dest):item.dest;if(!dest||token!==this.serial)return;const index=typeof dest[0]==='number'?dest[0]:await this.pdf.getPageIndex(dest[0]);if(token===this.serial)this.go(index+1);}catch(_){}});}
        else continue;layer.append(a);
      }r.el.append(layer);
    }
    scale(value,point,anchor){
      if(!this.records.length)return;anchor ||= this.anchor(point);this.zoom=clamp(value,1,this.modal.id==='mirror-report-modal'?1.5:this.source?2.5:2);
      if(point&&anchor){const b=this.viewport.getBoundingClientRect();anchor={...anchor,local:{x:point.x-b.left,y:point.y-b.top}};}
      this.layout(anchor);this.zoomSettlesAt=performance.now()+140;clearTimeout(this.renderTimer);this.renderTimer=setTimeout(()=>this.queue(),140);
    }
    go(page){if(!this.records.length)return;const r=this.records[clamp(Math.trunc(page)-1,0,this.count-1)];this.viewport.scrollTop=r.top;this.page=r.index+1;this.queue();}
    pause(){cancelAnimationFrame(this.visibleFrame);this.visibleFrame=0;clearTimeout(this.renderTimer);}
    resume(){if(active!==this||document.hidden)return;this.layout(this.anchor());for(const r of this.records)if(this.near(r)){if(r.failed){r.failed=false;r.el.querySelector('.dv-page-error')?.remove();}if(this.source){r.renderedZoom=0;r.ready=false;}}this.queue();}
    bindGestures(){
      const v=this.viewport,mid=p=>({x:(p[0].x+p[1].x)/2,y:(p[0].y+p[1].y)/2}),distance=p=>Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);
      const start=()=>{const p=[...this.points.values()];if(p.length>1){const center=mid(p);this.gesture={pinch:true,distance:distance(p),zoom:this.zoom,anchor:this.anchor(center)};this.hadPinch=true;}else if(p.length)this.gesture={x:p[0].x,y:p[0].y,left:v.scrollLeft,top:v.scrollTop};};
      v.addEventListener('pointerdown',e=>{if(active!==this||!this.records.length||(e.pointerType==='mouse'&&e.button!==0))return;e.preventDefault();e.stopPropagation();v.setPointerCapture(e.pointerId);if(e.pointerType!=='mouse')this.lastTouch=performance.now();if(!this.points.size){this.hadPinch=false;this.down={x:e.clientX,y:e.clientY,time:e.timeStamp,type:e.pointerType,link:e.target.closest('.dv-annotations a')};}this.points.set(e.pointerId,{x:e.clientX,y:e.clientY});v.classList.add('dv-dragging');start();});
      v.addEventListener('pointermove',e=>{if(!this.points.has(e.pointerId))return;e.preventDefault();e.stopPropagation();this.points.set(e.pointerId,{x:e.clientX,y:e.clientY});const p=[...this.points.values()];if(p.length>1){if(!this.gesture.pinch)start();this.scale(this.gesture.zoom*distance(p)/Math.max(1,this.gesture.distance),mid(p),this.gesture.anchor);}else if(this.gesture){v.scrollLeft=this.gesture.left+this.gesture.x-e.clientX;v.scrollTop=this.gesture.top+this.gesture.y-e.clientY;}});
      const end=e=>{if(!this.points.has(e.pointerId))return;e.stopPropagation();this.points.delete(e.pointerId);if(this.points.size){start();return;}v.classList.remove('dv-dragging');if(e.type!=='pointerup'||this.hadPinch||!this.down)return;const dx=e.clientX-this.down.x,dy=e.clientY-this.down.y,elapsed=e.timeStamp-this.down.time;if(this.down.link&&Math.hypot(dx,dy)<10&&elapsed<600){this.tap=null;this.down.link.click();return;}if(this.down.type!=='mouse'&&Math.hypot(dx,dy)<10&&elapsed<350){const now=e.timeStamp;if(this.tap&&now-this.tap.time<350&&Math.hypot(e.clientX-this.tap.x,e.clientY-this.tap.y)<30){this.scale(this.zoom>1.1?1:2.5,{x:e.clientX,y:e.clientY});this.tap=null;}else this.tap={time:now,x:e.clientX,y:e.clientY};}};
      for(const name of ['pointerup','pointercancel','lostpointercapture'])v.addEventListener(name,end);
      v.addEventListener('dblclick',e=>{if(e.sourceCapabilities?.firesTouchEvents||performance.now()-(this.lastTouch||-Infinity)<700)return;e.preventDefault();e.stopPropagation();this.scale(this.zoom>1.1?1:2.5,{x:e.clientX,y:e.clientY});});
      v.addEventListener('wheel',e=>{e.stopPropagation();if(e.ctrlKey||e.metaKey){e.preventDefault();this.scale(this.zoom*Math.exp(-e.deltaY*.003),{x:e.clientX,y:e.clientY});}},{passive:false});
    }
  }
  window.addEventListener('keydown',e=>{
    if(!active)return;const v=active;e.stopImmediatePropagation();
    if(e.key==='Escape'){e.preventDefault();v.close();return;}
    if(e.key==='Tab'){const nodes=[v.closeButton,v.viewport,...v.world.querySelectorAll('a[href]'),...v.message.querySelectorAll('a[href]')].filter(el=>!el.hidden&&el.getClientRects().length);const index=nodes.indexOf(document.activeElement);if(e.shiftKey&&index<=0||!e.shiftKey&&index===nodes.length-1){e.preventDefault();nodes[e.shiftKey?nodes.length-1:0]?.focus();}return;}
    if((e.ctrlKey||e.metaKey)&&['+','=','-','0'].includes(e.key))return;
    if(e.key==='+'||e.key==='='){e.preventDefault();v.scale(v.zoom*1.3);}else if(e.key==='-'){e.preventDefault();v.scale(v.zoom/1.3);}else if(e.key==='0'){e.preventDefault();v.scale(1);}
    else if(e.key==='PageDown'||e.key==='PageUp'){e.preventDefault();v.viewport.scrollTop+=(e.key==='PageDown'?1:-1)*v.viewport.clientHeight*.9;}
    else if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();v.viewport.scrollTop+=e.key==='ArrowDown'?80:-80;}
    else if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();if(v.zoom>1)v.viewport.scrollLeft+=e.key==='ArrowRight'?80:-80;else v.go(v.page+(e.key==='ArrowRight'?1:-1));}
    else if(e.key==='Home'){e.preventDefault();v.go(1);}else if(e.key==='End'){e.preventDefault();v.go(v.count);}
  },true);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)active?.pause();else active?.resume();});
  window.addEventListener('pageshow',()=>active?.resume());window.addEventListener('focus',()=>active?.resume());
  function lightbox(){if(generic)return generic;const modal=make('div');modal.id='document-lightbox';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');const frame=make('div'),viewport=make('div'),close=make('button','','×');close.type='button';close.setAttribute('aria-label','Cerrar documento');close.addEventListener('click',()=>modal.classList.remove('visible'));modal.append(frame);document.body.append(modal);generic=new DocumentView(modal,frame,viewport,close);modal.addEventListener('click',e=>{if(e.target===modal)generic.close();});return generic;}
  function openPdf(url,title='Documento PDF'){const absolute=new URL(url,location.href);if(!['http:','https:','file:'].includes(absolute.protocol))return;if(active)active.close();const view=lightbox();view.source=absolute.href;view.label=title;view.modal.classList.add('visible');view.sync();}
  function openImages(images,title='Documento ilustrado',originalURL=null){if(active)active.close();const view=lightbox();view.source=null;view.images=images.map(i=>({src:new URL(typeof i==='string'?i:i.src,location.href).href,alt:i.alt||title,width:i.width,height:i.height}));view.originalURL=originalURL;view.label=title;view.modal.classList.add('visible');view.sync();}
  window.PortfolioDocuments={openPdf,openImages,isActive:()=>!!active,getState:()=>active?{page:active.page,pages:active.count,zoom:active.zoom,scrollLeft:active.viewport.scrollLeft,scrollTop:active.viewport.scrollTop,width:active.world.scrollWidth,height:active.world.scrollHeight,kind:active.source?'pdf':'images',source:active.source||null,continuous:true,stage:active.stage,progress:active.progress,error:active.error?active.lastError:null,failedPages:active.records.filter(r=>r.failed).map(r=>({page:r.index+1,error:r.error})),visiblePages:active.records.filter(r=>active.near(r,0)).map(r=>({page:r.index+1,ready:r.ready})),loading:!active.error&&(!active.records.length||!active.records[active.page-1]?.ready&&!active.records[active.page-1]?.failed)}:null};
  document.addEventListener('click',e=>{if(e.defaultPrevented||e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;const a=e.target.closest('a[href]');if(!a||a.dataset.documentNative||!(pdfURL(a.href)||a.type==='application/pdf'||a.hasAttribute('data-pdf')))return;e.preventDefault();e.stopImmediatePropagation();openPdf(a.href,a.getAttribute('aria-label')||a.textContent.trim()||'Documento PDF');},true);
  function init(){
    for(const id of ['mirror-report-modal','abismo-modal','rapunzel-pdf-modal','personajes-modal']){const modal=document.getElementById(id);if(!modal)continue;const close=modal.querySelector('button'),frame=id==='mirror-report-modal'?make('div'):modal.firstElementChild,viewport=id==='mirror-report-modal'?make('div'):frame.querySelector('[id$="viewer"]');const images=[...modal.querySelectorAll('img')].map(img=>({src:img.src,alt:img.alt,width:img.naturalWidth,height:img.naturalHeight}));if(id==='mirror-report-modal')modal.replaceChildren(frame);new DocumentView(modal,frame,viewport,close,images).sync();}
    for(const container of document.querySelectorAll('.pages,.about')){const images=[...container.querySelectorAll('img')].map(img=>({src:img.src,alt:img.alt}));container.querySelectorAll('img').forEach((img,index)=>{img.tabIndex=0;img.setAttribute('role','button');img.setAttribute('aria-label','Ampliar: '+img.alt);const title=container.closest('article')?.querySelector('h3')?.textContent||img.alt;const open=()=>{openImages(images,title);if(index)generic.go(index+1);};img.addEventListener('click',open);img.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}});});}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
