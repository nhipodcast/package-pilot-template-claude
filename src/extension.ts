// The module 'vscode' contains the VS Code extensibility API
import { join } from "path";
import * as vscode from "vscode";
import { ExtensionContext, ExtensionMode, Uri, Webview } from "vscode";
import { MessageHandlerData } from "@estruyf/vscode";
import { readFileSync } from "fs";
import * as fs from "fs";
import * as path from "path";
import axios from "axios";

// Configuration for OpenAI API
// For security reasons, we'll fetch the API key from VS Code settings
function getOpenAIApiKey(): string {
  const config = vscode.workspace.getConfiguration("packagePilot");
  return config.get("openaiApiKey") || "";
}

// Helper function to extract error messages
const errorHandler = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

// Function to analyze project structure
function analyzeProjectStructure(targetPath: string, depth: number = 0) {
  interface ProjectAnalysis {
    structure: {
      type: "directory" | "file";
      name: string;
      path: string;
      children?: ProjectAnalysis["structure"];
    }[];
    packageImports: Record<string, string[]>;
    suggestedAnalysis: string[];
  }

  let analysisResult: ProjectAnalysis = {
    structure: [],
    packageImports: {},
    suggestedAnalysis: [],
  };

  if (!fs.existsSync(targetPath)) {
    return analysisResult;
  }

  // Sort directories first, then files
  let allEntries = fs.readdirSync(targetPath);
  let directories: string[] = [];
  let files: string[] = [];

  allEntries.forEach((entry) => {
    let fullPath = path.join(targetPath, entry);
    try {
      if (fs.statSync(fullPath).isDirectory()) {
        // Skip node_modules and other non-relevant directories
        if (
          entry !== "node_modules" &&
          entry !== ".git" &&
          !entry.startsWith(".")
        ) {
          directories.push(entry);
        }
      } else {
        // Focus on JS/TS files for analysis
        if (
          entry.endsWith(".js") ||
          entry.endsWith(".jsx") ||
          entry.endsWith(".ts") ||
          entry.endsWith(".tsx")
        ) {
          files.push(entry);
        }
      }
    } catch (error) {
      // Skip files that can't be accessed
      console.warn(`Unable to access ${fullPath}: ${errorHandler(error)}`);
    }
  });

  // Process all directories
  directories.forEach((dir: string) => {
    let fullPath: string = path.join(targetPath, dir);
    let subAnalysis: ProjectAnalysis = analyzeProjectStructure(
      fullPath,
      depth + 1
    );
    analysisResult.structure.push({
      type: "directory",
      name: dir,
      path: fullPath,
      children: subAnalysis.structure,
    });

    // Merge package imports from subdirectories
    Object.assign(analysisResult.packageImports, subAnalysis.packageImports);

    // Add suggested files from subdirectories
    analysisResult.suggestedAnalysis = [
      ...analysisResult.suggestedAnalysis,
      ...subAnalysis.suggestedAnalysis,
    ];
  });

  // Process all files
  files.forEach((file) => {
    let fullPath = path.join(targetPath, file);
    analysisResult.structure.push({
      type: "file",
      name: file,
      path: fullPath,
    });

    // Analyze imports for JS/TS files
    try {
      const imports = analyzeFileImports(fullPath);
      if (imports.length > 0) {
        analysisResult.packageImports[fullPath] = imports;

        // If file has many imports, suggest it for detailed analysis
        if (imports.length > 3) {
          analysisResult.suggestedAnalysis.push(fullPath);
        }
      }
    } catch (error) {
      console.warn(
        `Error analyzing imports in ${fullPath}: ${errorHandler(error)}`
      );
    }
  });

  return analysisResult;
}

// Function to analyze imports in a file
function analyzeFileImports(filePath: string): string[] {
  // Basic implementation - uses regex to extract imports
  const content = fs.readFileSync(filePath, "utf8");
  const imports = new Set<string>();

  try {
    // Detect require statements
    const requireMatches = content.match(/require\(['"]([^'"]+)['"]\)/g);
    if (requireMatches) {
      requireMatches.forEach((match) => {
        const regexResult = /require\(['"]([^'"]+)['"]\)/.exec(match);
        if (regexResult && regexResult[1]) {
          const pkg = regexResult[1];
          // Only include npm packages (not relative paths)
          if (!pkg.startsWith(".") && !pkg.startsWith("/")) {
            // Extract base package name (e.g., 'lodash/fp' -> 'lodash')
            const baseName = pkg.split("/")[0];
            imports.add(baseName);
          }
        }
      });
    }

    // Detect import statements
    const importMatches = content.match(/import .+ from ['"]([^'"]+)['"]/g);
    if (importMatches) {
      importMatches.forEach((match) => {
        const regexResult = /from ['"]([^'"]+)['"]/g.exec(match);
        if (regexResult && regexResult[1]) {
          const pkg = regexResult[1];
          // Only include npm packages (not relative paths)
          if (!pkg.startsWith(".") && !pkg.startsWith("/")) {
            // Extract base package name
            const baseName = pkg.split("/")[0];
            imports.add(baseName);
          }
        }
      });
    }

    // Detect dynamic imports
    const dynamicImportMatches = content.match(/import\(['"]([^'"]+)['"]\)/g);
    if (dynamicImportMatches) {
      dynamicImportMatches.forEach((match) => {
        const regexResult = /import\(['"]([^'"]+)['"]\)/.exec(match);
        if (regexResult && regexResult[1]) {
          const pkg = regexResult[1];
          // Only include npm packages (not relative paths)
          if (!pkg.startsWith(".") && !pkg.startsWith("/")) {
            // Extract base package name
            const baseName = pkg.split("/")[0];
            imports.add(baseName);
          }
        }
      });
    }
  } catch (error) {
    console.error(
      `Error parsing imports in ${filePath}: ${errorHandler(error)}`
    );
  }

  return Array.from(imports);
}

// Function to extract unique packages from an import analysis
function extractUniquePackages(
  packageImports: Record<string, string[]>
): Set<string> {
  const uniquePackages = new Set<string>();
  Object.values(packageImports).forEach((imports) => {
    imports.forEach((pkg) => uniquePackages.add(pkg));
  });
  return uniquePackages;
}

// Function to fetch npm metadata for a list of packages
async function fetchNpmMetadata(
  packageNames: string[]
): Promise<Record<string, any>> {
  const packageData: Record<string, any> = {};

  await Promise.all(
    packageNames.map(async (packageName) => {
      try {
        // Fetch basic package info from npm registry
        const response = await axios.get(
          `https://registry.npmjs.org/${packageName}`
        );

        if (response.status === 200) {
          const data = response.data;
          const latestVersion = data["dist-tags"]?.latest;

          packageData[packageName] = {
            name: packageName,
            description: data.description || "",
            version: latestVersion || "",
            license: data.license || "Unknown",
            homepage: data.homepage || "",
            repository: data.repository?.url || "",
            maintainers: data.maintainers?.length || 0,
            lastPublished: data.time?.[latestVersion] || "",
            dependencies: data.versions?.[latestVersion]?.dependencies || {},
            weeklyDownloads: 0, // Will be populated with additional API call
            alternatives: [], // Will be populated later with recommendations
          };

          // Additional API call to get download counts
          try {
            const downloadsResponse = await axios.get(
              `https://api.npmjs.org/downloads/point/last-week/${packageName}`
            );
            if (downloadsResponse.status === 200) {
              packageData[packageName].weeklyDownloads =
                downloadsResponse.data.downloads || 0;
            }
          } catch (error) {
            console.warn(`Could not fetch download stats for ${packageName}`);
          }
        }
      } catch (error) {
        console.warn(
          `Error fetching metadata for ${packageName}: ${errorHandler(error)}`
        );
        // Store minimal info for packages that couldn't be fetched
        packageData[packageName] = {
          name: packageName,
          description: "Could not fetch package data",
          version: "",
          error: errorHandler(error),
        };
      }
    })
  );

  // Generate recommendations using a combination of predefined suggestions and AI analysis
  await Promise.all(
    Object.keys(packageData).map(async (packageName) => {
      switch (packageName) {
        case "moment":
          packageData[packageName].alternatives = [
            "date-fns",
            "dayjs",
            "luxon",
          ];
          packageData[packageName].aiReason =
            "These modern alternatives offer better tree-shaking, smaller bundle sizes, and improved performance.";
          break;
        case "lodash":
        case "underscore":
          packageData[packageName].alternatives = ["lodash-es", "ramda"];
          packageData[packageName].aiReason =
            "ES module versions reduce bundle size, while native JS methods can replace many utility functions.";
          break;
        case "request":
          packageData[packageName].alternatives = [
            "axios",
            "node-fetch",
            "got",
          ];
          packageData[packageName].aiReason =
            "Request is deprecated. These alternatives offer better Promise support and modern features.";
          break;
        case "jquery":
          packageData[packageName].alternatives = ["cash-dom", "umbrella"];
          packageData[packageName].aiReason =
            "Modern browsers support most jQuery features natively. These lightweight alternatives offer similar APIs with much smaller footprints.";
          break;
        default:
          // Use AI to generate recommendations
          break;
      }
    })
  );

  return packageData;
}

// Helper function to get all selected files in the Explorer view
async function getSelectedFilesInExplorer(): Promise<string[]> {
  try {
    // First try to get selected resources from Explorer
    const selectedResources = await vscode.commands.executeCommand<
      vscode.Uri[]
    >("extension.getSelectedExplorerItems");

    if (selectedResources && selectedResources.length > 0) {
      return selectedResources.map((uri) => uri.fsPath);
    }

    // Fall back to an alternative method if the above doesn't work
    const selectedUris = await vscode.commands.executeCommand<vscode.Uri[]>(
      "_filesExplorer.getSelectedResources"
    );

    if (selectedUris && selectedUris.length > 0) {
      return selectedUris.map((uri) => uri.fsPath);
    }

    return [];
  } catch (error) {
    console.warn(
      `Error getting selected explorer items: ${errorHandler(error)}`
    );
    return [];
  }
}

// Function to recursively collect JS/TS files from a directory
function collectFilesFromDir(dirPath: string): string[] {
  const result: string[] = [];
  if (!fs.existsSync(dirPath)) {
    return result;
  }

  const entries = fs.readdirSync(dirPath);
  entries.forEach((entry) => {
    const fullPath = path.join(dirPath, entry);
    try {
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        // Skip node_modules and hidden directories
        if (
          entry !== "node_modules" &&
          entry !== ".git" &&
          !entry.startsWith(".")
        ) {
          result.push(...collectFilesFromDir(fullPath));
        }
      } else if (
        [".js", ".jsx", ".ts", ".tsx"].includes(path.extname(fullPath))
      ) {
        result.push(fullPath);
      }
    } catch (error) {
      console.warn(`Unable to access ${fullPath}: ${errorHandler(error)}`);
    }
  });
  return result;
}

// Central function to analyze folder/project
async function analyzeProjectFolder(
  selectedResource: any,
  context: vscode.ExtensionContext
) {
  try {
    let targetPath: string;

    // If called from explorer context menu, use the selected folder
    if (
      selectedResource &&
      fs.statSync(selectedResource.fsPath).isDirectory()
    ) {
      targetPath = selectedResource.fsPath;
    }
    // If called from command palette, use workspace folder
    else {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage(
          "Please open a workspace folder to analyze"
        );
        return;
      }
      targetPath = workspaceFolders[0].uri.fsPath;
    }

    // Show progress indicator
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Analyzing packages...",
        cancellable: true,
      },
      async (progress) => {
        progress.report({ message: "Scanning project structure..." });

        // Analyze project structure
        const analysis = analyzeProjectStructure(targetPath);

        progress.report({
          message: "Extracting package dependencies...",
          increment: 30,
        });

        // Extract unique packages
        const uniquePackages = extractUniquePackages(analysis.packageImports);

        if (uniquePackages.size === 0) {
          vscode.window.showInformationMessage(
            "No npm packages found in the project"
          );
          return;
        }

        progress.report({
          message: "Fetching npm metadata...",
          increment: 30,
        });

        // Fetch npm metadata for packages
        const packageData = await fetchNpmMetadata(Array.from(uniquePackages));

        progress.report({
          message: "Generating recommendations...",
          increment: 30,
        });

        // Create webview to display results
        displayReactWebview(analysis, packageData, context);

        progress.report({ message: "Analysis complete", increment: 10 });
      }
    );
  } catch (error) {
    vscode.window.showErrorMessage(
      `Error analyzing project: ${errorHandler(error)}`
    );
  }
}

// Function to display package analysis in a React webview
function displayReactWebview(
  analysis: any,
  packageData: any,
  context: vscode.ExtensionContext
): void {
  // Create webview panel
  const panel = vscode.window.createWebviewPanel(
    "packagePilot",
    "packagePilot Analysis",
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [
        vscode.Uri.file(join(context.extensionPath, "dist", "webview")),
      ],
    }
  );

  // Load the React webview
  panel.webview.html = getWebviewContent(context, panel.webview);

  // Send analysis data to the webview when it's ready
  panel.webview.onDidReceiveMessage(
    (message) => {
      const { command, requestId } = message;

      if (command === "GET_ANALYSIS_DATA") {
        // Send the analysis data to the webview
        panel.webview.postMessage({
          command,
          requestId,
          payload: {
            analysis,
            packageData,
          },
        } as MessageHandlerData<{ analysis: any; packageData: any }>);
      } else if (command === "OPEN_FILE") {
        // Handle file opening request
        const filePath = message.payload.filepath;
        if (fs.existsSync(filePath)) {
          vscode.workspace.openTextDocument(filePath).then((doc) => {
            vscode.window.showTextDocument(doc);
          });
        }
      }
    },
    undefined,
    context.subscriptions
  );
}

export function activate(context: vscode.ExtensionContext) {
  console.log("packagePilot is now active");

  // 1. Command to analyze current file (from editor or selected in explorer)
  let analyzeCurrentFileCommand = vscode.commands.registerCommand(
    "packagePilot.analyzeCurrentFile",
    async (selectedResource) => {
      try {
        let filesToAnalyze: string[] = [];

        // If called from explorer context menu, use the selected resource
        if (
          selectedResource &&
          !fs.statSync(selectedResource.fsPath).isDirectory()
        ) {
          const filePath = selectedResource.fsPath;
          const fileExtension = path.extname(filePath);

          // Check if selected file is JS/TS
          if ([".js", ".jsx", ".ts", ".tsx"].includes(fileExtension)) {
            filesToAnalyze.push(filePath);
          } else {
            vscode.window.showInformationMessage(
              "Selected file is not a JavaScript or TypeScript file"
            );
            return;
          }
        }
        // If called from command palette or editor context menu, use the active editor
        else if (!selectedResource) {
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

          filesToAnalyze.push(filePath);
        }

        // Show progress indicator
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Analyzing file...",
            cancellable: true,
          },
          async (progress) => {
            progress.report({ message: "Scanning imports..." });

            // Analyze files
            const packageImports: Record<string, string[]> = {};

            for (const filePath of filesToAnalyze) {
              const imports = analyzeFileImports(filePath);
              if (imports.length > 0) {
                packageImports[filePath] = imports;
              }
            }

            if (Object.keys(packageImports).length === 0) {
              vscode.window.showInformationMessage(
                "No npm packages found in the file"
              );
              return;
            }

            // Extract unique packages
            const uniquePackages = extractUniquePackages(packageImports);

            progress.report({
              message: "Fetching npm metadata...",
              increment: 50,
            });

            // Fetch npm metadata for packages
            const packageData = await fetchNpmMetadata(
              Array.from(uniquePackages)
            );

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

            // Display results with React webview
            displayReactWebview(analysis, packageData, context);

            progress.report({ message: "Analysis complete", increment: 10 });
          }
        );
      } catch (error) {
        vscode.window.showErrorMessage(
          `Error analyzing file: ${errorHandler(error)}`
        );
      }
    }
  );

  // 2. Command for analyze folder (explorer context menu)
  let analyzeFolderCommand = vscode.commands.registerCommand(
    "packagePilot.analyzeFolder",
    (selectedResource) => analyzeProjectFolder(selectedResource, context)
  );

  // 3. Command for analyze project (command palette)
  let analyzeProjectCommand = vscode.commands.registerCommand(
    "packagePilot.analyzeProject",
    (selectedResource) => analyzeProjectFolder(selectedResource, context)
  );

  // 4. Command to analyze selected files from a pick list
  let analyzePickedFilesCommand = vscode.commands.registerCommand(
    "packagePilot.analyzePickedFiles",
    async () => {
      try {
        // Get all JS/TS files in the workspace
        const files = await vscode.workspace.findFiles(
          "**/*.{js,ts,jsx,tsx}",
          "**/node_modules/**"
        );

        if (files.length === 0) {
          vscode.window.showInformationMessage(
            "No JavaScript/TypeScript files found in workspace"
          );
          return;
        }

        // Let user select files to analyze
        const selectedFiles = await vscode.window.showQuickPick(
          files.map((file) => ({
            label: path.basename(file.fsPath),
            description: vscode.workspace.asRelativePath(file.fsPath),
            path: file.fsPath,
          })),
          {
            canPickMany: true,
            placeHolder: "Select files to analyze for package recommendations",
          }
        );

        if (!selectedFiles || selectedFiles.length === 0) {
          return;
        }

        // Show progress indicator
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Analyzing selected files...",
            cancellable: true,
          },
          async (progress) => {
            progress.report({ message: "Scanning imports..." });

            // Analyze selected files
            const packageImports: Record<string, string[]> = {};
            selectedFiles.forEach((file) => {
              const imports = analyzeFileImports(file.path);
              if (imports.length > 0) {
                packageImports[file.path] = imports;
              }
            });

            // Extract unique packages
            const uniquePackages = extractUniquePackages(packageImports);

            if (uniquePackages.size === 0) {
              vscode.window.showInformationMessage(
                "No npm packages found in selected files"
              );
              return;
            }

            progress.report({
              message: "Fetching npm metadata...",
              increment: 50,
            });

            // Fetch npm metadata for packages
            const packageData = await fetchNpmMetadata(
              Array.from(uniquePackages)
            );

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
            displayReactWebview(analysis, packageData, context);

            progress.report({ message: "Analysis complete", increment: 10 });
          }
        );
      } catch (error) {
        vscode.window.showErrorMessage(
          `Error analyzing files: ${errorHandler(error)}`
        );
      }
    }
  );

  // 5. Command to analyze selected files in explorer
  let analyzeSelectedFilesCommand = vscode.commands.registerCommand(
    "packagePilot.analyzeSelectedFiles",
    async (selectedResources: vscode.Uri | vscode.Uri[] | undefined) => {
      try {
        let filesToAnalyze: string[] = [];

        // First, try to get the selected resources from the Explorer
        const explorerSelectedFiles = await getSelectedFilesInExplorer();

        // Process the selected resources from the Explorer
        if (explorerSelectedFiles.length > 0) {
          explorerSelectedFiles.forEach((resourcePath) => {
            const stat = fs.statSync(resourcePath);
            if (stat.isFile()) {
              // If it's a JS/TS file, include it directly
              if (
                [".js", ".jsx", ".ts", ".tsx"].includes(
                  path.extname(resourcePath)
                )
              ) {
                filesToAnalyze.push(resourcePath);
              }
            } else if (stat.isDirectory()) {
              // If it's a directory, collect all JS/TS files within it
              filesToAnalyze.push(...collectFilesFromDir(resourcePath));
            }
          });
        }

        // If no files were selected in the Explorer, fall back to the context menu argument
        if (filesToAnalyze.length === 0 && selectedResources) {
          const resources = Array.isArray(selectedResources)
            ? selectedResources
            : [selectedResources];

          resources.forEach((resource) => {
            const stat = fs.statSync(resource.fsPath);
            if (stat.isFile()) {
              // If it's a JS/TS file, include it directly
              if (
                [".js", ".jsx", ".ts", ".tsx"].includes(
                  path.extname(resource.fsPath)
                )
              ) {
                filesToAnalyze.push(resource.fsPath);
              } else {
                // Otherwise, collect all JS/TS files from its parent directory
                const parentDir = path.dirname(resource.fsPath);
                filesToAnalyze.push(...collectFilesFromDir(parentDir));
              }
            } else if (stat.isDirectory()) {
              // If it's a directory, collect all JS/TS files within it
              filesToAnalyze.push(...collectFilesFromDir(resource.fsPath));
            }
          });
        }

        // Remove duplicates
        filesToAnalyze = Array.from(new Set(filesToAnalyze));

        if (filesToAnalyze.length === 0) {
          vscode.window.showInformationMessage(
            "No JavaScript or TypeScript files found to analyze"
          );
          return;
        }

        // Show progress indicator
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Analyzing ${filesToAnalyze.length} file(s)...`,
            cancellable: true,
          },
          async (progress) => {
            progress.report({ message: "Scanning imports..." });

            // Analyze all collected files
            const packageImports: Record<string, string[]> = {};
            let totalImports: string[] = [];

            for (const filePath of filesToAnalyze) {
              const imports = analyzeFileImports(filePath);
              if (imports.length > 0) {
                packageImports[filePath] = imports;
                totalImports = [...totalImports, ...imports];
              }
            }

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

            const packageData = await fetchNpmMetadata(uniqueImports);

            progress.report({
              message: "Generating recommendations...",
              increment: 40,
            });

            const analysis = {
              structure: [],
              packageImports,
              suggestedAnalysis: Object.keys(packageImports),
            };

            displayReactWebview(analysis, packageData, context);

            progress.report({ message: "Analysis complete", increment: 10 });
          }
        );
      } catch (error) {
        vscode.window.showErrorMessage(
          `Error analyzing file(s): ${errorHandler(error)}`
        );
      }
    }
  );

  // 6. Command to open the React webview directly (for debugging)
  let openWebviewCommand = vscode.commands.registerCommand(
    "packagePilot.openWebview",
    () => {
      const panel = vscode.window.createWebviewPanel(
        "packagePilot",
        "packagePilot",
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
        }
      );

      panel.webview.html = getWebviewContent(context, panel.webview);

      panel.webview.onDidReceiveMessage(
        (message) => {
          const { command, requestId } = message;

          if (command === "GET_ANALYSIS_DATA") {
            // For direct opening, send empty data
            panel.webview.postMessage({
              command,
              requestId,
              payload: {
                analysis: {
                  packageImports: {},
                  structure: [],
                  suggestedAnalysis: [],
                },
                packageData: {},
              },
            } as MessageHandlerData<{ analysis: any; packageData: any }>);
          }
        },
        undefined,
        context.subscriptions
      );
    }
  );

  // Add all commands to subscriptions
  context.subscriptions.push(
    analyzeCurrentFileCommand,
    analyzeFolderCommand,
    analyzeProjectCommand,
    analyzePickedFilesCommand,
    analyzeSelectedFilesCommand,
    openWebviewCommand
  );
}

// Function to get webview content
const getWebviewContent = (context: ExtensionContext, webview: Webview) => {
  const jsFile = "main.bundle.js";
  const localServerUrl = "http://localhost:9000";

  let scriptUrl = [];
  let cssUrl = null;

  const isProduction = context.extensionMode === ExtensionMode.Production;
  if (isProduction) {
    // Get the manifest file from the dist folder
    const manifest = readFileSync(
      join(context.extensionPath, "dist", "webview", "manifest.json"),
      "utf-8"
    );
    const manifestJson = JSON.parse(manifest);
    for (const [key, value] of Object.entries<string>(manifestJson)) {
      if (key.endsWith(".js")) {
        scriptUrl.push(
          webview
            .asWebviewUri(
              Uri.file(join(context.extensionPath, "dist", "webview", value))
            )
            .toString()
        );
      }
    }
  } else {
    scriptUrl.push(`${localServerUrl}/${jsFile}`);
  }

  return `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    ${isProduction ? `<link href="${cssUrl}" rel="stylesheet">` : ""}
    <style>
      :root {
        --vscode-editor-foreground: #cccccc;
        --vscode-editor-background: #1e1e1e;
        --vscode-editor-inactiveSelectionBackground: #3a3d41;
        --vscode-panel-border: #80808059;
        --vscode-symbolIcon-packageForeground: #cccccc;
        --vscode-descriptionForeground: #ccccccb3;
        --vscode-textLink-foreground: #3794ff;
      }
      body {
        background-color: var(--vscode-editor-background);
        color: var(--vscode-editor-foreground);
      }
    </style>
  </head>
  <body>
    <div id="root"></div>

    ${scriptUrl.map((url) => `<script src="${url}"></script>`).join("\n")}
  </body>
  </html>`;
};

// This method is called when your extension is deactivated
export function deactivate() {
  console.log("packagePilot is now deactivated");
}
