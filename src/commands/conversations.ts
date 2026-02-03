import { Command } from 'commander';
import { getAuthenticatedClient } from '../lib/auth.ts';
import { error, formatChannelList, formatConversationHistory } from '../lib/formatter.ts';
import type { SlackChannel, SlackMessage, SlackUser } from '../types/index.ts';
import {
  ConversationListOutputSchema,
  ConversationReadOutputSchema,
  type ConversationListOutput,
  type ConversationReadOutput,
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

function getChannelType(channel: SlackChannel): 'public_channel' | 'private_channel' | 'im' | 'mpim' {
  if (channel.is_im) return 'im';
  if (channel.is_mpim) return 'mpim';
  if (channel.is_private) return 'private_channel';
  return 'public_channel';
}

export function createConversationsCommand(): Command {
  const conversations = new Command('conversations')
    .description('Manage Slack conversations (channels, DMs, groups)');

  // List conversations
  const listCmd = conversations
    .command('list')
    .description('List all conversations')
    .option('--types <types>', 'Conversation types (comma-separated: public_channel,private_channel,mpim,im)', 'public_channel,private_channel,mpim,im')
    .option('--limit <number>', 'Number of conversations to return', '100')
    .option('--exclude-archived', 'Exclude archived conversations', false)
    .option('--workspace <id|name>', 'Workspace to use (overrides default)')
    .action(async (options) => {
      const format = validateFormat(options.format);

      // For schema format, just output the schema and exit
      if (format === 'schema') {
        outputSchema(ConversationListOutputSchema);
        return;
      }

      const spinner = createSpinner('Fetching conversations...', format);

      try {
        const client = await getAuthenticatedClient(options.workspace);

        const response = await client.listConversations({
          types: options.types,
          limit: parseInt(options.limit),
          exclude_archived: options.excludeArchived,
        });

        const channels: SlackChannel[] = response.channels || [];

        // Fetch user info for DMs
        const userIds = new Set<string>();
        channels.forEach(ch => {
          if (ch.is_im && ch.user) {
            userIds.add(ch.user);
          }
        });

        const users = new Map<string, SlackUser>();
        if (userIds.size > 0) {
          updateSpinner(spinner, 'Fetching user information...');
          const usersResponse = await client.getUsersInfo(Array.from(userIds));
          usersResponse.users?.forEach((user: SlackUser) => {
            users.set(user.id, user);
          });
        }

        succeedSpinner(spinner, `Found ${channels.length} conversations`);

        // Build output data
        const outputData: ConversationListOutput = {
          channels: channels.map(ch => ({
            id: ch.id,
            name: ch.name || null,
            type: getChannelType(ch),
            is_archived: ch.is_archived,
            topic: ch.topic?.value,
            user_id: ch.user,
          })),
          users: userIds.size > 0 ? Object.fromEntries(
            Array.from(users.entries()).map(([id, u]) => [id, {
              id: u.id,
              name: u.name,
              real_name: u.real_name,
              email: u.profile?.email,
            }])
          ) : undefined,
        };

        output(outputData, ConversationListOutputSchema, format, (data) => {
          // Convert back to the format expected by formatChannelList
          const channelList: SlackChannel[] = data.channels.map(ch => ({
            id: ch.id,
            name: ch.name || undefined,
            is_im: ch.type === 'im',
            is_mpim: ch.type === 'mpim',
            is_private: ch.type === 'private_channel',
            is_archived: ch.is_archived,
            topic: ch.topic ? { value: ch.topic } : undefined,
            user: ch.user_id,
          }));
          return '\n' + formatChannelList(channelList, users);
        });
      } catch (err: any) {
        failSpinner(spinner, 'Failed to fetch conversations');
        error(err.message, 'Run "slackcli auth list" to check your authentication.');
        process.exit(1);
      }
    });
  addFormatOption(listCmd);

  // Read conversation history
  const readCmd = conversations
    .command('read')
    .description('Read conversation history or specific thread')
    .argument('<channel-id>', 'Channel ID to read from')
    .option('--thread-ts <timestamp>', 'Thread timestamp to read specific thread')
    .option('--exclude-replies', 'Exclude threaded replies (only top-level messages)', false)
    .option('--limit <number>', 'Number of messages to return', '100')
    .option('--oldest <timestamp>', 'Start of time range')
    .option('--latest <timestamp>', 'End of time range')
    .option('--workspace <id|name>', 'Workspace to use')
    .action(async (channelId, options) => {
      const format = validateFormat(options.format);

      // For schema format, just output the schema and exit
      if (format === 'schema') {
        outputSchema(ConversationReadOutputSchema);
        return;
      }

      const spinner = createSpinner('Fetching messages...', format);

      try {
        const client = await getAuthenticatedClient(options.workspace);

        let response: any;
        let messages: SlackMessage[];

        if (options.threadTs) {
          // Fetch thread replies
          updateSpinner(spinner, 'Fetching thread replies...');
          response = await client.getConversationReplies(channelId, options.threadTs, {
            limit: parseInt(options.limit),
            oldest: options.oldest,
            latest: options.latest,
          });
          messages = response.messages || [];
        } else {
          // Fetch conversation history
          updateSpinner(spinner, 'Fetching conversation history...');
          response = await client.getConversationHistory(channelId, {
            limit: parseInt(options.limit),
            oldest: options.oldest,
            latest: options.latest,
          });
          messages = response.messages || [];

          // Filter out replies if requested
          if (options.excludeReplies) {
            messages = messages.filter(msg => !msg.thread_ts || msg.thread_ts === msg.ts);
          }
        }

        // Reverse to show oldest first
        messages.reverse();

        // Fetch user info for messages
        const userIds = new Set<string>();
        messages.forEach(msg => {
          if (msg.user) {
            userIds.add(msg.user);
          }
        });

        const users = new Map<string, SlackUser>();
        if (userIds.size > 0) {
          updateSpinner(spinner, 'Fetching user information...');
          const usersResponse = await client.getUsersInfo(Array.from(userIds));
          usersResponse.users?.forEach((user: SlackUser) => {
            users.set(user.id, user);
          });
        }

        succeedSpinner(spinner, `Found ${messages.length} messages`);

        // Build output data
        const outputData: ConversationReadOutput = {
          channel_id: channelId,
          message_count: messages.length,
          messages: messages.map(msg => ({
            ts: msg.ts,
            thread_ts: msg.thread_ts,
            user: msg.user,
            text: msg.text,
            type: msg.type,
            reply_count: msg.reply_count,
            reactions: msg.reactions?.map(r => ({ name: r.name, count: r.count })),
            bot_id: msg.bot_id,
          })),
          users: userIds.size > 0 ? Object.fromEntries(
            Array.from(users.entries()).map(([id, u]) => [id, {
              id: u.id,
              name: u.name,
              real_name: u.real_name,
              email: u.profile?.email,
            }])
          ) : undefined,
        };

        output(outputData, ConversationReadOutputSchema, format, (data) => {
          // For pretty output, use existing formatter
          return '\n' + formatConversationHistory(channelId, messages, users);
        });
      } catch (err: any) {
        failSpinner(spinner, 'Failed to fetch messages');
        error(err.message);
        process.exit(1);
      }
    });
  addFormatOption(readCmd);

  return conversations;
}
