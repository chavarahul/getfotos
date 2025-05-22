import Dexie, { type Table } from 'dexie';
import type { Album  } from '@/constants/type';
import axiosInstance from '@/utils/api';

interface PendingOperation {
  id?: number;
  type: 'create_album' | 'update_album' | 'delete_album' | 'add_photos' | 'delete_photo' | 'bulk_delete_photos';
  data: any;
  createdAt: string;
}

interface LocalPhoto {
  id: string;
  albumId: string;
  blob: Blob;
  url: string;
  caption?: string;
  createdAt: string;
}

interface CachedUser {
  id: string;
  token: string;
  user: any;
}

interface Settings {
  id: string;
  theme: string;
}

export class AppDB extends Dexie {
  albums!: Table<Album>;
  photos!: Table<LocalPhoto>;
  pendingOperations!: Table<PendingOperation>;
  users!: Table<CachedUser>;
  settings!: Table<Settings>;

  constructor() {
    super('AppDB');
    this.version(3).stores({
      albums: '++id, name, date, coverImage, photoCount',
      photos: '++id, albumId, caption, createdAt',
      pendingOperations: '++id, type, createdAt',
      users: 'id',
      settings: 'id',
    });
  }
}

export const db = new AppDB();

export const storePhotoBlob = async (albumId: string, file: File, caption?: string): Promise<LocalPhoto> => {
  const id = crypto.randomUUID();
  const blob = new Blob([await file.arrayBuffer()], { type: file.type });
  const url = URL.createObjectURL(blob);
  const photo: LocalPhoto = {
    id,
    albumId,
    blob,
    url,
    caption,
    createdAt: new Date().toISOString(),
  };
  await db.photos.put(photo);
  return photo;
};

export const queueOperation = async (type: PendingOperation['type'], data: any) => {
  await db.pendingOperations.add({
    type,
    data,
    createdAt: new Date().toISOString(),
  });
};

export const syncPendingOperations = async () => {
  if (!navigator.onLine) return;

  const operations = await db.pendingOperations.orderBy('createdAt').toArray();
  for (const op of operations) {
    try {
      switch (op.type) {
        case 'create_album': {
          const { data } = await axiosInstance.post('/api/albums', op.data);
          await db.albums.put({ ...op.data, id: data.id });
          break;
        }
        case 'update_album': {
          await axiosInstance.put(`/api/albums/${op.data.id}`, op.data.formData);
          await db.albums.update(op.data.id, op.data.formData);
          break;
        }
        case 'delete_album': {
          await axiosInstance.delete(`/api/albums/${op.data.id}`);
          await db.albums.delete(op.data.id);
          break;
        }
        case 'add_photos': {
          const { albumId, formData } = op.data;
          await axiosInstance.post(`/api/photos/album/${albumId}`, formData);
          const localPhotos = await db.photos.where({ albumId }).toArray();
          for (const photo of localPhotos) {
            URL.revokeObjectURL(photo.url);
            await db.photos.delete(photo.id);
          }
          break;
        }
        case 'delete_photo': {
          const { photoId, albumId } = op.data;
          await axiosInstance.delete(`/api/photos/${photoId}/album/${albumId}`);
          await db.photos.delete(photoId);
          break;
        }
        case 'bulk_delete_photos': {
          const { photoIds, albumId } = op.data;
          await Promise.all(
            photoIds.map((photoId: string) =>
              axiosInstance.delete(`/api/photos/${photoId}/album/${albumId}`)
            )
          );
          for (const photoId of photoIds) {
            await db.photos.delete(photoId);
          }
          break;
        }
      }
      await db.pendingOperations.delete(op.id!);
    } catch (error) {
      console.error(`Failed to sync operation ${op.type}:`, error);
    }
  }
};