import type {
  User, Profile, Photo, DiscoverProfile, LikeResult, MatchWithProfile, Message,
  MatchStatus, ChatInfo, CloseReason, Gender, PromptAnswer, Story, StoryFeedGroup,
  ChatMediaUpload,
} from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("kindling_token");
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  auth: boolean = true
): Promise<T> {
  const headers: Record<string, string> = { ...(options.headers as Record<string, string>) };
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  if (auth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      // response wasn't JSON; fall back to statusText
    }
    throw new ApiError(res.status, detail);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export function getApiUrl(path: string) {
  return `${API_URL}${path}`;
}

export function getWsUrl(matchId: string): string {
  const token = getToken();
  const wsBase = API_URL.replace(/^http/, "ws");
  return `${wsBase}/chat/ws/${matchId}?token=${token}`;
}

// ---- Auth ----

export const auth = {
  signup: (email: string, password: string) =>
    request<{ access_token: string }>("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }, false),

  login: (email: string, password: string) =>
    request<{ access_token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }, false),

  me: () => request<User>("/auth/me"),
};

// ---- Profile ----

export const profile = {
  upsert: (data: {
    first_name: string;
    birthdate: string;
    gender: Gender;
    gender_preference: Gender[];
    bio?: string;
    prompts?: PromptAnswer[];
    latitude?: number | null;
    longitude?: number | null;
    max_distance_km?: number;
    age_min?: number;
    age_max?: number;
  }) =>
    request<Profile>("/profile", { method: "POST", body: JSON.stringify(data) }),

  me: () => request<Profile>("/profile/me"),
};

// ---- Photos ----

export const photos = {
  upload: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<Photo>("/photos/upload", { method: "POST", body: form });
  },
  list: () => request<Photo[]>("/photos/me"),
  setPrimary: (photoId: string) =>
    request<Photo>(`/photos/${photoId}/primary`, { method: "PATCH" }),
  remove: (photoId: string) =>
    request<{ status: string }>(`/photos/${photoId}`, { method: "DELETE" }),
};

// ---- Matching ----

export const matching = {
  discover: (limit = 20) => request<DiscoverProfile[]>(`/matching/discover?limit=${limit}`),
  like: (toUserId: string, comment?: string) =>
    request<LikeResult>("/matching/like", {
      method: "POST",
      body: JSON.stringify({ to_user_id: toUserId, comment }),
    }),
  pass: (toUserId: string) =>
    request<{ status: string }>("/matching/pass", {
      method: "POST",
      body: JSON.stringify({ to_user_id: toUserId }),
    }),
  matches: () => request<MatchWithProfile[]>("/matching/matches"),
};

// ---- Chat ----

export const chat = {
  info: (matchId: string) => request<ChatInfo>(`/chat/${matchId}/info`),
  messages: (matchId: string) => request<Message[]>(`/chat/${matchId}/messages`),
  markRead: (matchId: string) =>
    request<{ marked_read: number }>(`/chat/${matchId}/read`, { method: "POST" }),
  status: (matchId: string) => request<MatchStatus>(`/chat/${matchId}/status`),
  close: (matchId: string, reason: CloseReason, note?: string) =>
    request<{ status: string; closure_message_id: string | null }>(`/chat/${matchId}/close`, {
      method: "POST",
      body: JSON.stringify({ reason, note }),
    }),
  uploadMedia: (matchId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<ChatMediaUpload>(`/chat/${matchId}/media`, { method: "POST", body: form });
  },
};

// ---- Safety ----

export const safety = {
  block: (userId: string) =>
    request(`/safety/block`, { method: "POST", body: JSON.stringify({ user_id: userId }) }),
  report: (userId: string, reason: string, details?: string, blockToo = true) =>
    request(`/safety/report`, {
      method: "POST",
      body: JSON.stringify({ user_id: userId, reason, details, block_too: blockToo }),
    }),
};

export function setToken(token: string) {
  localStorage.setItem("kindling_token", token);
}

export function clearToken() {
  localStorage.removeItem("kindling_token");
}

// ---- Stories ----

export const stories = {
  upload: (file: File, caption?: string) => {
    const form = new FormData();
    form.append("file", file);
    if (caption) form.append("caption", caption);
    return request<Story>("/stories/upload", { method: "POST", body: form });
  },
  mine: () => request<Story[]>("/stories/me"),
  feed: () => request<StoryFeedGroup[]>("/stories/feed"),
  remove: (storyId: string) =>
    request<{ status: string }>(`/stories/${storyId}`, { method: "DELETE" }),
};
