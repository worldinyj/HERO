import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./app/App";
import { AudioProvider } from "./features/audio/AudioContext";
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
      <AudioProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </AudioProvider>
    </BrowserRouter>
  </StrictMode>,
);

registerHeroServiceWorker();
