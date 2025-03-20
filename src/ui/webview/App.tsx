import * as React from "react";
import { PackageCard } from "../components/PackageCard";
import "../styles.css";
import { VSCodeAPI } from "../utils/vscode";

interface PackageInfo {
  name: string;
  description: string;
  version: string;
  weeklyDownloads: number;
  alternatives: string[];
  aiReason?: string;
  usage: {
    count: number;
    files: string[];
  };
  VSCodeAPI: VSCodeAPI;
}

interface AppProps {
  vscodeApi: VSCodeAPI;
  analysisData: {
    fileCount: number;
    packageCount: number;
    packages: PackageInfo[];
  };
}

const App: React.FC<AppProps> = ({ analysisData }) => {
  const { fileCount, packageCount, packages } = analysisData;

  // Get VSCode API from window (set in webviewManager)
  const vscode = (window as any).vscode;

  // Sort packages by usage count
  const sortedPackages = [...packages].sort(
    (a, b) => b.usage.count - a.usage.count
  );

  // Handle opening a file in VS Code
  const handleOpenFile = (filePath: string) => {
    vscode.postMessage({
      command: "openFile",
      filepath: filePath,
    });
  };

  return (
    <div className="container">
      <header className="header">
        <h1>Package Pilot Analysis</h1>
      </header>

      <div className="summary">
        <p>
          Analyzed <strong>{fileCount}</strong> files containing{" "}
          <strong>{packageCount}</strong> unique npm packages.
        </p>
      </div>

      <div className="package-grid">
        {sortedPackages.map((pkg: any) => (
          <PackageCard
            key={pkg.name}
            packageInfo={pkg}
            onOpenFile={handleOpenFile}
          />
        ))}
      </div>
    </div>
  );
};

export default App;
