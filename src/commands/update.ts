import { Command } from 'commander';
import { checkForUpdates, performUpdate, getCurrentVersion } from '../lib/updater.ts';
import { success, error, info } from '../lib/formatter.ts';
import {
  UpdateCheckOutputSchema,
  type UpdateCheckOutput,
} from '../schemas/index.ts';
import {
  type OutputFormat,
  output,
  outputSchema,
  addFormatOption,
  validateFormat,
} from '../lib/output.ts';

export function createUpdateCommand(): Command {
  const update = new Command('update')
    .description('Check for and install updates')
    .action(async () => {
      try {
        await performUpdate();
      } catch (err: any) {
        error('Update failed', err.message);
        process.exit(1);
      }
    });

  // Check for updates
  const checkCmd = update
    .command('check')
    .description('Check for available updates')
    .action(async (options) => {
      const format = validateFormat(options.format);

      // For schema format, just output the schema and exit
      if (format === 'schema') {
        outputSchema(UpdateCheckOutputSchema);
        return;
      }

      try {
        const result = await checkForUpdates(false);

        // Build output data
        const outputData: UpdateCheckOutput = {
          current_version: result.currentVersion,
          latest_version: result.latestVersion,
          update_available: result.updateAvailable,
        };

        output(outputData, UpdateCheckOutputSchema, format, (data) => {
          let result = `Current version: v${data.current_version}`;

          if (data.update_available && data.latest_version) {
            result += `\nLatest version: ${data.latest_version}`;
            result += '\nUpdate available! Run "slackcli update" to update.';
          } else {
            result += '\nYou are on the latest version!';
          }

          return result;
        });
      } catch (err: any) {
        error('Failed to check for updates', err.message);
        process.exit(1);
      }
    });
  addFormatOption(checkCmd);

  return update;
}
