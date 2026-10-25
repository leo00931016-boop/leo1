'use strict';
const $=id=>document.getElementById(id), center=[24.1796,120.6495], KEY='campus-move-history-v1';
// Base map source is defined in tiles.js (CARTO Voyager, OpenStreetMap data). Change it there for school-wide use.
let records=[];try{records=JSON.parse(localStorage.getItem(KEY)||'[]');if(!Array.isArray(records))records=[];}catch{}
let map, route, halo=null, startMarker=null, positionDot, accuracyCircle, targetMarker, targetLine, target=null, current=null;
let session=null, watch=null, demoTimer=null, wake=null, last=null, lastSignal=0, lines=[], storageOK=true;
function message(s){$('message').textContent=s;}
function pinIcon(kind,label){return L.divIcon({className:'map-pin-wrap map-pin-'+kind,html:'<span class="pin-body"><b>'+label+'</b></span>',iconSize:[30,30],iconAnchor:[15,30]});}
function setTrack(lines){if(route)route.setLatLngs(lines);if(halo)halo.setLatLngs(lines);}
function clearStart(){if(startMarker&&map)map.removeLayer(startMarker);startMarker=null;}
function setStart(p){clearStart();if(map)startMarker=L.marker([p.lat,p.lng],{icon:pinIcon('start','起'),zIndexOffset:500}).addTo(map).bindTooltip('起點');}
try{map=L.map('map',{zoomControl:false}).setView(center,17);L.control.zoom({position:'bottomright'}).addTo(map);addBaseMap(map).on('tileerror',()=>message('底圖載入失敗，請檢查網路；Google Map/OSM 圖磚可能暫時不可用。'));halo=L.polyline([], {color:'#fff', weight:9, opacity:0.85, lineCap:'round', lineJoin:'round'}).addTo(map);route=L.polyline([], {color:'#d95432', weight:5, lineCap:'round', lineJoin:'round'}).addTo(map);map.on('click',e=>{target={lat:e.latlng.lat,lng:e.latlng.lng};updateTarget();});map.on('dblclick',()=>{target=null;clearTarget();});}catch(error){message('地圖初始化失敗，請確認 Leaflet 與底圖設定正確。');}
function updateTarget(){if(!target){$('navigate').hidden=true;$('targetInfo').textContent='點一下地圖，設定老師指定的集合點。';return;}let info='集合點已設定（依老師指定位置顯示）';if(current){const d=Math.round(MoveCore.distance(current,{lat:target.lat,lng:target.lng}));info+='。距離現在位置約 '+d+' 公尺';}$('targetInfo').textContent=info;document.getElementById('navigate').hidden=false;document.getElementById('navigate').href='https://www.google.com/maps/dir/?api=1&destination='+target.lat+','+target.lng+'&travelmode=walking';if(map){if(!targetMarker)targetMarker=L.marker([target.lat,target.lng],{icon:pinIcon('target','集'),zIndexOffset:600}).addTo(map).bindTooltip('集合點');else targetMarker.setLatLng([target.lat,target.lng]);if(!targetLine&&current)targetLine=L.polyline([[current.lat,current.lng],[target.lat,target.lng]],{color:'#975325',dashArray:'6 8',weight:2}).addTo(map);else if(targetLine) targetLine.setLatLngs([[current.lat,current.lng],[target.lat,target.lng]]);}}
function clearTarget(){target=null;for(const l of [targetMarker,targetLine])if(l&&map)map.removeLayer(l);targetMarker=targetLine=null;updateTarget();}
$('clearTarget').onclick=clearTarget;$('campus').onclick=()=>map&&map.setView(center,17);
function displayPosition(p){current=p;if(map){const ll=[p.lat,p.lng];if(!positionDot){positionDot=L.circleMarker(ll,{radius:7,color:'white',weight:3,fillColor:'#2f88b3',fillOpacity:1}).addTo(map);accuracyCircle=L.circle(ll,{radius:p.accuracy,color:'#2f88b3',weight:1,fillOpacity:0.08}).addTo(map);}else{positionDot.setLatLng(ll);accuracyCircle.setLatLng(ll).setRadius(p.accuracy);}}$('accuracy').textContent=Math.round(p.accuracy)+' m';updateTarget();}
const GEO_REASONS={1:'定位權限被拒絕：請到瀏覽器／手機設定允許位置與精確定位後重試。',2:'目前無法取得位置，請移到戶外空曠處。',3:'定位逾時，請再試一次。',4:'定位失敗，請檢查裝置或瀏覽器設定。'};
function geoError(err){if(session?.state==='running')pause('定位中斷，已暫停。'+(GEO_REASONS[err.code]||'請重試。'));else message(GEO_REASONS[err.code]||'定位失敗。');$('badge').textContent='● 定位不可用';}
function locateError(err){message(GEO_REASONS[err.code]||'定位失敗。');if(!session||session.state!=='running')$('badge').textContent='● 定位不可用';}
function available(){if(!window.isSecureContext){message('GPS 需要 HTTPS 網址（電腦本機 localhost 例外），請依部署說明開啟。');return false;}if(!navigator.geolocation){message('此瀏覽器不支援 GPS 定位。');return false;}return true;}
$('locate').onclick=()=>{if(session?.demo){message('示範模式使用模擬位置；結束後可取得真實定位。');return;}if(!available())return;message('正在取得你的定位…');navigator.geolocation.getCurrentPosition(pos=>{const p=normalize(pos);displayPosition(p);if(!session)session={};$('badge').textContent='● 已定位';},locateError,{enableHighAccuracy:true,timeout:15000,maximumAge:0});};
function normalize(pos){return {lat:pos.coords.latitude,lng:pos.coords.longitude,accuracy:pos.coords.accuracy,t:pos.timestamp};}
function seconds(){return session?session.seconds+(session.state==='running'&&session.runStart?(Date.now()-session.runStart)/1000:0):0;}
function fmt(n){const s=Math.floor(n);return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;}
function render(){document.body.classList.toggle('is-active',!!session&&session.state!=='finished');$('activityLabel').textContent=session?.demo?'示範運動':session?.mode?.split(' · ')[0]||'未選活動';$('elapsed').textContent=fmt(seconds());$('distance').textContent=(session?.meters||0)/1000>0?(session?.meters||0)/1000: '0.00';$('calories').textContent=session?Math.round(MoveCore.calories(session.met,session.weight,seconds())):0;$('speed').textContent=session&&seconds()>0?((session.meters/1000)/(seconds()/3600)).toFixed(1):'0.0';$('points').textContent=session?session.points.length:0;$('fields').disabled=!session||session.state==='finished';$('start').disabled=!session||session.state!=='finished';$('pause').disabled=!session||session.state==='finished';$('finish').disabled=!session||session.state==='finished';if(session&&session.state==='paused')$('pause').textContent='繼續';else $('pause').textContent='暫停';}
async function holdScreen(){try{if('wakeLock'in navigator)wake=await navigator.wakeLock.request('screen');}catch{} }
function stopWatch(){if(watch!==null){navigator.geolocation.clearWatch(watch);watch=null;}clearInterval(demoTimer);demoTimer=null;wake?.release().catch(()=>{});wake=null;}
function receive(p){if(!session||session.state!=='running')return;lastSignal=Date.now();displayPosition(p);const result=MoveCore.accept(last,p);if(!result.ok){message(result.reason);return;}if(!session.runStart)session.runStart=Date.now();if(!lines.length)lines.push([p.lat,p.lng]);if(last){lines[lines.length-1].push([p.lat,p.lng]);}else{lines[lines.length-1]=[[p.lat,p.lng]];}session.meters=(session.meters||0)+result.meters;session.points.push({...p,segment:lines.length-1});last=p;setTrack(lines.flat());if(session.points.length===1&&map){map.setView([p.lat,p.lng],17);setStart(p);}$('badge').textContent=session.demo?'● 示範中':'● GPS 定位中';message('已記錄 '+session.points.length+' 個有效定位點');render();}
function run(){session.state='running';session.runStart=Date.now();last=null;lastSignal=Date.now();if(session.demo){demoTick();demoTimer=setInterval(demoTick,1000);}else{watch=navigator.geolocation.watchPosition(pos=>receive(normalize(pos)),geoError,{enableHighAccuracy:true,timeout:15000,maximumAge:0});holdScreen();}}
function begin(demo){const fields=demo?['height','weight','age'].map($):[$('profile')];if(!fields.every(el=>el.reportValidity()))return;if(!demo&&!available())return;$('setupDialog').close();stopWatch();session={id:Date.now(),date:new Date().toISOString(),alias:$('alias').value.trim(),demo,mode:$('mode').value,height:Number($('height').value)||0,weight:Number($('weight').value)||0,age:Number($('age').value)||0,met:Number($('met').value)||0,seconds:0,meters:0,points:[],target:target?{lat:target.lat,lng:target.lng}:null,state:'ready'};lines=[];setTrack([]);clearStart();message(demo?'示範模式已啟動：將模擬 GPS 路徑。':'已建立新紀錄。');$('badge').textContent=demo?'● 示範模式':'● 等待定位';render();run();}
$('profile').onsubmit=e=>{e.preventDefault();begin(false);};$('demo').onclick=()=>begin(true);
function demoTick(){const i=session.demoIndex++,angle=i*.12;session.seconds+=5;receive({lat:center[0]+.00062*Math.sin(angle),lng:center[1]+.00085*Math.cos(angle),accuracy:6,t:Date.now()});}
function pause(reason){if(!session||session.state!=='running')return;session.seconds=seconds();session.runStart=0;session.state='paused';stopWatch();last=null;$('badge').textContent='● 已暫停';message(reason||'已暫停，稍後可繼續。');render();}
$('pause').onclick=()=>{if(session.state==='running')pause();else {message('等待新的有效定位後繼續…');run();}};
function persist(){try{localStorage.setItem(KEY,JSON.stringify(records));storageOK=true;}catch{storageOK=false;message('裝置儲存空間不足或儲存被封鎖。紀錄暫留本頁，請先匯出。');}}
$('finish').onclick=()=>{if(!session||session.state==='finished')return;session.seconds=seconds();session.runStart=0;session.state='finished';stopWatch();session.kcal=MoveCore.calories(session.met,session.weight,session.seconds);session.target=target?{lat:target.lat,lng:target.lng}:null;records.unshift({...session,points:[...session.points]});persist();renderHistory();render();$('badge').textContent='● 完成';message('紀錄已保存。可匯出 JSON / CSV。');};
function download(name,body,type){const url=URL.createObjectURL(new Blob([body],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function cell(v){let s=String(v ?? '');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
function computeRouteStats(r){
  const points=Array.isArray(r.points)?r.points:[];
  const meters=Number(r.meters)||0;
  const seconds=Number(r.seconds)||0;
  const first=points[0]||null;
  const lastPoint=points[points.length-1]||null;
  const km=meters/1000;
  const avgSpeed=seconds>0 ? km/(seconds/3600) : 0;
  const kcal=Number.isFinite(r.kcal) ? r.kcal : (Number.isFinite(r.met)&&Number.isFinite(r.weight) ? MoveCore.calories(r.met,r.weight,seconds) : 0);
  const segments = new Set(points.map(p => p && (p.segment ?? 0))).size;
  const straightMeters = first && lastPoint ? MoveCore.distance(first,lastPoint) : 0;
  let fastest=0;
  for(let i=1;i<points.length;i++){
    const prev=points[i-1], curr=points[i];
    if(!prev||!curr||!Number.isFinite(prev.t)||!Number.isFinite(curr.t)) continue;
    const deltaSec=(curr.t-prev.t)/1000;
    if(!(deltaSec>0)) continue;
    const dMeter=MoveCore.distance(prev,curr);
    if(!(dMeter>0)) continue;
    const speedKmh=(dMeter/1000)/(deltaSec/3600);
    if(speedKmh>fastest) fastest=speedKmh;
  }
  return {meters,seconds,avgSpeed,kcal,validPoints:points.length,segments,straightMeters,fastestSpeed:fastest};
}
function exportCSV(items){
  if(!items.length){message('目前沒有可匯出的紀錄。');return;}
  const rows=[['時間 ISO','課堂代號','類型','活動','身高 cm','體重 kg','年齡','距離 m','運動時間 s','平均速度 km/h','總熱量 kcal','有效定位點數','段數','起點到終點直線距離 m','最快相鄰點速度 km/h']];
  for(const r of items){
    const stats=computeRouteStats(r);
    rows.push([
      r.date || '',
      r.alias || '',
      r.demo ? '示範' : 'GPS',
      r.mode || '',
      r.height ?? '',
      r.weight ?? '',
      r.age ?? '',
      Math.round(stats.meters),
      Math.round(stats.seconds),
      stats.avgSpeed > 0 ? stats.avgSpeed.toFixed(1) : '0.0',
      Math.round(stats.kcal),
      stats.validPoints,
      stats.segments,
      Math.round(stats.straightMeters),
      stats.fastestSpeed > 0 ? stats.fastestSpeed.toFixed(1) : '0.0'
    ]);
  }
  download('campus-move.csv', rows.map(row => row.map(cell).join(',')).join('\n'), 'text/csv;charset=utf-8');
}
let historyFilter='all';
function routeThumbnail(r){const box=document.createElement('div');box.className='route-thumb';const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 100 67');svg.setAttribute('aria-label','運動路線');const ps=r.points||[];if(ps.length>1){const xs=ps.map(p=>p.lng),ys=ps.map(p=>p.lat),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),scale=Math.min(76/(Math.max(maxX-minX,0.00001)),43/(Math.max(maxY-minY,0.00001)));const groups=new Map();for(const p of ps){const k=p.segment||0;if(!groups.has(k))groups.set(k,[]);groups.get(k).push([50+(p.lng-minX)*scale,33+(maxY-p.lat)*scale]);}for(const points of groups.values()){const poly=document.createElementNS(ns,'polyline');poly.setAttribute('points',points.join(' '));poly.setAttribute('fill','none');poly.setAttribute('stroke','#d95432');poly.setAttribute('stroke-width','2.6');poly.setAttribute('stroke-linecap','round');svg.append(poly);}}else{const t=document.createElementNS(ns,'text');t.setAttribute('x','50');t.setAttribute('y','38');t.setAttribute('text-anchor','middle');t.setAttribute('font-size','9');t.setAttribute('fill','#9aa987');t.textContent='無軌跡';svg.append(t);}box.append(svg);return box;}
function renderHistory(){const root=$('records');root.replaceChildren();const actual=records.filter(r=>!r.demo);$('historyTotal').textContent=actual.length?`${actual.length} 次運動 · ${(actual.reduce((s,r)=>s+r.meters,0)/1000).toFixed(2)} km`:'0 次運動 · 0.00 km';const shown=records.filter(r=>historyFilter==='all'||(historyFilter==='demo'?r.demo:!r.demo));if(!shown.length){root.innerHTML='<div class="empty"><div class="empty-art"><svg><use href="#i-route"/></svg></div><div><h3>還沒有紀錄</h3><p>完成一段運動後，紀錄會在這裡出現。</p></div></div>';return;}shown.forEach(r=>{const row=document.createElement('div');row.className='record';row.append(routeThumbnail(r));const info=document.createElement('div');info.className='record-info';const title=document.createElement('strong');title.textContent=r.demo?'示範運動':(r.alias||r.mode||'GPS 運動');const sub=document.createElement('small');sub.textContent=new Date(r.date||Date.now()).toLocaleString('zh-TW',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});info.append(title,sub);const stats=document.createElement('div');stats.className='record-stats';for(const [value,label] of [[(r.meters/1000).toFixed(2)+' km','距離'],[fmt(r.seconds),'時間'],[Math.round(r.kcal||MoveCore.calories(r.met,r.weight,r.seconds))+' kcal','熱量']]){const item=document.createElement('span');item.textContent=value+label;stats.append(item);}row.append(info,stats);const actions=document.createElement('div');actions.className='record-actions';for(const [label,handler] of [['匯出 CSV',()=>exportCSV([r])],['匯出 JSON',()=>download('campus-track.json',JSON.stringify(r,null,2),'application/json')],['刪除',()=>{if(confirm('確定要刪除這筆紀錄？')){records=records.filter(x=>x!==r);persist();renderHistory();}}]]){const button=document.createElement('button');button.textContent=label;button.onclick=handler;actions.append(button);}row.append(actions);root.append(row);});}
$('openSetup').onclick=()=>$('setupDialog').showModal();$('closeSetup').onclick=()=>$('setupDialog').close();$('energyInfo').onclick=()=>$('energyDialog').showModal();$('closeEnergy').onclick=()=>$('energyDialog').close();$('todayDate').textContent=new Date().toLocaleDateString('zh-TW',{month:'long',day:'numeric',weekday:'short'});
document.querySelectorAll('[data-filter]').forEach(button=>button.onclick=()=>{historyFilter=button.dataset.filter;document.querySelectorAll('[data-filter]').forEach(b=>{b.classList.toggle('selected',b===button);b.setAttribute('aria-pressed',String(b===button));});renderHistory();});
$('exportAll').onclick=()=>exportCSV(records);$('deleteAll').onclick=()=>{if(records.length&&confirm('永久刪除此裝置全部運動紀錄？')){records=[];persist();renderHistory();}};
document.addEventListener('visibilitychange',()=>{if(document.hidden&&session?.state==='running')pause('頁面已離開前景，為避免漏記與錯估已自動暫停。回到頁面後按「繼續」。');});
window.addEventListener('beforeunload',e=>{if(session&&session.state!=='finished'){e.preventDefault();e.returnValue='';}});
setInterval(()=>{if(session?.state==='running'&&!session.demo&&Date.now()-lastSignal>30000)pause('超過 30 秒沒有 GPS 更新，已自動暫停。請檢查定位後按繼續。');render();},1000);
renderHistory();render();if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
document.querySelectorAll('.sidenav a[href^="#"]').forEach(a=>a.addEventListener('click',()=>{document.querySelectorAll('.sidenav a').forEach(n=>n.classList.toggle('active',n===a));document.querySelector('.breadcrumb strong').textContent=a.textContent.trim();}));
