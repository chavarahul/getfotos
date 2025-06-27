import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Album } from "../../constants/type";

interface AlbumFormDialogProps {
  albumToEdit?: Album;
  trigger?: React.ReactNode;
}

const ipc = window.electronAPI;

const AlbumFormDialog: React.FC<AlbumFormDialogProps> = ({ albumToEdit, trigger }) => {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [coverImage, setCoverImage] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const queryClient = useQueryClient();

  const isEditMode = !!albumToEdit;

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (open) {
      if (albumToEdit) {
        setName(albumToEdit.name);
        setDate(albumToEdit.date?.split("T")[0] ?? new Date().toISOString().split("T")[0]);
      } else {
        setName("");
        setDate(new Date().toISOString().split("T")[0]);
      }
      setCoverImage(null);
    }
  }, [open, albumToEdit]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (file) {
      const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
      if (!validTypes.includes(file.type)) {
        toast.error("Unsupported image type");
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error("Image size exceeds 10MB");
        return;
      }
    }
    setCoverImage(file);
  };

  type AlbumImage = {
    name: string;
    base64: string;
  } | null;

  const createOrUpdateAlbum = async () => {
    let image: AlbumImage = null;

    try {
      if (coverImage) {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(coverImage);
        });

        image = {
          name: coverImage.name,
          base64
        };
      }

      const payload = { name, date, image };

      if (isEditMode && albumToEdit?.id) {
        return await ipc.updateAlbum({
          id: albumToEdit.id,
          ...payload
        });
      }
      const res =  await ipc.createAlbum(payload);
      console.log(res);
      return res

    } catch (error) {
      console.error('Album operation failed:', error);
      throw new Error(
        error instanceof Error
          ? error.message
          : 'Failed to process album image'
      );
    }
  };

  const mutation = useMutation({
    mutationFn: createOrUpdateAlbum,
    onMutate: () => setIsSubmitting(true),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["albums"] });
      toast.success(`Album ${isEditMode ? "updated" : "created"} successfully`);
      setOpen(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to save album");
    },
    onSettled: () => setIsSubmitting(false),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error("Album name required");
    if (!date || isNaN(new Date(date).getTime())) return toast.error("Invalid date");

    setIsSubmitting(true);
    mutation.mutate();
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={() => !isSubmitting && setOpen(false)}
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-2xl font-bold mb-4">
          {isEditMode ? "Edit Album" : "Create Album"}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Album Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border rounded px-3 py-2"
              required
              disabled={isSubmitting}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full border rounded px-3 py-2"
              required
              disabled={isSubmitting}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Cover Image</label>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="w-full"
              disabled={isSubmitting}
            />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              className="px-4 py-2 bg-gray-200 rounded"
              onClick={() => setOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-black text-white rounded"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Saving..." : isEditMode ? "Update" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return (
    <>
      {trigger && (
        <span onClick={() => setOpen(true)} className="cursor-pointer">
          {trigger}
        </span>
      )}
      {mounted && open && createPortal(modalContent, document.body)}
    </>
  );
};

export default AlbumFormDialog;
