import * as fs from "fs";
import { errorHandler } from "../util/error";
// AST-based import and usage analysis
import { parse } from "@babel/parser";
import traverse from "@babel/traverse";

export function analyzeImportsWithAST(filePath: string): string[] {
  const content = require("fs").readFileSync(filePath, "utf8");
  const ast = parse(content, {
    sourceType: "module",
    plugins: ["typescript", "jsx"],
  });

  const imports: Set<string> = new Set();
  traverse(ast, {
    ImportDeclaration({ node }) {
      const pkg = node.source.value;
      if (!pkg.startsWith(".") && !pkg.startsWith("/")) {
        imports.add(pkg.split("/")[0]);
      }
    },
    CallExpression({ node }) {
      if (node.callee.type === "Import") {
        const arg = node.arguments[0];
        const pkg = arg && "value" in arg ? arg.value : undefined;
        if (
          typeof pkg === "string" &&
          !pkg.startsWith(".") &&
          !pkg.startsWith("/")
        ) {
          imports.add(pkg.split("/")[0]);
        }
      }
    },
  });

  return Array.from(imports);
}

export function analyzeFileImports(filePath: string): string[] {
  // Basic implementation - uses regex to extract imports
  const content = fs.readFileSync(filePath, "utf8");
  const imports = new Set<string>();

  try {
    // Detect require statements
    const requireMatches = content.match(/require\(['"]([^'"]+)['"]\)/g);
    if (requireMatches) {
      requireMatches.forEach((match) => {
        const regexResult = /require\(['"]([^'"]+)['"]\)/.exec(match);
        if (regexResult && regexResult[1]) {
          const pkg = regexResult[1];
          // Only include npm packages (not relative paths)
          if (!pkg.startsWith(".") && !pkg.startsWith("/")) {
            // Extract base package name (e.g., 'lodash/fp' -> 'lodash')
            const baseName = pkg.split("/")[0];
            imports.add(baseName);
          }
        }
      });
    }

    // Detect import statements
    const importMatches = content.match(/import .+ from ['"]([^'"]+)['"]/g);
    if (importMatches) {
      importMatches.forEach((match) => {
        const regexResult = /from ['"]([^'"]+)['"]/g.exec(match);
        if (regexResult && regexResult[1]) {
          const pkg = regexResult[1];
          // Only include npm packages (not relative paths)
          if (!pkg.startsWith(".") && !pkg.startsWith("/")) {
            // Extract base package name
            const baseName = pkg.split("/")[0];
            imports.add(baseName);
          }
        }
      });
    }

    // Detect dynamic imports
    const dynamicImportMatches = content.match(/import\(['"]([^'"]+)['"]\)/g);
    if (dynamicImportMatches) {
      dynamicImportMatches.forEach((match) => {
        const regexResult = /import\(['"]([^'"]+)['"]\)/.exec(match);
        if (regexResult && regexResult[1]) {
          const pkg = regexResult[1];
          // Only include npm packages (not relative paths)
          if (!pkg.startsWith(".") && !pkg.startsWith("/")) {
            // Extract base package name
            const baseName = pkg.split("/")[0];
            imports.add(baseName);
          }
        }
      });
    }
  } catch (error) {
    console.error(
      `Error parsing imports in ${filePath}: ${errorHandler(error)}`
    );
  }

  return Array.from(imports);
} // AST-based import and usage analysis
