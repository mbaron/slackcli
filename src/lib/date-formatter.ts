/**
 * Date and timestamp formatting utilities
 *
 * Provides consistent formatting of Slack timestamps across the CLI:
 * - ISO-8601 format for machine readability
 * - Relative time ("1 day ago") for human context
 * - Combined pretty format for display output
 * - JSON objects with all timestamp formats for API consumers
 */

/**
 * Convert a Slack timestamp to a Date object
 * Slack timestamps are Unix timestamps (seconds) with optional decimal precision
 *
 * @param ts - Slack timestamp as string or number
 * @returns Date object in UTC
 */
export function slackTimestampToDate(ts: string | number): Date {
  const seconds = typeof ts === 'string' ? parseFloat(ts) : ts;
  return new Date(seconds * 1000);
}

/**
 * Format timestamp as ISO-8601 string
 *
 * @param ts - Slack timestamp
 * @returns ISO-8601 string (e.g., "2026-02-12T22:20:25Z")
 */
export function formatToISO(ts: string | number): string {
  const date = slackTimestampToDate(ts);
  return date.toISOString();
}

/**
 * Format timestamp as relative time
 *
 * Examples: "5 minutes ago", "2 hours ago", "3 days ago", "1 month ago"
 *
 * @param ts - Slack timestamp
 * @returns Relative time string
 */
export function formatRelativeTime(ts: string | number): string {
  const date = slackTimestampToDate(ts);
  const now = new Date();
  const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffSeconds < 0) {
    // Future timestamp (shouldn't happen in practice)
    return 'in the future';
  }

  const minute = 60;
  const hour = minute * 60;
  const day = hour * 24;
  const month = day * 30;
  const year = day * 365;

  // 0-60 minutes: show in minutes
  if (diffSeconds < 60 * minute) {
    const minutes = Math.floor(diffSeconds / minute);
    if (minutes === 0) return 'just now';
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }

  // 61 min - 24 hours: show in hours
  if (diffSeconds < 24 * hour) {
    const hours = Math.floor(diffSeconds / hour);
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }

  // 25 hours - 60 days: show in days
  if (diffSeconds < 60 * day) {
    const days = Math.floor(diffSeconds / day);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }

  // 61 days - 2 years: show in months
  if (diffSeconds < 2 * year) {
    const months = Math.floor(diffSeconds / month);
    return `${months} month${months === 1 ? '' : 's'} ago`;
  }

  // 2+ years: show in years
  const years = Math.floor(diffSeconds / year);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}

/**
 * Format timestamp for pretty display output
 * Combines ISO format with relative time
 *
 * Example: "2026-02-12T22:20:25Z (1 day ago)"
 *
 * @param ts - Slack timestamp
 * @returns Formatted string suitable for console display
 */
export function formatTimestampPretty(ts: string | number): string {
  const iso = formatToISO(ts);
  const relative = formatRelativeTime(ts);
  return `${iso} (${relative})`;
}

/**
 * Format timestamp as JSON object with multiple representations
 * Suitable for JSON output where consumers need both raw and formatted values
 *
 * Example:
 * {
 *   "timestamp_unix": 1770934825.154319,
 *   "timestamp_iso": "2026-02-12T22:20:25Z",
 *   "relative_time": "1 day ago"
 * }
 *
 * @param ts - Slack timestamp
 * @returns Object with all timestamp formats
 */
export function formatTimestampForJson(ts: string | number): {
  timestamp_unix: number;
  timestamp_iso: string;
  relative_time: string;
} {
  const seconds = typeof ts === 'string' ? parseFloat(ts) : ts;
  return {
    timestamp_unix: seconds,
    timestamp_iso: formatToISO(ts),
    relative_time: formatRelativeTime(ts),
  };
}

/**
 * Format file creation timestamp (Unix epoch in seconds, no decimals)
 *
 * @param timestamp - Unix timestamp in seconds
 * @returns ISO-8601 string
 */
export function formatFileCreated(timestamp: number): string {
  return new Date(timestamp * 1000).toISOString();
}

/**
 * Format file creation timestamp with relative time
 *
 * @param timestamp - Unix timestamp in seconds
 * @returns Combined format string
 */
export function formatFileCreatedPretty(timestamp: number): string {
  const iso = formatFileCreated(timestamp);
  const relative = formatRelativeTime(timestamp);
  return `${iso} (${relative})`;
}
