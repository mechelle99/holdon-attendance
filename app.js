/* app.js */
const ENDPOINT = window.GAS_ENDPOINT;

const $ = (id) => document.getElementById(id);
const statusEl = $("status");
const whoEl = $("who");
const locEl = $("loc");

function setStatus(msg, ok) {
  statusEl.innerHTML = msg;
  statusEl.classList.remove("ok", "bad");
  if (ok === true) statusEl.classList.add("ok");
  if (ok === false) statusEl.classList.add("bad");
}
function safeText(s){ return String(s||'').replace(/[<>&]/g,c=>({ '<':'&lt;','>':'&gt;','&':'&amp;' }[c])); }

function jsonp(url, params, timeoutMs=12000){
  return new Promise((resolve)=>{
    const cb="cb_"+Math.random().toString(16).slice(2);
    let done=false;
    function finish(d){ if(done) return; done=true; resolve(d); cleanup(); }
    window[cb]=(d)=>finish(d);
    const qs=new URLSearchParams({ ...params, callback: cb });
    const sc=document.createElement("script");
    sc.src=url+(url.includes("?")?"&":"?")+qs.toString();
    sc.async=true;
    sc.onerror=()=>finish({ok:false,error:"jsonp_network_error"});
    const t=setTimeout(()=>finish({ok:false,error:"jsonp_timeout"}), timeoutMs);
    function cleanup(){
      clearTimeout(t);
      try{ delete window[cb]; }catch(_){ window[cb]=undefined; }
      if(sc.parentNode) sc.parentNode.removeChild(sc);
    }
    document.body.appendChild(sc);
  });
}

async function postOrJsonp(payload){
  if(!ENDPOINT) return {ok:false,error:"missing_endpoint"};
  try{
    const r=await fetch(ENDPOINT,{ method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(payload) });
    const txt=await r.text();
    try{ return JSON.parse(txt); }catch{ return {ok:r.ok}; }
  }catch(e){
    return await jsonp(ENDPOINT,{
      action:"submit",
      type:payload.type,
      userId:payload.userId,
      displayName:payload.displayName,
      lat:payload.lat,lng:payload.lng,
      note:payload.note,
      data:payload.data
    });
  }
}

function bindButton(id, fn){
  const el=$(id); if(!el) return;
  el.addEventListener("click",(ev)=>{ ev.preventDefault(); ev.stopPropagation(); fn(); }, {passive:false});
}

// 先用 localStorage demo，之後換 LIFF
function getUser(){
  const userId=localStorage.getItem("userId") || "demo_user";
  const displayName=localStorage.getItem("displayName") || "Demo";
  return { userId, displayName };
}

function getLocation(force){
  return new Promise((resolve,reject)=>{
    if(!navigator.geolocation){
      if(force) return reject(new Error("no_geolocation"));
      return resolve({lat:"",lng:""});
    }
    navigator.geolocation.getCurrentPosition(
      (pos)=>resolve({lat:String(pos.coords.latitude), lng:String(pos.coords.longitude)}),
      (err)=> force ? reject(err) : resolve({lat:"",lng:""}),
      { enableHighAccuracy:true, timeout:8000, maximumAge:60000 }
    );
  });
}

function showPanel(type){
  $("panelClock").style.display = (type==="clock") ? "" : "none";
  $("panelOuting").style.display = (type==="outing") ? "" : "none";
  $("panelLeave").style.display = (type==="leave") ? "" : "none";
  $("panelOvertime").style.display = (type==="overtime") ? "" : "none";

  if(type==="clock") locEl.textContent="需定位（送出時抓）";
  if(type==="outing") locEl.textContent="外出打卡免定位（但需核准外出單）";
  if(type==="leave") locEl.textContent="不需定位";
  if(type==="overtime") locEl.textContent="不需定位";
}

async function submitRecord({ type, requireGps, note, dataObj }){
  const btnIds=["btnClockIn","btnClockOut","btnOutApply","btnOutIn","btnOutOut","btnLeaveSubmit","btnOtSubmit"];
  const btns=btnIds.map(id=>$(id)).filter(Boolean);
  btns.forEach(b=>b.disabled=true);

  setStatus("送出中…", true);
  const { userId, displayName } = getUser();

  let lat="",lng="";
  try{
    const loc = await getLocation(!!requireGps);
    lat=loc.lat; lng=loc.lng;
  }catch(e){
    setStatus("❌ 需要定位才能打卡，請開啟定位權限後再試一次", false);
    btns.forEach(b=>b.disabled=false);
    return;
  }

  whoEl.textContent = `${displayName} (${userId})`;
  locEl.textContent = (lat && lng) ? `${lat}, ${lng}` : (requireGps ? "定位失敗" : "免定位/未取得");

  const payload={
    type, userId, displayName,
    lat, lng,
    note: note || "",
    data: JSON.stringify(dataObj || {})
  };

  const res = await postOrJsonp(payload);
  if(!res?.ok){
    setStatus(`❌ 送出失敗：<span class="mono">${safeText(res?.error || "unknown")}</span>`, false);
  }else{
    const extra = res.requestId ? `（單號：<span class="mono">${safeText(res.requestId)}</span>）` : "";
    setStatus(`✅ 已送出：<b>${safeText(type)}</b>${extra}`, true);
  }

  btns.forEach(b=>b.disabled=false);
}

async function loadApprovedOutings(){
  const { userId } = getUser();
  const res = await jsonp(ENDPOINT, { action:"list_outing_my", userId, status:"APPROVED" });

  const sel = $("approvedOutingSelect");
  sel.innerHTML="";

  if(!res?.ok){
    const opt=document.createElement("option");
    opt.value=""; opt.textContent="讀取失敗";
    sel.appendChild(opt);
    return;
  }
  const items=res.items || [];
  if(items.length===0){
    const opt=document.createElement("option");
    opt.value=""; opt.textContent="目前沒有已核准外出單";
    sel.appendChild(opt);
    return;
  }
  items.forEach(it=>{
    const opt=document.createElement("option");
    opt.value=it.requestId;
    opt.textContent=`${it.date} ${it.start}-${it.end}｜${it.destination}`;
    sel.appendChild(opt);
  });
}

// ===== 一般上下班（需 GPS）=====
async function onClockIn(){
  await submitRecord({ type:"clockin", requireGps:true, note:"", dataObj:{category:"clock"} });
}
async function onClockOut(){
  await submitRecord({ type:"clockout", requireGps:true, note:"", dataObj:{category:"clock"} });
}

// ===== 外出申請（不需 GPS）=====
async function onOutApply(){
  const date=$("outDate").value;
  const start=$("outStart").value;
  const end=$("outEnd").value;
  const destination=($("outDest").value||"").trim();
  const reason=($("outReason").value||"").trim();

  if(!date || !start || !end) return setStatus("❌ 外出申請需填日期/開始/結束時間", false);
  if(!destination) return setStatus("❌ 目的地必填", false);
  if(!reason) return setStatus("❌ 外出原因必填", false);

  await submitRecord({
    type:"outing_apply",
    requireGps:false,
    note:"",
    dataObj:{ category:"outing_apply", date, start, end, destination, reason }
  });

  await loadApprovedOutings();
}

// ===== 外出打卡（免 GPS，但必須帶核准單 requestId）=====
async function onOutIn(){
  const requestId = $("approvedOutingSelect").value;
  if(!requestId) return setStatus("❌ 請先選一張已核准外出單", false);

  await submitRecord({
    type:"out_clockin",
    requireGps:false,
    note:"",
    dataObj:{ category:"outing_clock", requestId }
  });
}
async function onOutOut(){
  const requestId = $("approvedOutingSelect").value;
  if(!requestId) return setStatus("❌ 請先選一張已核准外出單", false);

  await submitRecord({
    type:"out_clockout",
    requireGps:false,
    note:"",
    dataObj:{ category:"outing_clock", requestId }
  });
}

// ===== 請假/加班（不需 GPS）=====
async function onLeaveSubmit(){
  const kind=$("leaveKind").value;
  const start=$("leaveStart").value;
  const end=$("leaveEnd").value;
  const reason=($("leaveReason").value||"").trim();

  if(!start || !end) return setStatus("❌ 請假需填開始與結束時間", false);
  if(!reason) return setStatus("❌ 請假原因/備註必填", false);
  if(new Date(end).getTime() <= new Date(start).getTime()) return setStatus("❌ 結束時間必須晚於開始時間", false);

  await submitRecord({ type:"leave_apply", requireGps:false, note:reason, dataObj:{ category:"leave", kind, start, end, reason } });
}

async function onOtSubmit(){
  const date=$("otDate").value;
  const hours=Number($("otHours").value||0);
  const reason=($("otReason").value||"").trim();

  if(!date) return setStatus("❌ 加班日期必填", false);
  if(!hours || hours<=0) return setStatus("❌ 加班時數需大於 0", false);
  if(!reason) return setStatus("❌ 加班事由必填", false);

  await submitRecord({ type:"overtime_apply", requireGps:false, note:reason, dataObj:{ category:"overtime", date, hours, reason } });
}

function init(){
  if(!ENDPOINT){
    setStatus("❌ 缺少 GAS_ENDPOINT：請確認已載入 config.js", false);
    return;
  }

  const { userId, displayName }=getUser();
  whoEl.textContent=`${displayName} (${userId})`;

  const actionType=$("actionType");
  showPanel(actionType.value);
  actionType.addEventListener("change", async ()=>{ 
    showPanel(actionType.value);
    if(actionType.value==="outing") await loadApprovedOutings();
  });

  jsonp(ENDPOINT,{action:"ping"}).then(r=>{
    if(r?.ok) setStatus("✅ 系統就緒", true);
    else setStatus(`⚠️ ping 失敗：<span class="mono">${safeText(r?.error || "unknown")}</span>`, false);
  });

  bindButton("btnClockIn", onClockIn);
  bindButton("btnClockOut", onClockOut);
  bindButton("btnOutApply", onOutApply);
  bindButton("btnOutIn", onOutIn);
  bindButton("btnOutOut", onOutOut);
  bindButton("btnLeaveSubmit", onLeaveSubmit);
  bindButton("btnOtSubmit", onOtSubmit);

  loadApprovedOutings();
}

init();
