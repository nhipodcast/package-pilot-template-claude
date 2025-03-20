/**
 * This module provides utilities for communicating with the VS Code extension host.
 */

// Interface for the VSCode API exposed to webviews
interface VSCodeAPIObject {
  postMessage(message: any): void;
  getState(): any;
  setState(state: any): void;
}

// Declare the acquireVsCodeApi function that VS Code injects
declare function acquireVsCodeApi(): VSCodeAPIObject;

// Our wrapped API with TypeScript support
export interface VSCodeAPI {
  postMessage(message: any): void;
  getState<T>(): T | undefined;
  setState<T>(state: T): void;
}

// Singleton instance of the VS Code API
let vscodeApi: VSCodeAPI | undefined;

/**
 * Get the VS Code API instance
 * This should only be called once per webview session
 */
export function getVSCodeAPI(): VSCodeAPI {
  if (!vscodeApi) {
    try {
      const api = acquireVsCodeApi();

      vscodeApi = {
        postMessage: (message: any) => {
          api.postMessage(message);
        },
        getState: <T>() => {
          return api.getState() as T;
        },
        setState: <T>(state: T) => {
          api.setState(state);
        },
      };
    } catch (error) {
      console.error("Failed to acquire VS Code API:", error);

      // Provide a mock implementation for development outside VS Code
      if (process.env.NODE_ENV === "development") {
        console.warn("Using mock VS Code API for development");
        vscodeApi = createMockVSCodeAPI();
      } else {
        throw new Error("VS Code API not available");
      }
    }
  }

  return vscodeApi;
}

/**
 * Create a mock VS Code API for development
 */
function createMockVSCodeAPI(): VSCodeAPI {
  let state: any = {};

  return {
    postMessage: (message: any) => {
      console.log("Mock VS Code API received message:", message);
    },
    getState: <T>() => {
      return state as T;
    },
    setState: <T>(newState: T) => {
      state = newState;
      console.log("Mock VS Code API state updated:", state);
    },
  };
}

/**
 * Helper to post a message to the extension host
 */
export function postMessageToExtension(type: string, payload?: any): void {
  const api = getVSCodeAPI();
  api.postMessage({
    type,
    data: payload,
  });
}
