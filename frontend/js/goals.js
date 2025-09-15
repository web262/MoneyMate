import { api } from "./api.js";
const $ = (s, r=document)=>r.querySelector(s);

let toast, goalModal, contribModal, settings = { currency_symbol: "$" };

async function getSettings(){
  try{
    const cached = sessionStorage.getItem("mm_settings");
    if (cached) return JSON.parse(cached);
    const res = await api("/settings","GET");
    sessionStorage.setItem("mm_settings", JSON.stringify(res.settings));
    return res.settings;
  }catch{ return { currency_symbol:"$", warn_threshold:0.8, critical_threshold:1.0 }; }
}
function money(n, sym="$"){ return `${sym}${Number(n||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`; }

window.addEventListener("DOMContentLoaded", async ()=>{
  const me = await api("/auth/me").catch(()=>({success:false}));
  if (!me.success || !me.data){ location.href = "login.html"; return; }

  settings = await getSettings();

  toast = new bootstrap.Toast($("#toast"), { delay: 2200 });
  goalModal = new bootstrap.Modal($("#goalModal"));
  contribModal = new bootstrap.Modal($("#contribModal"));

  $("#logout").addEventListener("click", async ()=>{
    await api("/auth/logout", "POST").catch(()=>{});
    location.href = "index.html";
  });

  $("#goalForm").addEventListener("submit", saveGoal);
  $("#contribForm").addEventListener("submit", addContribution);

  await renderGoals();
});

async function renderGoals(){
  const res = await api("/goals");
  const grid = $("#goalsGrid"); grid.innerHTML = "";
  if (!res.goals || res.goals.length===0){
    grid.innerHTML = `<div class="muted">No goals yet. Click “New Goal” to create one.</div>`;
    return;
  }
  res.goals.forEach(g=>{
    const pct = Math.min(1, g.progress_pct || 0);
    const color = pct >= 0.66 ? "bg-ok" : (pct >= 0.33 ? "bg-mid" : "bg-low");
    const days = g.days_left!=null ? `${g.days_left} day${Math.abs(g.days_left)!==1?'s':''} left` : "No date set";
    const perDay = (g.per_day_needed!=null) ? money(g.per_day_needed, settings.currency_symbol) + "/day" : "";
    const statusBadge = g.status === "achieved" ? `<span class="badge badge-status">Achieved</span>` : "";

    const col = document.createElement("div");
    col.className = "col-md-6 col-lg-4";
    col.innerHTML = `
      <div class="card-goal">
        <div class="d-flex justify-content-between align-items-center mb-1">
          <div class="title">${escapeHtml(g.name)}</div>
          <div class="d-flex align-items-center gap-2">
            ${statusBadge}
            <div class="btn-group btn-group-sm">
              <button class="btn btn-outline-light" data-edit="${g.id}"><i class="fa-regular fa-pen-to-square"></i></button>
              <button class="btn btn-outline-danger" data-del="${g.id}"><i class="fa-regular fa-trash-can"></i></button>
            </div>
          </div>
        </div>
        <div class="small muted mb-1">${escapeHtml(g.category || "Savings")}</div>
        <div class="small muted mb-1">${money(g.saved_amount, settings.currency_symbol)} / ${money(g.target_amount, settings.currency_symbol)}</div>
        <div class="progress mb-2"><div class="progress-bar ${color}" style="width:${pct*100}%"></div></div>
        <div class="d-flex justify-content-between align-items-center">
          <div class="small muted">${days} ${perDay?(" · "+perDay):""}</div>
          <div class="btn-group btn-group-sm">
            ${g.status !== "achieved" ? `<button class="btn btn-mm" data-contrib="${g.id}"><i class="fa-solid fa-plus me-1"></i>Add</button>` : ""}
            ${g.status !== "achieved" ? `<button class="btn btn-outline-light" data-done="${g.id}">Mark done</button>` : ""}
          </div>
        </div>
      </div>
    `;
    grid.appendChild(col);
  });

  // wire actions
  grid.querySelectorAll("[data-edit]").forEach(btn=>{
    btn.addEventListener("click", ()=> openEdit(Number(btn.dataset.edit)));
  });
  grid.querySelectorAll("[data-del]").forEach(btn=>{
    btn.addEventListener("click", ()=> doDelete(Number(btn.dataset.del)));
  });
  grid.querySelectorAll("[data-contrib]").forEach(btn=>{
    btn.addEventListener("click", ()=> openContrib(Number(btn.dataset.contrib)));
  });
  grid.querySelectorAll("[data-done]").forEach(btn=>{
    btn.addEventListener("click", ()=> markDone(Number(btn.dataset.done)));
  });
}

function openEdit(id){
  api(`/goals`).then(res=>{
    const g = (res.goals||[]).find(x=>x.id===id);
    if (!g) return;
    const f = $("#goalForm");
    f.reset();
    f.querySelector(".modal-title").textContent = "Edit Goal";
    f.id.value = g.id;
    f.name.value = g.name;
    f.category.value = g.category || "";
    f.target_amount.value = g.target_amount;
    if (g.target_date) f.target_date.value = g.target_date;
    goalModal.show();
  });
}

function openContrib(goal_id){
  const f = $("#contribForm");
  f.reset();
  f.goal_id.value = goal_id;
  $("#recordTx").checked = true;
  contribModal.show();
}

async function saveGoal(e){
  e.preventDefault();
  const f = $("#goalForm");
  const payload = {
    name: f.name.value.trim(),
    category: f.category.value.trim(),
    target_amount: Number(f.target_amount.value),
    target_date: f.target_date.value || null
  };
  try{
    if (f.id.value){
      await api(`/goals/${Number(f.id.value)}`, "PATCH", payload);
      toastMsg("Goal updated");
    }else{
      await api("/goals", "POST", payload);
      toastMsg("Goal created");
    }
    goalModal.hide(); f.reset();
    await renderGoals();
  }catch(err){
    toastMsg(err.message || "Save failed");
  }
}

async function addContribution(e){
  e.preventDefault();
  const f = $("#contribForm");
  const payload = {
    amount: Number(f.amount.value),
    note: f.note.value,
    record_transaction: f.record_transaction.checked
  };
  try{
    await api(`/goals/${Number(f.goal_id.value)}/contribute`, "POST", payload);
    contribModal.hide(); f.reset();
    toastMsg("Contribution added");
    await renderGoals();
  }catch(err){
    toastMsg(err.message || "Add failed");
  }
}

async function doDelete(id){
  if (!confirm("Delete this goal?")) return;
  try{
    await api(`/goals/${id}`, "DELETE");
    toastMsg("Goal deleted");
    await renderGoals();
  }catch(err){
    toastMsg(err.message || "Delete failed");
  }
}

async function markDone(id){
  try{
    await api(`/goals/${id}`, "PATCH", { status: "achieved" });
    toastMsg("Marked as achieved");
    await renderGoals();
  }catch(err){
    toastMsg(err.message || "Update failed");
  }
}

function toastMsg(m){ $("#toastMsg").textContent = m; toast.show(); }
function escapeHtml(s){ return (s||"").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
