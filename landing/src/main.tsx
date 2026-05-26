import React from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";
import { LandingPage } from "./routes/index";
import { CallbackPage } from "./routes/callback";

function App() {
  const path = window.location.pathname;
  // Only the OAuth callback needs its own handler; everything else is the landing page
  if (path === "/callback" || path.startsWith("/callback/")) return <CallbackPage />;
  return <LandingPage />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
