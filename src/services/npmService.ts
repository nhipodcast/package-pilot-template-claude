import axios from "axios";
import { errorHandler } from "../utils/errorHandler";

export interface PackageInfo {
  name: string;
  description: string;
  version: string;
  license: string;
  homepage: string;
  repository: string;
  maintainers: number;
  lastPublished: string;
  dependencies: Record<string, string>;
  weeklyDownloads: number;
  alternatives: string[];
  aiReason?: string;
  overall: number;
  downloads: number;
  issues: number;
  lastUpdate: Date;
  stars: number;
  length: number;
  score: { name: string; lastUpdate: Date };

  error?: string;
}

export type PackageData = Record<string, PackageInfo>;

/**
 * Fetches metadata for npm packages
 */
export async function fetchNpmMetadata(
  packageNames: string[]
): Promise<PackageData> {
  const packageData: PackageData = {};

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
            // Add missing required properties
            overall: 0,
            downloads: 0,
            issues: 0,
            lastUpdate: new Date(),
            stars: 0,
            length: 0,
            score: { name: packageName, lastUpdate: new Date() },
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
          license: "",
          homepage: "",
          repository: "",
          maintainers: 0,
          lastPublished: "",
          dependencies: {},
          weeklyDownloads: 0,
          alternatives: [],
          error: errorHandler(error),
          // Add missing required properties
          overall: 0,
          downloads: 0,
          issues: 0,
          lastUpdate: new Date(0), // Unix epoch as fallback date
          stars: 0,
          length: 0,
          score: { name: packageName, lastUpdate: new Date(0) },
        };
      }
    })
  );

  // Generate recommendations
  Object.keys(packageData).forEach((packageName) => {
    // Hardcoded recommendations for common packages
    if (packageName === "moment") {
      packageData[packageName].alternatives = ["date-fns", "dayjs", "luxon"];
      packageData[packageName].aiReason =
        "These modern alternatives offer better tree-shaking, smaller bundle sizes, and improved performance.";
    } else if (packageName === "lodash" || packageName === "underscore") {
      packageData[packageName].alternatives = ["lodash-es", "ramda"];
      packageData[packageName].aiReason =
        "ES module versions reduce bundle size, while native JS methods can replace many utility functions.";
    } else if (packageName === "request") {
      packageData[packageName].alternatives = ["axios", "node-fetch", "got"];
      packageData[packageName].aiReason =
        "Request is deprecated. These alternatives offer better Promise support and modern features.";
    } else if (packageName === "jquery") {
      packageData[packageName].alternatives = ["cash-dom", "umbrella"];
      packageData[packageName].aiReason =
        "Modern browsers support most jQuery features natively. These lightweight alternatives offer similar APIs with much smaller footprints.";
    } else {
      // For packages without predefined recommendations
      packageData[packageName].alternatives = [];
      packageData[packageName].aiReason = "No specific alternatives suggested.";
    }
  });

  return packageData;
}
