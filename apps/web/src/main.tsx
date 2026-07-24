import React from "react";
import ReactDOM from "react-dom/client";
import ConfigProvider from "antd/es/config-provider";
import theme from "antd/es/theme";
import { QueryClientProvider } from "@tanstack/react-query";

import { AppRouter, queryClient } from "./router";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ConfigProvider
        theme={{
          algorithm: theme.darkAlgorithm,
          token: {
            colorPrimary: "#37d6a3",
            borderRadius: 8,
            fontFamily:
              '"SF Pro Display", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Segoe UI", sans-serif'
          },
          components: {
            Button: {
              controlHeight: 34,
              fontWeight: 700
            },
            Menu: {
              itemBg: "transparent",
              itemSelectedBg: "rgba(55, 214, 163, 0.12)",
              itemSelectedColor: "#f3f6fb",
              horizontalItemSelectedColor: "#f3f6fb"
            }
          }
        }}
      >
        <AppRouter />
      </ConfigProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
