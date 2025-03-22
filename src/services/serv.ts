import * as fs from "fs";
import * as path from "path";
import { errorHandler } from "../utils/errorHandler";

/**
 * Analyzes a file to find npm package imports
 */
export function analyzeFileImports(filePath: string): string[] {
  // Basic implementation - uses regex to extract imports
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const imports = new Set<string>();

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

    return Array.from(imports);
  } catch (error) {
    console.error(
      `Error analyzing imports in ${filePath}: ${errorHandler(error)}`
    );
    return [];
  }
}

/**
 * Analyzes project structure and finds all package imports
 */
export function analyzeProjectStructure(targetPath: string, depth: number = 0) {
  interface ProjectAnalysis {
    structure: {
      type: "directory" | "file";
      name: string;
      path: string;
      children?: ProjectAnalysis["structure"];
    }[];
    packageImports: Record<string, string[]>;
    suggestedAnalysis: string[];
  }

  let analysisResult: ProjectAnalysis = {
    structure: [],
    packageImports: {},
    suggestedAnalysis: [],
  };

  if (!fs.existsSync(targetPath)) {
    return analysisResult;
  }

  // Sort directories first, then files
  let allEntries = fs.readdirSync(targetPath);
  let directories: string[] = [];
  let files: string[] = [];

  allEntries.forEach((entry) => {
    let fullPath = path.join(targetPath, entry);
    try {
      if (fs.statSync(fullPath).isDirectory()) {
        // Skip node_modules and other non-relevant directories
        if (
          entry !== "node_modules" &&
          entry !== ".git" &&
          !entry.startsWith(".")
        ) {
          directories.push(entry);
        }
      } else {
        // Focus on JS/TS files for analysis
        if (
          entry.endsWith(".js") ||
          entry.endsWith(".jsx") ||
          entry.endsWith(".ts") ||
          entry.endsWith(".tsx")
        ) {
          files.push(entry);
        }
      }
    } catch (error) {
      // Skip files that can't be accessed
      console.warn(`Unable to access ${fullPath}: ${errorHandler(error)}`);
    }
  });

  // Process all directories
  directories.forEach((dir: string) => {
    let fullPath: string = path.join(targetPath, dir);
    let subAnalysis: ProjectAnalysis = analyzeProjectStructure(
      fullPath,
      depth + 1
    );
    analysisResult.structure.push({
      type: "directory",
      name: dir,
      path: fullPath,
      children: subAnalysis.structure,
    });

    // Merge package imports from subdirectories
    Object.assign(analysisResult.packageImports, subAnalysis.packageImports);

    // Add suggested files from subdirectories
    analysisResult.suggestedAnalysis = [
      ...analysisResult.suggestedAnalysis,
      ...subAnalysis.suggestedAnalysis,
    ];
  });

  // Process all files
  files.forEach((file) => {
    let fullPath = path.join(targetPath, file);
    analysisResult.structure.push({
      type: "file",
      name: file,
      path: fullPath,
    });

    // Analyze imports for JS/TS files
    try {
      const imports = analyzeFileImports(fullPath);
      if (imports.length > 0) {
        analysisResult.packageImports[fullPath] = imports;

        // If file has many imports, suggest it for detailed analysis
        if (imports.length > 3) {
          analysisResult.suggestedAnalysis.push(fullPath);
        }
      }
    } catch (error) {
      console.warn(
        `Error analyzing imports in ${fullPath}: ${errorHandler(error)}`
      );
    }
  });

  return analysisResult;
}

/**
 * Extracts unique packages from an import analysis
 */
export function extractUniquePackages(
  packageImports: Record<string, string[]>
): Set<string> {
  const uniquePackages = new Set<string>();
  Object.values(packageImports).forEach((imports) => {
    imports.forEach((pkg) => uniquePackages.add(pkg));
  });
  return uniquePackages;
}
