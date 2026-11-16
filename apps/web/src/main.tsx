import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AuthBoundary } from "./components/AuthBoundary";
import "@fontsource-variable/inter/wght.css";
import "@fontsource/noto-sans-sc/chinese-simplified-400.css";
import "@fontsource/noto-sans-sc/chinese-simplified-500.css";
import "@fontsource/noto-sans-sc/chinese-simplified-600.css";
import "@fontsource/noto-sans-sc/chinese-simplified-700.css";
import "./styles.css";
import "./premium.css";
import "./theme.css";
import { applyTheme, readStoredTheme } from "./theme";

document.documentElement.lang = "zh-CN";
applyTheme(readStoredTheme());

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthBoundary><App /></AuthBoundary>
  </React.StrictMode>,
);
