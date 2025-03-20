import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { getVSCodeAPI } from "../utils/vscode";
import "../styles/tailwind.css";

// Initialize the VS Code API
const vscodeApi = getVSCodeAPI();

// Create root and render app
const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <App
        vscodeApi={vscodeApi}
        analysisData={{
          fileCount: 0,
          packageCount: 0,
          packages: [],
        }}
      />
    </React.StrictMode>
  );
}
