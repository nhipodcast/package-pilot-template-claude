import { errorString as errorHandler } from "../utils/errorHandler";
import axios from "axios";
import * as fs from "fs";
import * as path from "path";

export async function fetchNpmMetadata(
  packageNames: string[]
): Promise<Record<string, any>> {
  const packageData: Record<string, any> = {};

  await Promise.all(
    packageNames.map(async (packageName) => {
      try {
        // Fetch basic package info from npm registry
        const response = await axios.get(
          `https://registry.npmjs.org/${packageName}`
        );

        if (response.status === 200) {
          const data = response.data;
          const latestVersion = data["dist-tags"]?.latest;

          packageData[packageName] = {
            name: packageName,
            description: data.description || "",
            version: latestVersion || "",
            license: data.license || "Unknown",
            homepage: data.homepage || "",
            repository: data.repository?.url || "",
            maintainers: data.maintainers?.length || 0,
            lastPublished: data.time?.[latestVersion] || "",
            dependencies: data.versions?.[latestVersion]?.dependencies || {},
            weeklyDownloads: 0, // Will be populated with additional API call
            alternatives: [], // Will be populated later with recommendations
          };

          // Additional API call to get download counts
          try {
            const downloadsResponse = await axios.get(
              `https://api.npmjs.org/downloads/point/last-week/${packageName}`
            );
            if (downloadsResponse.status === 200) {
              packageData[packageName].weeklyDownloads =
                downloadsResponse.data.downloads || 0;
            }
          } catch (error) {
            console.warn(`Could not fetch download stats for ${packageName}`);
          }
        }
      } catch (error) {
        console.warn(
          `Error fetching metadata for ${packageName}: ${errorHandler(error)}`
        );
        // Store minimal info for packages that couldn't be fetched
        packageData[packageName] = {
          name: packageName,
          description: "Could not fetch package data",
          version: "",
          error: errorHandler(error),
        };
      }
    })
  );

  // Generate recommendations using a combination of predefined suggestions and AI analysis
  await Promise.all(
    Object.keys(packageData).map(async (packageName) => {
      switch (packageName) {
        case "moment":
          packageData[packageName].alternatives = [
            "date-fns",
            "dayjs",
            "luxon",
          ];
          packageData[packageName].aiReason =
            "These modern alternatives offer better tree-shaking, smaller bundle sizes, and improved performance.";
          break;
        case "lodash":
        case "underscore":
          packageData[packageName].alternatives = ["lodash-es", "ramda"];
          packageData[packageName].aiReason =
            "ES module versions reduce bundle size, while native JS methods can replace many utility functions.";
          break;
        case "request":
          packageData[packageName].alternatives = [
            "axios",
            "node-fetch",
            "got",
          ];
          packageData[packageName].aiReason =
            "Request is deprecated. These alternatives offer better Promise support and modern features.";
          break;
        case "jquery":
          packageData[packageName].alternatives = ["cash-dom", "umbrella"];
          packageData[packageName].aiReason =
            "Modern browsers support most jQuery features natively. These lightweight alternatives offer similar APIs with much smaller footprints.";
          break;
        case "analyi_tool":
          // analyis_tool
          break;
        case "analyis_strategy_dimension_weight":
          // analyis_strategy_dimension_weight
          break;
        case "analyis_strategy_dimension_userbase":
          // analyis_strategy_dimension_userbase
          break;
        case "analyis_strategy_hybrid_dimension_AB":
          // analyis_strategy_hybrid_weight
          break;
        default:
          // Use AI to generate recommendations
          break;
      }
    })
  );

  return packageData;
} // Recursive project scanning with optimizations

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
}

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
