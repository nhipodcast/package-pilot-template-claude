import * as vscode from "vscode";
import { analyzeFileImports } from "./services/packageAnalyzer";
import { fetchNpmMetadata } from "./services/npmService";
import { errorHandler } from "./utils/errorHandler";
import { registerWebviewMessageHandlers } from "./webview/messageHandlers";
import { CommandType } from "./messageHandler";

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
          `Error analyzing current file: ${errorHandler(error)}`
        );
      }
    }
  );

  // Register command to analyze project structure
  let analyzeProjectCommand = vscode.commands.registerCommand(
    "packagePilot.analyzeProject",
    async () => {
      try {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
          vscode.window.showInformationMessage(
            "No workspace folder open. Please open a project folder first."
          );
          return;
        }

        const rootPath = workspaceFolders[0].uri.fsPath;

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Analyzing project...",
            cancellable: true,
          },
          async (progress) => {
            progress.report({ message: "Scanning project structure..." });

            // Use the package analyzer service to scan the project
            const { analyzeProjectStructure } = await import(
              "./services/packageAnalyzer"
            );
            const analysis = analyzeProjectStructure(rootPath);

            // Extract unique packages from all files
            const allPackages = new Set<string>();
            Object.values(analysis.packageImports).forEach((packages) => {
              packages.forEach((pkg) => allPackages.add(pkg));
            });

            if (allPackages.size === 0) {
              vscode.window.showInformationMessage(
                "No npm packages found in the project files."
              );
              return;
            }

            progress.report({
              message: `Fetching metadata for ${allPackages.size} packages...`,
              increment: 40,
            });

            // Fetch metadata for all found packages
            const packageData = await fetchNpmMetadata(Array.from(allPackages));

            progress.report({
              message: "Generating project analysis...",
              increment: 40,
            });

            // Display the analysis results
            displayPackageAnalysis(analysis, packageData, context.extensionUri);

            progress.report({ message: "Analysis complete", increment: 20 });
          }
        );
      } catch (error) {
        vscode.window.showErrorMessage(
          `Error analyzing project: ${errorHandler(error)}`
        );
      }
    }
  );

  // Register command to analyze selected files
  let analyzeSelectedFilesCommand = vscode.commands.registerCommand(
    "packagePilot.analyzeSelectedFiles",
    async (selectedResource: vscode.Uri) => {
      try {
        // If no resource was passed, use the currently active file
        if (!selectedResource) {
          const activeEditor = vscode.window.activeTextEditor;
          if (!activeEditor) {
            vscode.window.showInformationMessage(
              "No file selected for analysis"
            );
            return;
          }
          selectedResource = activeEditor.document.uri;
        }

        // Initialize variables for file or directory analysis
        let filesToAnalyze: string[] = [];

        // Check if selected resource is a file or directory
        const stat = await vscode.workspace.fs.stat(selectedResource);

        if (stat.type === vscode.FileType.File) {
          // Single file analysis
          const filePath = selectedResource.fsPath;
          const fileExtension = filePath.split(".").pop();

          if (["js", "jsx", "ts", "tsx"].includes(fileExtension || "")) {
            filesToAnalyze = [filePath];
          } else {
            vscode.window.showInformationMessage(
              "Selected file is not a JavaScript or TypeScript file"
            );
            return;
          }
        } else if (stat.type === vscode.FileType.Directory) {
          // Directory analysis
          vscode.window.showInformationMessage(
            "Analyzing selected directory..."
          );

          // Use the appropriate service to scan the directory
          const { analyzeProjectStructure } = await import(
            "./services/packageAnalyzer"
          );
          const analysis = analyzeProjectStructure(selectedResource.fsPath);

          // Get all JS/TS files in the directory
          filesToAnalyze = Object.keys(analysis.packageImports);
        }

        if (filesToAnalyze.length === 0) {
          vscode.window.showInformationMessage(
            "No suitable files found for analysis"
          );
          return;
        }

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Analyzing ${filesToAnalyze.length} file(s)...`,
            cancellable: true,
          },
          async (progress) => {
            progress.report({ message: "Collecting imports..." });

            // Track imports for all files
            const packageImports: Record<string, string[]> = {};
            const allPackages = new Set<string>();

            // Analyze each file
            for (const filePath of filesToAnalyze) {
              const imports = analyzeFileImports(filePath);
              if (imports.length > 0) {
                packageImports[filePath] = imports;
                imports.forEach((pkg) => allPackages.add(pkg));
              }
            }

            if (allPackages.size === 0) {
              vscode.window.showInformationMessage(
                "No npm packages found in the selected file(s)"
              );
              return;
            }

            progress.report({
              message: `Fetching metadata for ${allPackages.size} packages...`,
              increment: 50,
            });

            // Fetch metadata for all packages
            const packageData = await fetchNpmMetadata(Array.from(allPackages));

            progress.report({
              message: "Generating analysis report...",
              increment: 40,
            });

            // Create the analysis structure
            const analysis = {
              structure: [],
              packageImports,
              suggestedAnalysis: Object.keys(packageImports),
            };

            // Display the analysis
            displayPackageAnalysis(analysis, packageData, context.extensionUri);

            progress.report({ message: "Analysis complete", increment: 10 });
          }
        );
      } catch (error) {
        vscode.window.showErrorMessage(
          `Error analyzing selected files: ${errorHandler(error)}`
        );
      }
    }
  );

  // Register commands for message handling from webview
  registerWebviewMessageHandlers(context);

  // Add all commands to subscriptions
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
  // Create and show a new webview panel
  const panel = vscode.window.createWebviewPanel(
    "packagePilot",
    "Package Pilot Analysis",
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      localResourceRoots: [extensionUri],
      retainContextWhenHidden: true,
    }
  );

  // Set up message handling for the webview
  panel.webview.onDidReceiveMessage(
    async (message) => {
      // Handle messages from webview
      switch (message.command) {
        case CommandType.OpenFile:
          if (message.filePath) {
            try {
              const document = await vscode.workspace.openTextDocument(
                message.filePath
              );
              await vscode.window.showTextDocument(document);
            } catch (error) {
              vscode.window.showErrorMessage(
                `Error opening file: ${errorHandler(error)}`
              );
            }
          }
          break;

        case CommandType.GetAnalysisData:
          // Send analysis data to webview
          panel.webview.postMessage({
            command: CommandType.GetAnalysisData,
            data: {
              packageData: packageData,
              packageUsage: analysis.packageImports,
            },
          });
          break;

        default:
          console.log(
            `Unknown command received from webview: ${message.command}`
          );
          break;
      }
    },
    undefined,
    []
  );

  // Prepare webview content
  panel.webview.html = getWebviewHtml(
    panel.webview,
    extensionUri,
    analysis,
    packageData
  );
}

/**
 * Generate HTML for the webview
 */
function getWebviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  analysis: any,
  packageData: any
): string {
  // Get path to main webview JavaScript file
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "dist", "webview.js")
  );

  // Get path to CSS styles
  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "dist", "styles.css")
  );

  // Generate nonce for CSP
  const nonce = getNonce();

  // Create HTML
  return `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${
      webview.cspSource
    } https:; script-src 'nonce-${nonce}'; style-src ${
    webview.cspSource
  } 'unsafe-inline';">
    <link href="${styleUri}" rel="stylesheet">
    <title>Package Pilot Analysis</title>
  </head>
  <body>
    <div id="root"></div>

    <script nonce="${nonce}">
      // Initial data for webview
      window.initialData = {
        analysis: ${JSON.stringify(analysis)},
        packageData: ${JSON.stringify(packageData)}
      };

      // Message handler setup
      const vscode = acquireVsCodeApi();
      window.vscode = vscode;
    </script>
    <script nonce="${nonce}" src="${scriptUri}"></script>
  </body>
  </html>`;
}

/**
 * Generate a random nonce for CSP
 */
function getNonce(): string {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

// This method is called when your extension is deactivated
export function deactivate() {
  console.log("packagePilot is now deactivated");
}
