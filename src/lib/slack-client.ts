import { WebClient } from '@slack/web-api';
import type { WorkspaceConfig, SlackAuthTestResponse } from '../types/index.ts';

export class SlackClient {
  private config: WorkspaceConfig;
  private webClient?: WebClient;

  constructor(config: WorkspaceConfig) {
    this.config = config;
    
    // Only use WebClient for standard auth
    if (config.auth_type === 'standard') {
      this.webClient = new WebClient(config.token);
    }
  }

  // Make API request (handles both auth types)
  async request(method: string, params: Record<string, any> = {}): Promise<any> {
    if (this.config.auth_type === 'standard') {
      return this.standardRequest(method, params);
    } else {
      return this.browserRequest(method, params);
    }
  }

  // Standard token request (using @slack/web-api)
  private async standardRequest(method: string, params: Record<string, any>): Promise<any> {
    if (!this.webClient) {
      throw new Error('WebClient not initialized');
    }

    try {
      const response = await this.webClient.apiCall(method, params);
      return response;
    } catch (error: any) {
      throw new Error(`Slack API error: ${error.message}`);
    }
  }

  // Browser token request (custom implementation)
  private async browserRequest(method: string, params: Record<string, any>): Promise<any> {
    if (this.config.auth_type !== 'browser') {
      throw new Error('Invalid auth type');
    }

    const url = `${this.config.workspace_url}/api/${method}`;
    
    const formBody = new URLSearchParams({
      token: this.config.xoxc_token,
      ...params,
    });

    try {
      // URL-encode the xoxd token for the cookie
      const encodedXoxdToken = encodeURIComponent(this.config.xoxd_token);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Cookie': `d=${encodedXoxdToken}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Origin': 'https://app.slack.com',
          'User-Agent': 'Mozilla/5.0 (compatible; SlackCLI/0.1.0)',
        },
        body: formBody,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: any = await response.json();

      if (!data.ok) {
        throw new Error(data.error || 'Unknown API error');
      }

      return data;
    } catch (error: any) {
      throw new Error(`Slack API error: ${error.message}`);
    }
  }

  // Test authentication
  async testAuth(): Promise<SlackAuthTestResponse> {
    return this.request('auth.test', {});
  }

  // List conversations
  async listConversations(options: {
    types?: string;
    limit?: number;
    exclude_archived?: boolean;
    cursor?: string;
  } = {}): Promise<any> {
    return this.request('conversations.list', options);
  }

  // Get conversation history
  async getConversationHistory(channel: string, options: {
    cursor?: string;
    latest?: string;
    oldest?: string;
    inclusive?: boolean;
    limit?: number;
  } = {}): Promise<any> {
    // Filter out undefined values
    const params: Record<string, any> = { channel };
    if (options.cursor) params.cursor = options.cursor;
    if (options.latest) params.latest = options.latest;
    if (options.oldest) params.oldest = options.oldest;
    if (options.inclusive !== undefined) params.inclusive = options.inclusive;
    if (options.limit) params.limit = options.limit;
    
    return this.request('conversations.history', params);
  }

  // Get conversation replies (thread)
  async getConversationReplies(channel: string, ts: string, options: {
    cursor?: string;
    latest?: string;
    oldest?: string;
    inclusive?: boolean;
    limit?: number;
  } = {}): Promise<any> {
    const params: Record<string, any> = { channel, ts };
    if (options.cursor) params.cursor = options.cursor;
    if (options.latest) params.latest = options.latest;
    if (options.oldest) params.oldest = options.oldest;
    if (options.inclusive !== undefined) params.inclusive = options.inclusive;
    if (options.limit) params.limit = options.limit;
    
    return this.request('conversations.replies', params);
  }

  // Post message
  async postMessage(channel: string, text: string, options: {
    thread_ts?: string;
  } = {}): Promise<any> {
    const params: Record<string, any> = { channel, text };
    if (options.thread_ts) params.thread_ts = options.thread_ts;
    
    return this.request('chat.postMessage', params);
  }

  // Get user info
  async getUserInfo(userId: string): Promise<any> {
    return this.request('users.info', { user: userId });
  }

  // Get multiple users info
  async getUsersInfo(userIds: string[]): Promise<any> {
    const users: any[] = [];
    
    for (const userId of userIds) {
      try {
        const response = await this.getUserInfo(userId);
        if (response.ok && response.user) {
          users.push(response.user);
        }
      } catch (error) {
        // Skip users we can't fetch
        console.error(`Failed to fetch user ${userId}`);
      }
    }
    
    return { ok: true, users };
  }

  // Open a conversation (DM)
  async openConversation(users: string): Promise<any> {
    return this.request('conversations.open', { users });
  }

  // Add reaction to message
  async addReaction(channel: string, timestamp: string, name: string): Promise<any> {
    return this.request('reactions.add', {
      channel,
      timestamp,
      name
    });
  }

  // Remove reaction from message
  async removeReaction(channel: string, timestamp: string, name: string): Promise<any> {
    return this.request('reactions.remove', {
      channel,
      timestamp,
      name
    });
  }

  // List all users in workspace
  async listUsers(options: {
    cursor?: string;
    limit?: number;
    include_locale?: boolean;
  } = {}): Promise<any> {
    const params: Record<string, any> = {};
    if (options.cursor) params.cursor = options.cursor;
    if (options.limit) params.limit = options.limit;
    if (options.include_locale !== undefined) params.include_locale = options.include_locale;

    return this.request('users.list', params);
  }

  // Lookup user by email
  async lookupUserByEmail(email: string): Promise<any> {
    return this.request('users.lookupByEmail', { email });
  }

  // Search messages
  async searchMessages(query: string, options: {
    sort?: 'score' | 'timestamp';
    sort_dir?: 'asc' | 'desc';
    count?: number;
    page?: number;
    highlight?: boolean;
  } = {}): Promise<any> {
    const params: Record<string, any> = { query };
    if (options.sort) params.sort = options.sort;
    if (options.sort_dir) params.sort_dir = options.sort_dir;
    if (options.count) params.count = options.count;
    if (options.page) params.page = options.page;
    if (options.highlight !== undefined) params.highlight = options.highlight;

    return this.request('search.messages', params);
  }

  // Download a file from Slack (handles auth for both standard and browser tokens)
  async downloadFile(url: string): Promise<{ buffer: ArrayBuffer; contentType: string }> {
    const headers: Record<string, string> = {};

    if (this.config.auth_type === 'standard') {
      headers['Authorization'] = `Bearer ${this.config.token}`;
    } else {
      const encodedXoxdToken = encodeURIComponent(this.config.xoxd_token);
      headers['Cookie'] = `d=${encodedXoxdToken}`;
      headers['Origin'] = 'https://app.slack.com';
      headers['User-Agent'] = 'Mozilla/5.0 (compatible; SlackCLI/0.1.0)';
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      throw new Error(`Failed to download file: HTTP ${response.status} ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'application/octet-stream';

    return { buffer, contentType };
  }

  // Get file info
  async getFileInfo(fileId: string): Promise<any> {
    return this.request('files.info', { file: fileId });
  }

  // List files in a channel
  async listFiles(options: {
    channel?: string;
    user?: string;
    types?: string;
    count?: number;
    page?: number;
  } = {}): Promise<any> {
    const params: Record<string, any> = {};
    if (options.channel) params.channel = options.channel;
    if (options.user) params.user = options.user;
    if (options.types) params.types = options.types;
    if (options.count) params.count = options.count;
    if (options.page) params.page = options.page;

    return this.request('files.list', params);
  }

  // Search messages using modules API (browser auth only, supports searching all public channels)
  async searchModulesMessages(query: string, options: {
    sort?: 'score' | 'timestamp';
    sort_dir?: 'asc' | 'desc';
    count?: number;
    page?: number;
    include_all_channels?: boolean;
    exclude_bots?: boolean;
  } = {}): Promise<any> {
    const params: Record<string, any> = {
      module: 'messages',
      query,
      count: options.count || 20,
      page: options.page || 1,
      sort: options.sort || 'timestamp',
      sort_dir: options.sort_dir || 'desc',
      extracts: 1,
      highlight: 1,
      extra_message_data: 1,
      search_only_my_channels: options.include_all_channels ? false : true,
      search_exclude_bots: options.exclude_bots ?? false,
    };

    return this.request('search.modules.messages', params);
  }
}

