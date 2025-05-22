import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "../components/ui/card";

interface ImageStreamData {
  action: string;
  imageUrl: string;
}

const LiveFeed: React.FC<{ reset: boolean }> = ({ reset }) => {
  const [images, setImages] = useState<string[]>(() => {
    // Load images from localStorage on mount
    const savedImages = localStorage.getItem("liveFeedImages");
    return savedImages ? JSON.parse(savedImages) : [];
  });

  useEffect(() => {
    if (reset) {
      setImages([]);
      localStorage.removeItem("liveFeedImages");
      return;
    }

    const handleImageStream = (data: ImageStreamData) => {
      if (data.action === "add" && data.imageUrl) {
        setImages((prev) => {
          // Avoid duplicates by checking if imageUrl already exists
          if (prev.includes(data.imageUrl)) {
            return prev;
          }
          const updatedImages = [data.imageUrl, ...prev].slice(0, 50);
          localStorage.setItem("liveFeedImages", JSON.stringify(updatedImages));
          return updatedImages;
        });
      }
    };

    window.electronAPI.onImageStream(handleImageStream);

    return () => {
      window.electronAPI.removeImageStreamListener(handleImageStream);
      console.log("Cleaned up image-stream listener");
    };
  }, [reset]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Live Image Feed</CardTitle>
      </CardHeader>
      <CardContent>
        {images.length === 0 ? (
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
      </CardContent>
    </Card>
  );
};

export default LiveFeed;