import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { PageLoader, ErrorDisplay } from "../components/common/loaders";
import ClientConnectForm from "./ClientConnectForm";
import axiosInstance from "../utils/api";
import type { Album, Camera } from "../constants/type";
import { ScrollArea } from "../components/ui/scroll-area";

const cameras: Camera[] = [
  { id: "cam1", name: "Canon EOS R5" },
  { id: "cam2", name: "Sony Alpha 1" },
  { id: "cam3", name: "Nikon Z9" },
];

const Connect: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [albums, setAlbums] = useState<Album[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [user, setUser] = useState<{ id: string; name: string } | null>(null);

  const searchParams = useMemo(
    () => new URLSearchParams(location.search),
    [location.search]
  );

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const response = await axiosInstance.get<{ userId: string; name: string }>(
          "/api/auth/user-id"
        );
        setUser({ id: response.data.userId, name: response.data.name || "User" });
      } catch (err: any) {
        console.error("Fetch User Error:", err);
        navigate("/login");
      }
    };

    fetchUser();
  }, [navigate]);

  const fetchData = useCallback(async () => {
    if (!user?.id) return;
    try {
      setIsLoading(true);
      console.log("Fetching albums for Connect page");
      const albumData = await axiosInstance.get<Album[]>("/api/albums");
      console.log("Albums fetched:", albumData.data);
      setAlbums(albumData.data);
      setError(null);
    } catch (err: any) {
      console.error("Fetch Error:", err);
      setError(err.response?.data?.error || "Failed to load data");
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) {
      fetchData();
    }
  }, [user?.id, fetchData]);

  const token = localStorage.getItem("token");
  if (!token) {
    navigate("/login");
    return null;
  }

  if (!user || isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <PageLoader />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <ErrorDisplay message={error} />
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
            username={user.name}
            searchParams={Object.fromEntries(searchParams)}
          />
        </div>
      </motion.div>
    </ScrollArea>
  );
};

export default Connect;