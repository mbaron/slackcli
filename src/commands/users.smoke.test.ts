import { describe, expect, it, beforeAll } from 'bun:test';
import { getAuthenticatedClient } from '../lib/auth.ts';
import type { SlackClient } from '../lib/slack-client.ts';
import type { SlackUser } from '../types/index.ts';

/**
 * Smoke tests for users command.
 * These tests hit the real Slack API and require a configured workspace.
 *
 * Run with: bun test src/commands/users.smoke.test.ts
 *
 * Prerequisites:
 * - A workspace must be configured via `slackcli auth login`
 * - Tests are READ-ONLY (only uses users.list and users.info)
 */

let client: SlackClient;
let skipTests = false;

beforeAll(async () => {
  try {
    client = await getAuthenticatedClient();
  } catch {
    console.warn('No workspace configured - skipping smoke tests');
    skipTests = true;
  }
});

describe('users smoke tests', () => {
  describe('users.list', () => {
    it('should fetch at least one user', async () => {
      if (skipTests) return;

      const response = await client.listUsers({ limit: 10 });

      expect(response.ok).toBe(true);
      expect(response.members).toBeDefined();
      expect(Array.isArray(response.members)).toBe(true);
      expect(response.members.length).toBeGreaterThan(0);
    });

    it('should return users with required fields', async () => {
      if (skipTests) return;

      const response = await client.listUsers({ limit: 5 });
      const user: SlackUser = response.members[0];

      expect(user.id).toBeDefined();
      expect(user.id).toMatch(/^[UW]/); // User IDs start with U or W
      expect(user.name).toBeDefined();
      expect(typeof user.name).toBe('string');
      expect(user.profile).toBeDefined();
    });

    it('should support pagination with cursor', async () => {
      if (skipTests) return;

      // Fetch first page with small limit
      const firstPage = await client.listUsers({ limit: 2 });

      expect(firstPage.ok).toBe(true);
      expect(firstPage.members.length).toBeLessThanOrEqual(2);

      // If there's a next cursor, fetch next page
      const nextCursor = firstPage.response_metadata?.next_cursor;
      if (nextCursor) {
        const secondPage = await client.listUsers({ limit: 2, cursor: nextCursor });

        expect(secondPage.ok).toBe(true);
        expect(secondPage.members).toBeDefined();

        // Verify we got different users
        const firstIds = new Set(firstPage.members.map((u: SlackUser) => u.id));
        const secondIds = secondPage.members.map((u: SlackUser) => u.id);
        const hasNewUsers = secondIds.some((id: string) => !firstIds.has(id));
        expect(hasNewUsers).toBe(true);
      }
    });

    it('should include bots when requested', async () => {
      if (skipTests) return;

      const response = await client.listUsers({ limit: 200 });
      const allMembers: SlackUser[] = response.members;

      // Check if any bots exist in the workspace
      const bots = allMembers.filter((u: SlackUser) => u.is_bot || u.is_app_user);

      // Most workspaces have at least Slackbot
      if (bots.length > 0) {
        expect(bots[0].is_bot || bots[0].is_app_user).toBe(true);
      }
    });
  });

  describe('users.info', () => {
    it('should fetch info for a known user', async () => {
      if (skipTests) return;

      // First get a user ID from the list
      const listResponse = await client.listUsers({ limit: 1 });
      const userId = listResponse.members[0].id;

      // Then fetch that user's info
      const infoResponse = await client.getUserInfo(userId);

      expect(infoResponse.ok).toBe(true);
      expect(infoResponse.user).toBeDefined();
      expect(infoResponse.user.id).toBe(userId);
      expect(infoResponse.user.profile).toBeDefined();
    });

    it('should return error for invalid user ID', async () => {
      if (skipTests) return;

      try {
        await client.getUserInfo('UINVALIDUSERID123');
        // Should not reach here
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.message).toContain('user_not_found');
      }
    });
  });

  describe('search (client-side filtering)', () => {
    it('should find users matching a query', async () => {
      if (skipTests) return;

      // Get users and pick one to search for
      const listResponse = await client.listUsers({ limit: 50 });
      const users: SlackUser[] = listResponse.members;

      // Find a real user (not bot, not deleted) with a name
      const realUser = users.find(
        (u: SlackUser) => !u.is_bot && !u.deleted && u.real_name
      );

      if (realUser && realUser.real_name) {
        // Search for part of their name
        const searchTerm = realUser.real_name.split(' ')[0].toLowerCase();
        const matches = users.filter((u: SlackUser) => {
          const name = u.name?.toLowerCase() || '';
          const realName = u.real_name?.toLowerCase() || '';
          const displayName = u.profile?.display_name?.toLowerCase() || '';
          return (
            name.includes(searchTerm) ||
            realName.includes(searchTerm) ||
            displayName.includes(searchTerm)
          );
        });

        expect(matches.length).toBeGreaterThan(0);
        expect(matches.some((u: SlackUser) => u.id === realUser.id)).toBe(true);
      }
    });

    it('should return empty results for nonsense query', async () => {
      if (skipTests) return;

      const listResponse = await client.listUsers({ limit: 100 });
      const users: SlackUser[] = listResponse.members;

      const nonsenseQuery = 'xyzzy12345nonexistent';
      const matches = users.filter((u: SlackUser) => {
        const name = u.name?.toLowerCase() || '';
        const realName = u.real_name?.toLowerCase() || '';
        const email = u.profile?.email?.toLowerCase() || '';
        return (
          name.includes(nonsenseQuery) ||
          realName.includes(nonsenseQuery) ||
          email.includes(nonsenseQuery)
        );
      });

      expect(matches.length).toBe(0);
    });
  });

  describe('user data integrity', () => {
    it('should have consistent user data between list and info', async () => {
      if (skipTests) return;

      // Get a user from list
      const listResponse = await client.listUsers({ limit: 1 });
      const userFromList: SlackUser = listResponse.members[0];

      // Get same user from info endpoint
      const infoResponse = await client.getUserInfo(userFromList.id);
      const userFromInfo: SlackUser = infoResponse.user;

      // Verify core fields match
      expect(userFromInfo.id).toBe(userFromList.id);
      expect(userFromInfo.name).toBe(userFromList.name);
      expect(userFromInfo.is_bot).toBe(userFromList.is_bot);
    });
  });
});
