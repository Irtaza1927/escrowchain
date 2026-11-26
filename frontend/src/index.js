// file: index.js
// description: react app entry point. mounts the root App component and renders the global toast system.

import React    from "react";
import ReactDOM from "react-dom/client";
import { Toaster } from "react-hot-toast";
import App      from "./App";
import "./index.css";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
    <Toaster
      position="bottom-right"
      toastOptions={{
        duration: 4500,
        style: {
          background: "#111a30",
          color: "#f1f5f9",
          border: "1px solid rgba(148, 163, 184, 0.2)",
          borderRadius: "12px",
          fontSize: "13.5px",
          padding: "12px 14px",
          boxShadow: "0 12px 32px rgba(0,0,0,0.4)",
        },
        success: { iconTheme: { primary: "#10b981", secondary: "#052e16" } },
        error:   { iconTheme: { primary: "#f43f5e", secondary: "#450a0a" } },
      }}
    />
  </React.StrictMode>
);
