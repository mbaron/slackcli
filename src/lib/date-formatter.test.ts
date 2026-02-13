import { describe, it, expect } from 'bun:test';
import {
  slackTimestampToDate,
  formatToISO,
  formatRelativeTime,
  formatTimestampPretty,
  formatTimestampForJson,
  formatFileCreated,
  formatFileCreatedPretty,
} from './date-formatter';

describe('date-formatter', () => {
  // Use fixed reference time for testing relative time
  // Reference: 2026-02-13T00:00:00Z
  const referenceTime = 1770988800; // Unix timestamp for 2026-02-13T00:00:00Z

  describe('slackTimestampToDate', () => {
    it('should convert string timestamp to Date', () => {
      const result = slackTimestampToDate('1770934825.154319');
      expect(result).toBeInstanceOf(Date);
      expect(result.toISOString()).toBe('2026-02-12T22:20:25.154Z');
    });

    it('should convert number timestamp to Date', () => {
      const result = slackTimestampToDate(1770934825.154319);
      expect(result).toBeInstanceOf(Date);
      expect(result.toISOString()).toBe('2026-02-12T22:20:25.154Z');
    });

    it('should handle integer timestamps', () => {
      const result = slackTimestampToDate(1770934825);
      expect(result.toISOString()).toBe('2026-02-12T22:20:25.000Z');
    });

    it('should handle timestamp 0', () => {
      const result = slackTimestampToDate(0);
      expect(result.toISOString()).toBe('1970-01-01T00:00:00.000Z');
    });
  });

  describe('formatToISO', () => {
    it('should format timestamp as ISO-8601', () => {
      const result = formatToISO('1770934825.154319');
      expect(result).toBe('2026-02-12T22:20:25.154Z');
    });

    it('should format number timestamp as ISO-8601', () => {
      const result = formatToISO(1770934825.154319);
      expect(result).toBe('2026-02-12T22:20:25.154Z');
    });

    it('should always use Z (UTC) suffix', () => {
      const result = formatToISO('1770934825');
      expect(result).toMatch(/Z$/);
    });
  });

  describe('formatRelativeTime', () => {
    describe('time calculations', () => {
      it('should identify time ranges correctly', () => {
        // Test that different timestamps calculate relative times properly
        // We're testing the logic, not against a fixed "now"

        // These tests use timestamps that are definitively in the past
        // and verify the relative time output pattern
        const epochStart = 0;
        const result = formatRelativeTime(epochStart);
        expect(result).toMatch(/\d+ years ago/);
      });

      it('should show "just now" for recent past times', () => {
        // Create a timestamp from 30 seconds ago
        const now = Date.now() / 1000;
        const recent = now - 30;
        const result = formatRelativeTime(recent);
        expect(result).toBe('just now');
      });

      it('should show minutes for timestamps 1-120 minutes in past', () => {
        const now = Date.now() / 1000;

        // 5 minutes ago
        const fiveMinutesAgo = now - 300;
        const result1 = formatRelativeTime(fiveMinutesAgo);
        expect(result1).toMatch(/\d+ minutes? ago/);

        // 1 minute ago
        const oneMinuteAgo = now - 60;
        const result2 = formatRelativeTime(oneMinuteAgo);
        expect(result2).toMatch(/minute.*ago/);
      });

      it('should show hours for timestamps 121 minutes to 48 hours in past', () => {
        const now = Date.now() / 1000;

        // 2 hours ago
        const twoHoursAgo = now - 7200;
        const result = formatRelativeTime(twoHoursAgo);
        expect(result).toMatch(/\d+ hours? ago/);
      });

      it('should show days for timestamps 49 hours to 60 days in past', () => {
        const now = Date.now() / 1000;

        // 5 days ago
        const fiveDaysAgo = now - 5 * 86400;
        const result = formatRelativeTime(fiveDaysAgo);
        expect(result).toMatch(/\d+ days? ago/);
      });

      it('should use singular "1 minute"', () => {
        const now = Date.now() / 1000;
        const oneMinuteAgo = now - 60;
        const result = formatRelativeTime(oneMinuteAgo);
        expect(result).toBe('1 minute ago');
      });

      it('should use plural "X minutes"', () => {
        const now = Date.now() / 1000;
        const fiveMinutesAgo = now - 300;
        const result = formatRelativeTime(fiveMinutesAgo);
        expect(result).toBe('5 minutes ago');
      });

      it('should use singular "1 hour" for ~1 hour past', () => {
        const now = Date.now() / 1000;
        // Need to be past 60 minutes to show hours, but less than 2 hours
        const oneHourTenMinutesAgo = now - 4200; // 70 minutes
        const result = formatRelativeTime(oneHourTenMinutesAgo);
        expect(result).toBe('1 hour ago');
      });

      it('should use plural "X hours"', () => {
        const now = Date.now() / 1000;
        const threeHoursAgo = now - 10800;
        const result = formatRelativeTime(threeHoursAgo);
        expect(result).toBe('3 hours ago');
      });

      it('should use singular "1 day" for ~1 day past', () => {
        const now = Date.now() / 1000;
        // Need to be past 24 hours to show days, but less than 2 days
        const oneDayEightHoursAgo = now - 100800; // 28 hours
        const result = formatRelativeTime(oneDayEightHoursAgo);
        expect(result).toBe('1 day ago');
      });

      it('should use plural "X days"', () => {
        const now = Date.now() / 1000;
        const sevenDaysAgo = now - 7 * 86400;
        const result = formatRelativeTime(sevenDaysAgo);
        expect(result).toBe('7 days ago');
      });

      it('should handle very old timestamps (years)', () => {
        const veryOld = 86400; // 1970-01-02
        const result = formatRelativeTime(veryOld);
        expect(result).toMatch(/\d+ years? ago/);
      });
    });
  });

  describe('formatTimestampPretty', () => {
    it('should combine ISO and relative time', () => {
      const now = Date.now() / 1000;
      const oneDayEightHoursAgo = now - 100800; // 28 hours to trigger day display
      const result = formatTimestampPretty(oneDayEightHoursAgo);
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T.*\(\d+ \w+ ago\)$/);
      expect(result).toContain('(');
      expect(result).toContain('ago)');
    });

    it('should handle string timestamps', () => {
      const result = formatTimestampPretty('1770934825.154319');
      expect(result).toContain('2026-02-12T22:20:25.154Z');
    });

    it('should handle number timestamps', () => {
      const result = formatTimestampPretty(1770934825.154319);
      expect(result).toContain('2026-02-12T22:20:25.154Z');
    });
  });

  describe('formatTimestampForJson', () => {
    it('should return object with all three formats', () => {
      const ts = '1770934825.154319';
      const result = formatTimestampForJson(ts);

      expect(result).toHaveProperty('timestamp_unix');
      expect(result).toHaveProperty('timestamp_iso');
      expect(result).toHaveProperty('relative_time');
    });

    it('should preserve unix timestamp accuracy', () => {
      const ts = '1770934825.154319';
      const result = formatTimestampForJson(ts);
      expect(result.timestamp_unix).toBe(1770934825.154319);
    });

    it('should provide ISO format', () => {
      const ts = '1770934825.154319';
      const result = formatTimestampForJson(ts);
      expect(result.timestamp_iso).toBe('2026-02-12T22:20:25.154Z');
    });

    it('should provide relative time', () => {
      const now = Date.now() / 1000;
      const oneDayEightHoursAgo = now - 100800; // 28 hours to trigger day display
      const result = formatTimestampForJson(oneDayEightHoursAgo);
      expect(result.relative_time).toBe('1 day ago');
    });

    it('should handle number input', () => {
      const ts = 1770934825.154319;
      const result = formatTimestampForJson(ts);
      expect(result.timestamp_unix).toBe(1770934825.154319);
    });
  });

  describe('formatFileCreated', () => {
    it('should format file timestamp as ISO-8601', () => {
      const result = formatFileCreated(1770934825);
      expect(result).toBe('2026-02-12T22:20:25.000Z');
    });

    it('should handle timestamp 0', () => {
      const result = formatFileCreated(0);
      expect(result).toBe('1970-01-01T00:00:00.000Z');
    });
  });

  describe('formatFileCreatedPretty', () => {
    it('should combine ISO and relative time for file timestamps', () => {
      const now = Math.floor(Date.now() / 1000);
      const oneDayEightHoursAgo = now - 100800; // 28 hours to trigger day display
      const result = formatFileCreatedPretty(oneDayEightHoursAgo);
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T.*\(\d+ \w+ ago\)$/);
      expect(result).toContain('ago)');
    });
  });

  describe('timezone handling', () => {
    it('should always use UTC (Z suffix)', () => {
      const tests = [
        formatToISO('1770934825.154319'),
        formatToISO(1770934825.154319),
        formatFileCreated(1770934825),
      ];

      tests.forEach(result => {
        expect(result).toMatch(/Z$/);
      });
    });
  });

  describe('boundary cases', () => {
    it('should handle very small timestamps', () => {
      const result = formatToISO('0.000001');
      expect(result).toContain('1970');
    });

    it('should handle large timestamps', () => {
      const result = formatToISO('9999999999');
      expect(result).toContain('2286');
    });

    it('should handle string with many decimal places', () => {
      const result = formatToISO('1770934825.154319123');
      expect(result).toBe('2026-02-12T22:20:25.154Z');
    });
  });

  describe('special cases', () => {
    it('should handle Slack timestamp format with decimals', () => {
      // Typical Slack format: seconds.microseconds
      const slackTs = '1770934825.154319';
      const iso = formatToISO(slackTs);
      expect(iso).toBe('2026-02-12T22:20:25.154Z');
    });

    it('should handle integer-only timestamps', () => {
      const ts = '1770934825';
      const iso = formatToISO(ts);
      expect(iso).toBe('2026-02-12T22:20:25.000Z');
    });
  });
});
