import { Command } from 'commander';
import { writeFile, access, mkdir, mkdtemp } from 'fs/promises';
import { join, resolve } from 'path';
import { tmpdir } from 'os';
import chalk from 'chalk';
import { getAuthenticatedClient } from '../lib/auth.ts';
import { error, formatFileSize, formatTimestamp } from '../lib/formatter.ts';
import type { SlackFile } from '../types/index.ts';
import {
  FileInfoOutputSchema,
  FileListOutputSchema,
  FileDownloadOutputSchema,
  type FileInfoOutput,
  type FileListOutput,
  type FileDownloadOutput,
} from '../schemas/index.ts';
import {
  type OutputFormat,
  output,
  outputSchema,
  createSpinner,
  updateSpinner,
  succeedSpinner,
  failSpinner,
  addFormatOption,
  validateFormat,
} from '../lib/output.ts';

function mapFileFields(f: any): SlackFile & { created?: number; user?: string } {
  return {
    id: f.id,
    name: f.name,
    title: f.title,
    mimetype: f.mimetype,
    filetype: f.filetype,
    size: f.size,
    url_private: f.url_private,
    url_private_download: f.url_private_download,
    permalink: f.permalink,
    mode: f.mode,
    created: f.created,
    user: f.user,
  };
}

export function createFilesCommand(): Command {
  const files = new Command('files')
    .description('Download and manage Slack files');

  // files info <file-id>
  const infoCmd = files
    .command('info')
    .description('Get information about a file')
    .argument('<file-id>', 'File ID (e.g., F01234567)')
    .option('--workspace <id|name>', 'Workspace to use')
    .action(async (fileId, options) => {
      const format = validateFormat(options.format);

      if (format === 'schema') {
        outputSchema(FileInfoOutputSchema);
        return;
      }

      const spinner = createSpinner('Fetching file info...', format);

      try {
        const client = await getAuthenticatedClient(options.workspace);
        const response = await client.getFileInfo(fileId);
        const f = response.file;

        succeedSpinner(spinner, 'File info retrieved');

        const outputData: FileInfoOutput = {
          file: mapFileFields(f),
        };

        output(outputData, FileInfoOutputSchema, format, (data) => {
          const file = data.file;
          const sizeStr = file.size ? formatFileSize(file.size) : 'unknown';
          const createdStr = file.created ? formatTimestamp(String(file.created)) : 'unknown';

          let result = chalk.bold('\n📄 File Info\n');
          result += `\n${chalk.bold('Name:')} ${file.name}`;
          if (file.title && file.title !== file.name) {
            result += `\n${chalk.bold('Title:')} ${file.title}`;
          }
          result += `\n${chalk.bold('ID:')} ${file.id}`;
          result += `\n${chalk.bold('Type:')} ${file.mimetype || file.filetype || 'unknown'}`;
          result += `\n${chalk.bold('Size:')} ${sizeStr}`;
          result += `\n${chalk.bold('Created:')} ${createdStr}`;
          if (file.user) {
            result += `\n${chalk.bold('Uploaded by:')} ${file.user}`;
          }
          if (file.permalink) {
            result += `\n${chalk.bold('Link:')} ${file.permalink}`;
          }
          result += '\n';

          return result;
        });
      } catch (err: any) {
        failSpinner(spinner, 'Failed to fetch file info');
        error(err.message);
        process.exit(1);
      }
    });
  addFormatOption(infoCmd);

  // files download <file-id...>
  const downloadCmd = files
    .command('download')
    .description('Download one or more files')
    .argument('<file-ids...>', 'File ID(s) to download')
    .option('--output-dir <path>', 'Directory to save files to (defaults to temp directory)')
    .option('--workspace <id|name>', 'Workspace to use')
    .action(async (fileIds: string[], options) => {
      const format = validateFormat(options.format);

      if (format === 'schema') {
        outputSchema(FileDownloadOutputSchema);
        return;
      }

      const spinner = createSpinner(`Downloading ${fileIds.length} file(s)...`, format);

      // Create temp directory if --output-dir not specified
      const outputDir = options.outputDir
        ? resolve(options.outputDir)
        : await mkdtemp(join(tmpdir(), 'slackcli-downloads-'));

      try {
        // Ensure output directory exists (if user-specified)
        if (options.outputDir) {
          await mkdir(outputDir, { recursive: true });
        }

        const client = await getAuthenticatedClient(options.workspace);

        const downloads: FileDownloadOutput['downloads'] = [];
        const errors: Array<{ file_id: string; error: string }> = [];

        for (const fileId of fileIds) {
          try {
            updateSpinner(spinner, `Fetching info for ${fileId}...`);
            const response = await client.getFileInfo(fileId);
            const f = response.file;

            const downloadUrl = f.url_private_download || f.url_private;
            if (!downloadUrl) {
              errors.push({ file_id: fileId, error: 'No download URL available' });
              continue;
            }

            if (f.mode === 'external') {
              errors.push({ file_id: fileId, error: 'External files cannot be downloaded directly' });
              continue;
            }

            updateSpinner(spinner, `Downloading ${f.name}...`);
            const { buffer } = await client.downloadFile(downloadUrl);

            // Handle filename collisions
            let outputPath = join(outputDir, f.name);
            let counter = 1;
            while (true) {
              try {
                await access(outputPath);
                // File exists, add counter
                const ext = f.name.includes('.') ? '.' + f.name.split('.').pop() : '';
                const base = ext ? f.name.slice(0, -ext.length) : f.name;
                outputPath = join(outputDir, `${base}-${counter}${ext}`);
                counter++;
              } catch {
                // File doesn't exist, use this path
                break;
              }
            }

            await writeFile(outputPath, new Uint8Array(buffer));

            downloads.push({
              file_id: fileId,
              name: f.name,
              path: outputPath,
              size: buffer.byteLength,
              mimetype: f.mimetype,
            });
          } catch (err: any) {
            errors.push({ file_id: fileId, error: err.message });
          }
        }

        if (downloads.length > 0) {
          succeedSpinner(spinner, `Downloaded ${downloads.length} file(s)`);
        } else {
          failSpinner(spinner, 'No files downloaded');
        }

        const outputData: FileDownloadOutput = {
          downloads,
          errors: errors.length > 0 ? errors : undefined,
        };

        output(outputData, FileDownloadOutputSchema, format, (data) => {
          let result = '';

          if (data.downloads.length > 0) {
            result += chalk.bold(`\n📥 Downloaded ${data.downloads.length} file(s):\n`);
            data.downloads.forEach((d, idx) => {
              result += `\n${idx + 1}. ${chalk.bold(d.name)} (${formatFileSize(d.size)})`;
              result += `\n   ${chalk.dim(d.path)}`;
            });
          }

          if (data.errors && data.errors.length > 0) {
            result += chalk.red(`\n\n❌ ${data.errors.length} error(s):\n`);
            data.errors.forEach(e => {
              result += `\n  ${e.file_id}: ${e.error}`;
            });
          }

          result += '\n';
          return result;
        });

        if (downloads.length === 0) {
          process.exit(1);
        }
      } catch (err: any) {
        failSpinner(spinner, 'Failed to download files');
        error(err.message);
        process.exit(1);
      }
    });
  addFormatOption(downloadCmd);

  // files list <channel-id>
  const listCmd = files
    .command('list')
    .description('List files shared in a channel')
    .argument('<channel-id>', 'Channel ID')
    .option('--limit <number>', 'Number of files to return', '20')
    .option('--types <types>', 'Filter by file type (e.g., images, pdfs, snippets)')
    .option('--page <number>', 'Page number', '1')
    .option('--workspace <id|name>', 'Workspace to use')
    .action(async (channelId, options) => {
      const format = validateFormat(options.format);

      if (format === 'schema') {
        outputSchema(FileListOutputSchema);
        return;
      }

      const spinner = createSpinner('Fetching files...', format);

      try {
        const client = await getAuthenticatedClient(options.workspace);

        const response = await client.listFiles({
          channel: channelId,
          types: options.types,
          count: parseInt(options.limit),
          page: parseInt(options.page),
        });

        const files = (response.files || []).map(mapFileFields);
        const paging = response.paging || {};

        succeedSpinner(spinner, `Found ${paging.total || files.length} file(s)`);

        const outputData: FileListOutput = {
          channel_id: channelId,
          files,
          total: paging.total || files.length,
          page: paging.page || parseInt(options.page),
          page_count: paging.pages || 1,
        };

        output(outputData, FileListOutputSchema, format, (data) => {
          if (data.files.length === 0) {
            return chalk.yellow('\nNo files found in this channel.\n');
          }

          let result = chalk.bold(`\n📁 Files in ${data.channel_id} (${data.total} total, page ${data.page}/${data.page_count}):\n`);

          data.files.forEach((f, idx) => {
            const sizeStr = f.size ? formatFileSize(f.size) : '';
            const typeStr = f.mimetype || f.filetype || '';
            const meta = [typeStr, sizeStr].filter(Boolean).join(', ');

            result += `\n${idx + 1}. ${chalk.bold(f.name)}${meta ? ` (${meta})` : ''}`;
            result += `\n   ID: ${f.id}`;
            if (f.permalink) {
              result += `\n   ${chalk.dim(f.permalink)}`;
            }
          });

          if (data.page < data.page_count) {
            result += chalk.gray(`\n\n📄 More files available. Use --page ${data.page + 1} to see next page.`);
          }

          result += '\n';
          return result;
        });
      } catch (err: any) {
        failSpinner(spinner, 'Failed to fetch files');
        error(err.message);
        process.exit(1);
      }
    });
  addFormatOption(listCmd);

  return files;
}
