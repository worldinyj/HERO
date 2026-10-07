import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./app/App";
import { AuthProvider } from "./features/auth/AuthContext";
import { registerHeroServiceWorker } from "./lib/pwa";
import "./styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("HERO root element is missing.");
}

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);

registerHeroServiceWorker();
