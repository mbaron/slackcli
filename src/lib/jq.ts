import { spawnSync } from 'child_process';
import chalk from 'chalk';

/**
 * Check if jq is installed on the system
 */
export function isJqInstalled(): boolean {
  try {
    const result = spawnSync('jq', ['--version'], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

/**
 * Run jq filter on JSON data
 * @param data - The data to filter (will be JSON stringified)
 * @param jqExpr - The jq expression to apply
 * @returns The filtered output as a string
 * @throws Error if jq is not installed or the expression is invalid
 */
export function runJq(data: unknown, jqExpr: string): string {
  // Check if jq is installed
  if (!isJqInstalled()) {
    throw new Error(
      'jq is not installed. Please install jq to use the --jq option.\n' +
      'Installation instructions:\n' +
      '  macOS:   brew install jq\n' +
      '  Ubuntu:  sudo apt-get install jq\n' +
      '  Windows: choco install jq\n' +
      'Or visit: https://jqlang.github.io/jq/download/'
    );
  }

  // Run jq command
  const result = spawnSync('jq', [jqExpr], {
    input: JSON.stringify(data),
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    const errorMsg = result.stderr?.trim() || 'Unknown jq error';
    throw new Error(`jq error: ${errorMsg}`);
  }

  return result.stdout;
}

/**
 * Get help text about --jq option
 */
export function getJqHelpText(): string {
  return `
${chalk.bold('--jq Option:')}
  Filter and transform JSON output using jq syntax.
  Requires jq to be installed (https://jqlang.github.io/jq/)

  ${chalk.bold('Examples:')}
    # Get just the message texts
    slackcli search messages "error" --jq '.messages[].text'

    # Filter messages by username
    slackcli search messages "deploy" --jq '.messages[] | select(.username == "alice")'

    # Count total messages
    slackcli conversations list --jq '.channels | length'

    # Get channel names only
    slackcli conversations list --jq '.channels[].name'

    # Format custom output
    slackcli search messages "bug" --jq '.messages[] | "\\(.username): \\(.text)"'

  ${chalk.bold('Note:')} The --jq option only works with --format=json (default format).
`;
}
