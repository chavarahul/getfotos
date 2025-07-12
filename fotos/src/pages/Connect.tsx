import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { PageLoader, ErrorDisplay } from "../components/common/loaders";
import ClientConnectForm from "./ClientConnectForm";
import type { Camera, Album } from "../constants/type";
import { ScrollArea } from "../components/ui/scroll-area";
import { Button } from "../components/ui/button";
import { debounce } from "lodash";

const cameras: Camera[] = [
  { id: "cam1", name: "Canon EOS R5" },
  { id: "cam2", name: "Sony Alpha 1" },
  { id: "cam3", name: "Nikon Z9" },
];

const fetchUser = async () => {
  const res = await window.electronAPI.loadUser();
  if (!res.success) throw new Error(res.error || "Failed to load user");
  return res.user;
};

const fetchAlbums = async (): Promise<Album[]> => {
  const albums = await window.electronAPI.getAlbums();
  return albums;
};

const Connect: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<any | null>(null);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [isUserLoading, setIsUserLoading] = useState(true);
  const [isAlbumsLoading, setIsAlbumsLoading] = useState(true);
  const [userError, setUserError] = useState<string | null>(null);
  const [albumsError, setAlbumsError] = useState<string | null>(null);
  const token = localStorage.getItem("token");

  useEffect(() => {
    if (!token) {
      navigate("/login", { replace: true });
    }
  }, [token, navigate]);

  const loadUser = async () => {
    setIsUserLoading(true);
    try {
      const userData = await fetchUser();
      setUser(userData);
      setUserError(null);
    } catch (err) {
      setUserError((err as any)?.message || "Failed to load user");
    } finally {
      setIsUserLoading(false);
    }
  };

  const loadAlbums = async () => {
    setIsAlbumsLoading(true);
    try {
      const albumData = await fetchAlbums();
      setAlbums(albumData);
      setAlbumsError(null);
    } catch (err) {
      setAlbumsError((err as any)?.message || "Failed to load albums");
    } finally {
      setIsAlbumsLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      loadUser();
    }
  }, [token]);

  useEffect(() => {
    if (user) {
      loadAlbums();
    }
  }, [user]);

  useEffect(() => {
    const handleAlbumRefresh = debounce(() => {
      loadAlbums();
    }, 300);

    window.addEventListener("albumRefresh", handleAlbumRefresh);
    return () => {
      window.removeEventListener("albumRefresh", handleAlbumRefresh);
      handleAlbumRefresh.cancel();
    };
  }, []);

  if (userError || albumsError) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <ErrorDisplay
          message={userError || albumsError || "Failed to load user or albums data"}
        />
        <Button
          onClick={() => {
            loadUser();
            loadAlbums();
          }}
          className="mt-4 bg-black text-white hover:bg-gray-800"
        >
          Retry
        </Button>
      </div>
    );
  }

  if (isUserLoading || isAlbumsLoading) {
    return (
      <div className="min-h-screen bg-[#F5F2ED] flex items-center justify-center">
        <PageLoader />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <ErrorDisplay message="User data not available" />
      </div>
    );
  }

  if (albums.length === 0) {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 max-w-md text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No Albums Found</h2>
          <p className="text-gray-600 mb-4">
            You don’t have any albums yet. Create an album to start connecting with your camera.
          </p>
          <Button
            onClick={() => navigate("/dashboard")}
            className="bg-black text-white hover:bg-gray-800"
          >
            Go to Dashboard
          </Button>
        </div>
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
          />
        </div>
      </motion.div>
    </ScrollArea>
  );
};

export default Connect;