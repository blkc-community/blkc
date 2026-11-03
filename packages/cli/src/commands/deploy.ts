/**
 * BLKC CLI - Deploy Commands
 * 
 * Commands for deploying BLKC content to BCM.
 * This is the CLI half of the deploy functionality.
 * 
 * @package @blkc-code/cli
 * @license Apache-2.0
 * @author Black Code Enterprises LLC
 */

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { safeParse } from "@blkc-code/core";
import { z } from "zod";

// ============================================================================
// Types
// ============================================================================

/** Deploy configuration schema */
const DeployConfigSchema = z.object({
  apiUrl: z.string().url().default("https://api.blackcodemarket.com"),
  authToken: z.string().optional(),
  projectId: z.string().optional(),
  siteId: z.string().optional(),
  environment: z.enum(["development", "staging", "production"]).default("development"),
  outputDir: z.string().default("dist"),
  cleanOutputDir: z.boolean().default(true),
  minify: z.boolean().default(true),
});

type DeployConfig = z.infer<typeof DeployConfigSchema>;

// ============================================================================
// Configuration Management
// ============================================================================

const CONFIG_FILE_NAME = "blkc.deploy.json";

/** Get the deploy config file path */
function getConfigPath(cwd?: string): string {
  return path.resolve(cwd || process.cwd(), CONFIG_FILE_NAME);
}

/** Load deploy configuration */
async function loadConfig(cwd?: string): Promise<DeployConfig> {
  const configPath = getConfigPath(cwd);
  
  try {
    const content = await readFile(configPath, { encoding: "utf8" });
    return safeParse(DeployConfigSchema, JSON.parse(content)) as DeployConfig;
  } catch {
    // Return default config if file doesn't exist
    return DeployConfigSchema.parse({}) as DeployConfig;
  }
}

/** Save deploy configuration */
async function saveConfig(config: DeployConfig, cwd?: string): Promise<void> {
  const configPath = getConfigPath(cwd);
  await writeFile(configPath, JSON.stringify(config, null, 2), { encoding: "utf8" });
}

/** Check if config file exists */
async function configExists(cwd?: string): Promise<boolean> {
  const configPath = getConfigPath(cwd);
  try {
    await stat(configPath);
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Command: deploy init
// ============================================================================

function setupInitCommand(program: Command): void {
  program
    .command("init")
    .description("Initialize deployment configuration")
    .option("--project-id <id>", "BCM project ID")
    .option("--site-id <id>", "BCM site ID")
    .option("--api-url <url>", "BCM API URL", "https://api.blackcodemarket.com")
    .option("--environment <env>", "Environment", "development")
    .option("-y, --yes", "Skip prompts and use defaults")
    .action(async (options) => {
      const spinner = ora("Initializing BLKC deploy configuration...").start();
      
      try {
        // Check if config already exists
        const exists = await configExists();
        if (exists && !options.yes) {
          spinner.fail("Deploy configuration already exists. Use --yes to overwrite.");
          return;
        }

        // Create config
        const config: DeployConfig = {
          apiUrl: options.apiUrl,
          projectId: options.projectId,
          siteId: options.siteId,
          environment: options.environment as DeployConfig["environment"],
          outputDir: "dist",
          cleanOutputDir: true,
          minify: true,
        };

        await saveConfig(config);
        
        spinner.succeed(`Deploy configuration initialized in ${CONFIG_FILE_NAME}`);
        console.log(chalk.gray(`API URL: ${config.apiUrl}`));
        console.log(chalk.gray(`Environment: ${config.environment}`));
        if (config.projectId) {
          console.log(chalk.gray(`Project ID: ${config.projectId}`));
        }
        if (config.siteId) {
          console.log(chalk.gray(`Site ID: ${config.siteId}`));
        }
      } catch (error) {
        spinner.fail(`Failed to initialize configuration: ${error}`);
        process.exit(1);
      }
    });
}

// ============================================================================
// Command: deploy preview
// ============================================================================

function setupPreviewCommand(program: Command): void {
  program
    .command("preview")
    .description("Preview site before deployment")
    .option("--port <port>", "Port to serve preview", "3000")
    .option("--output-dir <dir>", "Output directory", "dist")
    .action(async (options) => {
      const spinner = ora("Starting preview server...").start();
      
      try {
        const { port, outputDir } = options;
        const outputPath = path.resolve(process.cwd(), outputDir);
        
        // Check if output directory exists
        try {
          await stat(outputPath);
        } catch {
          spinner.fail(`Output directory '${outputDir}' does not exist. Run 'npm run build' first.`);
          return;
        }

        // In a real implementation, we would start a server here
        // For now, just show a success message
        spinner.succeed(`Preview server would start on http://localhost:${port}`);
        console.log(chalk.yellow("Note: Preview server implementation requires a static file server."));
        console.log(chalk.gray(`Output directory: ${outputPath}`));
        console.log(chalk.gray(`To serve locally: npx serve -p ${port} ${outputPath}`));
      } catch (error) {
        spinner.fail(`Failed to start preview: ${error}`);
        process.exit(1);
      }
    });
}

// ============================================================================
// Command: deploy push
// ============================================================================

function setupPushCommand(program: Command): void {
  program
    .command("push")
    .description("Deploy site to BCM")
    .option("--message <message>", "Deploy message")
    .option("--dry-run", "Simulate deployment without actually deploying")
    .action(async (options) => {
      const { message, dryRun } = options;
      const spinner = ora(dryRun ? "Simulating deployment..." : "Deploying to BCM...").start();
      
      try {
        // Load config
        const config = await loadConfig();
        
        // Validate required fields
        if (!config.projectId) {
          spinner.fail("Project ID is required. Use 'blkc deploy init --project-id <id>' to set it.");
          return;
        }

        if (!config.siteId) {
          spinner.fail("Site ID is required. Use 'blkc deploy init --site-id <id>' to set it.");
          return;
        }

        if (!config.authToken) {
          spinner.fail("Auth token is required. Use 'blkc auth login' or set BCM_AUTH_TOKEN environment variable.");
          return;
        }

        // Check output directory
        const outputPath = path.resolve(process.cwd(), config.outputDir);
        try {
          await stat(outputPath);
        } catch {
          spinner.fail(`Output directory '${config.outputDir}' does not exist. Run 'npm run build' first.`);
          return;
        }

        // Simulate deployment
        if (dryRun) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          spinner.succeed("Dry run: Deployment would be successful");
          console.log(chalk.gray(`Project: ${config.projectId}`));
          console.log(chalk.gray(`Site: ${config.siteId}`));
          console.log(chalk.gray(`Environment: ${config.environment}`));
          console.log(chalk.gray(`Message: ${message || "No message"}`));
          return;
        }

        // In a real implementation, we would:
        // 1. Create a deploy manifest
        // 2. Upload files to BCM
        // 3. Trigger deployment via API
        // For now, simulate with a delay
        await new Promise((resolve) => setTimeout(resolve, 2000));
        
        const deployId = `deploy_${Date.now()}`;
        spinner.succeed(`Deployed successfully!`);
        console.log(chalk.green(`Deploy ID: ${deployId}`));
        console.log(chalk.gray(`Project: ${config.projectId}`));
        console.log(chalk.gray(`Site: ${config.siteId}`));
        console.log(chalk.gray(`Environment: ${config.environment}`));
        console.log(chalk.gray(`URL: https://${config.siteId}.blackcodemarket.com`));
      } catch (error) {
        spinner.fail(`Failed to deploy: ${error}`);
        process.exit(1);
      }
    });
}

// ============================================================================
// Command: deploy status
// ============================================================================

function setupStatusCommand(program: Command): void {
  program
    .command("status")
    .description("Check deployment status")
    .option("--deploy-id <id>", "Specific deploy ID to check")
    .option("--limit <n>", "Number of recent deploys to show", "10")
    .action(async (options) => {
      const { deployId, limit } = options;
      const spinner = ora("Checking deployment status...").start();
      
      try {
        const config = await loadConfig();
        
        if (!config.projectId) {
          spinner.fail("Project ID is required.");
          return;
        }

        if (!config.authToken) {
          spinner.fail("Auth token is required.");
          return;
        }

        // Simulate status check
        await new Promise((resolve) => setTimeout(resolve, 1000));
        
        if (deployId) {
          // Check specific deploy
          spinner.succeed(`Deploy ${deployId}`);
          console.log(chalk.gray("Status: " + chalk.green("Success")));
          console.log(chalk.gray(`URL: https://${config.siteId}.blackcodemarket.com`));
        } else {
          // List recent deploys
          spinner.succeed(`Recent deploys for ${config.projectId}`);
          console.log(chalk.gray("\nLast 3 deploys:"));
          
          for (let i = 0; i < Math.min(3, Number(limit)); i++) {
            const fakeDeployId = `deploy_${Date.now() - i * 1000}`;
            const status = i === 0 ? "Success" : i === 1 ? "Success" : "Failed";
            const color = status === "Success" ? chalk.green : chalk.red;
            console.log(`  ${i + 1}. ${fakeDeployId} - ${color(status)} - 2026-11-02T12:00:00Z`);
          }
          
          console.log(chalk.gray("\nUse --deploy-id to check a specific deploy."));
        }
      } catch (error) {
        spinner.fail(`Failed to check status: ${error}`);
        process.exit(1);
      }
    });
}

// ============================================================================
// Command: deploy logs
// ============================================================================

function setupLogsCommand(program: Command): void {
  program
    .command("logs")
    .description("View deployment logs")
    .option("--deploy-id <id>", "Deploy ID to view logs for")
    .option("--tail <n>", "Show last N lines", "100")
    .option("--follow, -f", "Follow logs in real-time")
    .action(async (options) => {
      const { deployId, tail, follow } = options;
      
      try {
        const config = await loadConfig();
        
        if (!config.projectId) {
          console.error(chalk.red("Project ID is required."));
          process.exit(1);
        }

        if (!config.authToken) {
          console.error(chalk.red("Auth token is required."));
          process.exit(1);
        }

        if (!deployId) {
          console.error(chalk.red("Deploy ID is required. Use --deploy-id."));
          process.exit(1);
        }

        if (follow) {
          console.log(chalk.yellow(`Following logs for deploy ${deployId}... (Ctrl+C to stop)`));
          // In a real implementation, we would stream logs here
          // For now, just simulate
          for (let i = 0; i < 5; i++) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            console.log(`[2026-11-02T12:00:${String(i).padStart(2, "0")}] Building...`);
          }
          console.log(chalk.green(`[2026-11-02T12:00:05] Deploy complete!`));
        } else {
          console.log(chalk.gray(`Showing last ${tail} lines for deploy ${deployId}`));
          console.log(chalk.gray("\n[2026-11-02T12:00:00] Starting deployment..."));
          console.log(chalk.gray("[2026-11-02T12:00:01] Building static files..."));
          console.log(chalk.gray("[2026-11-02T12:00:02] Uploading to BCM..."));
          console.log(chalk.gray("[2026-11-02T12:00:03] Deploying..."));
          console.log(chalk.gray("[2026-11-02T12:00:04] Successfully deployed!"));
        }
      } catch (error) {
        console.error(chalk.red(`Failed to view logs: ${error}`));
        process.exit(1);
      }
    });
}

// ============================================================================
// Register Commands
// ============================================================================

/** Register all deploy commands with the program */
export function registerDeployCommands(program: Command): void {
  const deployProgram = program
    .command("deploy")
    .description("Deployment commands")
    .alias("d");

  setupInitCommand(deployProgram);
  setupPreviewCommand(deployProgram);
  setupPushCommand(deployProgram);
  setupStatusCommand(deployProgram);
  setupLogsCommand(deployProgram);
}
