import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../components/ui/tooltip";
import { Badge } from "../components/ui/badge";
import { Checkbox } from "../components/ui/checkbox";
import { Progress } from "../components/ui/progress";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "../components/ui/context-menu";
import { ScrollArea } from "../components/ui/scroll-area";
import { Sheet, SheetContent, SheetTrigger } from "../components/ui/sheet";
import { toast } from "sonner";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Image as ImageIcon,
  Camera,
  Upload,
  X,
  CheckSquare,
  MoreHorizontal,
} from "lucide-react";
import { PageLoader, ErrorDisplay } from "../components/common/loaders";
import axiosInstance from "../utils/api";
import type { Album, Photo } from "../constants/type";

interface UploadFile {
  file: File;
  preview: string;
  caption: string;
  progress: number;
}

const AlbumPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [album, setAlbum] = useState<Album | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isAddPhotoOpen, setIsAddPhotoOpen] = useState<boolean>(false);
  const [mounted, setMounted] = useState<boolean>(false);
  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([]);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isSelectionMode, setIsSelectionMode] = useState<boolean>(false);
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
    return () => {
      setMounted(false);
      uploadFiles.forEach((file) => URL.revokeObjectURL(file.preview));
    };
  }, [uploadFiles]);

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;
      try {
        setIsLoading(true);
        const [albumResponse, photosResponse] = await Promise.all([
          axiosInstance.get<Album>(`/api/albums/${id}`),
          axiosInstance.get<Photo[]>(`/api/photos/album/${id}`),
        ]);
        setAlbum(albumResponse.data);
        setPhotos(photosResponse.data);
        setError(null);
      } catch (err: any) {
        setError(err.response?.data?.error || "Failed to load album");
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [id]);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter((file) =>
      file.type.startsWith("image/")
    );
    addFiles(files);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter((file) =>
      file.type.startsWith("image/")
    );
    addFiles(files);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const addFiles = (files: File[]) => {
    const newFiles: UploadFile[] = files.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
      caption: "",
      progress: 0,
    }));
    setUploadFiles((prev) => [...prev, ...newFiles]);
  };

  const handleCaptionChange = (index: number, value: string) => {
    setUploadFiles((prev) =>
      prev.map((item, i) => (i === index ? { ...item, caption: value } : item))
    );
  };

  const handleRemoveFile = (index: number) => {
    setUploadFiles((prev) => {
      const newFiles = prev.filter((_, i) => i !== index);
      URL.revokeObjectURL(prev[index].preview);
      return newFiles;
    });
  };

  const handleAddPhotos = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (uploadFiles.length === 0) {
      toast.error("Please select at least one image");
      return;
    }

    try {
      const formData = new FormData();
      uploadFiles.forEach((item) => {
        formData.append("images", item.file);
        formData.append("captions", item.caption);
      });

      uploadFiles.forEach((_, index) => {
        let progress = 0;
        const interval = setInterval(() => {
          progress += 10;
          setUploadFiles((prev) =>
            prev.map((item, i) =>
              i === index ? { ...item, progress: Math.min(progress, 100) } : item
            )
          );
          if (progress >= 100) clearInterval(interval);
        }, 200);
      });

      await axiosInstance.post(`/api/photos/album/${id}`, formData);
      toast.success(`${uploadFiles.length} photo${uploadFiles.length > 1 ? "s" : ""} added successfully`);
      setIsAddPhotoOpen(false);
      setUploadFiles([]);

      const [photosResponse, albumResponse] = await Promise.all([
        axiosInstance.get<Photo[]>(`/api/photos/album/${id}`),
        axiosInstance.get<Album>(`/api/albums/${id}`),
      ]);
      setPhotos(photosResponse.data);
      setAlbum(albumResponse.data);
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to add photos");
    }
  };

  const handleDeletePhoto = async (photoId: string) => {
    if (!confirm("Are you sure you want to delete this photo?")) return;
    try {
      await axiosInstance.delete(`/api/photos/${photoId}/album/${id}`);
      toast.success("Photo deleted successfully");
      setPhotos(photos.filter((photo) => photo.id !== photoId));
      setSelectedPhotos((prev) => prev.filter((pid) => pid !== photoId));
      setAlbum((prev) => (prev ? { ...prev, photoCount: prev.photoCount - 1 } : null));
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to delete photo");
    }
  };

  const handleBulkDelete = async () => {
    if (
      !confirm(
        `Are you sure you want to delete ${selectedPhotos.length} photo${selectedPhotos.length > 1 ? "s" : ""}?`
      )
    ) {
      return;
    }
    try {
      await Promise.all(
        selectedPhotos.map((photoId) =>
          axiosInstance.delete(`/api/photos/${photoId}/album/${id}`)
        )
      );
      toast.success(
        `${selectedPhotos.length} photo${selectedPhotos.length > 1 ? "s" : ""} deleted successfully`
      );
      setPhotos(photos.filter((photo) => !selectedPhotos.includes(photo.id)));
      setSelectedPhotos([]);
      setIsSelectionMode(false);
      setAlbum((prev) =>
        prev ? { ...prev, photoCount: prev.photoCount - selectedPhotos.length } : null
      );
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to delete photos");
    }
  };

  const togglePhotoSelection = (photoId: string) => {
    setSelectedPhotos((prev) =>
      prev.includes(photoId)
        ? prev.filter((id) => id !== photoId)
        : [...prev, photoId]
    );
  };

  if (isLoading) {
    return (
      <div className="h-screen bg-gray-100 flex items-center justify-center">
        <PageLoader />
      </div>
    );
  }

  if (error || !mounted) {
    return (
      <div className="h-screen bg-gray-100 flex items-center justify-center">
        <ErrorDisplay message={error || "Failed to load album"} />
      </div>
    );
  }

  if (!album) {
    return (
      <div className="h-screen bg-gray-100 flex items-center justify-center">
        <ErrorDisplay message="Album not found" />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="h-screen bg-gray-100 flex flex-col"
      >
        {/* Header */}
        <header className="sticky top-0 z-20 bg-gray-100/90 backdrop-blur-lg border-b border-gray-200/50 px-4 sm:px-6 py-3">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => navigate("/dashboard")}
                    className="text-gray-900 hover:bg-gray-200/50 rounded-full"
                    aria-label="Back to dashboard"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Back to dashboard</p>
                </TooltipContent>
              </Tooltip>
              <h1 className="text-lg font-medium text-gray-900 tracking-tight">
                {album.name} {">"} Photos
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <Badge className="border-gray-300 text-white text-sm px-3 py-1">
                <Camera className="w-3.5 h-3.5 mr-1.5" />
                {album.photoCount} Photo{album.photoCount !== 1 ? "s" : ""}
              </Badge>
              {isSelectionMode ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-gray-300 text-gray-900 hover:bg-gray-200 cursor-pointer text-sm px-3"
                    onClick={() => {
                      setIsSelectionMode(false);
                      setSelectedPhotos([]);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-gray-300 text-gray-900 cursor-pointer hover:bg-gray-200 text-sm px-3"
                    disabled={selectedPhotos.length === 0}
                    onClick={handleBulkDelete}
                  >
                    <Trash2 className="w-4 h-4 mr-1.5" />
                    Delete {selectedPhotos.length > 0 ? selectedPhotos.length : ""}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-gray-300 text-gray-900 cursor-pointer hover:bg-gray-200 text-sm px-3"
                    onClick={() => setIsSelectionMode(true)}
                  >
                    <CheckSquare className="w-4 h-4 mr-1.5" />
                    Select
                  </Button>
                  <Dialog open={isAddPhotoOpen} onOpenChange={setIsAddPhotoOpen}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <DialogTrigger asChild>
                          <Button
                            size="sm"
                            className="bg-black text-white hover:bg-gray-900 text-sm px-3 cursor-pointer"
                          >
                            <Plus className="w-4 h-4 mr-1.5" />
                            Add Photos
                          </Button>
                        </DialogTrigger>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Add new photos</p>
                      </TooltipContent>
                    </Tooltip>
                    <DialogContent className="max-w-md bg-gray-100 border-none rounded-2xl shadow-xl">
                      <DialogHeader>
                        <DialogTitle className="text-gray-900 text-lg">Add New Photos</DialogTitle>
                      </DialogHeader>
                      <form onSubmit={handleAddPhotos} className="space-y-4">
                        <div
                          className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
                            isDragging ? "border-gray-600 bg-gray-200" : "border-gray-300 bg-gray-100"
                          }`}
                          onDragOver={handleDragOver}
                          onDragLeave={handleDragLeave}
                          onDrop={handleDrop}
                        >
                          <input
                            type="file"
                            multiple
                            accept="image/*"
                            className="hidden"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                          />
                          <p className="text-gray-600 text-sm">
                            Drag and drop images or{" "}
                            <span
                              className="text-gray-900 hover:underline cursor-pointer font-medium"
                              onClick={() => fileInputRef.current?.click()}
                            >
                              browse
                            </span>
                          </p>
                        </div>
                        {uploadFiles.length > 0 && (
                          <ScrollArea className="max-h-60 rounded-md">
                            <div className="space-y-3 p-2">
                              {uploadFiles.map((item, index) => (
                                <div
                                  key={index}
                                  className="flex items-center gap-3 border-b border-gray-200 pb-3"
                                >
                                  <img
                                    src={item.preview}
                                    alt="Preview"
                                    className="w-14 h-14 object-cover rounded-md"
                                  />
                                  <div className="flex-1 space-y-1.5">
                                    <Input
                                      placeholder="Caption (optional)"
                                      value={item.caption}
                                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                        handleCaptionChange(index, e.target.value)
                                      }
                                      className="border-gray-200 text-gray-900 placeholder:text-gray-400 text-sm"
                                    />
                                    <Progress
                                      value={item.progress}
                                      className="h-1 bg-gray-200 [&>div]:bg-gray-600"
                                    />
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleRemoveFile(index)}
                                    className="text-gray-900 hover:bg-gray-200 rounded-full"
                                    aria-label="Remove file"
                                  >
                                    <X className="w-4 h-4" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          </ScrollArea>
                        )}
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="border-gray-300 text-gray-900 hover:bg-gray-200 rounded-full text-sm px-3"
                            onClick={() => {
                              setIsAddPhotoOpen(false);
                              setUploadFiles([]);
                            }}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="submit"
                            size="sm"
                            className="bg-black text-white hover:bg-gray-900 rounded-full text-sm px-3 cursor-pointer"
                            disabled={uploadFiles.length === 0}
                          >
                            <Upload className="w-4 h-4 mr-1.5" />
                            Upload
                          </Button>
                        </div>
                      </form>
                    </DialogContent>
                  </Dialog>
                </>
              )}
            </div>
          </div>
        </header>

        <ScrollArea className="flex-1 min-h-60">
          <main className="py-6 px-4 sm:px-6">
            <div className="max-w-7xl mx-auto">
              {photos.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.4 }}
                  className="flex flex-col items-center justify-center min-h-[60vh]"
                >
                  <ImageIcon className="w-16 h-16 text-gray-400 mb-4" />
                  <p className="text-gray-600 text-base font-medium">
                    No photos yet. Add your first photo!
                  </p>
                  <Button
                    className="mt-4 bg-black text-white hover:bg-gray-900 rounded-full text-sm px-3"
                    onClick={() => setIsAddPhotoOpen(true)}
                  >
                    <Plus className="w-4 h-4 mr-1.5" />
                    Add Photos
                  </Button>
                </motion.div>
              ) : (
                <motion.div
                  className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 auto-rows-fr"
                  variants={{
                    hidden: { opacity: 0 },
                    show: {
                      opacity: 1,
                      transition: { staggerChildren: 0.1, delayChildren: 0.2 },
                    },
                  }}
                  initial="hidden"
                  animate="show"
                >
                  {photos.map((photo) => (
                    <motion.div
                      key={photo.id}
                      variants={{
                        hidden: { opacity: 0, scale: 0.95, y: 20 },
                        show: {
                          opacity: 1,
                          scale: 1,
                          y: 0,
                          transition: { type: "spring", damping: 25 },
                        },
                      }}
                      className="relative group aspect-square p-0"
                    >
                      <ContextMenu>
                        <ContextMenuTrigger>
                          <Card className="h-auto overflow-hidden bg-transparent px-0">
                            <CardContent className="relative h-80">
                              <motion.img
                                src={photo.url}
                                alt={photo.caption || "Photo"}
                                loading="lazy"
                                initial={{ scale: 1 }}
                                whileHover={{ scale: 1.03 }}
                                transition={{ duration: 0.4, ease: "easeOut" }}
                                className="w-full h-full object-cover"
                              />
                              <div className="absolute inset-2 bg-gradient-to-t from-black/60 to-transparent opacity-0 transition-opacity duration-400 rounded-xl" />
                              {isSelectionMode ? (
                                <motion.div
                                  initial={{ scale: 0 }}
                                  animate={{ scale: 1 }}
                                  transition={{ duration: 0.3 }}
                                  className="absolute top-4 left-4"
                                >
                                  <Checkbox
                                    checked={selectedPhotos.includes(photo.id)}
                                    onCheckedChange={() => togglePhotoSelection(photo.id)}
                                    className="w-6 h-6 rounded-full bg-gray-100/90 border-2 border-gray-300 data-[state=checked]:bg-gray-700 data-[state=checked]:text-white data-[state=checked]:border-none"
                                  />
                                </motion.div>
                              ) : (
                                <motion.div
                                  initial={{ opacity: 0, y: 10 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ duration: 0.3, delay: 0.1 }}
                                  className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity duration-400"
                                >
                                  <Sheet>
                                    <SheetTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-9 w-9 rounded-full bg-gray-100/90 text-gray-900 hover:bg-gray-200/90 backdrop-blur-sm"
                                      >
                                        <MoreHorizontal className="h-4 w-4" />
                                      </Button>
                                    </SheetTrigger>
                                    <SheetContent
                                      side="right"
                                      className="w-80 bg-gray-100/95 backdrop-blur-lg border-none"
                                    >
                                      <div className="flex flex-col h-full p-5">
                                        <div className="flex-1 space-y-5">
                                          <div className="aspect-[4/3] w-full">
                                            <img
                                              src={photo.url}
                                              alt={photo.caption || "Photo"}
                                              className="w-full h-full object-cover rounded-xl"
                                            />
                                          </div>
                                          <div className="space-y-4">
                                            <div>
                                              <h3 className="text-sm font-medium text-gray-900">
                                                Uploaded
                                              </h3>
                                              <p className="text-sm text-gray-600">
                                                {new Date(photo.createdAt).toLocaleDateString()}
                                              </p>
                                            </div>
                                            {photo.caption && (
                                              <div>
                                                <h3 className="text-sm font-medium text-gray-900">
                                                  Caption
                                                </h3>
                                                <p className="text-sm text-gray-600">{photo.caption}</p>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                        <Button
                                          variant="outline"
                                          className="w-full border-gray-300 text-gray-900 hover:bg-gray-200 cursor-pointer"
                                          onClick={() => handleDeletePhoto(photo.id)}
                                        >
                                          <Trash2 className="w-4 h-4 mr-2" />
                                          Delete Photo
                                        </Button>
                                      </div>
                                    </SheetContent>
                                  </Sheet>
                                </motion.div>
                              )}
                              {photo.caption && (
                                <motion.div
                                  initial={{ opacity: 0, y: 15 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ duration: 0.3, delay: 0.1 }}
                                  className="absolute bottom-2 left-2 right-2 bg-gradient-to-t from-black/70 to-transparent text-white text-xs p-3 rounded-b-xl line-clamp-2"
                                >
                                  {photo.caption}
                                </motion.div>
                              )}
                            </CardContent>
                          </Card>
                        </ContextMenuTrigger>
                        <ContextMenuContent className="bg-gray-100/95 border-none backdrop-blur-lg rounded-lg">
                          <ContextMenuItem
                            className="text-gray-900 hover:bg-gray-200/90 rounded-md"
                            onClick={() => handleDeletePhoto(photo.id)}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </div>
          </main>
        </ScrollArea>
      </motion.div>
    </TooltipProvider>
  );
};

export default AlbumPage;