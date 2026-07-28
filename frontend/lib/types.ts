export interface User {
  id: string;
  email: string;
  is_verified: boolean;
  is_photo_verified: boolean;
  created_at: string;
}

export type Gender = "man" | "woman" | "nonbinary" | "other";

export interface PromptAnswer {
  prompt: string;
  answer: string;
}

export interface Profile {
  id: string;
  user_id: string;
  first_name: string;
  birthdate: string;
  gender: Gender;
  gender_preference: Gender[];
  bio: string;
  prompts: PromptAnswer[];
  latitude: number | null;
  longitude: number | null;
  max_distance_km: number;
  age_min: number;
  age_max: number;
  is_complete: boolean;
}

export interface Photo {
  id: string;
  url: string;
  position: number;
  is_primary: boolean;
}

export interface DiscoverProfile {
  user_id: string;
  first_name: string;
  age: number;
  bio: string | null;
  prompts: PromptAnswer[];
  distance_km: number | null;
  photos: string[];
}

export interface LikeResult {
  matched: boolean;
  match_id: string | null;
}

export interface Match {
  id: string;
  user1_id: string;
  user2_id: string;
  created_at: string;
}

export interface MatchWithProfile {
  id: string;
  created_at: string;
  other_user_id: string;
  other_first_name: string;
  other_photo_url: string | null;
  last_message_preview: string | null;
  last_message_at: string | null;
  has_unread: boolean;
}

export interface ChatInfo {
  match_id: string;
  is_active: boolean;
  other_user_id: string;
  other_first_name: string;
  other_photo_url: string | null;
}

export interface ChatMediaUpload {
  url: string;
  media_type: "image" | "video";
}

export interface Story {
  id: string;
  user_id: string;
  media_url: string;
  caption: string | null;
  created_at: string;
  expires_at: string;
}

export interface StoryFeedGroup {
  user_id: string;
  first_name: string;
  stories: Story[];
}

export interface Message {
  id: string;
  match_id: string;
  sender_id: string;
  content: string | null;
  media_url: string | null;
  sent_at: string;
  read_at: string | null;
}

export interface MatchStatus {
  match_id: string;
  last_message_at: string | null;
  last_message_sender_id: string | null;
  hours_since_last_message: number | null;
  needs_response: boolean;
  is_stale: boolean;
}

export type CloseReason =
  | "not_feeling_it"
  | "met_someone_else"
  | "distance"
  | "timing_not_right"
  | "no_longer_using_app"
  | "other";
