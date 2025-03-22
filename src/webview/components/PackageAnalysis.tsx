import * as React from "react";
import { useState, useEffect } from "react";
import PackagePilotMessageHandler, {
  CommandType,
} from "./utils/messageHandler";

interface PackageData {
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
  error?: string;
}

interface PackageUsage {
  count: number;
  files: string[];
}

interface PackageAnalysisProps {
  onBack?: () => void;
}

export const PackageAnalysis: React.FC<PackageAnalysisProps> = ({ onBack }) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [packages, setPackages] = useState<Record<string, PackageData>>({});
  const [packageUsage, setPackageUsage] = useState<
    Record<string, PackageUsage>
  >({});
  const [sortedPackages, setSortedPackages] = useState<string[]>([]);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    fetchAnalysisData();
  }, []);

  const fetchAnalysisData = async () => {
    try {
      setLoading(true);
      // Trigger analysis using our custom message handler
      PackagePilotMessageHandler.analyzeProject();

      // Request analysis data using the custom message handler
      const analysisData = await PackagePilotMessageHandler.getAnalysisData<{
        packageData: Record<string, PackageData>;
        packageUsage: Record<string, PackageUsage>;
      }>();

      if (analysisData) {
        setPackages(analysisData.packageData || {});
        setPackageUsage(analysisData.packageUsage || {});

        // Sort packages by usage count
        const sorted = Object.keys(analysisData.packageUsage || {}).sort(
          (a, b) =>
            analysisData.packageUsage[b].count -
            analysisData.packageUsage[a].count
        );

        setSortedPackages(sorted);
      }
    } catch (err) {
      setError(typeof err === "string" ? err : "Failed to load analysis data");
    } finally {
      setLoading(false);
    }
  };

  const openFile = (filePath: string) => {
    // Use the custom message handler to open files
    PackagePilotMessageHandler.openFile(filePath);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <div className="w-16 h-16 border-4 border-t-blue-500 border-blue-200 rounded-full animate-spin"></div>
        <p className="mt-4 text-gray-500">Loading package analysis...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-lg">
        <h3 className="text-lg font-semibold text-red-700 mb-2">Error</h3>
        <p className="text-red-600">{error}</p>
        <button
          onClick={onBack}
          className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
        >
          Go Back
        </button>
      </div>
    );
  }

  if (sortedPackages.length === 0) {
    return (
      <div className="p-6 bg-blue-50 border border-blue-200 rounded-lg">
        <h3 className="text-lg font-semibold text-blue-700 mb-2">
          No Packages Found
        </h3>
        <p className="text-blue-600">
          No npm packages were detected in the analyzed files.
        </p>
        <button
          onClick={onBack}
          className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
        >
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Package Analysis</h1>
        {onBack && (
          <button
            onClick={onBack}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
          >
            Back
          </button>
        )}
      </div>

      <div className="p-4 bg-gray-100 rounded-lg mb-6">
        <p>
          Analyzed{" "}
          <span className="font-semibold">
            {Object.keys(packageUsage).length}
          </span>{" "}
          files containing{" "}
          <span className="font-semibold">{sortedPackages.length}</span> unique
          npm packages.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {sortedPackages.map((pkg) => {
          const pkgData = packages[pkg] || {
            name: pkg,
            description: "No metadata available",
            version: "Unknown",
            weeklyDownloads: 0,
            alternatives: [],
          };

          return (
            <div
              key={pkg}
              className="border border-gray-200 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-200"
            >
              <div className="p-4 border-b border-gray-200 bg-gray-50">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-semibold text-blue-600">
                    {pkgData.name}
                  </h3>
                  <span className="text-sm text-gray-500">
                    v{pkgData.version || "Unknown"}
                  </span>
                </div>
                <p className="mt-2 text-sm text-gray-600 line-clamp-2">
                  {pkgData.description || "No description available"}
                </p>
              </div>

              <div className="p-4 flex justify-between text-sm">
                <div>
                  <p className="text-gray-500">Weekly Downloads</p>
                  <p className="font-semibold">
                    {typeof pkgData.weeklyDownloads === "number"
                      ? pkgData.weeklyDownloads.toLocaleString()
                      : "Unknown"}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Used in</p>
                  <p className="font-semibold">
                    {packageUsage[pkg]?.count || 0} file
                    {packageUsage[pkg]?.count !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>

              <div className="p-4 border-t border-gray-200">
                <h4 className="text-sm font-semibold text-gray-500 mb-2">
                  Files Using This Package
                </h4>
                <div className="max-h-32 overflow-y-auto border border-gray-200 rounded">
                  {packageUsage[pkg]?.files.map((file, idx) => (
                    <div
                      key={idx}
                      className="p-2 text-sm hover:bg-gray-50 border-b border-gray-200 last:border-b-0"
                    >
                      <button
                        onClick={() => openFile(file)}
                        className="text-blue-600 hover:underline focus:outline-none text-left"
                      >
                        {file.split("/").pop()}
                      </button>
                      <p className="text-xs text-gray-500 truncate">{file}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-4 border-t border-gray-200">
                <h4 className="text-sm font-semibold text-gray-500 mb-2">
                  Suggested Alternatives
                </h4>

                {pkgData.aiReason && (
                  <div className="mb-3 p-2 bg-blue-50 rounded text-sm">
                    <p className="font-semibold mb-1">AI Analysis:</p>
                    <p className="text-gray-600">{pkgData.aiReason}</p>
                  </div>
                )}

                {pkgData.alternatives && pkgData.alternatives.length > 0 ? (
                  <div className="border border-gray-200 rounded">
                    {pkgData.alternatives.map((alt, idx) => (
                      <div
                        key={idx}
                        className="p-2 flex justify-between items-center text-sm border-b border-gray-200 last:border-b-0"
                      >
                        <span className="font-medium">{alt}</span>
                        <a
                          href={`https://www.npmjs.com/package/${alt}`}
                          className="text-blue-600 hover:underline text-xs"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          View on npm
                        </a>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 italic p-2 border border-gray-200 rounded">
                    No alternatives suggested
                  </p>
                )}
              </div>

              <div className="p-4 border-t border-gray-200 flex gap-3">
                <a
                  href={`https://www.npmjs.com/package/${pkg}`}
                  className="text-blue-600 hover:underline text-sm"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View on npm
                </a>

                {pkgData.homepage && (
                  <a
                    href={pkgData.homepage}
                    className="text-blue-600 hover:underline text-sm"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Homepage
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PackageAnalysis;
