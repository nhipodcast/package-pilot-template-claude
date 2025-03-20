# package-pilot-template-claude

A template repository for the Package Pilot VS Code extension with React and Tailwind CSS integration.

## Features

- React components for VS Code webviews
- Tailwind CSS styled to match VS Code theme
- TypeScript configuration
- Webpack bundling

## Getting Started

1. Clone this repository
2. Run `pnpm install`
3. Run `pnpm run build:webview` to build the webview

## Development

- `pnpm run watch:webview` - Watch for changes in the webview code
- `pnpm run watch:tailwind` - Watch for changes in the Tailwind CSS

## Structure

- `src/ui/components` - React components
- `src/ui/context` - React context providers
- `src/ui/utils` - Utility functions
- `src/ui/webview` - Webview entry point
- `src/ui/styles` - CSS styles
- `src/services` - Service implementations
