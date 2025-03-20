import vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import {
  analyzeProjectStructure,
  analyzeFileImports,
  fetchNpmMetadata,
} from "./analysis/projectScanner";
import { scorePackages, PackageScore } from "./analysis/scoring";

import {
  generateRecommendations,
  generateMigrationCode,
} from "./ai/recommendations";
import { displayPackageAnalysis } from "./ui/analysisView";
import { offlineModeService } from "./ai/offlineMode";

// Create a safe command registration function since it doesn't exist in VS Code API
async function registerCommandSafely(
  context: vscode.ExtensionContext,
  commandId: string,
  callback: (...args: any[]) => any
): Promise<vscode.Disposable> {
  try {
    // Get all existing commands
    const commands = await vscode.commands.getCommands();

    // Check if our command already exists
    if (commands.includes(commandId)) {
      // Command exists, create a unique ID with timestamp
      const uniqueId = `${commandId}.instance${Date.now()}`;
      console.log(
        `Command ${commandId} already exists. Using ${uniqueId} instead.`
      );

      // Register with unique ID
      const disposable = vscode.commands.registerCommand(uniqueId, callback);
      return disposable;
    } else {
      // Register with original ID
      const disposable = vscode.commands.registerCommand(commandId, callback);
      return disposable;
    }
  } catch (error) {
    console.error(`Failed to register command ${commandId}: ${error}`);
    // Fall back to regular registration
    return vscode.commands.registerCommand(commandId, callback);
  }
}

async function checkApiKeyConfigured(): Promise<boolean> {
  const config = vscode.workspace.getConfiguration("packagePilot");
  const apiKey = config.get<string>("openaiApiKey");

  if (!apiKey) {
    const suppressPrompt = config.get<boolean>("suppressApiKeyPrompt", false);

    if (!suppressPrompt) {
      const configureNow = "Configure Now";
      const learnMore = "Learn More";
      const dontAsk = "Don't Ask Again";

      const selection = await vscode.window.showInformationMessage(
        "Package Pilot works better with an OpenAI API key. Some features will be limited without it.",
        configureNow,
        learnMore,
        dontAsk
      );

      if (selection === configureNow) {
        await vscode.commands.executeCommand(
          "workbench.action.openSettings",
          "packagePilot.openaiApiKey"
        );
      } else if (selection === learnMore) {
        vscode.env.openExternal(
          vscode.Uri.parse("https://platform.openai.com/api-keys")
        );
      } else if (selection === dontAsk) {
        await config.update(
          "suppressApiKeyPrompt",
          true,
          vscode.ConfigurationTarget.Global
        );
      }
    }

    return false;
  }

  return true;
}

export async function activate(context: vscode.ExtensionContext) {
  console.log("Package Pilot is now active");

  offlineModeService.setExtensionContext(context);

  // Helper to run analysis
  async function runAnalysis(
    target: string | string[] | undefined,
    scope: "file" | "folder" | "project" | "picked" | "selected"
  ) {
    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Analyzing ${scope}...`,
          cancellable: true,
        },
        async (
          progress: vscode.Progress<{ message?: string; increment?: number }>
        ) => {
          progress.report({ message: "Scanning imports..." });

          // Determine files to analyze
          let files: string[];
          if (scope === "file" && typeof target === "string") {
            files = [target];
          } else if (scope === "folder" && typeof target === "string") {
            files = analyzeProjectStructure(target)
              .structure.filter((s) => s.type === "file")
              .map((s) => s.path);
          } else if (scope === "project") {
            const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!ws) {
              throw new Error("No workspace open");
            }
            files = analyzeProjectStructure(ws)
              .structure.filter((s) => s.type === "file")
              .map((s) => s.path);
          } else if (scope === "picked") {
            const picks = await vscode.window.showQuickPick(
              (
                await vscode.workspace.findFiles(
                  "**/*.{js,ts,jsx,tsx}",
                  "**/node_modules/**"
                )
              ).map((f: { fsPath: string }) => ({
                label: path.basename(f.fsPath),
                description: vscode.workspace.asRelativePath(f.fsPath),
                path: f.fsPath,
              })),
              { canPickMany: true }
            );
            files = picks?.map((p: { path: any }) => p.path) || [];
          } else if (scope === "selected" && Array.isArray(target)) {
            files = target.flatMap((t) =>
              fs.statSync(t).isDirectory()
                ? analyzeProjectStructure(t)
                    .structure.filter((s) => s.type === "file")
                    .map((s) => s.path)
                : [t]
            );
          } else {
            throw new Error("Invalid analysis target");
          }

          if (!files.length) {
            vscode.window.showInformationMessage("No files to analyze");
            return;
          }

          // Analyze imports
          const packageImports: Record<string, string[]> = {};
          for (const file of files) {
            const imports = analyzeFileImports(file);
            if (imports.length) {
              packageImports[file] = imports;
            }
          }

          if (!Object.keys(packageImports).length) {
            vscode.window.showInformationMessage("No packages found");
            return;
          }

          progress.report({ message: "Fetching metadata...", increment: 30 });
          const uniquePackages = new Set(Object.values(packageImports).flat());
          const npmData = await fetchNpmMetadata(Array.from(uniquePackages));

          progress.report({ message: "Scoring packages...", increment: 30 });
          const scores = await scorePackages(npmData, packageImports);

          progress.report({
            message: "Generating recommendations...",
            increment: 20,
          });
          const scoresRecord = scores.reduce((acc, score) => {
            acc[score.name] = score;
            return acc;
          }, {} as Record<string, PackageScore>);
          const recommendations = await generateRecommendations(scoresRecord);

          progress.report({ message: "Rendering results...", increment: 10 });
          displayPackageAnalysis(
            {
              structure: files.map((f) => ({
                type: "file",
                name: path.basename(f),
                path: f,
              })),
              packageImports,
              suggestedAnalysis: Object.keys(packageImports),
            },
            {
              npmData,
              scores: scores.reduce((acc, score) => {
                acc[score.name] = score;
                return acc;
              }, {} as Record<string, PackageScore>),
              recommendations,
            },
            context.extensionUri
          );
        }
      );
    } catch (error) {
      vscode.window.showErrorMessage(`Error: ${(error as Error).message}`);
    }
  }

  // Define command handlers
  const analyzeCurrentFile = async (uri?: vscode.Uri) =>
    runAnalysis(uri?.fsPath, "file");

  const analyzeFolder = async (uri?: vscode.Uri) =>
    runAnalysis(uri?.fsPath, "folder");

  const analyzeProject = async () => runAnalysis(undefined, "project");

  const analyzePickedFiles = async () => runAnalysis(undefined, "picked");

  const analyzeSelectedFiles = async (uri?: vscode.Uri) =>
    runAnalysis(uri ? [uri.fsPath] : undefined, "selected");

  /**
   * Add this to the migrate function to check API key before attempting migration
   */
  // When generating the migration plan
  const generateMigrationPlanWithFallback = async () => {
    const pkg = await vscode.window.showInputBox({
      prompt: "Enter package to migrate from",
    });
    // Before showing a document in a text editor, check if it's still available
    const showTextDocument = async (document: vscode.TextDocument) => {
      try {
        const editor = await vscode.window.showTextDocument(document);
        // Only proceed if the editor is still valid
        if (editor && !editor.document.isClosed) {
          // Safe to use the editor here
        }
      } catch (error) {
        console.error("Failed to show document:", error);
      }
    };

    if (!pkg) {
      return;
    }

    try {
      // Show migration in progress
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Generating migration plan for ${pkg}...`,
          cancellable: true,
        },
        async (
          progress: vscode.Progress<{ message?: string; increment?: number }>
        ) => {
          const migration = await generateMigrationCode(pkg, context);

          // Create the document
          const document = await vscode.workspace.openTextDocument({
            content: migration,
            language: "typescript",
          });

          // Try to show it - might fail if editor environment changed
          try {
            await vscode.window.showTextDocument(document);
          } catch (error) {
            console.log(
              "Could not show document, editor might be closed:",
              error
            );
            // Maybe offer alternative like copying to clipboard
            vscode.env.clipboard.writeText(migration);
            vscode.window.showInformationMessage(
              "Migration plan copied to clipboard"
            );
          }
        }
      );
    } catch (error) {
      vscode.window.showErrorMessage(
        `Error generating migration plan: ${(error as Error).message}`
      );
    }
  };

  // Replace the migration command registration with this:
  const migrationCmd = await registerCommandSafely(
    context,
    "evan-meeks.package-pilot-vscode.generateMigrationPlan",
    generateMigrationPlanWithFallback
  );
  context.subscriptions.push(migrationCmd);

  // Add this command to allow users to clear the API cache
  const clearCacheCmd = await registerCommandSafely(
    context,
    "evan-meeks.package-pilot-vscode.clearCache",
    async () => {
      try {
        // Import here to avoid circular dependencies
        const { openaiClient } = await import("./ai/client.js");

        if (openaiClient) {
          openaiClient.clearCache();
          vscode.window.showInformationMessage(
            "Package Pilot: API cache cleared successfully"
          );
        } else {
          vscode.window.showInformationMessage(
            "Package Pilot: No API cache to clear"
          );
        }
      } catch (error) {
        vscode.window.showErrorMessage(
          `Error clearing cache: ${
            error instanceof Error ? error.message : JSON.stringify(error)
          }`
        );
      }
    }
  );

  // Register commands with explicit names
  const commands = [
    {
      id: "evan-meeks.package-pilot-vscode.analyzeCurrentFile",
      handler: analyzeCurrentFile,
    },
    {
      id: "evan-meeks.package-pilot-vscode.analyzeFolder",
      handler: analyzeFolder,
    },
    {
      id: "evan-meeks.package-pilot-vscode.analyzeProject",
      handler: analyzeProject,
    },
    {
      id: "evan-meeks.package-pilot-vscode.analyzePickedFiles",
      handler: analyzePickedFiles,
    },
    {
      id: "evan-meeks.package-pilot-vscode.analyzeSelectedFiles",
      handler: analyzeSelectedFiles,
    },
    {
      id: "evan-meeks.package-pilot-vscode.generateMigrationPlan",
      handler: generateMigrationPlanWithFallback,
    },
    {
      id: "evan-meeks.package-pilot-vscode.toggleOfflineMode",
      handler: async () => {
        try {
          const offlineModule = await import("./ai/offlineMode.js");
          if (
            offlineModule &&
            typeof offlineModule.toggleOfflineMode === "function"
          ) {
            offlineModule.toggleOfflineMode();
          } else {
            throw new Error("toggleOfflineMode function not found in module");
          }
        } catch (error) {
          console.error("Error importing offlineMode module:", error);
          vscode.window.showErrorMessage(
            `Error toggling offline mode: ${
              error instanceof Error ? error.message : JSON.stringify(error)
            }`
          );
        }
      },
    },
  ];

  // Register all commands
  for (const cmd of commands) {
    console.log(`Registering command: ${cmd.id}`);
    const disposable = await registerCommandSafely(
      context,
      cmd.id,
      cmd.handler
    );
    context.subscriptions.push(disposable);
  }

  console.log("All Package Pilot commands registered successfully");
}

export function deactivate() {
  console.log("Package Pilot deactivated");
}
