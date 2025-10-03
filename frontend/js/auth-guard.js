// frontend/js/auth-guard.js
import { getToken } from "./api.js";

(() => {
  const token = getToken();
  if (!token) {
    const here = location.pathname.split("/").pop() || "dashboard.html";
    const qs = new URLSearchParams(location.search);
    if (!qs.has("next")) qs.set("next", here);
    location.replace(`login.html?${qs.toString()}`);
  }
})();
