import { useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { PageLoader, ErrorDisplay } from "../components/common/loaders";
import ClientConnectForm from "./ClientConnectForm";
import axiosInstance from "../utils/api";
import type { Album, Camera } from "../constants/type";
import { ScrollArea } from "../components/ui/scroll-area";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const cameras: Camera[] = [
  { id: "cam1", name: "Canon EOS R5" },
  { id: "cam2", name: "Sony Alpha 1" },
  { id: "cam3", name: "Nikon Z9" },
];

const fetchUser = async () => {
  const { data } = await axiosInstance.get<{ userId: string; name: string }>(
    "/api/auth/user-id"
  );
  return { id: data.userId, name: data.name || "User" };
};

const fetchAlbums = async (userId: string) => {
  const { data } = await axiosInstance.get<Album[]>(`/api/albums?userId=${userId}`);
  return data;
};

const Connect: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const token = localStorage.getItem("token");

  // Redirect to login if no token
  useEffect(() => {
    if (!token) {
      navigate("/login", { replace: true });
    }
  }, [token, navigate]);

  // Memoize search params
  const searchParams = useMemo(
    () => Object.fromEntries(new URLSearchParams(location.search)),
    [location.search]
  );

  // Fetch user data (no polling needed for user)
  const { data: user, isLoading: isUserLoading, error: userError } = useQuery({
    queryKey: ["user"],
    queryFn: fetchUser,
    enabled: !!token,
    retry: 1,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });

  // Fetch albums with 5-second polling
  const { data: albums = [], isLoading: isAlbumsLoading, error: albumsError } = useQuery({
    queryKey: ["albums", user?.id],
    queryFn: () => fetchAlbums(user!.id),
    enabled: !!user?.id,
    staleTime: 1000 * 5, // Consider data stale after 5 seconds
    refetchInterval: 1000 * 5, // Poll every 5 seconds
    retry: 1,
  });

  // Handle album refresh event
  useEffect(() => {
    const handleAlbumRefresh = () => {
      if (user?.id) {
        queryClient.invalidateQueries({ queryKey: ["albums", user.id] });
      }
    };
    window.addEventListener("albumRefresh", handleAlbumRefresh);
    return () => {
      window.removeEventListener("albumRefresh", handleAlbumRefresh);
    };
  }, [user?.id, queryClient]);

  // Handle errors
  if (userError || albumsError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <ErrorDisplay
          message={
            (userError as any)?.response?.data?.error ||
            (albumsError as any)?.response?.data?.error ||
            "Failed to load data"
          }
        />
      </div>
    );
  }

  // Show loading only for initial load
  if (isUserLoading || (isAlbumsLoading && !albums.length)) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <PageLoader />
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1 min-h-60">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="min-h-screen bg-gray-100 overflow-y-auto"
      >
        <div className="mx-auto max-w-7xl p-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">
            Connect with your Camera
          </h1>
          <ClientConnectForm
            cameras={cameras}
            albums={albums}
            username={user!.name}
            searchParams={searchParams}
          />
        </div>
      </motion.div>
    </ScrollArea>
  );
};

export default Connect;