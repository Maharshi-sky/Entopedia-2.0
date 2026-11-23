// The signed-in user's account (GET /user/profile), as Settings shows it.

export type NotificationPrefs = { email: boolean; push: boolean; digest: boolean; regulatory: boolean };

export type Profile = {
  name: string;
  email: string;
  role: string;
  createdAt: string | null;
  lastLogin: string | null;
  notifications: NotificationPrefs;
  /** Module slugs the user can open, with their access level. */
  modules: Record<string, string>;
};

/** Sent by Settings after the name changes, so the sidebar's profile row updates without a reload. */
export const PROFILE_CHANGED_EVENT = "entopedia:profile-changed";
