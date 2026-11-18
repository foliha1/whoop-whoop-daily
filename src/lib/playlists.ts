export interface Playlist {
  id: string;
  label: string;
  url: string;
}

export const PLAYLISTS: Playlist[] = [
  {
    id: "whoop-whoop-house-mix",
    label: "Whoop! Whoop! House Mix",
    url: "https://soundcloud.com/foliha/sets/whoop-whoop-house-mix",
  },
  {
    id: "whoop-whoop-lofi-beats-mix",
    label: "Whoop! Whoop! Lofi Beats Mix",
    url: "https://soundcloud.com/foliha/sets/whoop-whoop-lofi-beats-mix",
  },
  {
    id: "test",
    label: "Test Playlist",
    url: "https://soundcloud.com/racesmusic/sets/races-god-gaming-playlist",
  },
];
