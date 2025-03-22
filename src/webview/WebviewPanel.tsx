import * as React from "react";
import { useState, useEffect } from "react";
import { VSCodeAPI } from "../utils/vscode";
import { PackageCard } from "../components/PackageCard";
import { OfflineMode } from "../components/OfflineMode";
import { CommandType } from "../../messageHandler";

interface WebviewPanelProps {
  vscodeApi: VSCodeAPI;
}

const WebviewPanel: React.FC<WebviewPanelProps> = ({ vscodeApi }) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [packageData, setPackageData] = useState<Record<string, any>>({});
  const [packageUsage, setPackageUsage] = useState<Record<string, any>>({});
  const [sortedPackages, setSortedPackages] = useState<string[]>([]);
  const [isOfflineMode, setIsOfflineMode] = useState<boolean>(false);
  const [rateLimitUntil, setRateLimitUntil] = useState<number | null>(null);

  // Fetch analysis data on component mount
  useEffect(() => {
    // Check if we have initial data
    const initialData = (window as any).initialData;
    if (initialData) {
      handleAnalysisData(
        initialData.packageData,
        initialData.analysis.packageImports
      );
    } else {
      requestAnalysisData();
    }

    // Set up message handler
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;

      if (message.command === CommandType.GetAnalysisData) {
        handleAnalysisData(message.data.packageData, message.data.packageUsage);
      } else if (message.type === "updateOfflineMode") {
        setIsOfflineMode(message.data.isOfflineMode);
        setRateLimitUntil(message.data.rateLimitedUntil);
      }
    };

    // Listen for messages from the extension
    window.addEventListener("message", handleMessage);

    // Clean up event listener
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [vscodeApi]);

  // Process analysis data
  const handleAnalysisData = (
    pkgData: Record<string, any>,
    pkgUsage: Record<string, string[]>
  ) => {
    setPackageData(pkgData || {});
    setPackageUsage(pkgUsage || {});

    // Sort packages by usage count
    const sorted = Object.keys(pkgUsage || {}).sort((a, b) => {
      const countA = pkgUsage[a] ? pkgUsage[a].length : 0;
      const countB = pkgUsage[b] ? pkgUsage[b].length : 0;
      return countB - countA;
    });

    setSortedPackages(sorted);
    setLoading(false);
  };

  // Request analysis data from extension
  const requestAnalysisData = () => {
    vscodeApi.postMessage({
      command: CommandType.GetAnalysisData,
    });
  };

  // Handle opening a file
  const handleOpenFile = (filePath: string) => {
    vscodeApi.postMessage({
      command: CommandType.OpenFile,
      filePath: filePath,
    });
  };

  // Handle requesting migration guidance
  const handleRequestMigration = (packageName: string) => {
    vscodeApi.postMessage({
      command: "generateMigration",
      data: packageName,
    });
  };

  // Toggle offline mode
  const toggleOfflineMode = () => {
    vscodeApi.postMessage({
      command: "toggleOfflineMode",
    });
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
          onClick={requestAnalysisData}
          className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
        >
          Retry
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
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Package Analysis</h1>
        <OfflineMode
          isOfflineMode={isOfflineMode}
          rateLimitUntil={rateLimitUntil}
          onToggle={toggleOfflineMode}
        />
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
          // Get package data and usage information
          const pkgData = packageData[pkg] || {
            name: pkg,
            description: "No metadata available",
            version: "Unknown",
            weeklyDownloads: 0,
            alternatives: [],
          };

          // Find files where this package is used
          const usedInFiles = Object.entries(packageUsage)
            .filter(([_, packages]) => packages.includes(pkg))
            .map(([filePath]) => filePath);

          // Package usage summary
          const usage = {
            count: usedInFiles.length,
            files: usedInFiles,
          };

          return (
            <PackageCard
              key={pkg}
              packageInfo={{
                ...pkgData,
                usage,
              }}
              onOpenFile={handleOpenFile}
              onRequestMigration={handleRequestMigration}
            />
          );
        })}
      </div>
    </div>
  );
};

export default WebviewPanel;
