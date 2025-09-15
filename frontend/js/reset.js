import { api } from "./api.js";
const $ = (s, r=document)=>r.querySelector(s);
let toast;

function msg(m){ $("#toastMsg").textContent=m; toast.show(); }

window.addEventListener("DOMContentLoaded", ()=>{
  toast = new bootstrap.Toast($("#toast"), { delay: 2000 });

  const params = new URLSearchParams(location.search);
  const token = params.get("token");

  if (token){
    $("#title").textContent = "Choose a new password";
    $("#reqForm").classList.add("d-none");
    $("#resetForm").classList.remove("d-none");
    $("#resetForm [name='token']").value = token;
  }

  $("#reqForm").addEventListener("submit", async (e)=>{
    e.preventDefault();
    try{
      const email = $("#reqForm [name='email']").value.trim();
      await api("/auth/forgot-start", "POST", { email });
      msg("If the email exists, a reset link was sent.");
    }catch(err){ msg(err.message || "Request failed"); }
  });

  $("#resetForm").addEventListener("submit", async (e)=>{
    e.preventDefault();
    try{
      const token = $("#resetForm [name='token']").value;
      const new_password = $("#resetForm [name='new_password']").value;
      await api("/auth/forgot-complete","POST",{ token, new_password });
      msg("Password updated. You can log in now.");
      setTimeout(()=>location.href="login.html", 1200);
    }catch(err){ msg(err.message || "Reset failed"); }
  });
});
