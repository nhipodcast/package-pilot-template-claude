// src/ai/recommendations.ts
import vscode from "vscode";
import { ApiClient, createOpenAIClient, openaiClient } from "./client";
import { PackageScore } from "../analysis/scoring";
import { shouldUseOfflineMode, toggleOfflineMode } from "./offlineMode";

/**
 * Get OpenAI client with API key from settings
 */
function getOpenAIClient(): ApiClient | null {
  if (openaiClient) {
    return openaiClient;
  }

  const config = vscode.workspace.getConfiguration("packagePilot");
  const apiKey = config.get<string>("openaiApiKey");

  if (!apiKey) {
    return null;
  }

  const client = createOpenAIClient();
  client.setApiKey(apiKey);
  return client;
}

/**
 * Generate recommendations based on package scores
 */
export async function generateRecommendations(
  scores: Record<string, PackageScore>
): Promise<Record<string, string[]>> {
  try {
    // Check if we're in offline mode (either manual or due to rate limiting)
    if (shouldUseOfflineMode()) {
      console.log("Using offline mode for recommendations");
      return generateBasicRecommendations(scores);
    }

    // Check if OpenAI integration is configured
    const client = getOpenAIClient();

    if (client) {
      try {
        return await generateAIRecommendations(client, scores);
      } catch (error) {
        // Log the error but don't throw - fall back to basic recommendations
        console.error("AI recommendations failed:", error);

        // Only show warning if not already in offline mode (to prevent duplicate messages)
        if (!shouldUseOfflineMode()) {
          vscode.window.showWarningMessage(
            "AI-powered recommendations failed. Falling back to basic recommendations."
          );
        }
      }
    } else {
      // No API key configured, show one-time message
      const suppressPrompt = vscode.workspace
        .getConfiguration("packagePilot")
        .get<boolean>("suppressApiKeyPrompt", false);

      if (!suppressPrompt) {
        const configureNow = "Configure Now";
        const dontAsk = "Don't Ask Again";
        const offline = "Use Offline Mode";

        const selection = await vscode.window.showInformationMessage(
          "OpenAI API key not configured. Enhanced package recommendations require an API key.",
          configureNow,
          offline,
          dontAsk
        );

        if (selection === configureNow) {
          vscode.commands.executeCommand(
            "workbench.action.openSettings",
            "packagePilot.openaiApiKey"
          );
        } else if (selection === offline) {
          toggleOfflineMode(true);
        } else if (selection === dontAsk) {
          // Remember user preference
          await vscode.workspace
            .getConfiguration("packagePilot")
            .update(
              "suppressApiKeyPrompt",
              true,
              vscode.ConfigurationTarget.Global
            );
        }
      }
    }

    // Fall back to basic recommendations
    return generateBasicRecommendations(scores);
  } catch (error) {
    console.error("Error generating recommendations:", error);
    // Return empty recommendations as a last resort
    return {};
  }
}

/**
 * Generate recommendations using AI via OpenAI API
 */
async function generateAIRecommendations(
  client: ApiClient,
  scores: Record<string, PackageScore>
): Promise<Record<string, string[]>> {
  // Prepare data for API request
  const packages = Object.entries(scores)
    .sort(([, a], [, b]) => b.overall - a.overall)
    .slice(0, 10) // Focus on top 10 packages
    .map(([name, score]) => ({
      name,
      overall: score.overall,
      downloads: score.downloads,
      issues: score.issues,
      lastUpdate: score.lastUpdate,
      stars: score.stars,
    }));

  // Make API request with caching
  const response = await client.request<any>(
    "post",
    "/chat/completions",
    {
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content:
            "You are a package recommendation expert for JavaScript/TypeScript projects.",
        },
        {
          role: "user",
          content: `Analyze these packages and provide recommendations: ${JSON.stringify(
            packages
          )}. For each package, suggest alternatives if they exist. Format as JSON with package names as keys and arrays of alternatives as values.`,
        },
      ],
      temperature: 0.3,
      max_tokens: 1500,
    },
    {
      cacheKey: `recommendations:${JSON.stringify(packages)}`,
      cacheTTL: 24 * 60 * 60 * 1000, // 24 hour cache for recommendations
    }
  );

  try {
    // Parse API response
    const content = response.choices[0]?.message?.content || "";
    const jsonMatch =
      content.match(/```json\n([\s\S]*?)\n```/) || content.match(/({[\s\S]*})/);

    if (jsonMatch && jsonMatch[1]) {
      return JSON.parse(jsonMatch[1]);
    }

    // Try to directly parse the response if no JSON block found
    return JSON.parse(content);
  } catch (error) {
    console.error("Failed to parse AI recommendations:", error);
    // Fall back to basic recommendations
    return generateBasicRecommendations(scores);
  }
}

/**
 * Generate basic recommendations without AI
 */
function generateBasicRecommendations(
  scores: Record<string, PackageScore>
): Record<string, string[]> {
  const recommendations: Record<string, string[]> = {};

  // Common package alternatives map
  const alternatives: Record<string, string[]> = {
    moment: ["date-fns", "dayjs", "luxon"],
    request: ["axios", "node-fetch", "got", "superagent"],
    underscore: ["lodash", "ramda"],
    jquery: ["react", "vue", "angular"],
    express: ["fastify", "koa", "nest.js"],
    mongoose: ["prisma", "typeorm", "sequelize"],
    redux: ["zustand", "mobx", "recoil"],
    eslint: ["rome", "prettier"],
    webpack: ["vite", "parcel", "esbuild", "rollup"],
    mocha: ["jest", "vitest", "ava"],
    chai: ["jest", "assert"],
    gulp: ["npm scripts", "grunt"],
    babel: ["swc", "esbuild"],
    "react-router": ["wouter", "tanstack-router"],
    "styled-components": ["emotion", "stitches", "tailwindcss"],
    axios: ["ky", "node-fetch", "got"],
    passport: ["lucia", "auth.js", "supertokens"],
    lodash: ["ramda", "radash", "remeda"],
    puppeteer: ["playwright"],
    grunt: ["npm scripts", "make"],
    bower: ["npm", "yarn", "pnpm"],
    handlebars: ["ejs", "pug", "nunjucks"],
    winston: ["pino", "bunyan", "loglevel"],
    nodemon: ["tsx watch", "ts-node-dev"],
    tslint: ["eslint", "rome"],
    enzyme: ["react-testing-library", "@testing-library/react"],
    sinon: ["jest.mock", "vitest.mock"],
  };

  // Fill in recommendations based on known alternatives
  for (const [pkg, score] of Object.entries(scores)) {
    if (alternatives[pkg]) {
      recommendations[pkg] = alternatives[pkg];
    } else if (pkg.startsWith("@types/")) {
      // Suggest TypeScript native packages for type definitions
      const basePkg = pkg.substring(7);
      recommendations[pkg] = [basePkg];
    } else {
      // Default recommendation for packages without known alternatives
      recommendations[pkg] = [];
    }
  }

  return recommendations;
}

/**
 * Generate migration code from one package to another
 */
export async function generateMigrationCode(
  fromPackage: string,
  context: vscode.ExtensionContext
): Promise<string> {
  try {
    // Check if we're in offline mode
    if (shouldUseOfflineMode()) {
      console.log("Using offline mode for migration code");
      return generateFallbackMigrationCode(fromPackage);
    }

    const client = getOpenAIClient();

    if (!client) {
      console.log("No API client available, using fallback");
      return generateFallbackMigrationCode(fromPackage);
    }

    try {
      const response = await client.request<any>(
        "post",
        "/chat/completions",
        {
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "system",
              content:
                "You are an expert at migrating between JavaScript/TypeScript packages.",
            },
            {
              role: "user",
              content: `Generate a migration guide with code examples for migrating from ${fromPackage} to recommended alternatives. Include code transformation examples.`,
            },
          ],
          temperature: 0.3,
          max_tokens: 2000,
        },
        {
          cacheKey: `migration:${fromPackage}`,
          cacheTTL: 7 * 24 * 60 * 60 * 1000, // 7 day cache for migrations
        }
      );

      return (
        response.choices[0]?.message?.content ||
        generateFallbackMigrationCode(fromPackage)
      );
    } catch (error) {
      console.error("Migration code generation failed:", error);
      return generateFallbackMigrationCode(fromPackage);
    }
  } catch (error) {
    console.error("Error in migration code generation:", error);
    return `// Error generating migration code: ${
      error instanceof Error ? error.message : "Unknown error"
    }\n\n${generateFallbackMigrationCode(fromPackage)}`;
  }
}

/**
 * Generate fallback migration code when API is unavailable
 */
function generateFallbackMigrationCode(fromPackage: string): string {
  const commonMigrations: Record<string, string> = {
    moment: `// Migration from moment to date-fns
// Before (moment):
import moment from 'moment';
const now = moment();
const formatted = now.format('YYYY-MM-DD');
const tomorrow = now.add(1, 'day');

// After (date-fns):
import { format, addDays } from 'date-fns';
const now = new Date();
const formatted = format(now, 'yyyy-MM-dd');
const tomorrow = addDays(now, 1);`,

    underscore: `// Migration from underscore to lodash
// Before (underscore):
import _ from 'underscore';
const filtered = _.filter(array, item => item.active);
const mapped = _.map(filtered, item => item.name);

// After (lodash):
import _ from 'lodash';
// Most methods have similar names but more features
const filtered = _.filter(array, item => item.active);
const mapped = _.map(filtered, item => item.name);
// Or using chain:
const result = _(array)
  .filter(item => item.active)
  .map(item => item.name)
  .value();`,

    request: `// Migration from request to axios
// Before (request):
const request = require('request');
request('https://api.example.com/data', (error, response, body) => {
  if (!error && response.statusCode === 200) {
    const data = JSON.parse(body);
    console.log(data);
  }
});

// After (axios):
const axios = require('axios');
axios.get('https://api.example.com/data')
  .then(response => {
    console.log(response.data);
  })
  .catch(error => {
    console.error('Error:', error);
  });

// With async/await:
async function fetchData() {
  try {
    const response = await axios.get('https://api.example.com/data');
    console.log(response.data);
  } catch (error) {
    console.error('Error:', error);
  }
}`,
  };

  // Return known migration guide or generic template
  return (
    commonMigrations[fromPackage] ||
    `// Migration guide for ${fromPackage}
// No pre-built migration guide available
// Common migration steps:
// 1. Install the alternative package
// 2. Update import statements
// 3. Convert method calls to the equivalent in the new package
// 4. Test thoroughly after migration

// Example:
// Before (${fromPackage}):
import ${fromPackage} from '${fromPackage}';
// Use ${fromPackage} methods...

// After (alternative):
import alternative from 'alternative';
// Use alternative methods...`
  );
}
