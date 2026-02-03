/* manager.js */

const ENDPOINT = window.GAS_ENDPOINT;

const $ = (id) => document.getElementById(id);
const statusEl = $("status");
const listEl = $("list");
const midEl = $("mid");

function setStatus(msg, ok){
  statusEl.innerHTML = msg;
  statusEl.classList.remove("ok","bad");
  if(ok===true) statusEl.classList.add("ok");
  if(ok===false) statusEl.classList.add("bad");
}

function safeText(s){
  return String(s||'').replace(/[<>&]/g,c=>({
    '<':'&lt;','>':'&gt;','&':'&amp;'
  }[c]));
}

function jsonp(url, params){
  return new Promise((resolve)=>{
    const cb="cb_"+Math.random().toString(16).slice(2);
    window[cb]=(d)=>resolve(d);
    const qs=new URLSearchParams({ ...params, callback: cb });
    const sc=document.createElement("script");
    sc.src=url+"?"+qs.toString();
    document.body.appendChild(sc);
  });
}

function getManagerId(){
  return localStorage.getItem("managerId")
      || localStorage.getItem("userId")
      || "demo_manager";
}

async function loadPending(){
  if(!ENDPOINT){
    setStatus("❌ 缺少 GAS_ENDPOINT", false);
    return;
  }

  const managerId = getManagerId();
  midEl.textContent = managerId;

  setStatus("載入中…", true);
  const res = await jsonp(ENDPOINT,{
    action:"list_outing_pending",
    managerId
  });

  if(!res?.ok){
    setStatus(`❌ 無法載入：${safeText(res?.error)}`, false);
    return;
  }

  listEl.innerHTML = "";
  (res.items || []).forEach(it=>{
    const div=document.createElement("div");
    div.innerHTML = `
      <b>${safeText(it.displayName)}</b><br/>
      ${safeText(it.date)} ${safeText(it.start)}-${safeText(it.end)}<br/>
      <button onclick="approve('${it.requestId}','APPROVED')">核准</button>
      <button onclick="approve('${it.requestId}','REJECTED')">駁回</button>
    `;
    listEl.appendChild(div);
  });

  setStatus("✅ 清單已載入", true);
}

window.approve = async (id, decision)=>{
  const managerId = getManagerId();
  const res = await jsonp(ENDPOINT,{
    action:"approve_outing",
    managerId,
    requestId:id,
    decision
  });

  if(res?.ok){
    setStatus("✅ 已處理", true);
    loadPending();
  }else{
    setStatus("❌ 處理失敗", false);
  }
};

$("btnRefresh")?.addEventListener("click", loadPending);
loadPending();
