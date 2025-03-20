import * as fs from "fs";
import * as path from "path";
import { errorHandler } from "../util/error";
import { analyzeFileImports } from "./astParser";

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

export function analyzeProjectStructure(
  targetPath: string,
  depth: number = 0
): ProjectAnalysis {
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
    return {
      structure: [
        {
          type: "directory",
          name: path.basename(targetPath),
          path: targetPath,
        },
      ],
      packageImports: {},
      suggestedAnalysis: [],
    };
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
