/* app.js (Updated: Fetch API version) */
const ENDPOINT = window.CONFIG?.GAS_ENDPOINT || window.GAS_ENDPOINT;

const $ = (id) => document.getElementById(id);
const statusEl = $("status");
const whoEl = $("who");
const locEl = $("loc");

// --- 核心通訊函式 (取代原本的 jsonp) ---
async function callApi(payload) {
  if (!ENDPOINT) throw new Error("缺少 GAS_ENDPOINT");
  
  // 使用 fetch POST，這是跨網域最標準的做法
  const res = await fetch(ENDPOINT, {
    method: "POST",
    // 必須用 text/plain 以避免 Google 的 CORS 預檢 (preflight) 失敗
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  });
  
  const txt = await res.text();
  try {
    return JSON.parse(txt);
  } catch (e) {
    throw new Error("伺服器回傳格式錯誤: " + txt);
  }
}

function setStatus(msg, ok) {
  statusEl.innerHTML = msg;
  statusEl.className = "status " + (ok ? "ok" : "bad");
}

// --- 使用者與定位 ---
function getUser() {
  const userId = localStorage.getItem("employeeId");
  const displayName = localStorage.getItem("employeeName");
  return { userId, displayName };
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

// --- UI 切換 ---
function showPanel(type) {
  ["panelClock", "panelOuting", "panelLeave", "panelOvertime"].forEach(id => {
    $(id).style.display = "none";
  });

  if (type === "clock") {
    $("panelClock").style.display = "block";
    locEl.textContent = "需定位 (送出時抓取)";
  } else if (type === "outing") {
    $("panelOuting").style.display = "block";
    locEl.textContent = "外出申請免定位 / 外出打卡需定位";
  } else {
    // leave, overtime
    const map = { leave: "panelLeave", overtime: "panelOvertime" };
    $(map[type]).style.display = "block";
    locEl.textContent = "不需定位";
  }
}

// --- 統一送出函式 ---
async function submitRecord({ action, dataObj, requireGps }) {
  const { userId, displayName } = getUser();
  if (!userId) {
    setStatus("❌ 請先至 <a href='setup.html'>setup.html</a> 設定員工身份", false);
    return;
  }

  // 鎖定按鈕避免重複按
  const buttons = document.querySelectorAll("button");
  buttons.forEach(b => b.disabled = true);
  setStatus("送出中...", true);

  try {
    let gps = { lat: "", lng: "" };
    if (requireGps) {
      try {
        gps = await getLocation(true);
      } catch (e) {
        throw new Error("無法取得定位，請確認已授權 GPS。");
      }
    }

    whoEl.textContent = `${displayName} (${userId})`;
    if (requireGps) locEl.textContent = `${gps.lat}, ${gps.lng}`;

    // 呼叫後端
    const payload = {
      action: action, // 告訴後端要做什麼
      userId,
      displayName,
      lat: gps.lat,
      lng: gps.lng,
      data: dataObj
    };

    const res = await callApi(payload);

    if (res.ok) {
      setStatus(`✅ 成功：${res.message || "已送出"}`, true);
      // 如果是外出申請成功，重新整理清單
      if (action === "create_outing") await loadApprovedOutings();
    } else {
      setStatus(`❌ 失敗：${res.message || "未知錯誤"}`, false);
    }

  } catch (err) {
    setStatus(`❌ 錯誤：${err.message}`, false);
  } finally {
    buttons.forEach(b => b.disabled = false);
  }
}

// --- 功能綁定 ---
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
 // --- 新增：自動計算請假時數 ---
window.calcLeaveHours = function() {
  const startVal = $("leaveStart").value;
  const endVal = $("leaveEnd").value;
  if (!startVal || !endVal) return;

  const start = new Date(startVal);
  const end = new Date(endVal);
  const diffMs = end - start;
  
  // 計算小時 (保留一位小數)
  let hours = diffMs / (1000 * 60 * 60);
  if (hours < 0) hours = 0;
  
  $("leaveTotalHours").textContent = hours.toFixed(1);
}

// --- 新增：自動計算加班時數 ---
window.calcOtHours = function() {
  const startVal = $("otStart").value;
  const endVal = $("otEnd").value;
  if (!startVal || !endVal) return;

  // 因為 input type="time" 只有時間沒有日期，我們假設是同一天計算
  // 或是需要結合 otDate，這裡先做簡易時間差計算
  const d = new Date().toDateString(); // 用今天當基準
  const start = new Date(d + ' ' + startVal);
  const end = new Date(d + ' ' + endVal);
  
  let diffMs = end - start;
  // 處理跨日問題 (例如 23:00 到 01:00)
  if (diffMs < 0) {
    diffMs += 24 * 60 * 60 * 1000;
  }

  let hours = diffMs / (1000 * 60 * 60);
  // 加班通常以 0.5 或 1 小時為單位，這裡先無條件捨去取整數（依照你的需求6：一小時為單位）
  hours = Math.floor(hours); 

  $("otTotalHours").textContent = hours.toFixed(1);
}

// --- 修改：bindEvents 裡的加班與請假送出邏輯 ---
function bindEvents() {
  $("actionType").addEventListener("change", (e) => showPanel(e.target.value));

  // 1. 上下班打卡 (增加顯示時間)
  const handleClock = (action) => {
    submitRecord({ action, requireGps: true, dataObj: {} }).then(() => {
        // 需求3：打卡後顯示時間
        const now = new Date();
        const timeStr = now.getHours().toString().padStart(2,'0') + ":" + now.getMinutes().toString().padStart(2,'0');
        alert(`打卡成功！時間：${timeStr}`);
    });
  };
  $("btnClockIn").onclick = () => handleClock("clock_in");
  $("btnClockOut").onclick = () => handleClock("clock_out");

  // ... (外出部分維持不變) ...

  // 4. 請假 (改抓新的欄位)
  $("btnLeaveSubmit").onclick = () => {
    submitRecord({
      action: "create_leave", requireGps: false,
      dataObj: {
        type: $("leaveKind").value,
        start: $("leaveStart").value,
        end: $("leaveEnd").value,
        hours: $("leaveTotalHours").textContent, // 傳送計算後的時數
        reason: $("leaveReason").value
      }
    });
  };

  // 5. 加班 (改抓新的欄位)
  $("btnOtSubmit").onclick = () => {
    submitRecord({
      action: "create_ot", requireGps: false,
      dataObj: {
        date: $("otDate").value,
        start: $("otStart").value, // 傳送開始時間
        end: $("otEnd").value,     // 傳送結束時間
        hours: $("otTotalHours").textContent, // 傳送計算後的時數
        reason: $("otReason").value
      }
    });
  };
  
  // ... (其他事件綁定) ...
}

// 初始化
function init() {
  if (!ENDPOINT) return setStatus("❌ 未設定 GAS_ENDPOINT", false);
  const user = getUser();
  if (!user.userId) {
    setStatus("⚠️ 請先執行 <a href='setup.html'>setup.html</a> 設定身份", false);
  } else {
    whoEl.textContent = `${user.displayName} (${user.userId})`;
    setStatus("✅ 系統就緒", true);
  }
  
  showPanel($("actionType").value);
  bindEvents();
  loadApprovedOutings();
}

init();
