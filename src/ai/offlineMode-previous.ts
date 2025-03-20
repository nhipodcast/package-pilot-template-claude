import vscode from "vscode";

export class OfflineModeService {
  setExtensionContext(context: vscode.ExtensionContext) {
    throw new Error("Method not implemented.");
  }
  private static instance: OfflineModeService;

  private _isOfflineMode: boolean = false;
  private _rateLimitedUntil: number | null = null;
  private _timeoutId: NodeJS.Timeout | null = null;
  private _listeners: Set<(state: OfflineModeState) => void> = new Set();

  /**
   * Get the singleton instance
   */
  public static getInstance(): OfflineModeService {
    if (!OfflineModeService.instance) {
      OfflineModeService.instance = new OfflineModeService();
    }
    return OfflineModeService.instance;
  }

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Get current offline mode state
   */
  public getState(): OfflineModeState {
    // Check if rate limit has expired
    if (this._rateLimitedUntil && Date.now() > this._rateLimitedUntil) {
      this._rateLimitedUntil = null;
    }

    return {
      isOfflineMode: this._isOfflineMode,
      isRateLimited: this.isRateLimited(),
      rateLimitedUntil: this._rateLimitedUntil,
    };
  }

  /**
   * Toggle offline mode
   */
  public toggleOfflineMode(force?: boolean): boolean {
    // If rate limited, don't allow toggling
    if (this.isRateLimited()) {
      return this._isOfflineMode;
    }

    if (typeof force === "boolean") {
      this._isOfflineMode = force;
    } else {
      this._isOfflineMode = !this._isOfflineMode;
    }

    this._notifyListeners();

    vscode.window.showInformationMessage(
      `Package Pilot is now in ${
        this._isOfflineMode ? "offline" : "online"
      } mode`
    );

    return this._isOfflineMode;
  }

  /**
   * Set rate limited status
   */
  // In src/services/offlineMode.ts
  public setRateLimited(limitedForSeconds: number = 60): void {
    this._rateLimitedUntil = Date.now() + limitedForSeconds * 1000;
    this._isOfflineMode = true;

    // Remove the problematic code that tries to access PackageAnalysisView.currentPanel
    // We'll handle UI updates through the listener system instead

    // Notify VS Code
    vscode.window
      .showWarningMessage(
        `API rate limit reached. Package Pilot has switched to offline mode for ${this._formatDuration(
          limitedForSeconds
        )}.`,
        "Configure API Key"
      )
      .then((selection: string | undefined) => {
        if (selection === "Configure API Key") {
          vscode.commands.executeCommand(
            "workbench.action.openSettings",
            "packagePilot.openaiApiKey"
          );
        }
      });

    // Notify listeners - this will indirectly update any UI that needs to know
    this._notifyListeners();
  }

  /**
   * Check if currently rate limited
   */
  public isRateLimited(): boolean {
    return (
      this._rateLimitedUntil !== null && Date.now() < this._rateLimitedUntil
    );
  }

  /**
   * Check if should use offline mode
   */
  public shouldUseOfflineMode(): boolean {
    return this._isOfflineMode || this.isRateLimited();
  }

  /**
   * Add state change listener
   */
  public addListener(listener: (state: OfflineModeState) => void): () => void {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }

  /**
   * Format duration in seconds to human-readable string
   */
  private _formatDuration(seconds: number): string {
    if (seconds < 60) {
      return `${seconds} seconds`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      return `${minutes} minute${minutes > 1 ? "s" : ""}`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return `${hours} hour${hours > 1 ? "s" : ""}${
        minutes > 0 ? ` ${minutes} minute${minutes > 1 ? "s" : ""}` : ""
      }`;
    }
  }

  /**
   * Notify all listeners of state change
   */
  private _notifyListeners(): void {
    const state = this.getState();
    this._listeners.forEach((listener) => {
      try {
        listener(state);
      } catch (error) {
        console.error("Error in offline mode listener:", error);
      }
    });
  }
}

/**
 * Offline mode state interface
 */
export interface OfflineModeState {
  isOfflineMode: boolean;
  isRateLimited: boolean;
  rateLimitedUntil: number | null;
}

// Export singleton methods for easier access
export const offlineModeService = OfflineModeService.getInstance();
export const toggleOfflineMode = (force?: boolean) =>
  offlineModeService.toggleOfflineMode(force);
export const setRateLimited = (seconds: number) =>
  offlineModeService.setRateLimited(seconds);
export const shouldUseOfflineMode = () =>
  offlineModeService.shouldUseOfflineMode();
export const isRateLimited = () => offlineModeService.isRateLimited();
export const getOfflineModeState = () => offlineModeService.getState();
