import { Command } from 'commander';
import chalk from 'chalk';
import { getAuthenticatedClient } from '../lib/auth.ts';
import { error, warning } from '../lib/formatter.ts';
import {
  SearchMessagesOutputSchema,
  type SearchMessagesOutput,
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
import type { SlackClient } from '../lib/slack-client.ts';

type MessageMatch = {
  ts: string;
  text: string;
  username?: string;
  user?: string;
  channel: {
    id: string;
    name?: string;
  };
  permalink?: string;
  thread_ts?: string;
  reply_count?: number;
  is_thread_reply?: boolean;
};

function formatMessageMatch(match: any): MessageMatch {
  // Extract thread_ts from match or parse from permalink
  let threadTs = match.thread_ts || undefined;

  // If not in match, try extracting from permalink (Slack search API doesn't return thread_ts directly)
  if (!threadTs && match.permalink) {
    const threadTsMatch = match.permalink.match(/[?&]thread_ts=([0-9.]+)/);
    if (threadTsMatch) {
      threadTs = threadTsMatch[1];
    }
  }

  const isThreadReply = threadTs ? threadTs !== match.ts : false;

  return {
    ts: match.ts,
    text: match.text || '',
    username: match.username,
    user: match.user,
    channel: {
      id: match.channel?.id || '',
      name: match.channel?.name,
    },
    permalink: match.permalink,
    thread_ts: threadTs,
    reply_count: match.reply_count,
    is_thread_reply: isThreadReply,
  };
}

function formatTimestamp(ts: string): string {
  const date = new Date(parseFloat(ts) * 1000);
  return date.toLocaleString();
}

// Resolve @username in from: modifiers to user IDs
// e.g., "from:@bill" -> "from:<@U04TXH1JFEK>"
async function resolveUserModifiers(query: string, client: SlackClient): Promise<{ query: string; warnings: string[] }> {
  const warnings: string[] = [];
  const fromPattern = /from:@([^\s]+)/gi;
  const matches = query.matchAll(fromPattern);

  let resolvedQuery = query;

  for (const match of matches) {
    const username = match[1];
    try {
      // Search for the user
      const response = await client.listUsers({ limit: 1000 });
      const users = response.members || [];

      // Find user by name, display_name, or real_name (case-insensitive)
      const user = users.find((u: any) =>
        u.name?.toLowerCase() === username.toLowerCase() ||
        u.profile?.display_name?.toLowerCase() === username.toLowerCase() ||
        u.real_name?.toLowerCase() === username.toLowerCase()
      );

      if (user) {
        // Replace from:@username with from:<@USER_ID>
        resolvedQuery = resolvedQuery.replace(match[0], `from:<@${user.id}>`);
      } else {
        warnings.push(`User "@${username}" not found - search may not return expected results`);
      }
    } catch (err) {
      warnings.push(`Could not resolve user "@${username}"`);
    }
  }

  return { query: resolvedQuery, warnings };
}

const SEARCH_MODIFIERS_HELP = `
Query Modifiers (use in query string):
  from:@user          Messages from a specific user (requires @ prefix)
  in:#channel         Messages in a specific channel (requires # prefix)
  in:@user            Messages in DM with user (requires @ prefix)
  to:@me              Messages sent to you
  with:@user          Conversations with a specific user
  is:thread           Messages in threads
  is:saved            Saved messages
  is:starred          Starred messages
  has:link            Messages containing links
  has:star            Messages you've starred
  has:pin             Pinned messages
  has::emoji:         Messages with specific emoji reaction
  before:YYYY-MM-DD   Messages before date
  after:YYYY-MM-DD    Messages after date
  on:YYYY-MM-DD       Messages on specific date
  during:month        Messages during month (e.g., during:January)
  "exact phrase"      Search for exact phrase
  word*               Wildcard search (e.g., int* matches internal)
  -term               Exclude term from results
  term1 AND term2     Both terms must match
  term1 OR term2      Either term matches

Thread Filtering:
  (default)            Include messages in threads (uses is:thread modifier)
  --top-level-only     Exclude thread messages (only show top-level messages)

Note: By default, search includes thread messages using the is:thread modifier,
      which returns both thread parents and their replies. Use --top-level-only
      to exclude all thread-related messages and search only top-level messages.

Note: User modifiers (from:, in:@, to:) require the @ prefix followed by the
user's display name or handle (e.g., from:@john.doe). Use 'slackcli users search'
to find the correct name before searching.

Important: Keyword search is EXACT WORD matching. Slack won't find "deploy" if
the message contains "deployment" or "deployed". Typos or slight variations will
not match. Best strategy to find a specific message from a user:
  1. Search all messages from that user (with optional date range)
  2. Filter/grep the results locally for keywords
  Example: slackcli search messages "from:@alice after:2024-01-01" | jq ...

Examples:
  slackcli search messages "deployment failed"
  slackcli search messages "from:@alice in:#engineering"
  slackcli search messages "has:link after:2024-01-01"
  slackcli search messages "error -warning in:#production"
`;

export function createSearchCommand(): Command {
  const search = new Command('search')
    .description('Search messages in the workspace')
    .addHelpText('after', SEARCH_MODIFIERS_HELP);

  // Search messages
  const messagesCmd = search
    .command('messages')
    .description('Search for messages matching a query')
    .argument('<query>', 'Search query (supports Slack search modifiers)')
    .option('--from <user>', 'Filter by sender (shortcut for from: modifier)')
    .option('--channel <channel>', 'Filter by channel (shortcut for in: modifier)')
    .option('--sort <type>', 'Sort by: score or timestamp', 'timestamp')
    .option('--sort-dir <dir>', 'Sort direction: asc or desc', 'desc')
    .option('--count <number>', 'Number of results per page (max 100)', '20')
    .option('--page <number>', 'Page number of results', '1')
    .option('--highlight', 'Highlight matching terms in results', false)
    .option('--include-all-channels', 'Include public channels you are not a member of (browser auth only)', false)
    .option('--top-level-only', 'Exclude thread messages (only show top-level messages)', false)
    .option('--workspace <id|name>', 'Workspace to use')
    .addHelpText('after', SEARCH_MODIFIERS_HELP)
    .action(async (query, options) => {
      const format = validateFormat(options.format);

      if (format === 'schema') {
        outputSchema(SearchMessagesOutputSchema);
        return;
      }

      const spinner = createSpinner('Searching messages...', format);

      try {
        const client = await getAuthenticatedClient(options.workspace);

        // Build query with optional shortcuts
        let fullQuery = query;
        if (options.from) {
          const from = options.from.startsWith('@') ? options.from : `@${options.from}`;
          fullQuery += ` from:${from}`;
        }
        if (options.channel) {
          const channel = options.channel.startsWith('#') ? options.channel : `#${options.channel}`;
          fullQuery += ` in:${channel}`;
        }

        // Resolve @username in from: modifiers to user IDs
        if (fullQuery.includes('from:@')) {
          updateSpinner(spinner, 'Resolving user names...');
          const resolved = await resolveUserModifiers(fullQuery, client);
          fullQuery = resolved.query;
          resolved.warnings.forEach(w => warning(w));
        }

        let matches: any[];
        let pagination: any;
        let total: number;

        if (options.includeAllChannels) {
          // Use modules API for searching all public channels (browser auth only)
          updateSpinner(spinner, 'Searching all channels...');
          const response = await client.searchModulesMessages(fullQuery, {
            sort: options.sort as 'score' | 'timestamp',
            sort_dir: options.sortDir as 'asc' | 'desc',
            count: parseInt(options.count),
            page: parseInt(options.page),
            include_all_channels: true,
          });

          // Transform modules API response to match standard format
          matches = (response.items || []).flatMap((item: any) =>
            (item.messages || []).map((msg: any) => {
              // Extract thread_ts from msg or parse from permalink
              let threadTs = msg.thread_ts || undefined;
              if (!threadTs && msg.permalink) {
                const threadTsMatch = msg.permalink.match(/[?&]thread_ts=([0-9.]+)/);
                if (threadTsMatch) {
                  threadTs = threadTsMatch[1];
                }
              }

              return {
                ts: msg.ts,
                text: msg.text || '',
                username: msg.username,
                user: msg.user,
                channel: {
                  id: item.channel?.id || '',
                  name: item.channel?.name,
                },
                permalink: msg.permalink,
                thread_ts: threadTs,
                reply_count: msg.reply_count,
                is_thread_reply: threadTs ? threadTs !== msg.ts : false,
              };
            })
          );

          // Apply filter options
          if (options.topLevelOnly) {
            matches = matches.filter((m: any) => !m.is_thread_reply);
          } else if (options.inThreadOnly) {
            matches = matches.filter((m: any) => m.is_thread_reply);
          }

          pagination = {
            page: response.pagination?.page || parseInt(options.page),
            page_count: response.pagination?.page_count || 1,
          };
          total = response.pagination?.total_count || 0;
        } else {
          // Use standard search API with dual-search strategy
          // Add is:thread modifier to query unless user wants top-level only
          if (!options.topLevelOnly && !fullQuery.includes('is:thread')) {
            fullQuery = `${fullQuery} is:thread`;
          }

          const searchOptions = {
            sort: options.sort as 'score' | 'timestamp',
            sort_dir: options.sortDir as 'asc' | 'desc',
            count: parseInt(options.count),
            page: parseInt(options.page),
            highlight: options.highlight,
          };

          // Use standard search API
          const response = await client.searchMessages(fullQuery, searchOptions);

          matches = (response.messages?.matches || []).map(formatMessageMatch);
          pagination = response.messages?.pagination || {};
          total = response.messages?.total || 0;
        }

        succeedSpinner(spinner, `Found ${total} messages`);

        const outputData: SearchMessagesOutput = {
          query: fullQuery,
          messages: matches,
          total,
          page: pagination.page || parseInt(options.page),
          page_count: pagination.page_count || 1,
        };

        output(outputData, SearchMessagesOutputSchema, format, (data) => {
          if (data.total === 0) {
            return chalk.yellow(`\nNo messages found matching "${data.query}"\n`);
          }

          let result = chalk.bold(`\n🔍 Search results for "${data.query}"\n`);
          result += chalk.gray(`   Showing page ${data.page} of ${data.page_count} (${data.total} total matches)\n`);

          data.messages.forEach((msg, idx) => {
            const channelName = msg.channel.name ? `#${msg.channel.name}` : msg.channel.id;
            const sender = msg.username || msg.user || 'Unknown';
            const time = formatTimestamp(msg.ts);
            const text = msg.text.length > 200 ? msg.text.substring(0, 200) + '...' : msg.text;
            const threadTag = msg.is_thread_reply ? chalk.dim(' (thread reply)') : '';
            const replyInfo = msg.reply_count ? chalk.dim(` [${msg.reply_count} replies]`) : '';

            result += `\n${chalk.cyan(`${idx + 1}.`)} ${chalk.bold(sender)} in ${chalk.green(channelName)}${threadTag}${replyInfo}`;
            result += `\n   ${chalk.gray(time)}`;
            result += `\n   ${text}`;
            if (msg.permalink) {
              result += `\n   ${chalk.blue(msg.permalink)}`;
            }
            result += '\n';
          });

          if (data.page < data.page_count) {
            result += chalk.gray(`\n📄 More results available. Use --page ${data.page + 1} to see next page.\n`);
          }

          return result;
        });
      } catch (err: any) {
        failSpinner(spinner, 'Search failed');
        error(err.message);
        process.exit(1);
      }
    });
  addFormatOption(messagesCmd);

  return search;
}
