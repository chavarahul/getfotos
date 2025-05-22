import { useState, useEffect } from "react";
import AlbumHeader from "../components/album/AlbumHeader";
import AlbumCard from "../components/album/AlbumCard";
import { PageLoader, ErrorDisplay } from "../components/common/loaders";
import axiosInstance from "../utils/api";
import type { Album } from "../constants/type";

const Dashboard: React.FC = () => {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchAlbums = async () => {
      try {
        setIsLoading(true);
        const response = await axiosInstance.get<Album[]>("/api/albums");
        setAlbums(response.data);
        setError(null);
      } catch (err: any) {
        setError(err.response?.data?.error || "Failed to fetch albums");
      } finally {
        setIsLoading(false);
      }
    };

    fetchAlbums();

    const handleAlbumRefresh = () => fetchAlbums();
    window.addEventListener("albumRefresh", handleAlbumRefresh);
    return () => {
      window.removeEventListener("albumRefresh", handleAlbumRefresh);
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="mx-auto max-w-7xl p-6">
        <AlbumHeader />
        {isLoading ? (
          <div className="h-screen bg-gray-100 flex items-center justify-center -mt-10">
            <PageLoader />
          </div>
        ) : error ? (
          <ErrorDisplay message={error} />
        ) : albums.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)]">
            <svg
              className="h-16 w-16 text-gray-400 mb-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16l4-4 4 4 4-4 4 4m-12-8h8m-4-4v8"
              />
            </svg>
            <p className="text-gray-500 text-lg">
              No albums yet. Create your first album!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {albums.map((album) => (
              <AlbumCard key={album.id} album={album} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;