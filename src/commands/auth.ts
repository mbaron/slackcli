import { Command } from 'commander';
import ora from 'ora';
import { authenticateStandard, authenticateBrowser } from '../lib/auth.ts';
import {
  getAllWorkspaces,
  setDefaultWorkspace,
  removeWorkspace,
  clearAllWorkspaces,
  getDefaultWorkspaceId,
} from '../lib/workspaces.ts';
import { success, error, info, formatWorkspace } from '../lib/formatter.ts';
import chalk from 'chalk';
import { parseCurlCommand, CurlParseError, looksLikeCurlCommand } from '../lib/curl-parser.ts';
import { readClipboard } from '../lib/clipboard.ts';
import { readInteractiveInput, isInteractiveTerminal, hasPipedInput } from '../lib/interactive-input.ts';
import {
  WorkspaceListOutputSchema,
  ParseCurlOutputSchema,
  type WorkspaceListOutput,
  type ParseCurlOutput,
} from '../schemas/index.ts';
import {
  type OutputFormat,
  output,
  outputSchema,
  createSpinner,
  succeedSpinner,
  failSpinner,
  addOutputOptions,
  validateFormat,
} from '../lib/output.ts';

export function createAuthCommand(): Command {
  const auth = new Command('auth')
    .description('Manage workspace authentication');

  // Login with standard token
  auth
    .command('login')
    .description('Login with standard Slack app token (xoxb-* or xoxp-*)')
    .requiredOption('--token <token>', 'Slack bot or user token')
    .requiredOption('--workspace-name <name>', 'Workspace name for identification')
    .action(async (options) => {
      const spinner = ora('Authenticating...').start();

      try {
        const config = await authenticateStandard(
          options.token,
          options.workspaceName
        );

        spinner.succeed('Authentication successful!');
        success(`Authenticated as workspace: ${config.workspace_name}`);
        info(`Workspace ID: ${config.workspace_id}`);
        if (config.auth_type === 'standard') {
          info(`Token Type: ${config.token_type}`);
        }
      } catch (err: any) {
        spinner.fail('Authentication failed');
        error(err.message);
        process.exit(1);
      }
    });

  // Login with browser tokens
  auth
    .command('login-browser')
    .description('Login with browser session tokens (xoxd-* and xoxc-*)')
    .requiredOption('--xoxd <token>', 'Browser session token (xoxd-*)')
    .requiredOption('--xoxc <token>', 'Browser API token (xoxc-*)')
    .requiredOption('--workspace-url <url>', 'Workspace URL (e.g., https://myteam.slack.com)')
    .option('--workspace-name <name>', 'Optional workspace name for identification')
    .action(async (options) => {
      const spinner = ora('Authenticating...').start();

      try {
        const config = await authenticateBrowser(
          options.xoxd,
          options.xoxc,
          options.workspaceUrl,
          options.workspaceName
        );

        spinner.succeed('Authentication successful!');
        success(`Authenticated as workspace: ${config.workspace_name}`);
        info(`Workspace ID: ${config.workspace_id}`);
        if (config.auth_type === 'browser') {
          info(`Workspace URL: ${config.workspace_url}`);
        }
      } catch (err: any) {
        spinner.fail('Authentication failed');
        error(err.message);
        process.exit(1);
      }
    });

  // List all workspaces
  const listCmd = auth
    .command('list')
    .description('List all authenticated workspaces')
    .action(async (options) => {
      const format = validateFormat(options.format);

      // For schema format, just output the schema and exit
      if (format === 'schema') {
        outputSchema(WorkspaceListOutputSchema);
        return;
      }

      try {
        const workspaces = await getAllWorkspaces();
        const defaultId = await getDefaultWorkspaceId();

        if (workspaces.length === 0 && format === 'pretty') {
          info('No authenticated workspaces found.');
          info('Run "slackcli auth login" or "slackcli auth login-browser" to authenticate.');
          return;
        }

        // Build output data
        const outputData: WorkspaceListOutput = {
          workspaces: workspaces.map(ws => ({
            workspace_id: ws.workspace_id,
            workspace_name: ws.workspace_name,
            auth_type: ws.auth_type,
            is_default: ws.workspace_id === defaultId,
          })),
        };

        output(outputData, WorkspaceListOutputSchema, format, (data) => {
          if (data.workspaces.length === 0) {
            return 'No authenticated workspaces found.\nRun "slackcli auth login" or "slackcli auth login-browser" to authenticate.';
          }

          let result = chalk.bold(`\n📋 Authenticated Workspaces (${data.workspaces.length}):\n`);

          data.workspaces.forEach((ws, idx) => {
            const isDefault = ws.is_default;
            const defaultBadge = isDefault ? chalk.green('(default)') : '';
            const authType = ws.auth_type === 'browser' ? '🌐 Browser' : '🔑 Standard';

            result += `\n${idx + 1}. ${chalk.bold(ws.workspace_name)} ${defaultBadge}
   ID: ${ws.workspace_id}
   Auth: ${authType}\n`;
          });

          return result;
        }, options.jq);
      } catch (err: any) {
        error('Failed to list workspaces', err.message);
        process.exit(1);
      }
    });
  addOutputOptions(listCmd);

  // Set default workspace
  auth
    .command('set-default')
    .description('Set default workspace')
    .argument('<workspace-id>', 'Workspace ID to set as default')
    .action(async (workspaceId) => {
      try {
        await setDefaultWorkspace(workspaceId);
        success(`Set ${workspaceId} as default workspace`);
      } catch (err: any) {
        error('Failed to set default workspace', err.message);
        process.exit(1);
      }
    });

  // Remove workspace
  auth
    .command('remove')
    .description('Remove a workspace')
    .argument('<workspace-id>', 'Workspace ID to remove')
    .action(async (workspaceId) => {
      try {
        await removeWorkspace(workspaceId);
        success(`Removed workspace ${workspaceId}`);
      } catch (err: any) {
        error('Failed to remove workspace', err.message);
        process.exit(1);
      }
    });

  // Logout (clear all workspaces)
  auth
    .command('logout')
    .description('Logout from all workspaces')
    .action(async () => {
      try {
        await clearAllWorkspaces();
        success('Logged out from all workspaces');
      } catch (err: any) {
        error('Failed to logout', err.message);
        process.exit(1);
      }
    });

  // Extract tokens guide
  auth
    .command('extract-tokens')
    .description('Show guide for extracting browser tokens')
    .action(() => {
      console.log(chalk.bold('\n🔍 How to Extract Browser Tokens:\n'));
      console.log('1. Open your Slack workspace in a web browser');
      console.log('2. Open Developer Tools (F12 or Cmd+Option+I)');
      console.log('3. Go to the Network tab');
      console.log('4. Refresh the page or send a message');
      console.log('5. Look for any Slack API request (e.g., conversations.list)');
      console.log('\n📝 Extract the tokens:');
      console.log('   - xoxd token: In the "Cookie" header, look for d=xoxd-...');
      console.log('   - xoxc token: In the request payload, look for "token":"xoxc-..."');
      console.log('\n✨ Use the tokens:');
      console.log('   slackcli auth login-browser \\');
      console.log('     --xoxd=xoxd-... \\');
      console.log('     --xoxc=xoxc-... \\');
      console.log('     --workspace-url=https://yourteam.slack.com\n');
      console.log('\n💡 Or use the easy way:');
      console.log('   Right-click on any Slack API request → Copy → Copy as cURL');
      console.log('   Then run: slackcli auth parse-curl --login');
      console.log('   (Interactive mode - just paste and press Enter twice)\n');
      console.log('   Or: slackcli auth parse-curl --from-clipboard --login');
      console.log('   (Reads directly from your clipboard)\n');
    });

  // Parse cURL command to extract tokens
  const parseCurlCmd = auth
    .command('parse-curl')
    .description('Extract xoxd and xoxc tokens from a cURL command')
    .argument('[curl-command]', 'cURL command (or use --from-clipboard / interactive mode)')
    .option('--login', 'Automatically login with extracted tokens')
    .option('--from-clipboard', 'Read cURL command from system clipboard')
    .action(async (curlCommand, options) => {
      const format = validateFormat(options.format);

      // For schema format, just output the schema and exit
      if (format === 'schema') {
        outputSchema(ParseCurlOutputSchema);
        return;
      }

      try {
        let curlInput = curlCommand;

        // Get input from various sources (in priority order)
        if (!curlInput && options.fromClipboard) {
          const spinner = createSpinner('Reading from clipboard...', format);

          const clipboardResult = await readClipboard();

          if (!clipboardResult.success) {
            failSpinner(spinner, 'Failed to read clipboard');
            error(clipboardResult.error || 'Unknown clipboard error');
            if (format === 'pretty') {
              console.log(chalk.yellow('\n💡 Tip: Try the interactive mode instead:'));
              console.log(chalk.cyan('   slackcli auth parse-curl --login\n'));
            }
            process.exit(1);
          }

          curlInput = clipboardResult.content || '';
          succeedSpinner(spinner, 'Read from clipboard');

          if (!looksLikeCurlCommand(curlInput)) {
            error('Clipboard content does not appear to be a cURL command');
            if (format === 'pretty') {
              console.log(chalk.yellow('\n💡 Tip: Make sure you copied the cURL command from browser DevTools'));
              console.log(chalk.yellow('   Right-click on request → Copy → Copy as cURL\n'));
            }
            process.exit(1);
          }
        } else if (!curlInput && hasPipedInput()) {
          const stdinChunks: Buffer[] = [];
          for await (const chunk of process.stdin) {
            stdinChunks.push(chunk);
          }
          if (stdinChunks.length > 0) {
            curlInput = Buffer.concat(stdinChunks).toString('utf-8');
          }
        } else if (!curlInput && isInteractiveTerminal()) {
          curlInput = await readInteractiveInput({
            prompt: 'Paste your cURL command (press Enter twice when done):',
            hint: 'Copy the cURL command from browser DevTools (Right-click → Copy → Copy as cURL)',
          });
        }

        if (!curlInput || curlInput.trim() === '') {
          error('No cURL command provided. Usage:');
          console.log('\n  Interactive mode (recommended):');
          console.log(chalk.cyan('    slackcli auth parse-curl --login'));
          console.log('\n  From clipboard:');
          console.log(chalk.cyan('    slackcli auth parse-curl --from-clipboard --login'));
          console.log('\n  Piped input:');
          console.log(chalk.cyan('    pbpaste | slackcli auth parse-curl --login'));
          process.exit(1);
        }

        if (format === 'pretty') {
          console.log(chalk.bold('\n🔍 Parsing cURL command...\n'));
        }

        // Parse the cURL command
        const parsed = parseCurlCommand(curlInput);

        // Build output data
        const outputData: ParseCurlOutput = {
          workspace_name: parsed.workspaceName,
          workspace_url: parsed.workspaceUrl,
          xoxd_token: parsed.xoxd,
          xoxc_token: parsed.xoxc,
        };

        // If --login flag is set, authenticate directly
        if (options.login) {
          const spinner = createSpinner('Authenticating with extracted tokens...', format);
          try {
            const config = await authenticateBrowser(parsed.xoxd, parsed.xoxc, parsed.workspaceUrl, parsed.workspaceName);
            succeedSpinner(spinner, 'Authentication successful!');

            if (format === 'pretty') {
              success(`Authenticated as workspace: ${config.workspace_name}`);
              info(`Workspace ID: ${config.workspace_id}`);
            } else {
              // For json format, output the parsed data
              output(outputData, ParseCurlOutputSchema, format, () => '', options.jq);
            }
          } catch (err: any) {
            failSpinner(spinner, 'Authentication failed');
            error(err.message);
            process.exit(1);
          }
        } else {
          // Output the parsed data
          output(outputData, ParseCurlOutputSchema, format, (data) => {
            let result = chalk.green('✅ Successfully extracted tokens!\n');
            result += chalk.bold('\nWorkspace:\n');
            result += `  Name: ${chalk.cyan(data.workspace_name)}\n`;
            result += `  URL:  ${chalk.cyan(data.workspace_url)}\n`;

            result += chalk.bold('\nTokens:\n');
            result += `  xoxd: ${chalk.green(data.xoxd_token.substring(0, 20))}...${chalk.gray(`(${data.xoxd_token.length} chars)`)}\n`;
            result += `  xoxc: ${chalk.green(data.xoxc_token.substring(0, 20))}...${chalk.gray(`(${data.xoxc_token.length} chars)`)}\n`;

            result += chalk.bold('\nTo login with these tokens, run:\n');
            result += chalk.cyan('\n  slackcli auth parse-curl --login\n');
            result += chalk.gray('\nOr manually:\n');
            result += `\n  slackcli auth login-browser \\`;
            result += `\n    --xoxd="${data.xoxd_token}" \\`;
            result += `\n    --xoxc="${data.xoxc_token}" \\`;
            result += `\n    --workspace-url="${data.workspace_url}"\n`;

            return result;
          }, options.jq);
        }
      } catch (err: any) {
        error('Failed to parse cURL command', err.message);
        if (format === 'pretty') {
          console.log(chalk.yellow('\n💡 Tip: Right-click on a Slack API request in browser DevTools'));
          console.log(chalk.yellow('   → Copy → Copy as cURL, then paste here\n'));
        }
        process.exit(1);
      }
    });
  addOutputOptions(parseCurlCmd);

  return auth;
}
