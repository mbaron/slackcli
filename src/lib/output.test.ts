import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { z } from 'zod';
import { output } from './output.ts';

describe('output module', () => {
  describe('jq error handling with schema display', () => {
    let capturedErrors: string[] = [];
    let originalConsoleError: typeof console.error;
    let originalExit: typeof process.exit;

    beforeEach(() => {
      capturedErrors = [];

      // Capture console.error output
      originalConsoleError = console.error;
      (console as any).error = (...args: any[]) => {
        capturedErrors.push(args.map(String).join(' '));
      };

      // Mock process.exit to prevent test from exiting
      originalExit = process.exit;
      (process.exit as any) = () => {
        // Don't actually exit during tests
      };
    });

    afterEach(() => {
      console.error = originalConsoleError;
      process.exit = originalExit;
    });

    it('should show schema in error output when jq filter fails', () => {
      const testSchema = z.object({
        channels: z.array(
          z.object({
            id: z.string(),
            name: z.string().nullable(),
            type: z.enum(['public_channel', 'private_channel', 'im', 'mpim']),
          })
        ),
      });

      const testData = {
        channels: [
          { id: 'C123', name: 'general', type: 'public_channel' },
        ],
      };

      // This jq expression will fail because .conversations doesn't exist
      output(
        testData,
        testSchema,
        'json',
        () => 'pretty output',
        '.conversations[]'
      );

      const errorOutput = capturedErrors.join('\n');

      // Should contain jq error message
      expect(errorOutput).toContain('jq error');

      // Should contain schema information header
      expect(errorOutput).toContain('Expected schema');

      // Should contain helpful tip
      expect(errorOutput).toContain('--format=schema');

      // Should contain actual JSON schema output
      expect(errorOutput).toContain('$schema');
    });

    it('should include schema structure in error output for invalid syntax', () => {
      const testSchema = z.object({
        messages: z.array(
          z.object({
            ts: z.string(),
            text: z.string(),
            username: z.string().optional(),
          })
        ),
        total: z.number(),
      });

      const testData = {
        messages: [
          { ts: '123.456', text: 'Hello', username: 'alice' },
        ],
        total: 1,
      };

      output(
        testData,
        testSchema,
        'json',
        () => 'pretty output',
        '.invalid[path' // Invalid jq syntax
      );

      const errorOutput = capturedErrors.join('\n');

      // Should show the problematic filter
      expect(errorOutput).toContain('jq error');

      // Should show schema information header
      expect(errorOutput).toContain('Expected schema');

      // Should show helpful tip
      expect(errorOutput).toContain('--format=schema');

      // Should contain JSON schema output
      expect(errorOutput).toContain('$schema');
    });
  });
});
