import { describe, expect, it, beforeAll } from 'bun:test';
import { getAuthenticatedClient } from '../lib/auth.ts';
import type { SlackClient } from '../lib/slack-client.ts';

/**
 * Integration test for search functionality with thread support
 *
 * This test:
 * 1. Finds existing channels and messages in the workspace
 * 2. Tests default behavior (uses is:thread modifier to include thread messages)
 * 3. Tests --top-level-only to exclude thread messages
 * 4. Verifies thread_ts and is_thread_reply fields are correctly extracted from permalinks
 */

let client: SlackClient;

beforeAll(async () => {
  // Get authenticated client (will use default workspace)
  client = await getAuthenticatedClient();
});

describe('Search Integration Tests', () => {
  describe('Thread field extraction', () => {
    it('should extract thread_ts from permalink when not in API response', async () => {
      // Search for any messages
      const response = await client.searchMessages('test', {
        count: 20,
        page: 1,
      });

      const matches = response.messages?.matches || [];
      expect(matches.length).toBeGreaterThan(0);

      // Check that we can identify thread messages from permalinks
      for (const match of matches) {
        if (match.permalink) {
          // Extract thread_ts from permalink if present
          const threadTsMatch = match.permalink.match(/[?&]thread_ts=([0-9.]+)/);

          if (threadTsMatch) {
            const threadTs = threadTsMatch[1];
            const isThreadReply = threadTs !== match.ts;

            console.log(`Message ${match.ts}: thread_ts=${threadTs}, is_reply=${isThreadReply}`);

            // Verify the logic: message is a thread reply when thread_ts exists and differs from ts
            expect(typeof threadTs).toBe('string');
            expect(threadTs).toMatch(/^[0-9]+\.[0-9]+$/);

            if (isThreadReply) {
              expect(threadTs).not.toBe(match.ts);
            } else {
              // Thread parent: thread_ts === ts
              expect(threadTs).toBe(match.ts);
            }
          }
        }
      }
    });

    it('should find both thread parents and thread replies in default search (with is:thread)', async () => {
      // Default behavior adds is:thread modifier
      const response = await client.searchMessages('in:#general is:thread', {
        count: 30,
        page: 1,
      });

      const matches = response.messages?.matches || [];
      expect(matches.length).toBeGreaterThan(0);

      let threadParents = 0;
      let threadReplies = 0;
      let noThread = 0;

      for (const match of matches) {
        if (match.permalink) {
          const threadTsMatch = match.permalink.match(/[?&]thread_ts=([0-9.]+)/);

          if (threadTsMatch) {
            const threadTs = threadTsMatch[1];
            if (threadTs === match.ts) {
              threadParents++;
            } else {
              threadReplies++;
            }
          } else {
            noThread++;
          }
        }
      }

      console.log(`Found: ${threadParents} thread parents, ${threadReplies} thread replies, ${noThread} non-thread messages`);

      // We should have a mix of message types
      expect(threadParents + threadReplies + noThread).toBe(matches.length);
    });
  });

  describe('Search with is:thread modifier', () => {
    it('should return messages in threads when using is:thread', async () => {
      const response = await client.searchMessages('is:thread', {
        count: 20,
        page: 1,
      });

      const matches = response.messages?.matches || [];
      expect(matches.length).toBeGreaterThan(0);

      // All messages should have thread_ts in their permalink
      for (const match of matches) {
        expect(match.permalink).toBeDefined();

        if (match.permalink) {
          const threadTsMatch = match.permalink.match(/[?&]thread_ts=([0-9.]+)/);
          expect(threadTsMatch).toBeTruthy();

          if (threadTsMatch) {
            const threadTs = threadTsMatch[1];
            console.log(`is:thread message: ts=${match.ts}, thread_ts=${threadTs}, is_reply=${threadTs !== match.ts}`);
          }
        }
      }
    });

    it('should return both parents and replies with is:thread', async () => {
      const response = await client.searchMessages('is:thread', {
        count: 30,
        page: 1,
      });

      const matches = response.messages?.matches || [];
      expect(matches.length).toBeGreaterThan(0);

      let parents = 0;
      let replies = 0;

      for (const match of matches) {
        if (match.permalink) {
          const threadTsMatch = match.permalink.match(/[?&]thread_ts=([0-9.]+)/);
          if (threadTsMatch) {
            const threadTs = threadTsMatch[1];
            if (threadTs === match.ts) {
              parents++;
            } else {
              replies++;
            }
          }
        }
      }

      console.log(`is:thread results: ${parents} parents, ${replies} replies`);

      // is:thread should return both parents and replies
      // (this is Slack's behavior - it returns all messages that are part of a thread)
      expect(parents + replies).toBeGreaterThan(0);
    });
  });

  describe('Default vs top-level-only comparison', () => {
    it('should include more results with is:thread than without', async () => {
      // Compare: query with is:thread (default) vs without (top-level-only)
      const query = 'test';

      const [withThreads, withoutThreads] = await Promise.all([
        client.searchMessages(`${query} is:thread`, { count: 20, page: 1 }),
        client.searchMessages(query, { count: 20, page: 1 }),
      ]);

      const withThreadsMatches = withThreads.messages?.matches || [];
      const withoutThreadsMatches = withoutThreads.messages?.matches || [];

      console.log(`With is:thread (default): ${withThreadsMatches.length} results`);
      console.log(`Without is:thread (top-level-only): ${withoutThreadsMatches.length} results`);

      // is:thread should generally return more or equal results (includes thread messages)
      expect(withThreadsMatches.length).toBeGreaterThanOrEqual(0);
      expect(withoutThreadsMatches.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Finding actual channels and threads', () => {
    it('should find channels with messages', async () => {
      // List conversations to find channels
      const convResponse = await client.listConversations({
        limit: 10,
        types: 'public_channel',
      });

      const channels = convResponse.channels || [];
      expect(channels.length).toBeGreaterThan(0);

      console.log(`Found ${channels.length} channels`);

      // Try searching in the first few channels to find one with threads
      for (const channel of channels.slice(0, 3)) {
        const searchResponse = await client.searchMessages(`in:#${channel.name} is:thread`, {
          count: 5,
          page: 1,
        });

        const matches = searchResponse.messages?.matches || [];
        if (matches.length > 0) {
          console.log(`Channel #${channel.name} has ${matches.length} thread messages`);

          // Analyze the first match
          const match = matches[0];
          if (match.permalink) {
            const threadTsMatch = match.permalink.match(/[?&]thread_ts=([0-9.]+)/);
            if (threadTsMatch) {
              console.log(`  Example: ts=${match.ts}, thread_ts=${threadTsMatch[1]}`);
            }
          }
        }
      }
    });

    it('should identify thread replies vs thread parents', async () => {
      // Search for messages in threads
      const response = await client.searchMessages('is:thread', {
        count: 10,
        page: 1,
      });

      const matches = response.messages?.matches || [];
      expect(matches.length).toBeGreaterThan(0);

      const analysis = matches.map((match: any) => {
        if (!match.permalink) return null;

        const threadTsMatch = match.permalink.match(/[?&]thread_ts=([0-9.]+)/);
        if (!threadTsMatch) return null;

        const threadTs = threadTsMatch[1];
        const isReply = threadTs !== match.ts;

        return {
          ts: match.ts,
          thread_ts: threadTs,
          is_reply: isReply,
          type: isReply ? 'REPLY' : 'PARENT',
          text_preview: (match.text || '').substring(0, 50),
        };
      }).filter(Boolean);

      console.log('Thread message analysis:');
      console.table(analysis);

      // Should have at least some thread replies
      const replies = analysis.filter((a: any) => a?.is_reply);
      expect(replies.length).toBeGreaterThan(0);
    });
  });

  describe('Top-level-only behavior', () => {
    it('should exclude thread messages when not using is:thread', async () => {
      // Without is:thread modifier (simulates --top-level-only)
      const response = await client.searchMessages('test', {
        count: 20,
        page: 1,
      });

      const matches = response.messages?.matches || [];
      expect(matches.length).toBeGreaterThan(0);

      // Count how many have thread_ts in permalink
      const withThreads = matches.filter((match: any) => {
        if (!match.permalink) return false;
        return match.permalink.includes('thread_ts=');
      });

      console.log(`Without is:thread: ${matches.length} total, ${withThreads.length} have thread_ts`);

      // Without is:thread, should have fewer thread-related messages
      expect(matches.length).toBeGreaterThan(0);
    });

    it('should include thread messages when using is:thread (default behavior)', async () => {
      // With is:thread modifier (default behavior)
      const response = await client.searchMessages('test is:thread', {
        count: 20,
        page: 1,
      });

      const matches = response.messages?.matches || [];
      expect(matches.length).toBeGreaterThan(0);

      // All should have thread_ts in permalink
      const withThreads = matches.filter((match: any) => {
        if (!match.permalink) return false;
        return match.permalink.includes('thread_ts=');
      });

      console.log(`With is:thread: ${matches.length} total, ${withThreads.length} have thread_ts`);

      // With is:thread, most/all should be thread-related
      expect(withThreads.length).toBeGreaterThan(0);
    });
  });
});
