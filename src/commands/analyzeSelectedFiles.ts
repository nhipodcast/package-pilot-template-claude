import * as vscode from "vscode";
import * as path from "path";
import { analyzeFileImports } from "../services/packageAnalyzer";
import { fetchNpmMetadata } from "../services/npmService";
import { errorString } from "../utils/errorHandling";
import { displayPackageAnalysis } from "../ui/webview/webviewManager";

export function registerAnalyzeSelectedFilesCommand(
  context: vscode.ExtensionContext
) {
  return vscode.commands.registerCommand(
    "packagePilot.analyzeSelectedFiles",
    async (selectedResources) => {
      try {
        // Handle both single selection and multiple selections (from explorer)
        let filesToAnalyze: string[] = [];

        if (selectedResources) {
          // VS Code might pass a single resource or an array of resources
          if (Array.isArray(selectedResources)) {
            // Multiple files selected
            filesToAnalyze = selectedResources
              .filter((resource) => {
                const ext = path.extname(resource.fsPath);
                return [".js", ".jsx", ".ts", ".tsx"].includes(ext);
              })
              .map((resource) => resource.fsPath);
          } else {
            // Single file selected
            const filePath = selectedResources.fsPath;
            const fileExtension = path.extname(filePath);

            if ([".js", ".jsx", ".ts", ".tsx"].includes(fileExtension)) {
              filesToAnalyze.push(filePath);
            } else {
              vscode.window.showInformationMessage(
                "Selected file is not a JavaScript or TypeScript file"
              );
              return;
            }
          }
        } else {
          // No resources selected, use the active editor instead
          const activeEditor = vscode.window.activeTextEditor;
          if (activeEditor) {
            const filePath = activeEditor.document.uri.fsPath;
            const fileExtension = path.extname(filePath);

            if ([".js", ".jsx", ".ts", ".tsx"].includes(fileExtension)) {
              filesToAnalyze.push(filePath);
            } else {
              vscode.window.showInformationMessage(
                "Current file is not a JavaScript or TypeScript file"
              );
              return;
            }
          } else {
            vscode.window.showInformationMessage(
              "Please select a file to analyze"
            );
            return;
          }
        }

        if (filesToAnalyze.length === 0) {
          vscode.window.showInformationMessage(
            "No JavaScript or TypeScript files selected"
          );
          return;
        }

        // Show progress indicator
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Analyzing ${filesToAnalyze.length} selected file(s)...`,
            cancellable: true,
          },
          async (progress) => {
            progress.report({ message: "Scanning imports..." });

            // Analyze all selected files
            const packageImports: Record<string, string[]> = {};
            let totalImports: string[] = [];

            // Process each file
            for (const filePath of filesToAnalyze) {
              const imports = analyzeFileImports(filePath);
              if (imports.length > 0) {
                packageImports[filePath] = imports;
                // Add to total imports for metadata fetching
                totalImports = [...totalImports, ...imports];
              }
            }

            // Get unique imports across all files
            const uniqueImports = Array.from(new Set(totalImports));

            if (uniqueImports.length === 0) {
              vscode.window.showInformationMessage(
                "No npm packages found in the selected file(s)"
              );
              return;
            }

            progress.report({
              message: "Fetching npm metadata...",
              increment: 50,
            });

            // Fetch npm metadata for all packages
            const packageData = await fetchNpmMetadata(uniqueImports);

            progress.report({
              message: "Generating recommendations...",
              increment: 40,
            });

            // Create analysis result structure
            const analysis = {
              structure: [],
              packageImports,
              suggestedAnalysis: Object.keys(packageImports),
            };

            // Display results
            displayPackageAnalysis(analysis, packageData, context.extensionUri);

            progress.report({ message: "Analysis complete", increment: 10 });
          }
        );
      } catch (error) {
        vscode.window.showErrorMessage(
          `Error analyzing file(s): ${errorString(error)}`
        );
      }
    }
  );
}
