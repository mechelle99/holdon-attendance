/* setup.js */
const $ = (id) => document.getElementById(id);

// 讀取設定並顯示
function loadSettings() {
  const empId = localStorage.getItem("employeeId") || "";
  const empName = localStorage.getItem("employeeName") || "";
  const mgrId = localStorage.getItem("managerId") || "";

  $("employeeId").value = empId;
  $("employeeName").value = empName;
  $("managerId").value = mgrId;

  const hasData = empId && empName;
  setStatus(hasData ? "✅ 目前已有設定" : "⚠️ 尚未設定", hasData);
}

// 儲存員工
$("btnSaveEmployee").addEventListener("click", () => {
  const id = $("employeeId").value.trim();
  const name = $("employeeName").value.trim();
  if (!id || !name) return alert("員工 ID 與 名稱都必填！");
  
  localStorage.setItem("employeeId", id);
  localStorage.setItem("employeeName", name);
  loadSettings();
  alert("員工身份已儲存！");
});

// 儲存主管
$("btnSaveManager").addEventListener("click", () => {
  const id = $("managerId").value.trim();
  localStorage.setItem("managerId", id); // 允許空值（取消主管職）
  loadSettings();
  alert("主管身份已更新！");
});

// 清除
$("btnClear").addEventListener("click", () => {
  localStorage.clear();
  loadSettings();
  alert("已清除所有設定");
});

$("btnLoad").addEventListener("click", loadSettings);

function setStatus(msg, isOk) {
  const el = $("status");
  el.innerHTML = msg;
  el.className = "status " + (isOk ? "ok" : "bad");
}

// 初始化
loadSettings();
