/**
 * Typed API client for Open vBrowser backend.
 * All requests include credentials (session cookie) and CSRF token where needed.
 */

const API_BASE = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://127.0.0.1:8000/api/';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Browser {
  slug: string;
  display_name: string;
  description: string;
  icon_filename: string;
  category: string;       // legacy primary category
  categories: string[];   // all category slugs
  requires_spot: boolean;
  sort_order: number;
}

export interface SessionDetail {
  uuid: string;
  type: string | null;
  container_url: string | null;
  session_token: string | null;
  active: boolean;
  start_time: string | null;
  closed_at: string | null;
  capacity_provider: string | null;
  subdomain: string | null;
  ip_address: string | null;
  vcpu: string | null;
  memory_gb: string | null;
  session_cost_usd: string | null;
  workspace_slug: string | null;
  workspace_uuid: string | null;
  case_id: number | null;
  tags: string[];
  enable_traffic_log: boolean;
  persistent_storage: boolean;
}

export interface SessionStatus {
  uuid: string;
  status: 'pending' | 'active' | 'closed';
  container_url: string | null;
  max_wait_time: number;
}

export interface SessionHistory {
  uuid: string;
  type: string | null;
  url: string | null;
  category: string | null;
  active: boolean;
  container_url: string | null;
  start_time: string | null;
  closed_at: string | null;
  duration_seconds: number | null;
  subdomain: string | null;
  ip_address: string | null;
  capacity_provider: string | null;
  session_cost_usd: string | null;
  notes_count: number;
  tags: string[];
  tag_uuids: string[];
  case_name: string | null;
  case_uuid: string | null;
  enable_traffic_log: boolean;
  persistent_storage: boolean;
  traffic_event_count: number;
}

export interface TrafficEvent {
  id: number;
  timestamp: string;
  host: string;
  url: string;
  method: string;
  flagged: boolean;
}

export interface CaseSession {
  uuid: string;
  type: string | null;
  active: boolean;
  start_time: string | null;
  closed_at: string | null;
  duration_seconds: number | null;
  capacity_provider: string | null;
  session_cost_usd: string | null;
}

export interface Case {
  uuid: string;
  name: string;
  description: string;
  status: string;
  created_at: string;
  updated_at: string;
  created_by_id: number | null;
  workspace_id: number | null;
  session_count: number;
  sessions: CaseSession[];
}

export interface CaseComment {
  uuid: string;
  body: string;  // BlockNote JSON string
  author_id: number | null;
  author_email: string | null;
  created_at: string;
  updated_at: string;
}

export interface CaseAttachment {
  uuid: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  uploaded_by_id: number | null;
  uploaded_by_email: string | null;
  created_at: string;
  url: string;
}

export interface Note {
  uuid: string;
  body: string;
  author_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface Tag {
  uuid: string;
  name: string;
  color: string;
  workspace_id: number | null;
}


export interface Workspace {
  id: number;
  uuid: string;
  name: string;
  slug: string;
  created_at: string;
  max_concurrent_sessions_per_member: number | null;
  idle_timeout_minutes: number | null;
  max_session_duration_hours: number | null;
  member_count: number;
  role: string;
  is_personal: boolean;
  allowed_browser_slugs: string[];
  logo_url: string | null;
  enable_network_logging: boolean;
  enable_file_protection: boolean;
  enable_persistent_storage: boolean;
}

export interface DashboardActiveSession {
  uuid: string;
  type: string | null;
  user_email: string | null;
  start_time: string | null;
  capacity_provider: string | null;
}

export interface DashboardHistorySession {
  uuid: string;
  type: string | null;
  user_email: string | null;
  active: boolean;
  start_time: string | null;
  closed_at: string | null;
  duration_seconds: number | null;
  capacity_provider: string | null;
  session_cost_usd: string | null;
  case_name: string | null;
  case_uuid: string | null;
}

export interface DashboardCase {
  uuid: string;
  name: string;
  status: string;
  updated_at: string;
  session_count: number;
}

export interface DashboardMember {
  user_id: number;
  email: string;
  role: string;
  active_sessions: number;
}

export interface WorkspaceDashboard {
  role: string;
  is_personal: boolean;
  stats: {
    active_sessions: number;
    total_sessions_30d: number;
    total_cost_30d_usd: number;
    avg_duration_seconds: number;
  };
  active_sessions: DashboardActiveSession[];
  recent_history: DashboardHistorySession[];
  cases: {
    open: number;
    closed: number;
    archived: number;
    recent: DashboardCase[];
  };
  top_apps: { type: string; count: number }[];
  sessions_per_day: { date: string; sessions: number; cost_usd: number }[];
  members: DashboardMember[];
}

export interface WorkspaceMember {
  user_id: number;
  username: string;
  email: string;
  role: string;
  joined_at: string;
}

export interface UserLimits {
  max_concurrent_sessions: number | null;
  idle_timeout_minutes: number | null;
  max_session_duration_hours: number | null;
  effective_max_concurrent_sessions: number;
  effective_idle_timeout_minutes: number;
  effective_max_session_duration_hours: number | null;
}

export interface ApiKey {
  uuid: string;
  name: string;
  key: string;
  active: boolean;
  created_at: string;
  last_used_at: string | null;
}

export interface Notification {
  uuid: string;
  verb: string;
  actor_email: string | null;
  case_uuid: string | null;
  case_name: string | null;
  workspace_uuid: string | null;
  comment_uuid: string | null;
  read: boolean;
  created_at: string;
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────

function url(path: string): string {
  return `${API_BASE.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

async function apiFetch<T>(
  path: string,
  options: RequestInit & { csrfToken?: string } = {}
): Promise<T> {
  const { csrfToken, ...rest } = options;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(rest.headers as Record<string, string> ?? {}),
  };
  if (csrfToken) {
    headers['X-CSRFToken'] = csrfToken;
  }

  const res = await fetch(url(path), {
    credentials: 'include',
    ...rest,
    headers,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ─── Browsers ─────────────────────────────────────────────────────────────────

export const browsersApi = {
  list: () => apiFetch<Browser[]>('/v1/browsers/'),
};

// ─── Sessions ─────────────────────────────────────────────────────────────────

export const sessionsApi = {
  create: (payload: {
    browser_type: string;
    auto_open_url?: string;
    session_type?: string;
    workspace_uuid?: string;
    enable_traffic_log?: boolean;
    file_protection?: boolean;
    persistent_storage?: boolean;
  }, csrfToken: string) =>
    apiFetch<SessionDetail>('/v1/sessions/', {
      method: 'POST', body: JSON.stringify(payload), csrfToken,
    }),

  getStatus: (uuid: string) =>
    apiFetch<SessionStatus>(`/v1/sessions/${uuid}/status/`),

  get: (uuid: string) =>
    apiFetch<SessionDetail>(`/v1/sessions/${uuid}/`),

  getHistoryDetail: (uuid: string) =>
    apiFetch<SessionHistory>(`/v1/sessions/history/${uuid}/`),

  delete: (uuid: string, csrfToken: string) =>
    apiFetch<{ status: string }>(`/v1/sessions/${uuid}/`, {
      method: 'DELETE', csrfToken,
    }),

  ping: (uuid: string, csrfToken: string) =>
    apiFetch<{ status: string }>(`/v1/sessions/${uuid}/ping/`, {
      method: 'POST', csrfToken,
    }),

  history: (params?: {
    page?: number; browser?: string;
    from_date?: string; to_date?: string;
    case_id?: number; tag?: string;
    workspace_uuid?: string;
  }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.browser) qs.set('browser', params.browser);
    if (params?.from_date) qs.set('from_date', params.from_date);
    if (params?.to_date) qs.set('to_date', params.to_date);
    if (params?.case_id) qs.set('case_id', String(params.case_id));
    if (params?.tag) qs.set('tag', params.tag);
    if (params?.workspace_uuid) qs.set('workspace_uuid', params.workspace_uuid);
    return apiFetch<SessionHistory[]>(`/v1/sessions/history/?${qs.toString()}`);
  },

  trafficLogs: (uuid: string, params?: { page?: number; search?: string; since_id?: number; flagged_only?: boolean; method?: string }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.search) qs.set('search', params.search);
    if (params?.since_id != null) qs.set('since_id', String(params.since_id));
    if (params?.flagged_only) qs.set('flagged_only', 'true');
    if (params?.method) qs.set('method', params.method);
    return apiFetch<TrafficEvent[]>(`/v1/sessions/${uuid}/traffic/?${qs.toString()}`);
  },

  flagTrafficEvent: (uuid: string, eventId: number, csrfToken: string) =>
    apiFetch<{ id: number; flagged: boolean }>(`/v1/sessions/${uuid}/traffic/${eventId}/flag/`, {
      method: 'POST', csrfToken,
    }),

  addNote: (uuid: string, body: string, csrfToken: string) =>
    apiFetch<Note>(`/v1/sessions/${uuid}/notes/`, {
      method: 'POST', body: JSON.stringify({ body }), csrfToken,
    }),

  getNotes: (uuid: string) =>
    apiFetch<Note[]>(`/v1/sessions/${uuid}/notes/`),

  assignTags: (uuid: string, tag_uuids: string[], csrfToken: string) =>
    apiFetch<{ status: string; tags: string[] }>(`/v1/sessions/${uuid}/tags/`, {
      method: 'POST', body: JSON.stringify({ tag_uuids }), csrfToken,
    }),

  removeTag: (uuid: string, tag_uuid: string, csrfToken: string) =>
    apiFetch<{ status: string }>(`/v1/sessions/${uuid}/tags/${tag_uuid}/`, {
      method: 'DELETE', csrfToken,
    }),

  assignCase: (uuid: string, case_uuid: string | null, csrfToken: string) =>
    apiFetch<{ status: string; case_uuid: string | null }>(`/v1/sessions/${uuid}/case/`, {
      method: 'PATCH', body: JSON.stringify({ case_uuid }), csrfToken,
    }),


};

// ─── Cases ────────────────────────────────────────────────────────────────────

export const casesApi = {
  list: (workspace_uuid?: string) => {
    const qs = workspace_uuid ? `?workspace_uuid=${workspace_uuid}` : '';
    return apiFetch<Case[]>(`/v1/cases/${qs}`);
  },
  create: (payload: { name: string; description?: string; workspace_uuid?: string }, csrfToken: string) =>
    apiFetch<Case>('/v1/cases/', { method: 'POST', body: JSON.stringify(payload), csrfToken }),
  get: (uuid: string) => apiFetch<Case>(`/v1/cases/${uuid}/`),
  update: (uuid: string, payload: Partial<Case>, csrfToken: string) =>
    apiFetch<Case>(`/v1/cases/${uuid}/`, { method: 'PATCH', body: JSON.stringify(payload), csrfToken }),
  delete: (uuid: string, csrfToken: string) =>
    apiFetch<{ status: string }>(`/v1/cases/${uuid}/`, { method: 'DELETE', csrfToken }),
  listTags: (workspace_uuid?: string, personal?: boolean) => {
    const qs = new URLSearchParams();
    if (workspace_uuid) qs.set('workspace_uuid', workspace_uuid);
    else if (personal) qs.set('personal', 'true');
    const q = qs.toString();
    return apiFetch<Tag[]>(`/v1/cases/tags/${q ? '?' + q : ''}`);
  },
  createTag: (payload: { name: string; color?: string; workspace_uuid?: string }, csrfToken: string) =>
    apiFetch<Tag>('/v1/cases/tags/', { method: 'POST', body: JSON.stringify(payload), csrfToken }),
  listComments: (caseUuid: string) =>
    apiFetch<CaseComment[]>(`/v1/cases/${caseUuid}/comments/`),
  addComment: (caseUuid: string, body: string, csrfToken: string) =>
    apiFetch<CaseComment>(`/v1/cases/${caseUuid}/comments/`, { method: 'POST', body: JSON.stringify({ body }), csrfToken }),
  editComment: (caseUuid: string, commentUuid: string, body: string, csrfToken: string) =>
    apiFetch<CaseComment>(`/v1/cases/${caseUuid}/comments/${commentUuid}/`, { method: 'PATCH', body: JSON.stringify({ body }), csrfToken }),
  deleteComment: (caseUuid: string, commentUuid: string, csrfToken: string) =>
    apiFetch<{ status: string }>(`/v1/cases/${caseUuid}/comments/${commentUuid}/`, { method: 'DELETE', csrfToken }),
  listAttachments: (caseUuid: string) =>
    apiFetch<CaseAttachment[]>(`/v1/cases/${caseUuid}/attachments/`),
  uploadAttachment: async (caseUuid: string, file: File, csrfToken: string): Promise<CaseAttachment> => {
    const form = new FormData();
    form.append('file', file);
    const API_BASE = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://127.0.0.1:8000/api/';
    const res = await fetch(`${API_BASE.replace(/\/$/, '')}/v1/cases/${caseUuid}/attachments/`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-CSRFToken': csrfToken },
      body: form,
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  deleteAttachment: (caseUuid: string, attachmentUuid: string, csrfToken: string) =>
    apiFetch<{ status: string }>(`/v1/cases/${caseUuid}/attachments/${attachmentUuid}/`, { method: 'DELETE', csrfToken }),
};

// ─── Workspaces ───────────────────────────────────────────────────────────────

export const workspacesApi = {
  list: () => apiFetch<Workspace[]>('/v1/workspaces/'),
  create: (payload: { name: string; slug: string }, csrfToken: string) =>
    apiFetch<Workspace>('/v1/workspaces/', { method: 'POST', body: JSON.stringify(payload), csrfToken }),
  getBySlug: (slug: string) => apiFetch<Workspace>(`/v1/workspaces/by-slug/${slug}/`),
  get: (uuid: string) => apiFetch<Workspace>(`/v1/workspaces/${uuid}/`),
  update: (uuid: string, payload: Partial<Pick<Workspace, 'name' | 'max_concurrent_sessions_per_member' | 'idle_timeout_minutes' | 'max_session_duration_hours' | 'enable_network_logging' | 'enable_file_protection' | 'enable_persistent_storage'>>, csrfToken: string) =>
    apiFetch<Workspace>(`/v1/workspaces/${uuid}/`, { method: 'PATCH', body: JSON.stringify(payload), csrfToken }),
  delete: (uuid: string, csrfToken: string) =>
    apiFetch<{ status: string }>(`/v1/workspaces/${uuid}/`, { method: 'DELETE', csrfToken }),
  listMembers: (uuid: string) => apiFetch<WorkspaceMember[]>(`/v1/workspaces/${uuid}/members/`),
  searchUsers: (uuid: string, q: string) =>
    apiFetch<{ id: number; email: string; first_name: string; last_name: string }[]>(
      `/v1/workspaces/${uuid}/search-users/?q=${encodeURIComponent(q)}`
    ),
  inviteMember: (uuid: string, payload: { email: string; role?: string }, csrfToken: string) =>
    apiFetch<WorkspaceMember>(`/v1/workspaces/${uuid}/members/`, { method: 'POST', body: JSON.stringify(payload), csrfToken }),
  removeMember: (uuid: string, user_id: number, csrfToken: string) =>
    apiFetch<{ status: string }>(`/v1/workspaces/${uuid}/members/${user_id}/`, { method: 'DELETE', csrfToken }),
  changeMemberRole: (uuid: string, user_id: number, role: string, csrfToken: string) =>
    apiFetch<WorkspaceMember>(`/v1/workspaces/${uuid}/members/${user_id}/`, { method: 'PATCH', body: JSON.stringify({ role }), csrfToken }),
  getSessions: (uuid: string) => apiFetch<SessionDetail[]>(`/v1/workspaces/${uuid}/sessions/`),
  getHistory: (uuid: string) => apiFetch<SessionHistory[]>(`/v1/workspaces/${uuid}/history/`),

  leaveWorkspace: (uuid: string, csrfToken: string) =>
    apiFetch<{ status: string }>(`/v1/workspaces/${uuid}/leave/`, { method: 'POST', csrfToken }),

  uploadLogo: async (uuid: string, file: File, csrfToken: string): Promise<Workspace> => {
    const API_BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://127.0.0.1:8000/api/';
    const form = new FormData();
    form.append('logo', file);
    const res = await fetch(`${API_BASE_URL.replace(/\/$/, '')}/v1/workspaces/${uuid}/logo/`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-CSRFToken': csrfToken },
      body: form,
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  deleteLogo: (uuid: string, csrfToken: string) =>
    apiFetch<{ status: string }>(`/v1/workspaces/${uuid}/logo/`, { method: 'DELETE', csrfToken }),

  getDashboard: (uuid: string) =>
    apiFetch<WorkspaceDashboard>(`/v1/workspaces/${uuid}/dashboard/`),
};

// ─── Account ──────────────────────────────────────────────────────────────────

export interface SiteSettings {
  allow_registration: boolean;
  allow_personal_workspaces: boolean;
  allow_workspace_creation: boolean;
  oidc_enabled: boolean;
  oidc_provider_type: string;
  oidc_client_id: string;
  oidc_server_url: string;
  oidc_client_secret_set: boolean;
  default_idle_timeout_minutes: number;
  default_max_concurrent_sessions: number;
  default_max_session_duration_hours: number | null;
  /** Slugs that all (non-personal) workspaces may pick from. Empty = all allowed. */
  global_allowed_browser_slugs: string[];
  /** Slugs that personal workspaces get by default. Empty = all globally allowed. */
  default_personal_browser_slugs: string[];
  /** When true, workspace admins may enable network logging for their workspace. */
  enable_network_logging: boolean;
  /** When true, workspace admins may enable file protection for their workspace. */
  enable_file_protection: boolean;
  /** When true, workspace admins may enable persistent S3 storage for their workspace. */
  enable_persistent_storage: boolean;
  /** vCPU for standard browser sessions (Chrome, Firefox, etc.) */
  browser_vcpu: number;
  /** RAM in GB for standard browser sessions */
  browser_memory_gb: number;
  /** vCPU for OS-based sessions (Kali, Ubuntu, Alpine) */
  os_vcpu: number;
  /** RAM in GB for OS-based sessions */
  os_memory_gb: number;
}

export interface AdminUser {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
  is_admin: boolean;
  date_joined: string;
  generated_password?: string;
}

export interface AnalyticsUserRow {
  user_id: number;
  email: string;
  name: string;
  session_count: number;
  total_cost_usd: number;
}

export interface AnalyticsAppRow {
  slug: string;
  display_name: string;
  session_count: number;
}

export interface AnalyticsWorkspaceRow {
  uuid: string;
  name: string;
  session_count: number;
  total_cost_usd: number;
}

export interface SessionsPerDayRow {
  date: string;     // "YYYY-MM-DD"
  sessions: number;
  cost_usd: number;
}

export interface AdminAnalytics {
  total_cost_usd: number;
  active_sessions: number;
  total_sessions: number;
  avg_session_duration_seconds: number;
  total_open_cases: number;
  total_workspaces: number;
  sessions_per_day: SessionsPerDayRow[];
  most_active_users: AnalyticsUserRow[];
  most_used_apps: AnalyticsAppRow[];
  most_active_workspaces: AnalyticsWorkspaceRow[];
  cost_per_user: AnalyticsUserRow[];
  cost_per_workspace: AnalyticsWorkspaceRow[];
}

export interface AdminSearchResult {
  users: { id: number; email: string; name: string }[];
  workspaces: { uuid: string; name: string }[];
}

export interface AdminWorkspace {
  id: number;
  uuid: string;
  name: string;
  slug: string;
  created_at: string;
  created_by_email: string | null;
  member_count: number;
}

export interface AdminWorkspaceMember {
  user_id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  joined_at: string;
}

export const adminApi = {
  getSiteSettings: () => apiFetch<SiteSettings>('/accounts/site-settings'),
  updateSiteSettings: (payload: Partial<Omit<SiteSettings, 'oidc_client_secret_set'> & { oidc_client_secret?: string }>, csrfToken: string) =>
    apiFetch<SiteSettings>('/accounts/site-settings', { method: 'PATCH', body: JSON.stringify(payload), csrfToken }),

  listUsers: () => apiFetch<AdminUser[]>('/accounts/admin/users'),
  checkEmail: (email: string) =>
    apiFetch<{ available: boolean }>(`/accounts/admin/check-email?email=${encodeURIComponent(email)}`),
  createUser: (payload: { email: string; first_name?: string; last_name?: string; is_admin?: boolean }, csrfToken: string) =>
    apiFetch<AdminUser>('/accounts/admin/users', { method: 'POST', body: JSON.stringify(payload), csrfToken }),
  updateUser: (id: number, payload: { is_admin?: boolean; is_active?: boolean; first_name?: string; last_name?: string; email?: string }, csrfToken: string) =>
    apiFetch<AdminUser>(`/accounts/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(payload), csrfToken }),
  resetPassword: (id: number, csrfToken: string) =>
    apiFetch<{ generated_password: string }>(`/accounts/admin/users/${id}/reset-password`, { method: 'POST', csrfToken }),

  getWorkspaceBrowsers: (uuid: string) => apiFetch<string[]>(`/v1/workspaces/${uuid}/browsers/`),
  setWorkspaceBrowsers: (uuid: string, slugs: string[], csrfToken: string) =>
    apiFetch<string[]>(`/v1/workspaces/${uuid}/browsers/`, { method: 'PUT', body: JSON.stringify({ slugs }), csrfToken }),

  getAnalytics: (params?: {
    from_date?: string;
    to_date?: string;
    user_id?: number;
    workspace_uuid?: string;
  }) => {
    const qs = new URLSearchParams();
    if (params?.from_date) qs.set('from_date', params.from_date);
    if (params?.to_date) qs.set('to_date', params.to_date);
    if (params?.user_id != null) qs.set('user_id', String(params.user_id));
    if (params?.workspace_uuid) qs.set('workspace_uuid', params.workspace_uuid);
    const q = qs.toString();
    return apiFetch<AdminAnalytics>(`/accounts/admin/analytics${q ? '?' + q : ''}`);
  },

  searchEntities: (q: string) =>
    apiFetch<AdminSearchResult>(`/accounts/admin/search-entities?q=${encodeURIComponent(q)}`),

  // Workspace management
  listWorkspaces: (q?: string) => {
    const qs = q ? `?q=${encodeURIComponent(q)}` : '';
    return apiFetch<AdminWorkspace[]>(`/accounts/admin/workspaces${qs}`);
  },
  listWorkspaceMembers: (uuid: string) =>
    apiFetch<AdminWorkspaceMember[]>(`/accounts/admin/workspaces/${uuid}/members`),
  addWorkspaceMember: (uuid: string, payload: { email: string; role?: string }, csrfToken: string) =>
    apiFetch<AdminWorkspaceMember>(`/accounts/admin/workspaces/${uuid}/members`, {
      method: 'POST', body: JSON.stringify(payload), csrfToken,
    }),
  changeWorkspaceMemberRole: (uuid: string, user_id: number, role: string, csrfToken: string) =>
    apiFetch<AdminWorkspaceMember>(`/accounts/admin/workspaces/${uuid}/members/${user_id}`, {
      method: 'PATCH', body: JSON.stringify({ role }), csrfToken,
    }),
  removeWorkspaceMember: (uuid: string, user_id: number, csrfToken: string) =>
    apiFetch<{ success: boolean; message: string }>(`/accounts/admin/workspaces/${uuid}/members/${user_id}`, {
      method: 'DELETE', csrfToken,
    }),
};

export const notificationsApi = {
  list: () => apiFetch<Notification[]>('/v1/notifications/'),
  unreadCount: () => apiFetch<{ count: number }>('/v1/notifications/unread-count'),
  markRead: (uuid: string, csrfToken: string) =>
    apiFetch<{ updated: number }>(`/v1/notifications/${uuid}/read`, { method: 'POST', csrfToken }),
  markAllRead: (csrfToken: string) =>
    apiFetch<{ updated: number }>('/v1/notifications/read-all', { method: 'POST', csrfToken }),
};

export interface DjangoSession {
  session_key: string;
  last_activity: string | null;
  ip_address: string | null;
  user_agent: string | null;
  is_current: boolean;
}

export interface MFAStatus {
  totp_enabled: boolean;
  oidc_active: boolean;
}

export const accountApi = {
  me: () => apiFetch<{
    id: number; username: string; email: string;
    first_name: string; last_name: string; isAdmin: boolean; phone: string | null;
  }>('/accounts/me'),

  updateProfile: (payload: { first_name?: string; last_name?: string }, csrfToken: string) =>
    apiFetch('/accounts/profile', { method: 'PATCH', body: JSON.stringify(payload), csrfToken }),

  changePassword: (payload: { current_password: string; new_password: string }, csrfToken: string) =>
    apiFetch('/accounts/change-password', { method: 'POST', body: JSON.stringify(payload), csrfToken }),

  getLimits: () => apiFetch<UserLimits>('/accounts/limits'),

  listApiKeys: () => apiFetch<ApiKey[]>('/accounts/api-keys'),
  createApiKey: (payload: { name?: string }, csrfToken: string) =>
    apiFetch<ApiKey>('/accounts/api-keys', { method: 'POST', body: JSON.stringify(payload), csrfToken }),
  deleteApiKey: (uuid: string, csrfToken: string) =>
    apiFetch<{ success: boolean; message: string }>(`/accounts/api-keys/${uuid}`, { method: 'DELETE', csrfToken }),

  // Sessions
  listSessions: () => apiFetch<DjangoSession[]>('/accounts/sessions'),
  revokeSession: (sessionKey: string, csrfToken: string) =>
    apiFetch<{ success: boolean; message: string }>(`/accounts/sessions/${sessionKey}`, { method: 'DELETE', csrfToken }),

  // MFA
  getMFAStatus: () => apiFetch<MFAStatus>('/accounts/mfa/status'),
};
