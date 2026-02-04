import { describe, expect, it, beforeAll } from 'bun:test';
import { getAuthenticatedClient } from '../lib/auth.ts';
import type { SlackClient } from '../lib/slack-client.ts';

/**
 * Smoke tests for search command.
 * These tests hit the real Slack API and require a configured workspace.
 *
 * Run with: bun test src/commands/search.smoke.test.ts
 *
 * Prerequisites:
 * - A workspace must be configured via `slackcli auth login`
 * - Tests are READ-ONLY (only uses search.messages and conversations.history)
 *
 * Note: search.messages requires a user token with search:read scope.
 * Browser tokens (xoxc/xoxd) typically have this scope.
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

describe('search smoke tests', () => {
  describe('search.messages', () => {
    it('should search for messages', async () => {
      if (skipTests) return;

      // Search for a common word that's likely to exist (avoid stop words like 'a', 'the')
      const response = await client.searchMessages('test', {
        count: 5,
        sort: 'timestamp',
        sort_dir: 'desc',
      });

      expect(response.ok).toBe(true);
      expect(response.messages).toBeDefined();
      expect(response.messages.matches).toBeDefined();
      expect(Array.isArray(response.messages.matches)).toBe(true);
    });

    it('should return message matches with required fields', async () => {
      if (skipTests) return;

      const response = await client.searchMessages('test', {
        count: 5,
        sort: 'timestamp',
        sort_dir: 'desc',
      });

      if (response.messages?.matches?.length > 0) {
        const match = response.messages.matches[0];

        expect(match.ts).toBeDefined();
        expect(typeof match.ts).toBe('string');
        expect(match.text).toBeDefined();
        expect(match.channel).toBeDefined();
        expect(match.channel.id).toBeDefined();
      }
    });

    it('should support sorting by timestamp', async () => {
      if (skipTests) return;

      const response = await client.searchMessages('test', {
        count: 10,
        sort: 'timestamp',
        sort_dir: 'desc',
      });

      if (response.messages?.matches?.length >= 2) {
        const matches = response.messages.matches;
        // Verify descending order (newer first)
        const ts1 = parseFloat(matches[0].ts);
        const ts2 = parseFloat(matches[1].ts);
        expect(ts1).toBeGreaterThanOrEqual(ts2);
      }
    });

    it('should support sorting in ascending order', async () => {
      if (skipTests) return;

      const response = await client.searchMessages('test', {
        count: 10,
        sort: 'timestamp',
        sort_dir: 'asc',
      });

      if (response.messages?.matches?.length >= 2) {
        const matches = response.messages.matches;
        // Verify ascending order (older first)
        const ts1 = parseFloat(matches[0].ts);
        const ts2 = parseFloat(matches[1].ts);
        expect(ts1).toBeLessThanOrEqual(ts2);
      }
    });

    it('should support pagination', async () => {
      if (skipTests) return;

      // Get first page with a term that should have many results
      const page1 = await client.searchMessages('test', {
        count: 2,
        page: 1,
        sort: 'timestamp',
        sort_dir: 'desc',
      });

      expect(page1.ok).toBe(true);
      expect(page1.messages?.pagination).toBeDefined();

      // Verify pagination metadata exists
      expect(page1.messages.pagination.page).toBe(1);
      expect(page1.messages.pagination.per_page).toBe(2);

      // If there are more pages, fetch page 2 and verify different results
      if (page1.messages?.pagination?.page_count > 1) {
        const page2 = await client.searchMessages('test', {
          count: 2,
          page: 2,
          sort: 'timestamp',
          sort_dir: 'desc',
        });

        expect(page2.ok).toBe(true);
        expect(page2.messages.pagination.page).toBe(2);

        // Verify we got different messages on page 2
        if (page1.messages?.matches?.length > 0 && page2.messages?.matches?.length > 0) {
          const page1Ids = new Set(page1.messages.matches.map((m: any) => m.ts));
          const page2HasNew = page2.messages.matches.some((m: any) => !page1Ids.has(m.ts));
          expect(page2HasNew).toBe(true);
        }
      }
    });

    it('should return empty results for nonsense query', async () => {
      if (skipTests) return;

      const nonsenseQuery = 'xyzzy12345nonexistentmessage98765';
      const response = await client.searchMessages(nonsenseQuery, {
        count: 10,
      });

      expect(response.ok).toBe(true);
      expect(response.messages?.total).toBe(0);
      expect(response.messages?.matches?.length || 0).toBe(0);
    });

    it('should support search modifiers in query', async () => {
      if (skipTests) return;

      // First, get a channel to search in
      const conversations = await client.listConversations({
        types: 'public_channel',
        limit: 1,
        exclude_archived: true,
      });

      if (conversations.channels?.length > 0) {
        const channelName = conversations.channels[0].name;

        // Search in that specific channel
        const response = await client.searchMessages(`in:#${channelName}`, {
          count: 5,
          sort: 'timestamp',
          sort_dir: 'desc',
        });

        expect(response.ok).toBe(true);

        // If we found messages, verify they're from the expected channel
        if (response.messages?.matches?.length > 0) {
          const match = response.messages.matches[0];
          expect(match.channel.name).toBe(channelName);
        }
      }
    });
  });

  describe('search integration with channel history', () => {
    it('should find a message that exists in channel history', async () => {
      if (skipTests) return;

      // Get a channel
      const conversations = await client.listConversations({
        types: 'public_channel',
        limit: 5,
        exclude_archived: true,
      });

      // Find a channel we're a member of
      const memberChannel = conversations.channels?.find(
        (c: any) => c.is_member && c.name
      );

      if (!memberChannel) {
        console.warn('No member channels found - skipping integration test');
        return;
      }

      // Get recent messages from that channel
      const history = await client.getConversationHistory(memberChannel.id, {
        limit: 10,
      });

      if (!history.messages?.length) {
        console.warn('No messages in channel - skipping integration test');
        return;
      }

      // Find a message with some searchable text (at least 5 chars, no special chars)
      const searchableMessage = history.messages.find(
        (m: any) => m.text && m.text.length >= 5 && /^[a-zA-Z0-9\s]+$/.test(m.text.substring(0, 20))
      );

      if (!searchableMessage) {
        console.warn('No searchable messages found - skipping integration test');
        return;
      }

      // Extract a unique-ish search term from the message
      const words = searchableMessage.text.split(/\s+/).filter((w: string) => w.length >= 4);
      if (words.length === 0) {
        console.warn('No suitable search terms found - skipping integration test');
        return;
      }

      const searchTerm = words[0];

      // Search for that term in the specific channel
      const searchResponse = await client.searchMessages(
        `"${searchTerm}" in:#${memberChannel.name}`,
        {
          count: 20,
          sort: 'timestamp',
          sort_dir: 'desc',
        }
      );

      expect(searchResponse.ok).toBe(true);

      // We found messages containing our search term
      if (searchResponse.messages?.matches?.length > 0) {
        // Verify at least one match is from our channel
        const hasChannelMatch = searchResponse.messages.matches.some(
          (m: any) => m.channel.id === memberChannel.id || m.channel.name === memberChannel.name
        );
        expect(hasChannelMatch).toBe(true);
      }
    });
  });
});
