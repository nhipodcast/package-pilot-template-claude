// Scoring Framework implementation
import vscode from "vscode";
import { fetchNpmMetadata } from "./projectScanner"; // For dependencies

export interface PackageScore {
  name: string;
  scores: Record<string, number>; // e.g., { codeWeight: 0.8, performance: 0.9, ... }
  total: number;
  overall: number;
  downloads: number;
  issues: string[];
  lastUpdate: string;
  stars: number;
}

export async function scorePackages(
  npmData: Record<string, any>,
  imports: Record<string, string[]>
): Promise<PackageScore[]> {
  const config = vscode.workspace.getConfiguration("packagePilot");
  const weights = config.get("scoringWeights") as Record<string, number>;

  const scores: PackageScore[] = [];
  for (const [pkg, data] of Object.entries(npmData)) {
    const usageCount = Object.values(imports)
      .flat()
      .filter((i) => i === pkg).length;
    const deps = Object.keys(data.dependencies || {}).length;

    const score: PackageScore = {
      name: pkg,
      scores: {
        codeWeight: Math.min(1, 1000 / (data.size || 1000)), // Assume 1MB max, adjust with real data
        performance: 1 - (data.performanceImpact || 0) / 100, // Placeholder, needs benchmark
        scalability:
          data.weeklyDownloads > 100000 ? 1 : data.weeklyDownloads / 100000,
        reusability: 1 - deps / 10, // Fewer deps = more reusable
        easeOfIntegration: 1 - (usageCount > 5 ? 0.2 : 0), // Simple heuristic
        maintainability: data.maintainers > 1 ? 1 : 0.5,
        futureProofiness: data.lastPublished
          ? new Date().getTime() - new Date(data.lastPublished).getTime() <
            31536000000
            ? 1
            : 0.7
          : 0.5, // 1 year
        costEfficiency: !data.cost ? 1 : 0.8, // Placeholder
      },
      total: 0,
      overall: 0,
      downloads: 0,
      issues: [],
      lastUpdate: "",
      stars: 0,
    };

    score.total = Object.entries(score.scores).reduce(
      (sum, [key, value]) => sum + (weights[key] || 0) * value,
      0
    );
    scores.push(score);
  }

  return scores.sort((a, b) => b.total - a.total);
}
