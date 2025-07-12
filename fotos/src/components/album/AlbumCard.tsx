import { memo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { Badge } from "../ui/badge";
import AlbumFormDialog from "./AlbumDialog";
import { toast } from "sonner";
import {
  ArrowUpRight,
  Pencil,
  Trash2,
  Image,
  Calendar,
  GalleryVertical,
} from "lucide-react";
import { ButtonLoader } from "../common/loaders";
import type { Album } from "../../constants/type";

interface AlbumCardProps {
  album: Album;
}

const AlbumCard = memo(function AlbumCard({ album }: AlbumCardProps) {
  const [isImageLoading, setIsImageLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const navigate = useNavigate();

  const token = localStorage.getItem("token");
  if (!token) {
    navigate("/login");
    return null;
  }

  const deleteAlbum = async (id: string) => {
    setIsDeleting(true);
    try {
      const res = await window.electronAPI.deleteAlbum(id);
      if (!res.success) throw new Error("Failed to delete album");
      toast.success("Album deleted successfully.");
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete album.");
    } finally {
      setIsDeleting(false);
    }
  };

  const formattedDate = new Date(album.date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const truncatedName =
    album.name.length > 24 ? `${album.name.substring(0, 24)}...` : album.name;

  const handleNavigate = () => {
    navigate(`/album/${album.name}`);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full"
    >
      <motion.div
        whileHover={{
          scale: 1.02,
          boxShadow:
            "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
        }}
        transition={{ duration: 0.4 }}
        className="overflow-hidden rounded-2xl bg-white border border-gray-100 relative"
      >
        <div className="relative aspect-[3/4] w-full overflow-hidden h-60">
          {album.imagePath ? (
            <>
              {isImageLoading && (
                <div className="absolute inset-0 bg-gray-100 flex items-center justify-center">
                  <Skeleton className="h-full w-full" />
                </div>
              )}
              <motion.img
                src={`file://${album.imagePath}`}
                alt={album.name}
                loading="lazy"
                whileHover={{ scale: 1.1 }}
                transition={{ duration: 0.7 }}
                className={`w-full h-full object-cover transition-opacity duration-300 ${
                  isImageLoading ? "opacity-0" : "opacity-100"
                }`}
                onLoad={() => setIsImageLoading(false)}
                onError={() => setIsImageLoading(false)}
              />
            </>
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-gray-50 to-gray-100 flex flex-col items-center justify-center">
              <div className="rounded-full bg-gray-200 p-4">
                <Image className="w-12 h-12 text-gray-400" />
              </div>
              <span className="mt-4 text-gray-500 font-medium">
                No images yet
              </span>
            </div>
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-60" />

          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 flex items-center justify-center z-20"
            >
              <Button
                onClick={handleNavigate}
                className="bg-white hover:bg-white text-black hover:text-black rounded-full w-12 h-12 shadow-xl transition-transform duration-200 hover:scale-110"
              >
                <ArrowUpRight className="w-5 h-5" />
              </Button>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="p-5 relative z-10 -mt-16">
          <div className="bg-white/95 rounded-xl p-5 shadow-lg border border-white/40">
            <div className="flex items-center mb-2 text-gray-500 text-xs">
              <Calendar className="w-3 h-3 mr-1.5" />
              <span>{formattedDate}</span>
            </div>

            <h2 className="text-xl font-bold text-gray-900 mb-3">
              {truncatedName}
            </h2>

            <div className="flex gap-2 mt-3">
              <Button
                onClick={handleNavigate}
                className="bg-black/95 hover:bg-black/85 text-white flex-1 rounded-[6px] flex items-center gap-2"
              >
                <GalleryVertical className="w-4 h-4" />
                <span>View Album</span>
              </Button>
              <div className="flex gap-1">
                <AlbumFormDialog
                  albumToEdit={album}
                  trigger={
                    <Button
                      variant="outline"
                      size="icon"
                      className="border-gray-200 hover:border-gray-300 rounded-[6px] h-10 w-10"
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                  }
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => deleteAlbum(album.id)}
                  disabled={isDeleting}
                  className="border-gray-200 hover:border-red-200 hover:bg-red-50 text-gray-600 hover:text-red-600 rounded-[6px] h-10 w-10"
                >
                  {isDeleting ? (
                    <ButtonLoader className="border-red-600" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
});

export default AlbumCard;