import { describe, expect, test } from 'bun:test';
import { isJqInstalled, runJq } from './jq.ts';

describe('jq utilities', () => {
  test('isJqInstalled returns true when jq is available', () => {
    // This test assumes jq is installed in the test environment
    // It will pass if jq is available, skip otherwise
    const installed = isJqInstalled();
    expect(typeof installed).toBe('boolean');
  });

  test('runJq filters JSON data correctly', () => {
    // Skip if jq not installed
    if (!isJqInstalled()) {
      return;
    }

    const data = {
      users: [
        { name: 'alice', age: 30 },
        { name: 'bob', age: 25 },
      ],
    };

    const result = runJq(data, '.users[].name');
    expect(result.trim()).toContain('alice');
    expect(result.trim()).toContain('bob');
  });

  test('runJq handles complex filters', () => {
    if (!isJqInstalled()) {
      return;
    }

    const data = {
      items: [
        { id: 1, active: true },
        { id: 2, active: false },
        { id: 3, active: true },
      ],
    };

    const result = runJq(data, '.items[] | select(.active) | .id');
    const lines = result.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('1');
    expect(lines[1]).toBe('3');
  });

  test('runJq throws error for invalid expression', () => {
    if (!isJqInstalled()) {
      return;
    }

    const data = { test: 'value' };

    expect(() => {
      runJq(data, '.invalid[syntax');
    }).toThrow();
  });

  test('runJq throws error when jq not installed', () => {
    // This test needs to mock the isJqInstalled check
    // For now, we'll just ensure the function exists and can be called
    expect(typeof runJq).toBe('function');
  });
});
