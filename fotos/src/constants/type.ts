export interface Album {
  coverImage?: any;
  date?: string | number | Date;
  id: string;
  name: string;
  userId: string;
  photoCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Photo {
  id: string;
  url: string;
  albumId: string;
  caption?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AlbumCardProps {
  album: Album;
  userId?: string;
  onAlbumModified?: () => (void );
}

export type Camera = {
  id: string;
  name: string;
};

export type ConnectionDetails = {
  host: string;
  port: number;
  username: string;
  password: string;
  mode: string;
};

