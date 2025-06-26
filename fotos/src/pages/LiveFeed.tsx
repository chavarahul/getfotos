import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "../components/ui/card";

interface ImageStreamData {
  action: string;
  imageUrl?: string;
  filePath?: string;
  error?: string;
}

const LiveFeed: React.FC = () => {
  const [images, setImages] = useState<string[]>(() => {
    const ftpCleared = localStorage.getItem("ftpCleared");
    if (ftpCleared === "true") {
      return [];
    }
    const savedImages = localStorage.getItem("liveFeedImages");
    return savedImages ? JSON.parse(savedImages) : [];
  });

  const [pendingImages, setPendingImages] = useState<string[]>(() => {
    const savedPendingImages = localStorage.getItem("pendingImages");
    return savedPendingImages ? JSON.parse(savedPendingImages) : [];
  });

  const [syncedCount, setSyncedCount] = useState<number>(() => {
    const savedSyncedCount = localStorage.getItem("syncedCount");
    return savedSyncedCount ? parseInt(savedSyncedCount, 10) : 0;
  });

  const [isConnected, setIsConnected] = useState<boolean>(() => !!localStorage.getItem("ftpCredentials"));

  useEffect(() => {
    // Persist images, pendingImages, and syncedCount to localStorage whenever they change
    localStorage.setItem("liveFeedImages", JSON.stringify(images));
    localStorage.setItem("pendingImages", JSON.stringify(pendingImages));
    localStorage.setItem("syncedCount", syncedCount.toString());
  }, [images, pendingImages, syncedCount]);

  useEffect(() => {
    const handleImageStream = (data: ImageStreamData) => {
      console.log("Received image-stream event:", data);

      const normalizePath = (path: string | undefined) =>
        path ? path.replace(/\\/g, "/").toLowerCase() : "";

      if (data.action === "pending" && data.filePath) {
        const normalizedPath = normalizePath(data.filePath);
        setPendingImages((prev) => {
          if (prev.includes(normalizedPath)) return prev;
          const newPending = [...prev, normalizedPath];
          console.log("Added to pendingImages:", newPending);
          return newPending;
        });

        setTimeout(() => {
          setPendingImages((prev) =>
            prev.filter((path) => path !== normalizedPath)
          );
        }, 30000);
      } else if (data.action === "add" && data.imageUrl && data.filePath) {
        const normalizedPath = normalizePath(data.filePath);
        setImages((prev) => {
          let updatedImages = prev;
          if (prev.length === 0) {
            const ftpCleared = localStorage.getItem("ftpCleared");
            if (ftpCleared !== "true") {
              const savedImages = localStorage.getItem("liveFeedImages");
              updatedImages = savedImages ? JSON.parse(savedImages) : [];
            }
          }

          if (updatedImages.includes(data.imageUrl)) {
            console.log("Duplicate image URL, skipping:", data.imageUrl);
            return updatedImages;
          }

          updatedImages = [data.imageUrl, ...updatedImages].slice(0, 50);
          console.log("Added image to feed:", data.imageUrl, "Total images:", updatedImages.length);
          return updatedImages;
        });

        setPendingImages((prev) => {
          const newPending = prev.filter((path) => path !== normalizedPath);
          console.log("Removed from pendingImages:", newPending);
          setSyncedCount((prevCount) => {
            const newCount = images.length + 1;
            console.log("Updated syncedCount:", newCount);
            return newCount;
          });
          return newPending;
        });
      } else if (data.action === "error" && data.filePath) {
        const normalizedPath = normalizePath(data.filePath);
        setPendingImages((prev) => {
          const newPending = prev.filter((path) => path !== normalizedPath);
          console.log("Error received, removed from pendingImages:", newPending);
          return newPending;
        });
      }
    };

    const handleClearCredentials = () => {
      setIsConnected(false);
      setSyncedCount(0);
      setPendingImages([]);
      setImages([]);
      localStorage.setItem("liveFeedImages", JSON.stringify([]));
      localStorage.setItem("pendingImages", JSON.stringify([]));
      localStorage.setItem("syncedCount", "0");
      console.log("Cleared credentials and reset state");
    };

    const handleWindowClose = () => {
      // Clear all data when the window is closed
      setIsConnected(false);
      setSyncedCount(0);
      setPendingImages([]);
      setImages([]);
      localStorage.setItem("liveFeedImages", JSON.stringify([]));
      localStorage.setItem("pendingImages", JSON.stringify([]));
      localStorage.setItem("syncedCount", "0");
      localStorage.removeItem("ftpCredentials");
      localStorage.setItem("ftpCleared", "true");
      console.log("Window closed, cleared all data");
    };

    const electronAPI = window.electronAPI || {};
    if (typeof electronAPI.onClearCredentials === "function") {
      electronAPI.onClearCredentials(handleClearCredentials);
    } else {
      console.warn("window.electronAPI.onClearCredentials is not available");
    }

    if (typeof electronAPI.onImageStream === "function") {
      electronAPI.onImageStream(handleImageStream);
    } else {
      console.error("window.electronAPI.onImageStream is not available");
    }

    window.addEventListener("beforeunload", handleWindowClose);

    const checkConnection = () => {
      const connected = !!localStorage.getItem("ftpCredentials");
      setIsConnected(connected);
      if (!connected) {
        setSyncedCount(0);
        setPendingImages([]);
        setImages([]);
        localStorage.setItem("liveFeedImages", JSON.stringify([]));
        localStorage.setItem("pendingImages", JSON.stringify([]));
        localStorage.setItem("syncedCount", "0");
      }
    };

    const connectionInterval = setInterval(checkConnection, 1000);

    const resetCheck = () => {
      if (pendingImages.length === 0 && images.length === 0) {
        setSyncedCount(0);
        localStorage.setItem("syncedCount", "0");
      }
    };

    const resetInterval = setInterval(resetCheck, 1000);
    console.log(images)

    return () => {
      if (typeof electronAPI.removeImageStreamListener === "function") {
        electronAPI.removeImageStreamListener(handleImageStream);
      } else {
        console.warn("window.electronAPI.removeImageStreamListener is not available");
      }

      if (typeof electronAPI.removeClearCredentialsListener === "function") {
        electronAPI.removeClearCredentialsListener(handleClearCredentials);
      } else {
        console.warn("window.electronAPI.removeClearCredentialsListener is not defined, skipping cleanup");
      }

      window.removeEventListener("beforeunload", handleWindowClose);

      clearInterval(connectionInterval);
      clearInterval(resetInterval);
      console.log("Cleaned up listeners and intervals");
    };
  }, [pendingImages.length, images.length]);

  const totalImages = pendingImages.length + images.length;
  const cappedSyncedCount = Math.min(syncedCount, totalImages);
  const progressPercentage = totalImages > 0 ? (cappedSyncedCount / totalImages) * 100 : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Live Feed</CardTitle>
      </CardHeader>
      <CardContent>
        {!isConnected ? (
          <div className="flex flex-col items-center justify-center py-6">
            <div className="h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <svg
                className="h-8 w-8 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                />
              </svg>
            </div>
            <p className="text-lg font-semibold text-gray-800">No Camera Connected</p>
            <p className="text-gray-500 text-center mt-2">
              Use the connection wizard to connect your camera and start transferring photos.
            </p>
          </div>
        ) : (
          <>
            {(pendingImages.length > 0 || images.length > 0) && (
              <div className="flex items-center justify-between py-2">
                <p className="text-gray-600">Transferring files</p>
                <p className="text-gray-800 font-medium">
                  {cappedSyncedCount}/{totalImages} files
                </p>
              </div>
            )}
            {images.length === 0 && pendingImages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6">
                <svg
                  className="h-12 w-12 text-gray-400 mb-4"
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
                <p className="text-gray-500 text-center">No images in feed yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {images.map((imageUrl, index) => (
                  <img
                    key={index}
                    src={imageUrl}
                    alt={`Live feed image ${index}`}
                    className="w-full h-48 object-cover rounded-lg"
                    onError={(e) => {
                      console.error(`Failed to load image ${index}: ${imageUrl}`);
                      e.currentTarget.style.display = "none";
                    }}
                  />
                ))}
              </div>
            )}
            {(pendingImages.length > 0 || images.length > 0) && (
              <div className="mt-4 w-full h-2 bg-gray-300 rounded-full overflow-hidden shadow-sm">
                <div
                  className="h-full bg-gray-500 transition-all duration-300 ease-in-out"
                  style={{ width: `${progressPercentage}%` }}
                ></div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default LiveFeed;