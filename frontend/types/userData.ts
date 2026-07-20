export interface UserStateData {
  csrfToken: string;
  isLoggedIn: boolean | null;
  isLoading: boolean;

  id?: number;
  username?: string;
  email?: string;
  first_name?: string;
  last_name?: string;

  isAdmin: boolean;
  /** True when the user is an admin OR the site allows all users to create workspaces. */
  canCreateWorkspaces: boolean;
  /** Whether personal workspaces are enabled site-wide. */
  personalWorkspacesEnabled: boolean;
}