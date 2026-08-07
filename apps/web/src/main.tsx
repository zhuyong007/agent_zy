import React from "react";
import ReactDOM from "react-dom/client";
import ConfigProvider from "antd/es/config-provider";
import theme from "antd/es/theme";
import { QueryClientProvider } from "@tanstack/react-query";

import { AppRouter, queryClient } from "./router";
import "./styles.css";
import "./ui-foundation.css";

// #region debug-point A:bootstrap-reporter
const DEBUG_SERVER_URL = "http://127.0.0.1:7777/event";
const DEBUG_SESSION_ID = "startup-white-screen";

function reportStartupDebug(hypothesisId: string, location: string, msg: string, data?: unknown) {
  void fetch(DEBUG_SERVER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      sessionId: DEBUG_SESSION_ID,
      runId: "pre-fix",
      hypothesisId,
      location,
      msg,
      data,
      ts: Date.now()
    })
  }).catch(() => undefined);
}
// #endregion

// #region debug-point A:global-errors
window.addEventListener("error", (event) => {
  reportStartupDebug("A", "main.tsx:global-error", "[DEBUG] window error", {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno
  });
});

window.addEventListener("unhandledrejection", (event) => {
  reportStartupDebug("A", "main.tsx:unhandledrejection", "[DEBUG] unhandled rejection", {
    reason:
      event.reason instanceof Error
        ? {
          message: event.reason.message,
          stack: event.reason.stack
        }
        : String(event.reason)
  });
});
// #endregion

// #region debug-point A:root-check
const rootElement = document.getElementById("root");
reportStartupDebug("A", "main.tsx:root-check", "[DEBUG] root element lookup", {
  hasRoot: Boolean(rootElement)
});
// #endregion

// #region debug-point A:render-start
reportStartupDebug("A", "main.tsx:render-start", "[DEBUG] react render start");
ReactDOM.createRoot(rootElement!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ConfigProvider
        theme={{
          algorithm: theme.darkAlgorithm,
          token: {
            colorPrimary: "#4fa3b3",
            colorBgBase: "#0c1117",
            colorBgContainer: "#171d26",
            colorBorder: "rgba(255, 255, 255, 0.08)",
            colorText: "#e8ebf2",
            colorTextSecondary: "#98a2b3",
            borderRadius: 10,
            controlHeight: 40,
            fontFamily:
              '"SF Pro Display", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Segoe UI", sans-serif'
          },
          components: {
            Button: {
              controlHeight: 40,
              fontWeight: 700
            },
            Menu: {
              itemBg: "transparent",
              itemSelectedBg: "rgba(79, 163, 179, 0.12)",
              itemSelectedColor: "#e8ebf2",
              horizontalItemSelectedColor: "#e8ebf2"
            }
          }
        }}
      >
        <AppRouter />
      </ConfigProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
queueMicrotask(() => {
  reportStartupDebug("A", "main.tsx:render-complete", "[DEBUG] react render scheduled complete");
});
// #endregion
