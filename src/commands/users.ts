import { Command } from 'commander';
import chalk from 'chalk';
import { getAuthenticatedClient } from '../lib/auth.ts';
import { error } from '../lib/formatter.ts';
import type { SlackUser } from '../types/index.ts';
import {
  UserListOutputSchema,
  UserSearchOutputSchema,
  UserInfoOutputSchema,
  type UserListOutput,
  type UserSearchOutput,
  type UserInfoOutput,
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

type UserOutput = {
  id: string;
  name?: string;
  real_name?: string;
  display_name?: string;
  email?: string;
  title?: string;
  is_bot?: boolean;
  is_admin?: boolean;
  deleted?: boolean;
  tz?: string;
};

function formatUserForOutput(user: SlackUser): UserOutput {
  const result: UserOutput = { id: user.id };

  if (user.name) result.name = user.name;
  const realName = user.real_name || user.profile?.real_name;
  if (realName) result.real_name = realName;
  if (user.profile?.display_name) result.display_name = user.profile.display_name;
  if (user.profile?.email) result.email = user.profile.email;
  if (user.profile?.title) result.title = user.profile.title;
  if (user.is_bot) result.is_bot = true;
  if (user.is_admin) result.is_admin = true;
  if (user.deleted) result.deleted = true;
  if (user.tz) result.tz = user.tz;

  return result;
}

function formatUserPretty(user: SlackUser): string {
  const handle = user.name ? `@${user.name}` : '';
  const displayName = user.profile?.display_name || user.real_name || user.name || 'Unknown';
  const email = user.profile?.email ? ` (${user.profile.email})` : '';
  const title = user.profile?.title ? ` - ${user.profile.title}` : '';
  const badges: string[] = [];

  if (user.is_admin) badges.push(chalk.yellow('admin'));
  if (user.is_bot) badges.push(chalk.blue('bot'));
  if (user.deleted) badges.push(chalk.red('deactivated'));

  const badgeStr = badges.length > 0 ? ` [${badges.join(', ')}]` : '';

  return `${chalk.bold(displayName)} ${chalk.cyan(handle)}${email}${title}${badgeStr}
   ID: ${user.id}`;
}

export function createUsersCommand(): Command {
  const users = new Command('users')
    .description('List and search workspace users');

  // List users
  const listCmd = users
    .command('list')
    .description('List all users in the workspace')
    .option('--limit <number>', 'Maximum number of users to return per page', '200')
    .option('--all', 'Fetch all users (paginate through all results)', false)
    .option('--include-bots', 'Include bot users', false)
    .option('--include-deleted', 'Include deactivated users', false)
    .option('--cursor <cursor>', 'Pagination cursor for next page')
    .option('--workspace <id|name>', 'Workspace to use')
    .action(async (options) => {
      const format = validateFormat(options.format);

      if (format === 'schema') {
        outputSchema(UserListOutputSchema);
        return;
      }

      const spinner = createSpinner('Fetching users...', format);

      try {
        const client = await getAuthenticatedClient(options.workspace);

        let members: SlackUser[] = [];
        let nextCursor: string | undefined = options.cursor;
        let hasMore = false;

        if (options.all) {
          // Paginate through all users
          do {
            updateSpinner(spinner, `Fetching users${nextCursor ? ' (loading more...)' : ''}...`);
            const response = await client.listUsers({
              limit: parseInt(options.limit),
              cursor: nextCursor,
            });

            const pageMembers: SlackUser[] = response.members || [];
            members = members.concat(pageMembers);

            nextCursor = response.response_metadata?.next_cursor;
          } while (nextCursor);

          hasMore = false;
        } else {
          // Single page fetch
          const response = await client.listUsers({
            limit: parseInt(options.limit),
            cursor: options.cursor,
          });

          members = response.members || [];
          nextCursor = response.response_metadata?.next_cursor;
          hasMore = !!nextCursor;
        }

        // Filter out bots unless requested
        if (!options.includeBots) {
          members = members.filter((u: SlackUser) => !u.is_bot && !u.is_app_user);
        }

        // Filter out deleted unless requested
        if (!options.includeDeleted) {
          members = members.filter((u: SlackUser) => !u.deleted);
        }

        succeedSpinner(spinner, `Found ${members.length} users`);

        const outputData: UserListOutput = {
          users: members.map(formatUserForOutput),
          total_count: members.length,
          has_more: hasMore,
          next_cursor: nextCursor || undefined,
        };

        output(outputData, UserListOutputSchema, format, (data) => {
          let result = chalk.bold(`\n👥 Users (${data.total_count}):\n`);

          data.users.forEach((u, idx) => {
            const handle = u.name ? `@${u.name}` : '';
            const displayName = u.display_name || u.real_name || u.name || 'Unknown';
            const email = u.email ? ` (${u.email})` : '';
            const badges: string[] = [];

            if (u.is_admin) badges.push(chalk.yellow('admin'));
            if (u.is_bot) badges.push(chalk.blue('bot'));
            if (u.deleted) badges.push(chalk.red('deactivated'));

            const badgeStr = badges.length > 0 ? ` [${badges.join(', ')}]` : '';

            result += `\n${idx + 1}. ${chalk.bold(displayName)} ${chalk.cyan(handle)}${email}${badgeStr}
   ID: ${u.id}\n`;
          });

          if (data.has_more && data.next_cursor) {
            result += chalk.gray(`\n📄 More results available. Use --cursor "${data.next_cursor}" to fetch next page.\n`);
          }

          return result;
        });
      } catch (err: any) {
        failSpinner(spinner, 'Failed to fetch users');
        error(err.message);
        process.exit(1);
      }
    });
  addFormatOption(listCmd);

  // Search users
  const searchCmd = users
    .command('search')
    .description('Search users by name, handle, or email')
    .argument('<query>', 'Search query (matches name, handle, or email)')
    .option('--include-bots', 'Include bot users', false)
    .option('--include-deleted', 'Include deactivated users', false)
    .option('--workspace <id|name>', 'Workspace to use')
    .action(async (query, options) => {
      const format = validateFormat(options.format);

      if (format === 'schema') {
        outputSchema(UserSearchOutputSchema);
        return;
      }

      const spinner = createSpinner('Searching users...', format);

      try {
        const client = await getAuthenticatedClient(options.workspace);

        // Fetch all users (paginated) and filter locally
        // Slack doesn't have a native user search endpoint
        let allMembers: SlackUser[] = [];
        let cursor: string | undefined;

        do {
          updateSpinner(spinner, `Fetching users${cursor ? ' (loading more...)' : ''}...`);
          const response = await client.listUsers({
            limit: 200,
            cursor,
          });

          const members: SlackUser[] = response.members || [];
          allMembers = allMembers.concat(members);

          cursor = response.response_metadata?.next_cursor;
        } while (cursor);

        // Filter by search query
        const queryLower = query.toLowerCase();
        let matches = allMembers.filter((u: SlackUser) => {
          const name = u.name?.toLowerCase() || '';
          const realName = u.real_name?.toLowerCase() || '';
          const displayName = u.profile?.display_name?.toLowerCase() || '';
          const email = u.profile?.email?.toLowerCase() || '';

          return name.includes(queryLower) ||
                 realName.includes(queryLower) ||
                 displayName.includes(queryLower) ||
                 email.includes(queryLower);
        });

        // Filter out bots unless requested
        if (!options.includeBots) {
          matches = matches.filter((u: SlackUser) => !u.is_bot && !u.is_app_user);
        }

        // Filter out deleted unless requested
        if (!options.includeDeleted) {
          matches = matches.filter((u: SlackUser) => !u.deleted);
        }

        succeedSpinner(spinner, `Found ${matches.length} matching users`);

        const outputData: UserSearchOutput = {
          query,
          users: matches.map(formatUserForOutput),
          match_count: matches.length,
        };

        output(outputData, UserSearchOutputSchema, format, (data) => {
          if (data.match_count === 0) {
            return chalk.yellow(`\nNo users found matching "${data.query}"\n`);
          }

          let result = chalk.bold(`\n🔍 Search results for "${data.query}" (${data.match_count} matches):\n`);

          data.users.forEach((u, idx) => {
            const handle = u.name ? `@${u.name}` : '';
            const displayName = u.display_name || u.real_name || u.name || 'Unknown';
            const email = u.email ? ` (${u.email})` : '';
            const badges: string[] = [];

            if (u.is_admin) badges.push(chalk.yellow('admin'));
            if (u.is_bot) badges.push(chalk.blue('bot'));
            if (u.deleted) badges.push(chalk.red('deactivated'));

            const badgeStr = badges.length > 0 ? ` [${badges.join(', ')}]` : '';

            result += `\n${idx + 1}. ${chalk.bold(displayName)} ${chalk.cyan(handle)}${email}${badgeStr}
   ID: ${u.id}\n`;
          });

          return result;
        });
      } catch (err: any) {
        failSpinner(spinner, 'Failed to search users');
        error(err.message);
        process.exit(1);
      }
    });
  addFormatOption(searchCmd);

  // Get user info
  const infoCmd = users
    .command('info')
    .description('Get detailed information about a user')
    .argument('<user-id>', 'User ID (e.g., U01234567)')
    .option('--workspace <id|name>', 'Workspace to use')
    .action(async (userId, options) => {
      const format = validateFormat(options.format);

      if (format === 'schema') {
        outputSchema(UserInfoOutputSchema);
        return;
      }

      const spinner = createSpinner('Fetching user info...', format);

      try {
        const client = await getAuthenticatedClient(options.workspace);

        const response = await client.getUserInfo(userId);
        const user: SlackUser = response.user;

        succeedSpinner(spinner, 'User found');

        const outputData: UserInfoOutput = {
          user: formatUserForOutput(user),
        };

        output(outputData, UserInfoOutputSchema, format, (data) => {
          const u = data.user;
          const handle = u.name ? `@${u.name}` : '';
          const displayName = u.display_name || u.real_name || u.name || 'Unknown';

          let result = chalk.bold(`\n👤 User Profile\n`);
          result += `\n${chalk.bold('Name:')} ${displayName} ${chalk.cyan(handle)}`;
          result += `\n${chalk.bold('ID:')} ${u.id}`;

          if (u.email) result += `\n${chalk.bold('Email:')} ${u.email}`;
          if (u.title) result += `\n${chalk.bold('Title:')} ${u.title}`;
          if (u.tz) result += `\n${chalk.bold('Timezone:')} ${u.tz}`;

          const roles: string[] = [];
          if (u.is_admin) roles.push('Admin');
          if (u.is_bot) roles.push('Bot');
          if (u.deleted) roles.push('Deactivated');

          if (roles.length > 0) {
            result += `\n${chalk.bold('Status:')} ${roles.join(', ')}`;
          }

          return result + '\n';
        });
      } catch (err: any) {
        failSpinner(spinner, 'Failed to fetch user');
        error(err.message);
        process.exit(1);
      }
    });
  addFormatOption(infoCmd);

  return users;
}
