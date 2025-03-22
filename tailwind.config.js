/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,js,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Use VS Code's theme variables for better integration
        // These values are defaults that will be overridden by VS Code's CSS variables
        vscode: {
          foreground: "var(--vscode-editor-foreground)",
          background: "var(--vscode-editor-background)",
          border: "var(--vscode-panel-border)",
          link: "var(--vscode-textLink-foreground)",
          description: "var(--vscode-descriptionForeground)",
          error: "var(--vscode-editorError-foreground)",
        },
      },
    },
  },
  plugins: [require("@tailwindcss/line-clamp")],
  // Prefix with tw- to avoid conflicts with VS Code's CSS
  prefix: "",
  // Important to ensure Tailwind styles override VS Code styles
  important: true,
};
