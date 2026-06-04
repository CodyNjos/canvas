import type { LiveMap } from "@liveblocks/client";

export const GRID_WIDTH = 200;
export const GRID_HEIGHT = 200;
export const CELL_SIZE = 6; // base cell size at zoom=1

// Augment Liveblocks global types
declare global {
  interface Liveblocks {
    Presence: {
      cursor: { x: number; y: number } | null;
      name: string;
      color: string;
    };
    Storage: {
      // Sparse pixel map: "x,y" -> "#hexcolor"
      // Only filled pixels are stored
      pixels: LiveMap<string, string>;
    };
  }
}
