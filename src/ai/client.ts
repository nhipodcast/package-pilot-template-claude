import vscode from "vscode";
import axios, {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  AxiosError,
} from "axios";
import { shouldUseOfflineMode } from "../test/services/offlineMode";

interface ApiClientConfig {
  baseUrl: string;
  maxRetries: number;
  initialBackoffMs: number;
}

interface CacheEntry {
  timestamp: number;
  data: any;
}

// Export a singleton instance
export let openaiClient: ApiClient | null = null;

export class ApiClient {
  private cacheTTLMs = 1000 * 60 * 60; // 1 hour cache by default
  private cache = new Map<string, { timestamp: number; data: any }>();
  private client: AxiosInstance;
  private maxRetries: number;
  private initialBackoffMs: number;

  constructor(config: ApiClientConfig) {
    this.client = axios.create({
      baseURL: config.baseUrl,
      timeout: 30000, // 30 second timeout
    });

    this.maxRetries = config.maxRetries;
    this.initialBackoffMs = config.initialBackoffMs;
  }

  /**
   * Set API key for authenticated requests
   */
  setApiKey(apiKey: string): void {
    this.client.defaults.headers.common["Authorization"] = `Bearer ${apiKey}`;
  }

  /**
   * Make API request with automatic retry and caching
   */
  async request<T>(
    method: string,
    url: string,
    data?: any,
    options?: {
      cacheKey?: string;
      cacheTTL?: number;
      forceRefresh?: boolean;
    }
  ): Promise<T> {
    // Check for offline mode first
    if (shouldUseOfflineMode()) {
      throw new Error("API request failed: Offline mode is active");
    }

    const cacheKey =
      options?.cacheKey || `${method}:${url}:${JSON.stringify(data || {})}`;
    const cacheTTL = options?.cacheTTL || this.cacheTTLMs;

    // Check cache if it's a GET request and caching is not disabled
    if (method.toLowerCase() === "get" && !options?.forceRefresh) {
      const cachedResult = this.getFromCache<T>(cacheKey, cacheTTL);
      if (cachedResult) {
        return cachedResult;
      }
    }

    // Make the request with retries
    let retries = 0;
    let lastError: any;

    while (retries <= this.maxRetries) {
      try {
        const config: AxiosRequestConfig = { method, url };
        if (["post", "put", "patch"].includes(method.toLowerCase()) && data) {
          config.data = data;
        } else if (data) {
          config.params = data;
        }

        // Display progress for long requests
        const progressOptions = {
          location: vscode.ProgressLocation.Notification,
          title: `API Request: ${method.toUpperCase()} ${url}`,
          cancellable: true,
        };

        const response = await vscode.window.withProgress<AxiosResponse>(
          progressOptions,
          async (progress: any, token: any) => {
            return this.client.request(config);
          }
        );

        // Cache successful response for GET requests
        if (method.toLowerCase() === "get") {
          this.addToCache(cacheKey, response.data);
        }

        return response.data as T;
      } catch (error) {
        lastError = error;

        // Handle rate limiting explicitly
        if (this.isRateLimitError(error as AxiosError)) {
          // Get retry-after header if available
          const retryAfter = this.getRetryAfterSeconds(error as AxiosError);

          // Set rate limited status
          // In src/ai/client.ts at around line 120
          // try {
          //   setRateLimited(retryAfter || 60);
          // } catch (error) {
          //   console.error("Failed to set rate limited status:", error);
          //   // Still enter offline mode even if notification fails
          //   vscode.window.showWarningMessage(
          //     "API rate limited. Switching to offline mode."
          //   );
          // }
          // Stop retrying and let the offline mode system handle it
          break;
        }

        if (this.shouldRetry(error as AxiosError, retries)) {
          const backoffTime = this.calculateBackoff(retries);

          // Show retry notification
          vscode.window.showInformationMessage(
            `API request failed. Retrying in ${Math.ceil(
              backoffTime / 1000
            )} seconds... (${retries + 1}/${this.maxRetries})`
          );

          await this.delay(backoffTime);
          retries++;
        } else {
          break;
        }
      }
    }

    // If we got here, all retries failed
    this.handleApiError(lastError);
    throw lastError;
  }

  /**
   * Check if error is a rate limit error
   */
  private isRateLimitError(error: AxiosError): boolean {
    return error.response?.status === 429;
  }

  /**
   * Get retry-after header value
   */
  private getRetryAfterSeconds(error: AxiosError): number | null {
    if (!error.response?.headers) {
      return null;
    }

    const retryAfter = error.response.headers["retry-after"];
    if (!retryAfter) {
      return null;
    }

    // Header can be a date or seconds
    if (isNaN(parseInt(retryAfter as string))) {
      // It's a date
      const retryDate = new Date(retryAfter as string);
      return Math.ceil((retryDate.getTime() - Date.now()) / 1000);
    } else {
      // It's seconds
      return parseInt(retryAfter as string);
    }
  }

  /**
   * Check if the error is retryable
   */
  private shouldRetry(error: AxiosError, retries: number): boolean {
    if (retries >= this.maxRetries) {
      return false;
    }

    // Don't retry rate limit errors - handle them specially
    if (error.response?.status === 429) {
      return false;
    }

    // Retry on server errors (5xx) and network errors
    return (
      !error.response ||
      (error.response.status >= 500 && error.response.status < 600)
    );
  }

  /**
   * Calculate exponential backoff time
   */
  private calculateBackoff(retries: number): number {
    // Exponential backoff with jitter
    const baseBackoff = this.initialBackoffMs * Math.pow(2, retries);
    const jitter = Math.random() * 0.5 + 0.75; // 0.75-1.25 multiplier
    return Math.min(baseBackoff * jitter, 30000); // Cap at 30 seconds
  }

  /**
   * Delay/sleep for specified milliseconds
   */
  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Add successful response to cache
   */
  private addToCache(key: string, data: any): void {
    this.cache.set(key, {
      timestamp: Date.now(),
      data,
    });

    // Keep cache size reasonable
    if (this.cache.size > 100) {
      // Delete oldest entries if cache gets too large
      const entries = Array.from(this.cache.entries());
      const oldestEntries = entries
        .sort((a, b) => a[1].timestamp - b[1].timestamp)
        .slice(0, 20);

      for (const [key] of oldestEntries) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Get cached response if valid
   */
  private getFromCache<T>(key: string, ttl: number): T | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < ttl) {
      return cached.data as T;
    }
    return null;
  }

  /**
   * Handle API errors with user-friendly messages
   */
  private handleApiError(error: any): void {
    if (!error.response) {
      vscode.window.showErrorMessage(
        "Network error. Please check your internet connection."
      );
      return;
    }

    const status = error.response.status;

    // Only show error for non-rate-limit errors (since those are handled separately)
    if (status !== 429) {
      switch (status) {
        case 401:
          vscode.window.showErrorMessage(
            "API authentication failed. Please check your API key in settings."
          );
          break;
        case 403:
          vscode.window.showErrorMessage(
            "API access forbidden. Your API key may not have the required permissions."
          );
          break;
        case 500:
        case 502:
        case 503:
        case 504:
          vscode.window.showErrorMessage(
            `API server error (${status}). The service may be experiencing issues. Please try again later.`
          );
          break;
        default:
          vscode.window.showErrorMessage(
            `API request failed with status code ${status}: ${
              error.response.data?.message || error.message
            }`
          );
      }
    }
  }

  /**
   * Clear the entire cache
   */
  clearCache(): void {
    this.cache.clear();
    vscode.window.showInformationMessage("API cache cleared successfully");
  }
}

// Create OpenAI client instance
export function createOpenAIClient(): ApiClient {
  // Get configuration
  const config = vscode.workspace.getConfiguration("packagePilot");
  const maxRetries = config.get<number>("maxRetries", 3);
  const initialBackoffMs = config.get<number>("initialBackoffMs", 1000);

  openaiClient = new ApiClient({
    baseUrl: "https://api.openai.com/v1",
    maxRetries,
    initialBackoffMs,
  });

  return openaiClient;
}
