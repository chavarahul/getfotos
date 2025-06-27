import AlbumHeader from "../components/album/AlbumHeader";
import AlbumCard from "../components/album/AlbumCard";
import { PageLoader, ErrorDisplay } from "../components/common/loaders";
import type { Album } from "../constants/type";
import { useQuery } from "@tanstack/react-query";

const fetchAlbums = async (): Promise<Album[]> => {
  const result = await window.electronAPI.getAlbums();
  return result;
};

const Dashboard: React.FC = () => {
  const { data: albums = [], isLoading, error } = useQuery({
    queryKey: ["albums"],
    queryFn: fetchAlbums,
    staleTime: 1000 * 5,
    refetchInterval: 1000 * 5,
    retry: 1,
  });

  if (isLoading && !albums.length) {
    return (
      <div className="h-screen bg-[#F5F2ED] flex items-center justify-center -mt-10">
        <PageLoader />
      </div>
    );
  }

  if (error) {
    return (
      <ErrorDisplay message={(error as any)?.message || "Failed to fetch albums"} />
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F2ED]">
      <div className="mx-auto max-w-7xl p-6">
        <AlbumHeader />
        {albums.length === 0 ? (
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
