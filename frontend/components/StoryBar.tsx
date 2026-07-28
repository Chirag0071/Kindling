"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { stories as storiesApi, getApiUrl, ApiError } from "@/lib/api";
import StoryViewer from "./StoryViewer";
import type { Story, StoryFeedGroup } from "@/lib/types";

export default function StoryBar() {
  const [myStories, setMyStories] = useState<Story[]>([]);
  const [feed, setFeed] = useState<StoryFeedGroup[]>([]);
  const [viewing, setViewing] = useState<{ firstName: string; stories: Story[] } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = () => {
    storiesApi.mine().then(setMyStories).catch(() => {});
    storiesApi.feed().then(setFeed).catch(() => {});
  };

  useEffect(load, []);

  const handleUpload = async (file: File) => {
    setError("");
    setUploading(true);
    try {
      await storiesApi.upload(file);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't post that story.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="mb-6">
      <div className="flex gap-4 overflow-x-auto pb-1 -mx-5 px-5">
        <button
          onClick={() => (myStories.length > 0
            ? setViewing({ firstName: "Your story", stories: myStories })
            : fileInputRef.current?.click())}
          disabled={uploading}
          className="flex flex-col items-center gap-1.5 shrink-0"
        >
          <div className={`relative h-16 w-16 rounded-full p-0.5 ${myStories.length > 0 ? "bg-ember" : "border border-dashed border-ash"}`}>
            <div className="relative h-full w-full rounded-full overflow-hidden bg-dusk-deep flex items-center justify-center">
              {myStories[0] ? (
                <Image src={getApiUrl(myStories[0].media_url)} alt="" fill className="object-cover" />
              ) : (
                <span className="text-slate text-xl font-display">{uploading ? "···" : "+"}</span>
              )}
            </div>
          </div>
          <span className="text-[11px] text-slate font-sans">Your story</span>
        </button>

        {feed.map((group) => (
          <button
            key={group.user_id}
            onClick={() => setViewing({ firstName: group.first_name, stories: group.stories })}
            className="flex flex-col items-center gap-1.5 shrink-0"
          >
            <div className="h-16 w-16 rounded-full p-0.5 bg-gradient-to-tr from-ember to-spark">
              <div className="relative h-full w-full rounded-full overflow-hidden bg-dusk-deep">
                <Image src={getApiUrl(group.stories[0].media_url)} alt={group.first_name} fill className="object-cover" />
              </div>
            </div>
            <span className="text-[11px] text-slate font-sans truncate w-16 text-center">{group.first_name}</span>
          </button>
        ))}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUpload(file);
          e.target.value = "";
        }}
      />
      {error && <p className="text-xs text-red-300 mt-1.5">{error}</p>}

      {viewing && (
        <StoryViewer
          firstName={viewing.firstName}
          stories={viewing.stories}
          onClose={() => { setViewing(null); load(); }}
        />
      )}
    </div>
  );
}
