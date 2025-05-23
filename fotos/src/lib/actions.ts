import type { Album, Photo } from "@/constants/type";
import axiosInstance from "@/utils/api";

export const fetchUser = async () => {
  const { data } = await axiosInstance.get<{ userId: string; name: string }>(
    "/api/auth/verify-token"
  );
  if (!data.name || data.name.trim() === "") {
    throw new Error("User name is missing or invalid");
  }
  return { id: data.userId, name: data.name.trim().replace(/\s+/g, "") };
};

export const fetchAlbums = async (userId: string) => {
  if (!userId) {
    throw new Error("User ID is required to fetch albums");
  }
  const { data } = await axiosInstance.get<Album[]>(`/api/albums?userId=${userId}`);
  return data ?? [];
};

export const fetchAlbum = async (id: string) => {
  const { data } = await axiosInstance.get<Album>(`/api/albums/${id}`);
  return data || [];
};

export const fetchPhotos = async (id: string) => {
  const { data } = await axiosInstance.get<Photo[]>(`/api/photos/album/${id}`);
  return data || [];
};