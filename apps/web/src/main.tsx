import React from "react";
import ReactDOM from "react-dom/client";
import ConfigProvider from "antd/es/config-provider";
import theme from "antd/es/theme";
import { QueryClientProvider } from "@tanstack/react-query";

import { AppRouter, queryClient } from "./router";
import "./styles.css";
import "./ui-foundation.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
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
