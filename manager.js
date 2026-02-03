/* manager.js (secured + localStorage) */
const ENDPOINT = window.CONFIG?.GAS_ENDPOINT || window.GAS_ENDPOINT;
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
  return String(s||'').replace(/[<>&]/g,c=>({ '<':'&lt;','>':'&gt;','&':'&amp;' }[c]));
}

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

// ===== localStorage 正式版（主管身份）=====
// 你會有兩個主管：就各自瀏覽器 localStorage 設定自己的 managerId 即可
function getManagerId(){
  return localStorage.getItem("managerId") || "demo_manager";
}

async function loadPending(){
  if(!ENDPOINT){
    setStatus("❌ 缺少 GAS_ENDPOINT（config.js）", false);
    return;
  }

  const managerId = getManagerId();
  midEl.textContent = managerId;

  setStatus("載入待核准清單中…", true);
  const res = await jsonp(ENDPOINT, { action:"list_outing_pending", managerId });

  if(!res?.ok){
    setStatus(
      `❌ 載入失敗：<span class="mono">${safeText(res?.error || "unknown")}</span><br/>
      （若顯示 not_manager：請把此 managerId 加入 GAS 的 MANAGER_USER_IDS）`,
      false
    );
    listEl.innerHTML = "";
    return;
  }

  const items = res.items || [];
  if(items.length===0){
    setStatus("✅ 目前沒有待核准外出單", true);
    listEl.innerHTML = "";
    return;
  }

  setStatus(`✅ 待核准：${items.length} 筆`, true);
  renderList(items, managerId);
}

function renderList(items, managerId){
  listEl.innerHTML = "";
  items.forEach(it=>{
    const div=document.createElement("div");
    div.className="item";
    div.innerHTML = `
      <div class="title">${safeText(it.displayName)}（${safeText(it.userId)}）</div>
      <div class="meta">
        單號：<span class="mono">${safeText(it.requestId)}</span><br/>
        時段：${safeText(it.date)} ${safeText(it.start)} - ${safeText(it.end)}<br/>
        目的地：${safeText(it.destination)}<br/>
        原因：${safeText(it.reason)}
      </div>
      <textarea placeholder="主管備註（可留空）" data-note="${safeText(it.requestId)}"></textarea>
      <div class="row">
        <button class="btn" data-act="APPROVED" data-id="${safeText(it.requestId)}">核准</button>
        <button class="btn secondary" data-act="REJECTED" data-id="${safeText(it.requestId)}">駁回</button>
      </div>
    `;
    listEl.appendChild(div);
  });

  listEl.querySelectorAll("button[data-id]").forEach(btn=>{
    btn.addEventListener("click", async (ev)=>{
      ev.preventDefault();
      const requestId = btn.getAttribute("data-id");
      const decision = btn.getAttribute("data-act");
      const ta = listEl.querySelector(`textarea[data-note="${CSS.escape(requestId)}"]`);
      const managerNote = ta ? ta.value.trim() : "";

      btn.disabled = true;
      setStatus(`送出 ${decision}：${safeText(requestId)}…`, true);

      const res = await jsonp(ENDPOINT, {
        action:"approve_outing",
        managerId,
        requestId,
        decision,
        managerNote
      });

      if(!res?.ok){
        setStatus(`❌ 操作失敗：<span class="mono">${safeText(res?.error || "unknown")}</span>`, false);
        btn.disabled = false;
        return;
      }

      setStatus(`✅ 已${decision==="APPROVED"?"核准":"駁回"}：<span class="mono">${safeText(requestId)}</span>`, true);
      await loadPending();
    }, {passive:false});
  });
}

$("btnRefresh")?.addEventListener("click", (e)=>{ e.preventDefault(); loadPending(); }, {passive:false});
loadPending();
