import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import axiosInstance from "../../utils/api";
import type { Album } from "../../constants/type";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";

interface AlbumFormDialogProps {
  albumToEdit?: Album;
  trigger?: React.ReactNode;
}

const fetchUser = async () => {
  const { data } = await axiosInstance.get<{ userId: string; name: string }>(
    "/api/auth/user-id"
  );
  return { id: data.userId, name: data.name || "User" };
};

const AlbumFormDialog: React.FC<AlbumFormDialogProps> = ({ albumToEdit, trigger }) => {
  const [open, setOpen] = useState<boolean>(false);
  const [mounted, setMounted] = useState<boolean>(false);
  const [name, setName] = useState<string>("");
  const [date, setDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [coverImage, setCoverImage] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ["user"],
    queryFn: fetchUser,
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });


  console.log(user)

  const isEditMode = !!albumToEdit;

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (open) {
      if (albumToEdit) {
        setName(albumToEdit.name || "");
        setDate(albumToEdit.date ? albumToEdit.date.toString().split("T")[0] : new Date().toISOString().split("T")[0]);
        setCoverImage(null);
      } else {
        setName("");
        setDate(new Date().toISOString().split("T")[0]);
        setCoverImage(null);
      }
    }
  }, [open, albumToEdit]);

  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Prevent background scrolling when modal is open
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }

    // Handle ESC key to close modal
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSubmitting) {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", handleEsc);

    return () => {
      document.body.style.overflow = "unset";
      window.removeEventListener("keydown", handleEsc);
    };
  }, [open, isSubmitting]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (file) {
      const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
      if (!validTypes.includes(file.type)) {
        toast.error("Unsupported file type. Please upload a JPEG, PNG, GIF, or WebP image.");
        setCoverImage(null);
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error("File size exceeds 10MB limit.");
        setCoverImage(null);
        return;
      }
    }
    setCoverImage(file);
  };

  // Define mutation for creating an album
  const createAlbumMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const { data } = await axiosInstance.post("/api/albums", formData);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["albums"] });
      if (user?.id) {
        queryClient.invalidateQueries({ queryKey: ["albums", user.id] });
      }
      toast.success("Album created successfully.");
      setOpen(false);
    },
    onError: (error: any) => {
      const errorMessage =
        error.response?.data?.error || "An error occurred while creating the album";
      toast.error(errorMessage);
    },
    onSettled: () => {
      setIsSubmitting(false);
    },
    retry: 1,
  });

  // Define mutation for updating an album
  const updateAlbumMutation = useMutation({
    mutationFn: async ({ id, formData }: { id: string; formData: FormData }) => {
      const { data } = await axiosInstance.put(`/api/albums/${id}`, formData);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["albums"] });
      if (user?.id) {
        queryClient.invalidateQueries({ queryKey: ["albums", user.id] });
      }
      toast.success("Album updated successfully.");
      setOpen(false);
    },
    onError: (error: any) => {
      const errorMessage =
        error.response?.data?.error || "An error occurred while updating the album";
      toast.error(errorMessage);
    },
    onSettled: () => {
      setIsSubmitting(false);
    },
    retry: 1,
  });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Album name is required");
      return;
    }
    if (!date || isNaN(new Date(date).getTime())) {
      toast.error("A valid date is required");
      return;
    }

    setIsSubmitting(true);
    const formData = new FormData();
    formData.append("name", name);
    formData.append("date", date);
    if (coverImage) {
      formData.append("coverImage", coverImage);
    }

    if (isEditMode && albumToEdit?.id) {
      updateAlbumMutation.mutate({ id: albumToEdit.id, formData });
    } else {
      createAlbumMutation.mutate(formData);
    }
  };

  const dialogContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => {
        e.stopPropagation();
        !isSubmitting && setOpen(false);
      }}
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl transform transition-all duration-300"
        ref={modalRef}
        style={{
          animation: "fadeInScale 0.3s ease-out",
          maxHeight: "90vh",
          overflow: "auto",
          position: "relative",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 sm:p-8">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-semibold text-gray-900">
              {isEditMode ? "Edit Album" : "Create Album"}
            </h2>
            <button
              onClick={() => !isSubmitting && setOpen(false)}
              className="text-gray-500 hover:text-gray-700 focus:outline-none p-2 rounded-full hover:bg-gray-100 transition-colors"
              disabled={isSubmitting}
              aria-label="Close dialog"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label
                htmlFor="name"
                className="block text-sm font-medium text-gray-700"
              >
                Album Name
              </label>
              <input
                id="name"
                value={name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setName(e.target.value)
                }
                placeholder="Enter album name"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent transition-all hover:border-gray-300 disabled:bg-gray-100 disabled:cursor-not-allowed"
                required
                disabled={isSubmitting}
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="date"
                className="block text-sm font-medium text-gray-700"
              >
                Date
              </label>
              <input
                id="date"
                type="date"
                value={date}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setDate(e.target.value)
                }
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent transition-all hover:border-gray-300 disabled:bg-gray-100 disabled:cursor-not-allowed"
                required
                disabled={isSubmitting}
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="coverImage"
                className="block text-sm font-medium text-gray-700"
              >
                Cover Image
              </label>
              <input
                id="coverImage"
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-900 file:mr-4 file:px-4 file:py-2 file:rounded-xl file:border-0 file:bg-gradient-to-r file:from-black file:to-gray-800 file:text-white file:font-medium file:hover:from-gray-800 file:hover:to-gray-600 file:transition-all file:duration-300 file:cursor-pointer focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent transition-all hover:border-gray-300 disabled:bg-gray-100 disabled:cursor-not-allowed"
                disabled={isSubmitting}
              />
            </div>

            <div className="flex justify-end space-x-3 pt-5">
              <button
                type="button"
                className="px-5 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-700 font-medium hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 transition-all disabled:bg-gray-100 disabled:cursor-not-allowed"
                onClick={() => setOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-black to-gray-800 text-white font-medium hover:from-gray-800 hover:to-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-300 transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <svg
                    className="animate-spin h-5 w-5 mr-2 text-white"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v4l4-4-4-4v4a8 8 0 00-8 8z"
                    />
                  </svg>
                ) : null}
                {isSubmitting
                  ? "Processing..."
                  : isEditMode
                  ? "Update"
                  : "Create"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {trigger && (
        <span
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
          }}
          className="focus:outline-none inline-flex"
        >
          {trigger}
        </span>
      )}

      {mounted && open && createPortal(dialogContent, document.body)}
    </>
  );
};

export default AlbumFormDialog;
