import React, { useState } from "react";
import { PackageInfo, PackageData } from "../../services/npmService";

interface PackageCardProps {
  packageData?: PackageData;
  onRequestMigration?: (packageName: string) => void;
  onOpenFile?: (packageName: string) => void;
  packageInfo: PackageData;
}

export function PackageCard({
  packageData,
  onRequestMigration,
  onOpenFile,
  packageInfo,
}: PackageCardProps) {
  const [expanded, setExpanded] = useState(false);

  // Format overall score for display

  const { name, version, description, score, recommendations, usedIn } =
    packageData || packageInfo;

  const overallScore = Math.round(score.overall * 100);

  // Determine score class
  const getScoreClass = (score: number) => {
    if (score >= 80) return "score-badge-high";
    if (score >= 50) return "score-badge-medium";
    return "score-badge-low";
  };

  const scoreClass = getScoreClass(overallScore);

  // Format last update date
  const lastUpdateDate = new Date(score.lastUpdate).toLocaleDateString();

  return (
    <div className="vscode-card mb-4">
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-3">
          <div className={`score-badge ${scoreClass}`}>{overallScore}</div>

          <div>
            <h3 className="text-base font-medium">
              {String(name)}{" "}
              <span className="text-xs opacity-60">{String(version)}</span>
            </h3>
            <p className="text-sm mt-1 opacity-80">
              {String(description || "")}
            </p>
          </div>
        </div>

        <button
          onClick={() => setExpanded(!expanded)}
          className="text-vscode-fg opacity-70 hover:opacity-100"
        >
          {expanded ? (
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 15l7-7 7 7"
              />
            </svg>
          ) : (
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          )}
        </button>
      </div>

      {expanded && (
        <div className="mt-4 pt-3 border-t border-vscode-border">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <h4 className="text-xs uppercase tracking-wider opacity-60 mb-1">
                Package Details
              </h4>
              <ul className="text-sm space-y-1">
                <li>
                  <span className="opacity-70">Downloads:</span>{" "}
                  {score.downloads.toLocaleString()}
                </li>
                <li>
                  <span className="opacity-70">GitHub Stars:</span>{" "}
                  {score.stars.toLocaleString()}
                </li>
                <li>
                  <span className="opacity-70">Issues:</span> {score.issues}
                </li>
                <li>
                  <span className="opacity-70">Last Update:</span>{" "}
                  {lastUpdateDate}
                </li>
              </ul>
            </div>

            <div>
              <h4 className="text-xs uppercase tracking-wider opacity-60 mb-1">
                Used In
              </h4>
              {usedIn && Array.isArray(usedIn) ? (
                usedIn.length
              ) : 0 > 0 ? (
                <ul className="text-sm max-h-24 overflow-y-auto">
                  {Array.isArray(usedIn) &&
                    usedIn.map((file) => (
                      <li key={file} className="truncate" title={file}>
                        {file.split("/").pop()}
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="text-sm opacity-70">Not used in any files</p>
              )}
            </div>
          </div>

          {recommendations && recommendations.length > 0 && (
            <div className="mb-4">
              <h4 className="text-xs uppercase tracking-wider opacity-60 mb-1">
                Alternatives
              </h4>
              <div className="flex flex-wrap gap-2">
                {Object.values(recommendations).map(
                  (
                    rec:
                      | boolean
                      | React.ReactElement<
                          any,
                          string | React.JSXElementConstructor<any>
                        >
                      | Iterable<React.ReactNode>
                      | React.Key
                      | null
                      | undefined
                  ) => (
                    <span
                      key={rec + Date()}
                      className="px-2 py-1 text-xs rounded-full bg-vscode-input-bg"
                    >
                      {JSON.stringify(rec)}
                    </span>
                  )
                )}
              </div>
            </div>
          )}

          {onRequestMigration && (
            <div className="mt-4 pt-3 border-t border-vscode-border flex justify-end">
              <button
                onClick={() => onRequestMigration(String(name))}
                className="vscode-button text-sm"
              >
                Generate Migration Plan
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
