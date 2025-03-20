import vscode from "vscode";
import { analyzeFileImports } from "./services/packageAnalyzer";
import { analyzeFileImports } from "./services/packageAnalyzer";
import { fetchNpmMetadata } from "./services/npmService";
import { errorString } from "./utils/errorHandler";

// Activation function for the extension
export function activate(context: vscode.ExtensionContext) {
  console.log("packagePilot is now active");

  // Register command to analyze current file
  let analyzeCurrentFileCommand = vscode.commands.registerCommand(
    "packagePilot.analyzeCurrentFile",
    async () => {
      try {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
          vscode.window.showInformationMessage("No active file to analyze");
          return;
        }

        const filePath = activeEditor.document.uri.fsPath;
        const fileExtension = filePath.split(".").pop();

        // Check if current file is JS/TS
        if (!["js", "jsx", "ts", "tsx"].includes(fileExtension || "")) {
          vscode.window.showInformationMessage(
            "Current file is not a JavaScript or TypeScript file"
          );
          return;
        }

        // Show progress indicator
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Analyzing current file...",
            cancellable: true,
          },
          async (
            progress: vscode.Progress<{ message?: string; increment?: number }>
          ) => {
            progress.report({ message: "Scanning imports..." });

            // Analyze current file
            const imports = analyzeFileImports(filePath);

            if (imports.length === 0) {
              vscode.window.showInformationMessage(
                "No npm packages found in the current file"
              );
              return;
            }

            progress.report({
              message: "Fetching npm metadata...",
              increment: 50,
            });

            // Fetch npm metadata for packages
            const packageData = await fetchNpmMetadata(imports);

            progress.report({
              message: "Generating recommendations...",
              increment: 40,
            });

            // Create simple analysis structure
            const packageImports: Record<string, string[]> = {};
            packageImports[filePath] = imports;

            const analysis = {
              structure: [],
              packageImports,
              suggestedAnalysis: [filePath],
            };

            // Display results
            displayPackageAnalysis(analysis, packageData, context.extensionUri);

            progress.report({ message: "Analysis complete", increment: 10 });
          }
        );
      } catch (error) {
        vscode.window.showErrorMessage(
          `Error analyzing current file: ${errorString(error)}`
        );
      }
    }
  );

  // Register command to analyze project structure
  let analyzeProjectCommand = vscode.commands.registerCommand(
    "packagePilot.analyzeProject",
    async (selectedResource: vscode.Uri[]) => {
      vscode.window.showInformationMessage(
        "Analyze Project functionality is coming soon!"
      );
    }
  );

  // Register command to analyze selected files
  let analyzeSelectedFilesCommand = vscode.commands.registerCommand(
    "packagePilot.analyzeSelectedFiles",
    async (selectedResource: vscode.Uri[]) => {
      vscode.window.showInformationMessage(
        "Analyze Selected Files functionality is coming soon!"
      );
    }
  );

  context.subscriptions.push(
    analyzeCurrentFileCommand,
    analyzeProjectCommand,
    analyzeSelectedFilesCommand
  );
}

// Function to display package analysis in a webview
function displayPackageAnalysis(
  analysis: any,
  packageData: any,
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

  // Simple HTML content for now
  panel.webview.html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Package Pilot Analysis</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          padding: 20px;
          color: var(--vscode-editor-foreground);
          background-color: var(--vscode-editor-background);
        }
        .package-card {
          border: 1px solid var(--vscode-panel-border);
          border-radius: 4px;
          padding: 15px;
          margin-bottom: 15px;
        }
        .package-name {
          font-weight: bold;
          margin-bottom: 5px;
        }
      </style>
    </head>
    <body>
      <h1>Package Analysis</h1>
      <div>
${JSON.stringify(packageData)}
        ${Object.keys(packageData)
          .map(
            (pkg) => `
          <div class="package-card">
            <div class="package-name">${pkg}</div>
            <div>${
              packageData[pkg].description || "No description available"
            }</div>
          </div>
        `
          )
          .join("")}
      </div>
    </body>
    </html>
  `;
}

// This method is called when your extension is deactivated
export function deactivate() {
  console.log("packagePilot is now deactivated");
}
