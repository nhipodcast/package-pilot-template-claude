import React from "react";
import { useOfflineMode } from "../context/OfflineModeContext";

interface OfflineModeProps {
  className?: string;
}

export function OfflineMode({ className = "" }: OfflineModeProps) {
  const {
    isOfflineMode,
    isRateLimited,
    rateLimitedUntil,
    remainingTimeFormatted,
  } = useOfflineMode();

  return (
    <div className={`offline-mode ${className}`}>
      <div className="flex items-center justify-between p-3 border border-vscode-border rounded-md bg-vscode-dropdown-bg">
        <div className="flex flex-col">
          <div className="flex items-center">
            <h3 className="text-sm font-medium text-vscode-fg">
              {isOfflineMode ? "Offline Mode" : "Online Mode"}
            </h3>
            {isRateLimited && (
              <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-amber-700 text-amber-100">
                Rate Limited
              </span>
            )}
          </div>

          <div className="mt-1 text-xs text-vscode-fg opacity-80">
            {isRateLimited ? (
              <p>
                API rate limit in effect. {remainingTimeFormatted} remaining.
              </p>
            ) : isOfflineMode ? (
              <p>AI-powered features are disabled.</p>
            ) : (
              <p>AI-powered features are enabled.</p>
            )}
          </div>
        </div>

        <div className="flex items-center">
          <button
            disabled={isRateLimited}
            title={
              isRateLimited
                ? "Can't toggle while rate limited"
                : "Toggle offline mode"
            }
            className={`
              relative inline-flex h-6 w-11 items-center rounded-full
              ${isOfflineMode ? "bg-vscode-button-bg" : "bg-gray-600"}
              transition-colors duration-200
              ${
                isRateLimited
                  ? "opacity-50 cursor-not-allowed"
                  : "cursor-pointer"
              }
            `}
          >
            <span
              className={`
                inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200
                ${isOfflineMode ? "translate-x-6" : "translate-x-1"}
              `}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
