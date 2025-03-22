import * as vscode from "vscode";
import { analyzeFileImports } from "../../../services/packageAnalyzer";
import { fetchNpmMetadata } from "../../../services/npmService";
import { errorString } from "../u";
import { CommandType } from "../../messageHandler";

/**
 * Register handlers for messages from the webview
 */
export function registerWebviewMessageHandlers(
  context: vscode.ExtensionContext
) {
  // Register a command that will be exposed to the webview for message handling
  const messageHandler = vscode.commands.registerCommand(
    "packagePilot.handleWebviewMessage",
    async (message: any) => {
      try {
        // Process message based on command type
        switch (message.command) {
          case CommandType.AnalyzeCurrentFile:
            return handleAnalyzeCurrentFile();

          case CommandType.AnalyzeFolder:
            return handleAnalyzeFolder();

          case CommandType.AnalyzeProject:
            return handleAnalyzeProject();

          case CommandType.AnalyzePickedFiles:
            return handleAnalyzePickedFiles();

          case CommandType.AnalyzeSelectedFiles:
            return handleAnalyzeSelectedFiles(message.data);

          case CommandType.OpenFile:
            return handleOpenFile(message.data?.filePath);

          case CommandType.GetAnalysisData:
            return handleGetAnalysisData();

          case CommandType.GetData:
            return "Sample data from extension";

          case CommandType.GetDataError:
            throw new Error("Test error requested by webview");

          case CommandType.PostData:
            console.log("Received data from webview:", message.data);
            return "Data received successfully";

          default:
            console.log(`Unknown command received: ${message.command}`);
            return null;
        }
      } catch (error) {
        console.error(`Error handling message: ${errorString(error)}`);
        throw error; // Re-throw for proper error handling in caller
      }
    }
  );

  // Add command to subscriptions
  context.subscriptions.push(messageHandler);
}

/**
 * Handle analyze current file request
 */
async function handleAnalyzeCurrentFile() {
  const activeEditor = vscode.window.activeTextEditor;
  if (!activeEditor) {
    throw new Error("No active file to analyze");
  }

  const filePath = activeEditor.document.uri.fsPath;
  const fileExtension = filePath.split(".").pop();

  // Check if current file is JS/TS
  if (!["js", "jsx", "ts", "tsx"].includes(fileExtension || "")) {
    throw new Error("Current file is not a JavaScript or TypeScript file");
  }

  // Analyze current file
  const imports = analyzeFileImports(filePath);
  if (imports.length === 0) {
    throw new Error("No npm packages found in the current file");
  }

  // Fetch npm metadata for packages
  const packageData = await fetchNpmMetadata(imports);

  // Create analysis structure
  const packageImports: Record<string, string[]> = {};
  packageImports[filePath] = imports;

  return {
    packageData,
    packageImports,
  };
}

/**
 * Handle analyze folder request
 */
async function handleAnalyzeFolder() {
  // Show folder picker dialog
  const folderUri = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: "Analyze Folder",
  });

  if (!folderUri || folderUri.length === 0) {
    throw new Error("No folder selected");
  }

  // Scan the folder
  const { analyzeProjectStructure } = await import(
    "../services/packageAnalyzer"
  );
  const analysis = analyzeProjectStructure(folderUri[0].fsPath);

  // Collect all unique package names
  const allPackages = new Set<string>();
  Object.values(analysis.packageImports).forEach((packages) => {
    packages.forEach((pkg) => allPackages.add(pkg));
  });

  if (allPackages.size === 0) {
    throw new Error("No npm packages found in the folder");
  }

  // Fetch package metadata
  const packageData = await fetchNpmMetadata(Array.from(allPackages));

  return {
    packageData,
    packageImports: analysis.packageImports,
  };
}

/**
 * Handle analyze project request
 */
async function handleAnalyzeProject() {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    throw new Error("No workspace folder open");
  }

  // Scan the root workspace folder
  const { analyzeProjectStructure } = await import(
    "../services/packageAnalyzer"
  );
  const analysis = analyzeProjectStructure(workspaceFolders[0].uri.fsPath);

  // Collect all unique package names
  const allPackages = new Set<string>();
  Object.values(analysis.packageImports).forEach((packages) => {
    packages.forEach((pkg) => allPackages.add(pkg));
  });

  if (allPackages.size === 0) {
    throw new Error("No npm packages found in the project");
  }

  // Fetch package metadata
  const packageData = await fetchNpmMetadata(Array.from(allPackages));

  return {
    packageData,
    packageImports: analysis.packageImports,
  };
}

/**
 * Handle file picker for analysis
 */
async function handleAnalyzePickedFiles() {
  // Show file picker dialog
  const fileUris = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: true,
    filters: {
      "JavaScript/TypeScript": ["js", "jsx", "ts", "tsx"],
    },
    openLabel: "Analyze Files",
  });

  if (!fileUris || fileUris.length === 0) {
    throw new Error("No files selected");
  }

  // Track imports for all files
  const packageImports: Record<string, string[]> = {};
  const allPackages = new Set<string>();

  // Analyze each file
  for (const fileUri of fileUris) {
    const filePath = fileUri.fsPath;
    const imports = analyzeFileImports(filePath);
    if (imports.length > 0) {
      packageImports[filePath] = imports;
      imports.forEach((pkg) => allPackages.add(pkg));
    }
  }

  if (allPackages.size === 0) {
    throw new Error("No npm packages found in the selected files");
  }

  // Fetch package metadata
  const packageData = await fetchNpmMetadata(Array.from(allPackages));

  return {
    packageData,
    packageImports,
  };
}

/**
 * Handle selected files in explorer for analysis
 */
async function handleAnalyzeSelectedFiles(data: any) {
  if (
    !data ||
    !data.files ||
    !Array.isArray(data.files) ||
    data.files.length === 0
  ) {
    throw new Error("No files provided for analysis");
  }

  // Track imports for all files
  const packageImports: Record<string, string[]> = {};
  const allPackages = new Set<string>();

  // Analyze each file
  for (const filePath of data.files) {
    const imports = analyzeFileImports(filePath);
    if (imports.length > 0) {
      packageImports[filePath] = imports;
      imports.forEach((pkg) => allPackages.add(pkg));
    }
  }

  if (allPackages.size === 0) {
    throw new Error("No npm packages found in the selected files");
  }

  // Fetch package metadata
  const packageData = await fetchNpmMetadata(Array.from(allPackages));

  return {
    packageData,
    packageImports,
  };
}

/**
 * Handle open file request
 */
async function handleOpenFile(filePath: string) {
  if (!filePath) {
    throw new Error("No file path provided");
  }

  try {
    const document = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(document);
    return true;
  } catch (error) {
    throw new Error(`Failed to open file: ${errorString(error)}`);
  }
}

/**
 * Handle request for existing analysis data
 */
async function handleGetAnalysisData() {
  // In a full implementation, this would retrieve cached analysis data
  // For now, return a placeholder result indicating that no analysis is available
  return {
    packageData: {},
    packageImports: {},
  };
}
