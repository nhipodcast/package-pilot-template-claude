// Mock declarations for our VS Code extension development
// This should help with TypeScript errors if there are problems with the VS Code module

// This tells TypeScript to look for VS Code types in the "node_modules/@types/vscode" folder
// instead of anywhere else
/// <reference types="vscode" />

declare module "vscode" {
  export = vscode;
}

// Make sure we don't accidentally import it wrong
declare module "@types/vscode" {
  // No exports, this is just a type package
}
