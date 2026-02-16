import { describe, it, expect } from 'bun:test';
import { ConversationListOutputSchema } from '../schemas/index.ts';

describe('conversations list schema', () => {
  it('should use "conversations" key for consistency with command name', () => {
    // After the fix, the schema should have "conversations" key, not "channels"
    // This matches user expectations from the command name: "conversations list"

    const testData = {
      conversations: [
        {
          id: 'C123',
          name: 'general',
          type: 'public_channel' as const,
        },
      ],
    };

    // This test will fail until we rename the schema key
    const result = ConversationListOutputSchema.parse(testData);
    expect(result.conversations).toHaveLength(1);
    expect(result.conversations[0].name).toBe('general');
  });

  it('should enable .conversations[] accessor in jq queries', () => {
    // Users should intuitively be able to use:
    // slackcli conversations list --format=json | jq '.conversations[]'
    // Instead of having to know the internal key is 'channels'

    const testData = {
      conversations: [
        {
          id: 'C123',
          name: 'general',
          type: 'public_channel' as const,
        },
        {
          id: 'C456',
          name: 'random',
          type: 'public_channel' as const,
        },
      ],
    };

    const result = ConversationListOutputSchema.parse(testData);

    // After fix, accessing .conversations should work
    expect(result.conversations).toHaveLength(2);
    expect(result.conversations[0].id).toBe('C123');
    expect(result.conversations[1].id).toBe('C456');
  });
});
