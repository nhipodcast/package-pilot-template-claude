/** @type {import("tailwindcss").Config} */
module.exports = {
  content: [
    "./src/ui/**/*.{js,jsx,ts,tsx,html}",
  ],
  theme: {
    extend: {
      colors: {
        "vscode-bg": "var(--vscode-editor-background)",
        "vscode-fg": "var(--vscode-editor-foreground)",
        "vscode-button-bg": "var(--vscode-button-background)",
        "vscode-button-fg": "var(--vscode-button-foreground)",
        "vscode-button-hover-bg": "var(--vscode-button-hoverBackground)",
        "vscode-input-bg": "var(--vscode-input-background)",
        "vscode-input-fg": "var(--vscode-input-foreground)",
        "vscode-dropdown-bg": "var(--vscode-dropdown-background)",
        "vscode-dropdown-fg": "var(--vscode-dropdown-foreground)",
        "vscode-list-active-bg": "var(--vscode-list-activeSelectionBackground)",
        "vscode-list-active-fg": "var(--vscode-list-activeSelectionForeground)",
        "vscode-list-hover-bg": "var(--vscode-list-hoverBackground)",
        "vscode-border": "var(--vscode-panel-border)"
      },
      fontFamily: {
        sans: ["var(--vscode-font-family)", "sans-serif"],
        mono: ["var(--vscode-editor-font-family)", "monospace"]
      },
      fontSize: {
        "vscode-base": "var(--vscode-font-size)",
        "vscode-code": "var(--vscode-editor-font-size)"
      }
    },
  },
  plugins: [],
};
