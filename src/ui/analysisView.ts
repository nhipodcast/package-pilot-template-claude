import vscode from "vscode";
import { PackageScore } from "../analysis/scoring";

// Interface for structure data
interface StructureItem {
  type: "file" | "folder";
  name: string;
  path: string;
}

// Interface for package data
interface PackageData {
  name: string;
  version: string;
  description: string;
  npmData: any;
  score: PackageScore;
  recommendations: string[];
  usedIn: string[];
}

// Interface for analysis data
interface AnalysisData {
  structure: StructureItem[];
  packageImports: Record<string, string[]>;
  suggestedAnalysis: string[];
  npmData: Record<string, any>;
  scores: Record<string, PackageScore>;
  recommendations: Record<string, string[]>;
}

/**
 * Manage webview panels for package analysis
 */
export class PackageAnalysisView {
  public static currentPanel: PackageAnalysisView | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];
  private _analysisData: AnalysisData | undefined;
  private _offlineMode: boolean = false;
  private _rateLimitedUntil: number | null = null;

  /**
   * Get the static singleton view
   */
  public static getOrCreateWebview(
    extensionUri: vscode.Uri
  ): PackageAnalysisView {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // // If we already have a panel, show it
    // if (PackageAnalysisView.currentPanel) {
    //   PackageAnalysisView.currentPanel._panel.reveal(column);
    //   return PackageAnalysisView.currentPanel;
    // }

    // Otherwise, create a new panel
    const panel = vscode.window.createWebviewPanel(
      "packagePilotAnalysis",
      "Package Analysis",
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, "dist")],
        retainContextWhenHidden: true,
      }
    );

    PackageAnalysisView.currentPanel = new PackageAnalysisView(
      panel,
      extensionUri
    );
    return PackageAnalysisView?.currentPanel;
  }

  /**
   * Create new analysis view
   */
  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    // Set initial HTML content
    // this._updateWebview();

    // Listen for when the panel is disposed
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      (message: { type: string; data?: any }) => {
        switch (message.type) {
          case "ready":
            // Initial load - send data if we have it
            if (this._analysisData) {
              this._sendAnalysisToWebview();
            }
            break;
          case "getOfflineModeState":
            this._sendOfflineModeState();
            break;
          case "toggleOfflineMode":
            this._toggleOfflineMode();
            break;
          case "generateMigration":
            vscode.commands.executeCommand(
              "evan-meeks.package-pilot-vscode.generateMigrationPlan",
              message.data
            );
            break;
          case "clearCache":
            vscode.commands.executeCommand(
              "evan-meeks.package-pilot-vscode.clearCache"
            );
            break;
          case "openDocs":
            vscode.env.openExternal(
              vscode.Uri.parse(
                "https://github.com/evan-meeks/package-pilot-vscode"
              )
            );
            break;
        }
      },
      null,
      this._disposables
    );
  }

  /**
   * Update the webview with the analysis results
   */
  public updateAnalysis(analysisData: AnalysisData): void {
    this._analysisData = analysisData;
    this._sendAnalysisToWebview();
  }

  /**
   * Set offline mode status
   */
  public setOfflineMode(
    isOffline: boolean,
    rateLimitedUntil: number | null = null
  ): void {
    this._offlineMode = isOffline;
    this._rateLimitedUntil = rateLimitedUntil;
    this._sendOfflineModeState();
  }

  /**
   * Send offline mode state to webview
   */
  private _sendOfflineModeState(): void {
    this._panel.webview.postMessage({
      type: "updateOfflineMode",
      data: {
        isOfflineMode: this._offlineMode,
        isRateLimited:
          this._rateLimitedUntil !== null &&
          Date.now() < this._rateLimitedUntil,
        rateLimitedUntil: this._rateLimitedUntil,
      },
    });
  }

  /**
   * Toggle offline mode
   */
  private _toggleOfflineMode(): void {
    // Don't allow toggling if rate limited
    if (this._rateLimitedUntil && Date.now() < this._rateLimitedUntil) {
      return;
    }

    this._offlineMode = !this._offlineMode;
    vscode.commands.executeCommand(
      "evan-meeks.package-pilot-vscode.toggleOfflineMode"
    );
    this._sendOfflineModeState();
  }

  /**
   * Send analysis data to the webview
   */
  private _sendAnalysisToWebview(): void {
    if (!this._analysisData) {
      return;
    }

    // Transform data for the webview
    const packageData: PackageData[] = Object.entries(this._analysisData.scores)
      .map(([name, score]) => {
        const npmData = this._analysisData!.npmData[name] || {};
        const recommendations = this._analysisData!.recommendations[name] || [];

        // Find files where this package is used
        const usedIn = Object.entries(this._analysisData!.packageImports)
          .filter(([_, imports]) => imports.includes(name))
          .map(([file]) => file);

        return {
          name,
          version: npmData.version || "unknown",
          description: npmData.description || "",
          npmData,
          score,
          recommendations,
          usedIn,
        };
      })
      .sort((a, b) => b.score.overall - a.score.overall);

    // Send the data to the webview
    this._panel.webview.postMessage({
      type: "analysisResults",
      data: {
        packages: packageData,
        structure: this._analysisData.structure,
        timestamp: Date.now(),
      },
    });
  }

  /**
   * Update the webview HTML content
   */
  private _updateWebview(): void {
    const webview = this._panel.webview;

    // Get the local path to the webview assets
    const webviewScriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "dist", "webview", "webview.js")
    );

    // Use a nonce to only allow specific scripts to be run
    const nonce = getNonce();

    // Set the HTML content
    webview.html = `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https:; script-src 'nonce-${nonce}'; style-src ${webview.cspSource} 'unsafe-inline';">
        <title>Package Analysis</title>
    </head>
    <body>
        <div id="root"></div>
        <script nonce="${nonce}" src="${webviewScriptUri}"></script>
    </body>
    </html>`;
  }

  /**
   * Dispose of the webview and cleanup resources
   */
  public dispose(): void {
    // Clean up resources
    this._panel.dispose();

    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }
}

/**
 * Display package analysis results in a webview
 */
export function displayPackageAnalysis(
  analysisResults: {
    structure: StructureItem[];
    packageImports: Record<string, string[]>;
    suggestedAnalysis: string[];
  },
  analysisData: {
    npmData: Record<string, any>;
    scores: Record<string, PackageScore>;
    recommendations: Record<string, string[]>;
  },
  extensionUri: vscode.Uri
): void {
  // Get or create the webview
  const analysisView = PackageAnalysisView.getOrCreateWebview(extensionUri);

  // Combine the data
  const data = {
    ...analysisResults,
    ...analysisData,
  };

  // Update the view with the analysis results
  analysisView.updateAnalysis(data);
}

/**
 * Generate a nonce string
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
