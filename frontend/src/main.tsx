import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

function mountApp() {
  const rootElement = document.getElementById("root");
  if (!rootElement) {
    console.error("[DairyGoatApp] Root element #root not found!");
    return;
  }
  try {
    ReactDOM.createRoot(rootElement).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
    console.log("[DairyGoatApp] React application mounted successfully.");
  } catch (err) {
    console.error("[DairyGoatApp] Error during ReactDOM render:", err);
    rootElement.innerHTML = `
      <div style="padding:32px 20px; text-align:center; font-family:system-ui,sans-serif; color:#333;">
        <div style="font-size:48px; margin-bottom:12px;">⚠️</div>
        <h3 style="color:#dc2626; margin:0 0 8px 0;">组件初始化异常</h3>
        <p style="color:#666; font-size:13px; margin:0 0 16px 0;">${err instanceof Error ? err.message : String(err)}</p>
        <button onclick="location.reload()" style="background:#185334; color:#fff; border:none; padding:10px 24px; border-radius:6px; font-size:14px; cursor:pointer;">重新加载</button>
      </div>
    `;
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mountApp);
} else {
  // DOM is already ready (e.g. script executed at bottom of body or deferred)
  mountApp();
}

