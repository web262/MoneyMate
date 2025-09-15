import { api } from "./api.js";
const $ = (s, r=document)=>r.querySelector(s);
let toast;

window.addEventListener("DOMContentLoaded", async ()=>{
  const me = await api("/auth/me").catch(()=>({success:false}));
  if (!me.success || !me.data){ location.href = "login.html"; return; }
  toast = new bootstrap.Toast($("#toast"), { delay: 2200 });

  $("#logout").addEventListener("click", async ()=>{ await api("/auth/logout","POST").catch(()=>{}); location.href="index.html"; });

  // load settings
  const res = await api("/settings");
  const s = res.settings;
  const f = $("#settingsForm");
  f.currency_symbol.value = s.currency_symbol || "$";
  f.warn_threshold.value  = s.warn_threshold ?? 0.8;
  f.critical_threshold.value = s.critical_threshold ?? 1.0;
  f.week_starts_monday.checked = !!s.week_starts_monday;

  f.addEventListener("submit", async (e)=>{
    e.preventDefault();
    const payload = {
      currency_symbol: f.currency_symbol.value || "$",
      warn_threshold: Number(f.warn_threshold.value || 0.8),
      critical_threshold: Number(f.critical_threshold.value || 1.0),
      week_starts_monday: f.week_starts_monday.checked
    };
    const saved = await api("/settings", "POST", payload);
    sessionStorage.setItem("mm_settings", JSON.stringify(saved.settings)); // cache for other pages
    $("#toastMsg").textContent = "Settings saved";
    toast.show();
  });
});
