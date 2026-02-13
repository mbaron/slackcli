import { Command } from 'commander';
import { getAuthenticatedClient } from '../lib/auth.ts';
import { success, error } from '../lib/formatter.ts';
import { formatTimestampForJson } from '../lib/date-formatter.ts';
import {
  MessageSendOutputSchema,
  MessageReactOutputSchema,
  type MessageSendOutput,
  type MessageReactOutput,
} from '../schemas/index.ts';
import {
  type OutputFormat,
  output,
  outputSchema,
  createSpinner,
  updateSpinner,
  succeedSpinner,
  failSpinner,
  addOutputOptions,
  validateFormat,
} from '../lib/output.ts';

export function createMessagesCommand(): Command {
  const messages = new Command('messages')
    .description('Send and manage messages');

  // Send message
  const sendCmd = messages
    .command('send')
    .description('Send a message to a channel or user')
    .requiredOption('--recipient-id <id>', 'Channel ID or User ID')
    .requiredOption('--message <text>', 'Message text content')
    .option('--thread-ts <timestamp>', 'Send as reply to thread')
    .option('--workspace <id|name>', 'Workspace to use')
    .addHelpText('after', `
Configuration:
  To restrict message posting to specific channels/users, add an "allowed_targets"
  array to your workspace config at ~/.config/slackcli/workspaces.json:

  {
    "workspaces": {
      "T123456": {
        ...
        "allowed_targets": ["C123456", "U789012", "G345678"]
      }
    }
  }

  If allowed_targets is set, messages can only be sent to channels/users in that list.
  If allowed_targets is not set or empty, messages can be sent anywhere.`)
    .action(async (options) => {
      const format = validateFormat(options.format);

      // For schema format, just output the schema and exit
      if (format === 'schema') {
        outputSchema(MessageSendOutputSchema);
        return;
      }

      const spinner = createSpinner('Sending message...', format);

      try {
        const client = await getAuthenticatedClient(options.workspace);

        // Check if allowed_targets is configured and validate recipient
        if (client.config.allowed_targets && client.config.allowed_targets.length > 0) {
          const isAllowed = client.config.allowed_targets.includes(options.recipientId);
          if (!isAllowed) {
            failSpinner(spinner, 'Target not allowed');
            error(`Posting to ${options.recipientId} is not allowed by workspace configuration.`);
            error(`\nAllowed targets: ${client.config.allowed_targets.join(', ')}`);
            error(`\nTo modify allowed targets, edit ~/.config/slackcli/workspaces.json`);
            error(`See 'slackcli messages send --help' for configuration details.`);
            process.exit(1);
          }
        }

        // Check if recipient is a user ID (starts with U) and needs DM opened
        let channelId = options.recipientId;
        if (options.recipientId.startsWith('U')) {
          updateSpinner(spinner, 'Opening direct message...');
          const dmResponse = await client.openConversation(options.recipientId);
          channelId = dmResponse.channel.id;
        }

        updateSpinner(spinner, 'Sending message...');
        const response = await client.postMessage(channelId, options.message, {
          thread_ts: options.threadTs,
        });

        succeedSpinner(spinner, 'Message sent successfully!');

        // Build output data
        const outputData: MessageSendOutput = {
          ok: true,
          channel: channelId,
          ts: response.ts,
          ts_formatted: formatTimestampForJson(response.ts),
          message: response.message ? {
            text: response.message.text || options.message,
            ts: response.message.ts || response.ts,
          } : undefined,
        };

        output(outputData, MessageSendOutputSchema, format, (data) => {
          return `Message timestamp: ${data.ts}`;
        }, options.jq);
      } catch (err: any) {
        failSpinner(spinner, 'Failed to send message');
        error(err.message);
        process.exit(1);
      }
    });
  addOutputOptions(sendCmd);

  // Add reaction to message
  const reactCmd = messages
    .command('react')
    .description('Add a reaction to a message')
    .requiredOption('--channel-id <id>', 'Channel ID where the message is')
    .requiredOption('--timestamp <ts>', 'Message timestamp')
    .requiredOption('--emoji <name>', 'Emoji name (e.g., thumbsup, heart, fire)')
    .option('--workspace <id|name>', 'Workspace to use')
    .action(async (options) => {
      const format = validateFormat(options.format);

      // For schema format, just output the schema and exit
      if (format === 'schema') {
        outputSchema(MessageReactOutputSchema);
        return;
      }

      const spinner = createSpinner('Adding reaction...', format);

      try {
        const client = await getAuthenticatedClient(options.workspace);

        await client.addReaction(options.channelId, options.timestamp, options.emoji);

        succeedSpinner(spinner, 'Reaction added successfully!');

        // Build output data
        const outputData: MessageReactOutput = {
          ok: true,
          channel: options.channelId,
          timestamp: options.timestamp,
          timestamp_formatted: formatTimestampForJson(options.timestamp),
          emoji: options.emoji,
        };

        output(outputData, MessageReactOutputSchema, format, (data) => {
          return `Added :${data.emoji}: to message ${data.timestamp}`;
        }, options.jq);
      } catch (err: any) {
        failSpinner(spinner, 'Failed to add reaction');
        error(err.message);
        process.exit(1);
      }
    });
  addOutputOptions(reactCmd);

  return messages;
}
