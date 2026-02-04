import { Command } from 'commander';
import chalk from 'chalk';
import { getAuthenticatedClient } from '../lib/auth.ts';
import { error } from '../lib/formatter.ts';
import {
  SearchMessagesOutputSchema,
  type SearchMessagesOutput,
} from '../schemas/index.ts';
import {
  type OutputFormat,
  output,
  outputSchema,
  createSpinner,
  succeedSpinner,
  failSpinner,
  addFormatOption,
  validateFormat,
} from '../lib/output.ts';

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
};

function formatMessageMatch(match: any): MessageMatch {
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
  };
}

function formatTimestamp(ts: string): string {
  const date = new Date(parseFloat(ts) * 1000);
  return date.toLocaleString();
}

const SEARCH_MODIFIERS_HELP = `
Query Modifiers (use in query string):
  from:@user          Messages from a specific user (requires @ prefix)
  in:#channel         Messages in a specific channel (requires # prefix)
  in:@user            Messages in DM with user (requires @ prefix)
  to:@me              Messages sent to you
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

Note: User modifiers (from:, in:@, to:) require the @ prefix followed by the
user's display name or handle (e.g., from:@john.doe). Use 'slackcli users search'
to find the correct name before searching.

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

        const response = await client.searchMessages(fullQuery, {
          sort: options.sort as 'score' | 'timestamp',
          sort_dir: options.sortDir as 'asc' | 'desc',
          count: parseInt(options.count),
          page: parseInt(options.page),
          highlight: options.highlight,
        });

        const matches = response.messages?.matches || [];
        const pagination = response.messages?.pagination || {};
        const total = response.messages?.total || 0;

        succeedSpinner(spinner, `Found ${total} messages`);

        const outputData: SearchMessagesOutput = {
          query: fullQuery,
          messages: matches.map(formatMessageMatch),
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

            result += `\n${chalk.cyan(`${idx + 1}.`)} ${chalk.bold(sender)} in ${chalk.green(channelName)}`;
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
