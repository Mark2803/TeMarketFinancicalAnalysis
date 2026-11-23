import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { captureToken } from "./api";
import FinancePage from "./FinancePage";
import "./styles.css";

captureToken();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <FinancePage />
  </StrictMode>
);
