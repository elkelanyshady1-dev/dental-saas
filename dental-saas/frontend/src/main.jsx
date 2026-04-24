import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./i18n";
import "./index.css";
import { assertNoLegacyBrand } from "./utils/assertNoLegacyBrand";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// 🛡️ DEV-only: fires console.error if legacy brand name appears in rendered DOM
assertNoLegacyBrand();
