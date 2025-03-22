import { messageHandler } from "@estruyf/vscode/dist/client";

// Command types for extension-webview communication
export enum CommandType {
  AnalyzeCurrentFile = "ANALYZE_CURRENT_FILE",
  AnalyzeFolder = "ANALYZE_FOLDER",
  AnalyzeProject = "ANALYZE_PROJECT",
  AnalyzePickedFiles = "ANALYZE_PICKED_FILES",
  AnalyzeSelectedFiles = "ANALYZE_SELECTED_FILES",
  OpenFile = "OPEN_FILE",
  GetAnalysisData = "GET_ANALYSIS_DATA",
  GetData = "GET_DATA",
  GetDataError = "GET_DATA_ERROR",
  PostData = "POST_DATA",
}

// File path interface for opening files
export interface OpenFilePayload {
  filePath: string;
}

// Custom message handler with typed methods
export class PackagePilotMessageHandler {
  /**
   * Send a command to the extension without expecting a response
   */
  public static send<T = any>(command: CommandType, payload?: T): void {
    messageHandler.send(command, payload);
  }

  /**
   * Request data from the extension and expect a response
   */
  public static async request<T = any>(
    command: CommandType,
    payload?: any
  ): Promise<T> {
    return messageHandler.request<T>(command, payload);
  }

  /**
   * Send a command to open a file in the editor
   */
  public static openFile(filePath: string): void {
    this.send<OpenFilePayload>(CommandType.OpenFile, { filePath });
  }

  /**
   * Request analysis data from the extension
   */
  public static async getAnalysisData<T = any>(): Promise<T> {
    return this.request<T>(CommandType.GetAnalysisData);
  }

  /**
   * Trigger analysis of the current file
   */
  public static analyzeCurrentFile(): void {
    this.send(CommandType.AnalyzeCurrentFile);
  }

  /**
   * Trigger analysis of a selected folder
   */
  public static analyzeFolder(): void {
    this.send(CommandType.AnalyzeFolder);
  }

  /**
   * Trigger analysis of the entire project
   */
  public static analyzeProject(): void {
    this.send(CommandType.AnalyzeProject);
  }

  /**
   * Trigger file selection dialog for analysis
   */
  public static analyzePickedFiles(): void {
    this.send(CommandType.AnalyzePickedFiles);
  }

  /**
   * Trigger analysis of files selected in the explorer
   */
  public static analyzeSelectedFiles(): void {
    this.send(CommandType.AnalyzeSelectedFiles);
  }
}

export default PackagePilotMessageHandler;
