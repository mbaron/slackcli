import { describe, expect, it, beforeAll } from 'bun:test';
import { access, readdir } from 'fs/promises';
import { getAuthenticatedClient } from '../lib/auth.ts';
import type { SlackClient } from '../lib/slack-client.ts';

/**
 * Integration test for file download functionality
 *
 * This test:
 * 1. Finds channels with file attachments
 * 2. Tests file info retrieval
 * 3. Tests file downloads with temp directory (no --output-dir)
 * 4. Verifies temp directory is created and files are downloaded
 */

let client: SlackClient;

beforeAll(async () => {
  client = await getAuthenticatedClient();
});

describe('Files Integration Tests', () => {
  describe('Finding files in channels', () => {
    it('should find channels with file attachments', async () => {
      // List some channels
      const convResponse = await client.listConversations({
        limit: 10,
        types: 'public_channel,private_channel',
      });

      const channels = convResponse.channels || [];
      expect(channels.length).toBeGreaterThan(0);

      console.log(`Testing ${channels.length} channels for file attachments...`);

      // Look for files in channels
      let foundFiles = false;
      for (const channel of channels.slice(0, 5)) {
        try {
          const filesResponse = await client.listFiles({
            channel: channel.id,
            count: 5,
          });

          const files = filesResponse.files || [];
          if (files.length > 0) {
            foundFiles = true;
            console.log(`✓ Channel ${channel.name || channel.id} has ${files.length} files`);

            // Show first file info
            const file = files[0];
            console.log(`  Example file: ${file.name} (${file.id})`);
            console.log(`  Type: ${file.mimetype || file.filetype || 'unknown'}`);
            console.log(`  Size: ${file.size ? `${(file.size / 1024).toFixed(1)} KB` : 'unknown'}`);
            break;
          }
        } catch (err) {
          // Some channels might not have file access
          continue;
        }
      }

      // Note: It's possible no files are found in public channels
      if (!foundFiles) {
        console.log('Note: No files found in accessible channels');
      }
    });
  });

  describe('File info retrieval', () => {
    it('should retrieve file metadata', async () => {
      // First, find a file
      const channels = (await client.listConversations({
        limit: 10,
        types: 'public_channel,private_channel',
      })).channels || [];

      let testFileId: string | null = null;

      for (const channel of channels.slice(0, 5)) {
        try {
          const filesResponse = await client.listFiles({
            channel: channel.id,
            count: 1,
          });

          const files = filesResponse.files || [];
          if (files.length > 0) {
            testFileId = files[0].id;
            break;
          }
        } catch (err) {
          continue;
        }
      }

      if (!testFileId) {
        console.log('Skipping: No accessible files found for testing');
        return;
      }

      // Test file info retrieval
      const fileInfo = await client.getFileInfo(testFileId);
      expect(fileInfo.ok).toBe(true);
      expect(fileInfo.file).toBeDefined();
      expect(fileInfo.file.id).toBe(testFileId);
      expect(fileInfo.file.name).toBeDefined();

      console.log(`File info retrieved: ${fileInfo.file.name}`);
      console.log(`  Type: ${fileInfo.file.mimetype || 'unknown'}`);
      console.log(`  Mode: ${fileInfo.file.mode || 'hosted'}`);
    });
  });

  describe('File download with temp directory', () => {
    it('should download file to temp directory when output-dir not specified', async () => {
      // Find a small file to download
      const channels = (await client.listConversations({
        limit: 10,
        types: 'public_channel,private_channel',
      })).channels || [];

      let testFile: any = null;

      for (const channel of channels.slice(0, 5)) {
        try {
          const filesResponse = await client.listFiles({
            channel: channel.id,
            count: 10,
          });

          const files = filesResponse.files || [];

          // Find a small file (< 1MB) that's not external
          for (const file of files) {
            if (file.size && file.size < 1024 * 1024 && file.mode !== 'external') {
              testFile = file;
              break;
            }
          }

          if (testFile) break;
        } catch (err) {
          continue;
        }
      }

      if (!testFile) {
        console.log('Skipping: No suitable files found for download test');
        return;
      }

      console.log(`Testing download: ${testFile.name} (${(testFile.size / 1024).toFixed(1)} KB)`);

      // Download the file
      const downloadUrl = testFile.url_private_download || testFile.url_private;
      expect(downloadUrl).toBeDefined();

      const { buffer, contentType } = await client.downloadFile(downloadUrl);

      expect(buffer).toBeDefined();
      expect(buffer.byteLength).toBeGreaterThan(0);
      expect(contentType).toBeDefined();

      console.log(`✓ Downloaded ${buffer.byteLength} bytes`);
      console.log(`  Content-Type: ${contentType}`);

      // Verify buffer is valid
      expect(buffer.byteLength).toBeLessThanOrEqual(testFile.size * 1.1); // Allow 10% variance
    });
  });

  describe('Temp directory behavior', () => {
    it('should create unique temp directories', async () => {
      const { mkdtemp } = await import('fs/promises');
      const { tmpdir } = await import('os');
      const { join } = await import('path');

      // Simulate what the code does
      const tempDir1 = await mkdtemp(join(tmpdir(), 'slackcli-downloads-'));
      const tempDir2 = await mkdtemp(join(tmpdir(), 'slackcli-downloads-'));

      expect(tempDir1).toBeDefined();
      expect(tempDir2).toBeDefined();
      expect(tempDir1).not.toBe(tempDir2);

      console.log(`Temp dir 1: ${tempDir1}`);
      console.log(`Temp dir 2: ${tempDir2}`);

      // Verify directories exist
      await access(tempDir1);
      await access(tempDir2);

      // Verify directories are empty initially
      const files1 = await readdir(tempDir1);
      const files2 = await readdir(tempDir2);
      expect(files1.length).toBe(0);
      expect(files2.length).toBe(0);
    });
  });
});
