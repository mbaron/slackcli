import { z } from 'zod';

// Auth list output
export const WorkspaceListOutputSchema = z.object({
  workspaces: z.array(z.object({
    workspace_id: z.string(),
    workspace_name: z.string(),
    auth_type: z.enum(['standard', 'browser']),
    is_default: z.boolean(),
  })),
});
export type WorkspaceListOutput = z.infer<typeof WorkspaceListOutputSchema>;

// Auth parse-curl output
export const ParseCurlOutputSchema = z.object({
  workspace_name: z.string(),
  workspace_url: z.string(),
  xoxd_token: z.string(),
  xoxc_token: z.string(),
});
export type ParseCurlOutput = z.infer<typeof ParseCurlOutputSchema>;

// User info (shared)
const UserInfoSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  real_name: z.string().optional(),
  email: z.string().optional(),
});

// Conversations list output
export const ConversationListOutputSchema = z.object({
  channels: z.array(z.object({
    id: z.string(),
    name: z.string().nullable(),
    type: z.enum(['public_channel', 'private_channel', 'im', 'mpim']),
    is_archived: z.boolean().optional(),
    topic: z.string().optional(),
    user_id: z.string().optional(), // for DMs
  })),
  users: z.record(z.string(), UserInfoSchema).optional(),
});
export type ConversationListOutput = z.infer<typeof ConversationListOutputSchema>;

// Slack file (shared)
const SlackFileSchema = z.object({
  id: z.string(),
  name: z.string(),
  title: z.string().optional(),
  mimetype: z.string().optional(),
  filetype: z.string().optional(),
  size: z.number().optional(),
  url_private: z.string().optional(),
  url_private_download: z.string().optional(),
  permalink: z.string().optional(),
  mode: z.string().optional(),
});

// Conversations read output
export const ConversationReadOutputSchema = z.object({
  channel_id: z.string(),
  message_count: z.number(),
  messages: z.array(z.object({
    ts: z.string(),
    thread_ts: z.string().optional(),
    user: z.string().optional(),
    username: z.string().optional(), // Human-readable @handle
    text: z.string(),
    type: z.string(),
    reply_count: z.number().optional(),
    reactions: z.array(z.object({
      name: z.string(),
      count: z.number(),
    })).optional(),
    bot_id: z.string().optional(),
    files: z.array(SlackFileSchema).optional(),
  })),
  users: z.record(z.string(), UserInfoSchema).optional(),
  downloaded_files: z.array(z.object({
    file_id: z.string(),
    name: z.string(),
    path: z.string(),
    size: z.number(),
  })).optional(),
});
export type ConversationReadOutput = z.infer<typeof ConversationReadOutputSchema>;

// Messages send output
export const MessageSendOutputSchema = z.object({
  ok: z.boolean(),
  channel: z.string(),
  ts: z.string(),
  message: z.object({
    text: z.string(),
    ts: z.string(),
  }).optional(),
});
export type MessageSendOutput = z.infer<typeof MessageSendOutputSchema>;

// Messages react output
export const MessageReactOutputSchema = z.object({
  ok: z.boolean(),
  channel: z.string(),
  timestamp: z.string(),
  emoji: z.string(),
});
export type MessageReactOutput = z.infer<typeof MessageReactOutputSchema>;

// Update check output
export const UpdateCheckOutputSchema = z.object({
  current_version: z.string(),
  latest_version: z.string().optional(),
  update_available: z.boolean(),
});
export type UpdateCheckOutput = z.infer<typeof UpdateCheckOutputSchema>;

// User profile (shared)
const UserProfileSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  real_name: z.string().optional(),
  display_name: z.string().optional(),
  email: z.string().optional(),
  title: z.string().optional(),
  is_bot: z.boolean().optional(),
  is_admin: z.boolean().optional(),
  deleted: z.boolean().optional(),
  tz: z.string().optional(),
});

// Users list output
export const UserListOutputSchema = z.object({
  users: z.array(UserProfileSchema),
  total_count: z.number(),
  has_more: z.boolean(),
  next_cursor: z.string().optional(),
});
export type UserListOutput = z.infer<typeof UserListOutputSchema>;

// Users search output
export const UserSearchOutputSchema = z.object({
  query: z.string(),
  users: z.array(UserProfileSchema),
  match_count: z.number(),
});
export type UserSearchOutput = z.infer<typeof UserSearchOutputSchema>;

// Users info output (supports single or multiple users)
export const UserInfoOutputSchema = z.object({
  users: z.array(UserProfileSchema),
});
export type UserInfoOutput = z.infer<typeof UserInfoOutputSchema>;

// Search message match
const SearchMessageMatchSchema = z.object({
  ts: z.string(),
  text: z.string(),
  username: z.string().optional(),
  user: z.string().optional(),
  channel: z.object({
    id: z.string(),
    name: z.string().optional(),
  }),
  permalink: z.string().optional(),
  // Thread-related fields
  thread_ts: z.string().optional(),
  reply_count: z.number().optional(),
  is_thread_reply: z.boolean().optional(),
});

// Search messages output
export const SearchMessagesOutputSchema = z.object({
  query: z.string(),
  messages: z.array(SearchMessageMatchSchema),
  total: z.number(),
  page: z.number(),
  page_count: z.number(),
});
export type SearchMessagesOutput = z.infer<typeof SearchMessagesOutputSchema>;

// File info output
export const FileInfoOutputSchema = z.object({
  file: SlackFileSchema.extend({
    created: z.number().optional(),
    user: z.string().optional(),
    username: z.string().optional(), // Human-readable @handle of uploader
  }),
});
export type FileInfoOutput = z.infer<typeof FileInfoOutputSchema>;

// File list output
export const FileListOutputSchema = z.object({
  channel_id: z.string(),
  files: z.array(SlackFileSchema.extend({
    created: z.number().optional(),
    user: z.string().optional(),
    username: z.string().optional(), // Human-readable @handle of uploader
  })),
  total: z.number(),
  page: z.number(),
  page_count: z.number(),
});
export type FileListOutput = z.infer<typeof FileListOutputSchema>;

// File download output
export const FileDownloadOutputSchema = z.object({
  downloads: z.array(z.object({
    file_id: z.string(),
    name: z.string(),
    path: z.string(),
    size: z.number(),
    mimetype: z.string().optional(),
  })),
  errors: z.array(z.object({
    file_id: z.string(),
    error: z.string(),
  })).optional(),
});
export type FileDownloadOutput = z.infer<typeof FileDownloadOutputSchema>;
