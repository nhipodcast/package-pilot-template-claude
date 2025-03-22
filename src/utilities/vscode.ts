/**
 * Utility for communicating with VS Code extension host
 */

// Type definitions for message handlers
export interface MessageHandler<T = any> {
  command: string;
  requestId: string;
  payload?: T;
  error?: string;
}

// Export the VS Code API
// Acquires the VS Code API object for the webview
export const vscode = acquireVsCodeApi();

/**
 * Send a message to the VS Code extension and get a Promise for the response
 * @param command The command to send
 * @param payload Optional payload data
 * @returns Promise that resolves with the response data or rejects with an error
 */
export const sendMessage = <T, R = any>(
  command: string,
  payload?: T
): Promise<R> => {
  return new Promise((resolve, reject) => {
    // Generate a unique request ID
    const requestId = `req_${Date.now()}_${Math.random()
      .toString(36)
      .substring(2, 11)}`;

    // Set up the message handler
    const handler = (event: MessageEvent) => {
      const message = event.data as MessageHandler<R>;

      // Check if this is the response to our request
      if (
        message &&
        message.command === command &&
        message.requestId === requestId
      ) {
        // Remove the event listener
        window.removeEventListener("message", handler);

        // Check if there's an error
        if (message.error) {
          reject(new Error(message.error));
        } else {
          // Resolve with the payload
          resolve(message.payload as R);
        }
      }
    };

    // Add the event listener
    window.addEventListener("message", handler);

    // Send the message
    vscode.postMessage({
      command,
      requestId,
      payload,
    });

    // Set a timeout (optional)
    setTimeout(() => {
      window.removeEventListener("message", handler);
      reject(new Error(`Request timed out: ${command}`));
    }, 10000); // 10 second timeout
  });
};

/**
 * Utility function to add a VS Code theme CSS class to an element
 * This helps match VS Code's native styling
 */
export const addVSCodeClass = (
  element: HTMLElement,
  className: string
): void => {
  element.classList.add(`vscode-${className}`);
};

/**
 * Get the current VS Code theme type (dark, light, high-contrast)
 */
export const getThemeType = (): string => {
  const body = document.body;
  if (body.classList.contains("vscode-dark")) {
    return "dark";
  } else if (body.classList.contains("vscode-light")) {
    return "light";
  } else if (body.classList.contains("vscode-high-contrast")) {
    return "high-contrast";
  }
  return "dark"; // Default to dark
};
