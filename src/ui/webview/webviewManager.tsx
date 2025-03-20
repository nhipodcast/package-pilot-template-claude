import vscode from "vscode";
import * as fs from "fs";
import { PackageData } from "../../services/npmService";

/**
 * Creates and displays the webview for package analysis
 */
export function displayPackageAnalysis(
  analysis: any,
  packageData: PackageData,
  extensionUri: vscode.Uri
): void {
  // Create webview panel
  const panel = vscode.window.createWebviewPanel(
    "packagePilot",
    "Package Pilot Analysis",
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      localResourceRoots: [extensionUri],
    }
  );

  // Get webview content
  panel.webview.html = getWebviewContent(
    panel.webview,
    extensionUri,
    analysis,
    packageData
  );

  // Handle messages from the webview
  panel.webview.onDidReceiveMessage(
    (message: { command: string; filepath: string }) => {
      if (message.command === "openFile") {
        const filePath = message.filepath;
        if (fs.existsSync(filePath)) {
          vscode.workspace
            .openTextDocument(filePath)
            .then((doc: vscode.TextDocument) => {
              vscode.window.showTextDocument(doc);
            });
        }
      }
    },
    undefined,
    []
  );
}

/**
 * Gets the webview HTML content
 */
function getWebviewContent(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  analysis: any,
  packageData: PackageData
): string {
  // Get path to local resources
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "dist", "webview.js")
  );

  // Count total imports per package
  const packageUsage: Record<string, { count: number; files: string[] }> = {};
  Object.entries(analysis.packageImports).forEach(
    ([file, imports]: [string, any]) => {
      imports.forEach((pkg: string) => {
        if (!packageUsage[pkg]) {
          packageUsage[pkg] = {
            count: 0,
            files: [],
          };
        }
        packageUsage[pkg].count++;
        packageUsage[pkg].files.push(file);
      });
    }
  );

  // Prepare data for React
  const analysisData = {
    fileCount: Object.keys(analysis.packageImports).length,
    packageCount: Object.keys(packageUsage).length,
    packages: Object.keys(packageUsage).map((pkg) => ({
      ...packageData[pkg],
      usage: packageUsage[pkg],
    })),
  };

  // Base HTML that loads our React app
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Package Pilot Analysis</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
          padding: 20px;
          line-height: 1.5;
          color: var(--vscode-editor-foreground);
          background-color: var(--vscode-editor-background);
        }
      </style>
    </head>
    <body>
      <div id="root"></div>

      <script>
        // Make VS Code API available to React app
        const vscode = acquireVsCodeApi();

        // Store analysis data for React
        window.analysisData = ${JSON.stringify(analysisData)};
      </script>
      <script src="${scriptUri}"></script>
    </body>
    </html>
  `;
}
