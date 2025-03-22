import * as React from "react";
import { messageHandler } from "@estruyf/vscode/dist/client";
import PackageAnalysis from "./components/PackageAnalysis";
import "./styles.css";
export interface IAppProps {}

export const App: React.FunctionComponent<
  IAppProps
> = ({}: React.PropsWithChildren<IAppProps>) => {
  const [message, setMessage] = React.useState<string>("");
  const [error, setError] = React.useState<string>("");

  const sendMessage = () => {
    messageHandler.send("POST_DATA", { msg: "Hello from the webview" });
  };

  const requestData = () => {
    messageHandler.request<string>("GET_ANALYSIS_DATA").then((msg) => {
      setMessage(msg);
    });
  };

  const requestWithErrorData = () => {
    messageHandler
      .request<string>("GET_DATA_ERROR")
      .then((msg) => {
        setMessage(msg);
      })
      .catch((err) => {
        setError(err);
      });
  };

  return (
    <div className="app">
      <div className="app__actions">
        <PackageAnalysis />
      </div>

      {message && (
        <p>
          <strong>Message from the extension</strong>: {message}
        </p>
      )}

      {error && (
        <p className="app__error">
          <strong>ERROR</strong>: {error}
        </p>
      )}
    </div>
  );
};
