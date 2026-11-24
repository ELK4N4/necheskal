import React from "react";
import { createRoot } from "react-dom/client";
import App from "./app/App";
import "./styles.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element was not found");
}

try {
  createRoot(rootElement).render(
    <React.StrictMode><App /></React.StrictMode>,
  );
} catch (error) {
  console.error("Application startup failed", error);
  rootElement.innerHTML = `
    <main style="max-width:640px;margin:10vh auto;padding:24px;font:16px sans-serif;color:#20241f;direction:rtl">
      <h1>לא ניתן לטעון את האפליקציה</h1>
      <p>אירעה שגיאה בעת הפעלת הממשק. רעננו את הדף. אם הבעיה נמשכת, פתחו את מסוף הדפדפן לפרטים.</p>
    </main>
  `;
}
