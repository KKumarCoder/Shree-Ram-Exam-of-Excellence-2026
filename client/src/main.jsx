import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "./styles.css";
import "./theme.css";
import "./button-hover.css";
import "./portal.css";
import "./portal-header.css";
import "./public-polish.css";
import "./notifications.css";
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <ToastContainer
        position="top-right"
        autoClose={8000}
        limit={3}
        newestOnTop
        closeOnClick={false}
        pauseOnHover
        pauseOnFocusLoss
        draggable={false}
        toastClassName="portal-toast"
        ariaLabel="Notifications"
      />
    </BrowserRouter>
  </React.StrictMode>,
);
