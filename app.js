/* app.js - 完整修復版 (含自動扣除午休) */
const ENDPOINT = window.CONFIG?.GAS_ENDPOINT || window.GAS_ENDPOINT;
const $ = (id) => document.getElementById(id);
const statusEl = $("status");
const whoEl = $("who");
const locEl = $("loc");

// 通訊 API
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
  statusEl.style.display = "block";
  setTimeout(() => { statusEl.style.display = "none"; }, 3000);
}

function getUser() {
  return { 
    userId: localStorage.getItem("employeeId"), 
    displayName: localStorage.getItem("employeeName") 
  };
}

window.logout = function() {
  if(confirm("確定要登出嗎？")) {
    localStorage.removeItem("employeeId");
    localStorage.removeItem("employeeName");
    location.href = "login.html";
  }
}

// 載入儀表板數據
async function loadDashboard() {
  const { userId, displayName } = getUser();
  if (!userId) return;
  
  if($("dispAnnualLeft")) $("dispAnnualLeft").textContent = "...";
  if($("dispCompLeft")) $("dispCompLeft").textContent = "...";

  try {
    const res = await callApi({ action: "get_dashboard", userId, displayName });
    if (res.ok && res.data) {
      if($("dispAnnualLeft")) $("dispAnnualLeft").textContent = res.data.annual.left + " 天";
      if($("dispAnnualTotal")) $("dispAnnualTotal").textContent = res.data.annual.total;
      if($("dispAnnualUsed")) $("dispAnnualUsed").textContent = res.data.annual.used;
      
      if($("dispCompLeft")) $("dispCompLeft").textContent = res.data.comp.left + " 時";
      if($("dispCompTotal")) $("dispCompTotal").textContent = res.data.comp.total;
      if($("dispCompUsed")) $("dispCompUsed").textContent = res.data.comp.used;
    }
  } catch (e) { console.error("儀表板錯誤", e); }
}

function getLocation(force) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      if (force) return reject(new Error("瀏覽器不支援定位"));
      return resolve({ lat: "", lng: "" });
    }
    const options = { enableHighAccuracy: false, timeout: 20000, maximumAge: 60000 };
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        if (!force) return resolve({ lat: "", lng: "" }); 
        reject(new Error("定位失敗 (請確認權限或訊號)"));
      },
      options
    );
  });
}

function showPanel(type) {
  ["panelClock", "panelOuting", "panelLeave", "panelOvertime"].forEach(id => {
    if($(id)) $(id).style.display = "none";
  });
  if (type === "clock") { $("panelClock").style.display = "block"; locEl.textContent = "需定位"; }
  else if (type === "outing") { $("panelOuting").style.display = "block"; locEl.textContent = "免定位"; }
  else if (type === "leave") { $("panelLeave").style.display = "block"; locEl.textContent = "免定位"; }
  else if (type === "overtime") { $("panelOvertime").style.display = "block"; locEl.textContent = "免定位"; }
}

// --- 自動扣除午休 1 小時邏輯 ---
window.calcLeaveHours = function() {
  const s = $("leaveStart").value;
  const e = $("leaveEnd").value;
  if (!s || !e) return;
  
  const start = new Date(s);
  const end = new Date(e);
  
  if (end <= start) { 
    alert("結束時間不能早於開始時間"); 
    $("leaveEnd").value = ""; 
    return; 
  }

  // 1. 算出原始時數
  let hours = (end - start) / (36e5); 
  
  // 2. 如果超過 4 小時，自動減 1 小時 (午休)
  if (hours > 4) {
    hours = hours - 1;
  }
  
  $("leaveTotalHours").textContent = hours.toFixed(1);
};

window.calcOtHours = function() {
  const d = $("otDate").value, s = $("otStart").value, e = $("otEnd").value;
  if (!d || !s || !e) return;
  const start = new Date(`${d}T${s}`), end = new Date(`${d}T${e}`);
  if (end <= start) { alert("結束錯誤"); $("otEnd").value=""; return; }
  let h = (end - start)/(36e5);
  $("otTotalHours").textContent = (Math.floor(h * 2) / 2).toFixed(1);
};

window.calcOutingHours = function() {
  const s = $("outStart").value, e = $("outEnd").value;
  if (!s || !e) return;
  const today = new Date().toISOString().split('T')[0];
  const start = new Date(`${today}T${s}`), end = new Date(`${today}T${e}`);
  if (end <= start) { alert("結束錯誤"); $("outEnd").value=""; return; }
  let h = (end - start)/(36e5);
  if (h > 4) h = h - 1; 
  $("outTotalHours").textContent = h.toFixed(1);
};

async function submitRecord({ action, dataObj, requireGps }) {
  const { userId, displayName } = getUser();
  if (!userId) { location.href = "login.html"; return; }
  const buttons = document.querySelectorAll("button");
  buttons.forEach(b => b.disabled = true);
  setStatus("處理中...", true);

  try {
    let gps = { lat: "", lng: "" };
    if (requireGps) {
      setStatus("📡 定位中...", true);
      try { gps = await getLocation(true); } catch (e) { throw e; }
    }

    setStatus("送出資料...", true);
    const payload = { action, userId, displayName, lat: gps.lat, lng: gps.lng, data: dataObj };
    const res = await callApi(payload);
    
    if (res.ok) {
      setStatus(`✅ ${res.message}`, true);
      if (action.includes("clock")) alert(`打卡成功！${new Date().toTimeString().slice(0,5)}`);
      if (action.includes("create")) {
        if($("leaveReason")) $("leaveReason").value=""; 
        if($("otReason")) $("otReason").value=""; 
        await loadDashboard(); 
      }
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
    if(sel) {
      sel.innerHTML = "";
      if (res.ok && res.list && res.list.length > 0) {
        res.list.forEach(item => {
          const opt = document.createElement("option");
          opt.value = item.requestId;
          opt.textContent = `${item.date} ${item.destination} (${item.status})`;
          sel.appendChild(opt);
        });
      } else { sel.innerHTML = "<option>無單據</option>"; }
    }
  } catch(e) {}
}

function bindEvents() {
  if($("actionType")) $("actionType").addEventListener("change", (e) => showPanel(e.target.value));
  if($("btnClockIn")) $("btnClockIn").onclick = () => submitRecord({ action: "clock_in", requireGps: true, dataObj: {} });
  if($("btnClockOut")) $("btnClockOut").onclick = () => submitRecord({ action: "clock_out", requireGps: true, dataObj: {} });
  
  if($("btnOutApply")) $("btnOutApply").onclick = () => {
    if($("outTotalHours").textContent === "0.0") return alert("請確認時間");
    const d=$("outDate").value;
    submitRecord({ action: "create_outing", requireGps: false, dataObj: {
      start_full: `${d} ${$("outStart").value}`, end_full: `${d} ${$("outEnd").value}`,
      hours: $("outTotalHours").textContent, destination: $("outDest").value, reason: $("outReason").value
    }});
  };

  const getOutReq = () => ({ requestId: $("approvedOutingSelect").value });
  if($("btnOutIn")) $("btnOutIn").onclick = () => submitRecord({ action: "clock_in", requireGps: true, dataObj: { ...getOutReq(), isOuting: true } });
  if($("btnOutOut")) $("btnOutOut").onclick = () => submitRecord({ action: "clock_out", requireGps: true, dataObj: { ...getOutReq(), isOuting: true } });

  if($("btnLeaveSubmit")) $("btnLeaveSubmit").onclick = () => {
    if($("leaveTotalHours").textContent === "0.0") return alert("請確認時間");
    submitRecord({ action: "create_leave", requireGps: false, dataObj: {
      type: $("leaveKind").value, start: $("leaveStart").value.replace("T"," "), 
      end: $("leaveEnd").value.replace("T"," "), hours: $("leaveTotalHours").textContent, reason: $("leaveReason").value
    }});
  };

  if($("btnOtSubmit")) $("btnOtSubmit").onclick = () => {
    if($("otTotalHours").textContent === "0.0") return alert("請確認時間");
    const d=$("otDate").value;
    submitRecord({ action: "create_ot", requireGps: false, dataObj: {
      start_full: `${d} ${$("otStart").value}`, end_full: `${d} ${$("otEnd").value}`,
      hours: $("otTotalHours").textContent, reason: $("otReason").value
    }});
  };
}

function init() {
  if (!ENDPOINT) return setStatus("❌ 未設定 GAS", false);
  const user = getUser();
  if (!user.userId) { location.href = "login.html"; return; }
  
  whoEl.innerHTML = `${user.displayName} (${user.userId}) <a href="javascript:logout()" style="font-size:12px;color:#c22;margin-left:5px;">[登出]</a>`;
  setStatus("就緒", true);
  
  if($("actionType")) showPanel($("actionType").value);
  bindEvents();
  loadApprovedOutings();
  loadDashboard();
}

init();
