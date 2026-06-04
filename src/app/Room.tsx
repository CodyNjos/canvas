"use client";

import { ReactNode } from "react";
import { LiveMap } from "@liveblocks/client";
import { LiveblocksProvider, RoomProvider, ClientSideSuspense } from "@liveblocks/react";
import "./liveblocks.config"; // import for type augmentation

const RANDOM_NAMES = [
  "Fox", "Owl", "Bear", "Wolf", "Hawk", "Deer", "Lynx", "Crow",
  "Hare", "Dove", "Orca", "Moth", "Newt", "Frog", "Swan", "Pike",
];

const RANDOM_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6",
];

function getRandomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const userName = getRandomItem(RANDOM_NAMES);
const userColor = getRandomItem(RANDOM_COLORS);

export function Room({
  children,
  roomId = "canvas:v2",
}: {
  children: ReactNode;
  roomId?: string;
}) {
  return (
    <LiveblocksProvider publicApiKey={process.env.NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY!} throttle={16}>
      <RoomProvider
        id={roomId}
        initialPresence={{
          cursor: null,
          name: userName,
          color: userColor,
        }}
        initialStorage={{
          pixels: new LiveMap<string, string>(),
        }}
      >
        <ClientSideSuspense
          fallback={
            <div className="flex h-screen flex-col items-center justify-center bg-background">
              <span className="mb-3 text-sm font-bold tracking-widest text-scheels-red">
                SCHEELS
              </span>
              <span className="text-xs text-muted">Loading canvas...</span>
            </div>
          }
        >
          {children}
        </ClientSideSuspense>
      </RoomProvider>
    </LiveblocksProvider>
  );
}
