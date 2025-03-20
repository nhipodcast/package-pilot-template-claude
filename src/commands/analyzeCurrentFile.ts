import vscode from "vscode";
import * as path from "path";
import { analyzeFileImports } from "../services/packageAnalyzer";
import { fetchNpmMetadata } from "../services/npmService";
import { errorString } from "../utils/errorHandler";
import { displayPackageAnalysis } from "../ui/webview/webviewManager";

/**
 * Registers the command to analyze the current file
 */
export function registerAnalyzeCurrentFileCommand(
  context: vscode.ExtensionContext
) {
  return vscode.commands.registerCommand(
    "packagePilot.analyzeCurrentFile",
    async () => {
      try {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
          vscode.window.showInformationMessage("No active file to analyze");
          return;
        }

        const filePath = activeEditor.document.uri.fsPath;
        const fileExtension = path.extname(filePath);

        // Check if current file is JS/TS
        if (![".js", ".jsx", ".ts", ".tsx"].includes(fileExtension)) {
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
}
