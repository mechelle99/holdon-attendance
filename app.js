/* app.js - 加入登入檢查與登出功能 */
const ENDPOINT = window.CONFIG?.GAS_ENDPOINT || window.GAS_ENDPOINT;
const $ = (id) => document.getElementById(id);
const statusEl = $("status");
const whoEl = $("who");
const locEl = $("loc");

// 1. 核心通訊 API
async function callApi(payload) {
  if (!ENDPOINT) throw new Error("缺少 GAS_ENDPOINT");
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  });
  const txt = await res.text();
  try { return JSON.parse(txt); } 
  catch (e) { throw new Error("伺服器回傳格式錯誤"); }
}

function setStatus(msg, ok) {
  statusEl.innerHTML = msg;
  statusEl.className = "status " + (ok ? "ok" : "bad");
}

function getUser() {
  return { 
    userId: localStorage.getItem("employeeId"), 
    displayName: localStorage.getItem("employeeName") 
  };
}

// 登出功能
window.logout = function() {
  if(confirm("確定要登出嗎？")) {
    localStorage.removeItem("employeeId");
    localStorage.removeItem("employeeName");
    location.href = "login.html";
  }
}

function getLocation(force) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      if (force) return reject(new Error("瀏覽器不支援定位"));
      return resolve({ lat: "", lng: "" });
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => (force ? reject(err) : resolve({ lat: "", lng: "" })),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  });
}

function showPanel(type) {
  ["panelClock", "panelOuting", "panelLeave", "panelOvertime"].forEach(id => {
    $(id).style.display = "none";
  });
  if (type === "clock") { $("panelClock").style.display = "block"; locEl.textContent = "需定位"; }
  else if (type === "outing") { $("panelOuting").style.display = "block"; locEl.textContent = "申請免定位 / 打卡需定位"; }
  else if (type === "leave") { $("panelLeave").style.display = "block"; locEl.textContent = "免定位"; }
  else if (type === "overtime") { $("panelOvertime").style.display = "block"; locEl.textContent = "免定位"; }
}

window.calcLeaveHours = function() {
  const s = $("leaveStart").value;
  const e = $("leaveEnd").value;
  if (!s || !e) return;
  const start = new Date(s), end = new Date(e);
  if (end <= start) { alert("結束不能早於開始"); $("leaveEnd").value=""; return; }
  $("leaveTotalHours").textContent = ((end - start)/(36e5)).toFixed(1);
};

window.calcOtHours = function() {
  const d = $("otDate").value, s = $("otStart").value, e = $("otEnd").value;
  if (!d || !s || !e) return;
  const start = new Date(`${d}T${s}`), end = new Date(`${d}T${e}`);
  if (end <= start) { alert("結束不能早於開始"); $("otEnd").value=""; return; }
  let h = (end - start)/(36e5);
  $("otTotalHours").textContent = (Math.floor(h * 2) / 2).toFixed(1);
};

window.calcOutingHours = function() {
  const s = $("outStart").value, e = $("outEnd").value;
  if (!s || !e) return;
  const today = new Date().toISOString().split('T')[0];
  const start = new Date(`${today}T${s}`), end = new Date(`${today}T${e}`);
  if (end <= start) { alert("結束不能早於開始"); $("outEnd").value=""; return; }
  $("outTotalHours").textContent = ((end - start)/(36e5)).toFixed(1);
};

async function submitRecord({ action, dataObj, requireGps }) {
  const { userId, displayName } = getUser();
  // 雙重保險：如果沒 ID，踢回登入頁
  if (!userId) { location.href = "login.html"; return; }

  const buttons = document.querySelectorAll("button");
  buttons.forEach(b => b.disabled = true);
  setStatus("送出中...", true);

  try {
    let gps = { lat: "", lng: "" };
    if (requireGps) {
      try { gps = await getLocation(true); } 
      catch (e) { throw new Error("無法取得定位，請確認已授權 GPS。"); }
    }

    const payload = { action, userId, displayName, lat: gps.lat, lng: gps.lng, data: dataObj };
    const res = await callApi(payload);
    
    if (res.ok) {
      setStatus(`✅ ${res.message}`, true);
      if (action.includes("clock")) alert(`打卡成功！時間：${new Date().toTimeString().slice(0,5)}`);
      if (action === "create_outing") { $("outDest").value=""; $("outReason").value=""; await loadApprovedOutings(); } 
    } else {
      setStatus(`❌ 失敗：${res.message}`, false);
    }
  } catch (err) {
    setStatus(`❌ 錯誤：${err.message}`, false);
  } finally {
    buttons.forEach(b => b.disabled = false);
  }
}

async function loadApprovedOutings() {
  const { userId } = getUser();
  if(!userId) return;
  try {
    const res = await callApi({ action: "get_my_outings", userId });
    const sel = $("approvedOutingSelect");
    sel.innerHTML = "";
    if (res.ok && res.list && res.list.length > 0) {
      res.list.forEach(item => {
        const opt = document.createElement("option");
        opt.value = item.requestId;
        opt.textContent = `${item.date} ${item.destination} (${item.status})`;
        sel.appendChild(opt);
      });
    } else {
      sel.innerHTML = "<option>無已核准的外出單</option>";
    }
  } catch(e) { console.error(e); }
}

function bindEvents() {
  $("actionType").addEventListener("change", (e) => showPanel(e.target.value));
  $("btnClockIn").onclick = () => submitRecord({ action: "clock_in", requireGps: true, dataObj: {} });
  $("btnClockOut").onclick = () => submitRecord({ action: "clock_out", requireGps: true, dataObj: {} });
  
  $("btnOutApply").onclick = () => {
    if($("outTotalHours").textContent === "0.0") return alert("請確認時間");
    const d=$("outDate").value;
    submitRecord({ action: "create_outing", requireGps: false, dataObj: {
      start_full: `${d} ${$("outStart").value}`, end_full: `${d} ${$("outEnd").value}`,
      hours: $("outTotalHours").textContent, destination: $("outDest").value, reason: $("outReason").value
    }});
  };

  const getOutReq = () => ({ requestId: $("approvedOutingSelect").value });
  $("btnOutIn").onclick = () => submitRecord({ action: "clock_in", requireGps: true, dataObj: { ...getOutReq(), isOuting: true } });
  $("btnOutOut").onclick = () => submitRecord({ action: "clock_out", requireGps: true, dataObj: { ...getOutReq(), isOuting: true } });

  $("btnLeaveSubmit").onclick = () => {
    if($("leaveTotalHours").textContent === "0.0") return alert("請確認時間");
    submitRecord({ action: "create_leave", requireGps: false, dataObj: {
      type: $("leaveKind").value, start: $("leaveStart").value.replace("T"," "), 
      end: $("leaveEnd").value.replace("T"," "), hours: $("leaveTotalHours").textContent, reason: $("leaveReason").value
    }});
  };

  $("btnOtSubmit").onclick = () => {
    if($("otTotalHours").textContent === "0.0") return alert("請確認時間");
    const d=$("otDate").value;
    submitRecord({ action: "create_ot", requireGps: false, dataObj: {
      start_full: `${d} ${$("otStart").value}`, end_full: `${d} ${$("otEnd").value}`,
      hours: $("otTotalHours").textContent, reason: $("otReason").value
    }});
  };
}

function init() {
  if (!ENDPOINT) return setStatus("❌ 未設定 GAS_ENDPOINT", false);
  
  // === 登入檢查 ===
  const user = getUser();
  if (!user.userId) {
    // 沒登入 -> 踢去登入頁
    location.href = "login.html";
    return;
  }
  
  whoEl.innerHTML = `${user.displayName} (${user.userId}) <a href="javascript:logout()" style="font-size:12px;color:#c22;margin-left:5px;">[登出]</a>`;
  setStatus("系統就緒", true);
  
  showPanel($("actionType").value);
  bindEvents();
  loadApprovedOutings();
}

init();
