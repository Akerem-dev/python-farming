import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import "./styles/tokens.css";
import "./styles/theme-dark.css";
import "./styles/theme-light.css";
import "./styles/typography.css";
import "./styles/globals.css";
import "./styles/layout.css";
import "./styles/motion.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Uygulama kök elementi bulunamadı.");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
