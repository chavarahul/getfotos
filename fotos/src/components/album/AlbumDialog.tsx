import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
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
    if (!ipc) {
      console.error("Electron IPC not available");
      throw new Error("IPC not available. Ensure Electron context is properly set up.");
    }
    console.log('Creating or updating album with data:', { name, date, coverImage });

    try {
      if (coverImage) {
        console.log('Processing coverImage...');
        const base64 = await new Promise<string>((resolve, reject) => {
          console.log('Starting FileReader for coverImage');
          const reader = new FileReader();
          reader.onload = () => {
            console.log('FileReader onload triggered');
            resolve(reader.result as string);
          };
          reader.onerror = () => {
            console.error('FileReader error:', reader.error);
            reject(reader.error);
          };
          reader.readAsDataURL(coverImage);
        });
        console.log('FileReader completed, creating image object');
        image = {
          name: coverImage.name,
          base64
        };
      } else {
        console.log('No coverImage provided');
      }

      const payload = { name, date, image };
      console.log('Payload prepared:', payload);

      let res;
      if (isEditMode && albumToEdit?.id) {
        console.log('Updating album with ID:', albumToEdit.id);
        res = await ipc.updateAlbum({
          id: albumToEdit.id,
          ...payload
        });
        console.log('Update album response:', res);
      } else {
        console.log('Creating new album with payload:', payload);
        res = await ipc.createAlbum(payload);
        console.log('Create album response:', res);
      }

      toast.success(`Album ${isEditMode ? "updated" : "created"} successfully`);
      setOpen(false);
      return res;
    } catch (error) {
      console.error('Album operation failed:', error);
      throw new Error(
        error instanceof Error
          ? error.message
          : 'Failed to process album image'
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('handleSubmit called with:', { name, date, coverImage });
    if (!name.trim()) {
      console.log('Validation failed: Empty album name');
      toast.error("Album name required");
      return;
    }
    if (!date || isNaN(new Date(date).getTime())) {
      console.log('Validation failed: Invalid date');
      toast.error("Invalid date");
      return;
    }

    console.log('Submitting...');
    setIsSubmitting(true);
    try {
      await createOrUpdateAlbum();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save album");
    } finally {
      setIsSubmitting(false);
    }
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