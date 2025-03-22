import * as React from "react";
import { useState, useEffect } from "react";
import { messageHandler } from "@estruyf/vscode/dist/client";
import PackageAnalysis from "./components/PackageAnalysis";

export interface IAppProps {}

export const App: React.FunctionComponent<IAppProps> = () => {
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [currentView, setCurrentView] = useState<string>("home");
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const setMessageHandler = (msg: React.SetStateAction<string>) => {
    console.log("message", msg);
    setMessage(msg);
  };

  const sendMessage = () => {
    messageHandler.send("POST_DATA", { msg: "Hello from Package Pilot!" });
  };

  const requestData = () => {
    setIsLoading(true);
    messageHandler
      .request<string>("GET_DATA")
      .then((msg) => {
        setMessageHandler(msg);
      })
      .catch((err) => {
        setError(typeof err === "string" ? err : "Unknown error occurred");
      })
      .finally(() => {
        setIsLoading(false);
      });
  };

  const requestWithErrorData = () => {
    setIsLoading(true);
    messageHandler
      .request<string>("GET_DATA_ERROR")
      .then((msg) => {
        console.log(
          `%c msg ` + JSON.stringify(msg, null, 4),
          "color:white; background:blue; font-size: 20px"
        );
        setMessageHandler(msg);
      })
      .catch((err) => {
        setError(typeof err === "string" ? err : "Unknown error occurred");
      })
      .finally(() => {
        setIsLoading(false);
      });
  };

  const analyzeCurrentFile = () => {
    setIsLoading(true);
    messageHandler.send("ANALYZE_CURRENT_FILE");
    setCurrentView("analysis");
    setIsLoading(false);
  };

  const analyzeFolder = () => {
    setIsLoading(true);
    messageHandler.send("ANALYZE_FOLDER");
    setCurrentView("analysis");
    setIsLoading(false);
  };

  const analyzeProject = () => {
    setIsLoading(true);
    messageHandler.send("ANALYZE_PROJECT");
    setCurrentView("analysis");
    setIsLoading(false);
  };

  const selectFilesToAnalyze = () => {
    setIsLoading(true);
    messageHandler.send("ANALYZE_PICKED_FILES");
    setCurrentView("analysis");
    setIsLoading(false);
  };

  const goBackToHome = () => {
    setCurrentView("home");
    setMessageHandler("xz");
    setError("");
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-blue-600 mb-2">Package Pilot</h1>
        <p className="text-gray-600">
          Analyze and optimize your project's npm dependencies
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <PackageAnalysis onBack={goBackToHome} />
        <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200 hover:shadow-lg transition-shadow duration-200">
          <h2 className="text-xl font-semibold mb-4 text-gray-800">
            File Analysis
          </h2>
          <p className="text-gray-600 mb-4">
            Analyze imports from individual files to get package recommendations
          </p>
          <div className="flex flex-col space-y-3">
            <button
              onClick={analyzeCurrentFile}
              disabled={isLoading}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 disabled:opacity-50"
            >
              Analyze Current File
            </button>
            <button
              onClick={selectFilesToAnalyze}
              disabled={isLoading}
              className="px-4 py-2 bg-blue-100 text-blue-800 rounded hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 disabled:opacity-50"
            >
              Select Files to Analyze
            </button>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200 hover:shadow-lg transition-shadow duration-200">
          <h2 className="text-xl font-semibold mb-4 text-gray-800">
            Project Analysis
          </h2>
          <p className="text-gray-600 mb-4">
            Get a comprehensive overview of all dependencies in your project
          </p>
          <div className="flex flex-col space-y-3">
            <button
              onClick={analyzeFolder}
              disabled={isLoading}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 disabled:opacity-50"
            >
              Analyze Selected Folder
            </button>
            <button
              onClick={analyzeProject}
              disabled={isLoading}
              className="px-4 py-2 bg-blue-100 text-blue-800 rounded hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 disabled:opacity-50"
            >
              Analyze Entire Project
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
        <h2 className="text-xl font-semibold mb-4 text-gray-800">
          Debug Options
        </h2>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={sendMessage}
            disabled={isLoading}
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50 disabled:opacity-50"
          >
            Send Message
          </button>
          <button
            onClick={requestData}
            disabled={isLoading}
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50 disabled:opacity-50"
          >
            Get Data
          </button>
          <button
            onClick={requestWithErrorData}
            disabled={isLoading}
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50 disabled:opacity-50"
          >
            Test Error
          </button>
        </div>

        {isLoading && (
          <div className="mt-4 flex items-center text-gray-500">
            <div className="w-4 h-4 border-2 border-t-blue-500 border-blue-200 rounded-full animate-spin mr-2"></div>
            <p>Loading...</p>
          </div>
        )}

        {message && (
          <div className="mt-4 p-3 bg-green-50 text-green-800 rounded border border-green-200">
            <strong>Response:</strong> {message}
          </div>
        )}

        {error && (
          <div className="mt-4 p-3 bg-red-50 text-red-800 rounded border border-red-200">
            <strong>Error:</strong> {error}
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
