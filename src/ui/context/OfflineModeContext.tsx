import React, {
  createContext,
  useState,
  useContext,
  useEffect,
  ReactNode,
} from "react";
import { VSCodeAPI } from "../utils/vscode";

interface OfflineModeState {
  isOfflineMode: boolean;
  isRateLimited: boolean;
  rateLimitedUntil: number | null;
}

interface OfflineModeContextType extends OfflineModeState {
  toggleOfflineMode: () => void;
  remainingTimeFormatted: string;
}

const defaultState: OfflineModeState = {
  isOfflineMode: false,
  isRateLimited: false,
  rateLimitedUntil: null,
};

const OfflineModeContext = createContext<OfflineModeContextType>({
  ...defaultState,
  toggleOfflineMode: () => {},
  remainingTimeFormatted: "",
});

export function useOfflineMode() {
  return useContext(OfflineModeContext);
}

interface OfflineModeProviderProps {
  children: ReactNode;
  vscodeApi: VSCodeAPI;
}

export function OfflineModeProvider({
  children,
  vscodeApi,
}: OfflineModeProviderProps) {
  const [state, setState] = useState<OfflineModeState>(defaultState);
  const [timeRemaining, setTimeRemaining] = useState<string>("");

  useEffect(() => {
    // Listen for messages from extension
    const messageListener = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === "updateOfflineMode") {
        setState(message.data);
      }
    };

    window.addEventListener("message", messageListener);

    // Request initial state
    vscodeApi.postMessage({
      type: "getOfflineModeState",
    });

    // Update formatted time remaining
    const timer = setInterval(() => {
      if (state.rateLimitedUntil) {
        const remainingMs = Math.max(0, state.rateLimitedUntil - Date.now());
        setTimeRemaining(formatDuration(remainingMs));

        // If rate limit expired, update state
        if (remainingMs <= 0) {
          setState((prev) => ({
            ...prev,
            isRateLimited: false,
            rateLimitedUntil: null,
          }));
        }
      }
    }, 1000);

    return () => {
      window.removeEventListener("message", messageListener);
      clearInterval(timer);
    };
  }, [vscodeApi, state.rateLimitedUntil]);

  const toggleOfflineMode = () => {
    vscodeApi.postMessage({
      type: "toggleOfflineMode",
    });
  };

  return (
    <OfflineModeContext.Provider
      value={{
        ...state,
        toggleOfflineMode,
        remainingTimeFormatted: timeRemaining,
      }}
    >
      {children}
    </OfflineModeContext.Provider>
  );
}

// Format duration in milliseconds to human-readable format
function formatDuration(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);

  if (seconds < 60) {
    return `${seconds}s`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }
}
