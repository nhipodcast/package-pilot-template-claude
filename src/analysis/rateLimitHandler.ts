import axios, { AxiosRequestConfig, AxiosResponse, AxiosError } from "axios";

/**
 * Configuration options for the rate limit handler
 */
export interface RateLimitOptions {
  /** Maximum requests per minute (default: 30) */
  requestsPerMinute?: number;
  /** Maximum retry attempts for rate-limited requests (default: 3) */
  maxRetries?: number;
  /** Base delay before retrying in ms (default: 2000) */
  baseRetryDelay?: number;
  /** Whether to use exponential backoff for retries (default: true) */
  useExponentialBackoff?: number;
}

/**
 * A request queue that handles rate limiting for API requests
 */
export class RateLimitHandler {
  private queue: Array<{
    requestFn: () => Promise<AxiosResponse>;
    resolve: (value: AxiosResponse) => void;
    reject: (reason: any) => void;
  }> = [];
  private isProcessing = false;
  private requestsPerMinute: number;
  private delayBetweenRequests: number;
  private maxRetries: number;
  private baseRetryDelay: number;
  private useExponentialBackoff: boolean;

  /**
   * Creates a new rate limit handler
   */
  constructor(options: RateLimitOptions = {}) {
    this.requestsPerMinute = options.requestsPerMinute || 30;
    this.delayBetweenRequests = 60000 / this.requestsPerMinute;
    this.maxRetries = options.maxRetries || 3;
    this.baseRetryDelay = options.baseRetryDelay || 2000;
    this.useExponentialBackoff =
      options.useExponentialBackoff !== undefined
        ? !!options.useExponentialBackoff
        : true;
  }

  /**
   * Makes an API request with rate limit handling
   *
   * @param url The URL to request
   * @param config Optional Axios request configuration
   * @returns Promise that resolves with the Axios response
   */
  public async request<T = any>(
    url: string,
    config: AxiosRequestConfig = {}
  ): Promise<AxiosResponse<T>> {
    return this.enqueue(() => axios.get<T>(url, config));
  }

  /**
   * Makes a POST request with rate limit handling
   *
   * @param url The URL to request
   * @param data The data to send
   * @param config Optional Axios request configuration
   * @returns Promise that resolves with the Axios response
   */
  public async post<T = any>(
    url: string,
    data?: any,
    config: AxiosRequestConfig = {}
  ): Promise<AxiosResponse<T>> {
    return this.enqueue(() => axios.post<T>(url, data, config));
  }

  /**
   * Adds a request to the queue and processes it with rate limiting
   *
   * @param requestFn Function that returns a promise for an Axios request
   * @returns Promise that resolves with the Axios response
   */
  private async enqueue<T = any>(
    requestFn: () => Promise<AxiosResponse<T>>
  ): Promise<AxiosResponse<T>> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        requestFn: requestFn as () => Promise<AxiosResponse>,
        resolve: resolve as (value: AxiosResponse) => void,
        reject,
      });

      this.processQueue();
    });
  }

  /**
   * Processes requests in the queue, respecting rate limits
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;
    const { requestFn, resolve, reject } = this.queue.shift()!;

    try {
      const result = await this.executeWithRetry(requestFn);
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.isProcessing = false;

      // Schedule the next request
      setTimeout(() => {
        this.processQueue();
      }, this.delayBetweenRequests);
    }
  }

  /**
   * Executes a request with automatic retry for rate limit errors
   *
   * @param requestFn Function that returns a promise for an Axios request
   * @param retryCount Current retry attempt (used internally)
   * @returns Promise that resolves with the Axios response
   */
  private async executeWithRetry(
    requestFn: () => Promise<AxiosResponse>,
    retryCount = 0
  ): Promise<AxiosResponse> {
    try {
      return await requestFn();
    } catch (error) {
      const axiosError = error as AxiosError;

      // Handle rate limiting (429 status code)
      if (
        axiosError.response &&
        axiosError.response.status === 429 &&
        retryCount < this.maxRetries
      ) {
        // Get retry delay from header or use calculated delay
        let retryDelay = this.baseRetryDelay;

        // Check for Retry-After header (in seconds, convert to ms)
        if (axiosError.response.headers["retry-after"]) {
          const headerValue = axiosError.response.headers["retry-after"];
          const retryAfterSeconds = parseInt(headerValue as string, 10);

          if (!isNaN(retryAfterSeconds)) {
            retryDelay = retryAfterSeconds * 1000;
          }
        } else if (this.useExponentialBackoff) {
          // Use exponential backoff if no header is present
          retryDelay = this.baseRetryDelay * Math.pow(2, retryCount);
        }

        console.log(
          `Rate limited. Retrying after ${retryDelay}ms (attempt ${
            retryCount + 1
          }/${this.maxRetries})...`
        );

        // Wait and then retry
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        return this.executeWithRetry(requestFn, retryCount + 1);
      }

      // For other errors or if max retries reached, re-throw
      throw error;
    }
  }

  /**
   * Gets the current queue length
   */
  public get queueLength(): number {
    return this.queue.length;
  }

  /**
   * Clears all pending requests from the queue
   */
  public clearQueue(): void {
    const error = new Error("Request queue cleared");
    this.queue.forEach((item) => item.reject(error));
    this.queue = [];
  }
}

/**
 * Creates a pre-configured rate limit handler for npm API
 */
export function createNpmApiHandler(
  options?: RateLimitOptions
): RateLimitHandler {
  return new RateLimitHandler({
    requestsPerMinute: 30,
    maxRetries: 3,
    ...options,
  });
}

/**
 * Creates a pre-configured rate limit handler for GitHub API
 */
export function createGitHubApiHandler(
  options?: RateLimitOptions
): RateLimitHandler {
  return new RateLimitHandler({
    requestsPerMinute: 60, // GitHub allows more requests than npm
    maxRetries: 3,
    ...options,
  });
}

// Example usage
export async function fetchPackageInfo(packageName: string): Promise<any> {
  const npmApi = createNpmApiHandler();

  try {
    const response = await npmApi.request(
      `https://registry.npmjs.org/${packageName}`
    );
    return response.data;
  } catch (error) {
    console.error(`Error fetching package info for ${packageName}:`, error);
    throw error;
  }
}
