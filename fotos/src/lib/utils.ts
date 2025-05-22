import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const emitAlbumRefresh = () => {
  window.dispatchEvent(new Event("albumRefresh"));
};

export const listenAlbumRefresh = (callback: () => void) => {
  window.addEventListener("albumRefresh", callback);
  return () => window.removeEventListener("albumRefresh", callback);
};
