import { toast } from "react-toastify";

function show(type, message) {
  if (typeof message !== "string" || !message.trim()) return;
  return toast[type](message, {
    autoClose: 8000,
    role: type === "error" ? "alert" : "status",
  });
}

export const notify = {
  success: (message) => show("success", message),
  info: (message) => show("info", message),
  error: (message) => show("error", message),
};
