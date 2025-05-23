import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Upload, X, Check, AlertCircle, User, Mail, Camera } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import axiosInstance from '../utils/api';
import { PageLoader, ErrorDisplay } from '../components/common/loaders';
import { toast } from 'sonner';

// Define user type based on Prisma schema
interface User {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  albums?: unknown[];
}

// Define API error type
interface ApiError {
  response?: {
    data?: {
      error?: string;
    };
  };
}

// Define mutation payload type
interface UpdateUserPayload {
  name: string | null;
  image: File | null;
}

const fetchUser = async (): Promise<User> => {
  const { data } = await axiosInstance.get<User>('/api/user');
  console.log(data)
  return data;
};

const updateUser = async ({ name, image }: UpdateUserPayload): Promise<User> => {
  const formData = new FormData();
  if (name) formData.append('name', name);
  if (image) formData.append('image', image);
  const { data } = await axiosInstance.post<User>('/api/user', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
};

const Settings: React.FC = () => {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');

  const { data: user, isLoading, error } = useQuery<User, ApiError>({
    queryKey: ['user'],
    queryFn: fetchUser,
  });

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setEmail(user.email || ''); 
      const cleanImageUrl = user.image ? user.image.split('?')[0] : null;
      setImagePreview(cleanImageUrl);
      console.log('User data:', { name: user.name, email: user.email, image: cleanImageUrl });
    }
  }, [user]);

  useEffect(() => {
    if (user?.image) {
      console.log('User image URL:', user.image);
    }
  }, [user]);

  const mutation = useMutation<User, ApiError, UpdateUserPayload>({
    mutationFn: updateUser,
    onSuccess: (data) => {
      queryClient.setQueryData(['user'], data);
      toast.success('Profile updated successfully');
      const cleanImageUrl = data.image ? data.image.split('?')[0] : null;
      setImagePreview(cleanImageUrl);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    onError: (error) => {
      console.error('Update error:', error);
      toast.error(error?.response?.data?.error || 'Failed to update profile');
    },
  });

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (file) {
      const previewUrl = URL.createObjectURL(file);
      setImagePreview(previewUrl);
      setSelectedFile(file);
      console.log('Selected file:', file.name, 'Preview URL:', previewUrl);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)) {
      const previewUrl = URL.createObjectURL(file);
      setImagePreview(previewUrl);
      setSelectedFile(file);
      console.log('Dropped file:', file.name, 'Preview URL:', previewUrl);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleRemoveImage = useCallback(() => {
    setImagePreview(null);
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    console.log('Image removed');
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (name !== user?.name || selectedFile || imagePreview !== (user?.image?.split('?')[0] || null)) {
        mutation.mutate({ name, image: selectedFile });
      }
    },
    [name, user, imagePreview, selectedFile, mutation],
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex items-center justify-center">
        <PageLoader />
      </div>
    );
  }

  if (error) {
    return (
      <ErrorDisplay
        message={error?.response?.data?.error || 'Failed to load user data'}
      />
    );
  }

  return (
    <div className="min-h-[50vh]">
      <main className="w-11/12 mx-auto px-6 py-8">
        <div className="bg-white/70 w-full rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all duration-300">
          <div className="p-8">
            <div className="flex items-start gap-6">
              <h2 className="text-xl font-semibold text-slate-900 mb-8">Profile Information</h2>
            </div>

            <form onSubmit={handleSubmit} className="space-y-8">
              <div className="space-y-4">
                <label className="block text-sm font-medium text-slate-700">Profile Picture</label>
                <div
                  className={`relative group p-6 rounded-xl border-2 border-dashed transition-all duration-300 ${
                    isDragging
                      ? 'border-slate-400 bg-slate-50 shadow-lg'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                  }`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <div className="flex flex-col items-center gap-4">
                    <div className="relative">
                      {imagePreview ? (
                        <div className="relative">
                          <img
                            src={imagePreview}
                            alt="Profile"
                            className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-lg ring-1 ring-slate-200"
                            onError={(e) => {
                              console.error('Failed to load image:', imagePreview);
                              setImagePreview(null); // Fallback to no image
                            }}
                          />
                          <button
                            type="button"
                            onClick={handleRemoveImage}
                            className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-lg transition-all duration-200"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center border-4 border-white shadow-lg ring-1 ring-slate-200">
                          <User className="w-8 h-8 text-slate-400" />
                        </div>
                      )}
                    </div>

                    <div className="text-center space-y-2">
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/gif,image/webp"
                        className="hidden"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full sm:w-auto px-8 py-3 bg-black hover:bg-gray-800 text-white text-sm font-medium rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 shadow-sm"
                      >
                        <div className="flex items-center justify-center gap-2">
                          <Camera className="w-4 h-4" />
                          {imagePreview ? 'Change Photo' : 'Upload Photo'}
                        </div>
                      </button>
                      <p className="text-xs text-slate-500">
                        Drop an image here or click to upload
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-6">
                <div className="space-y-2">
                  <label htmlFor="name" className="flex items-center gap-2 text-sm font-medium text-slate-700">
                    <User className="w-4 h-4" />
                    Full Name
                  </label>
                  <input
                    id="name"
                    value={name}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent transition-all duration-200 hover:border-slate-300"
                    placeholder="Enter your full name"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="email" className="flex items-center gap-2 text-sm font-medium text-slate-700">
                    <Mail className="w-4 h-4" />
                    Email Address
                  </label>
                  <input
                    id="email"
                    value={email}
                    disabled
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 text-slate-500 rounded-xl cursor-not-allowed focus:outline-none"
                  />
                  <p className="text-xs text-slate-500">Email cannot be changed</p>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200">
                <button
                  type="submit"
                  disabled={mutation.isPending}
                  className="w-full sm:w-auto px-8 py-3 bg-black hover:bg-gray-800 disabled:bg-gray-400 text-white font-medium rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 shadow-sm disabled:cursor-not-allowed"
                >
                  {mutation.isPending ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      Saving Changes...
                    </span>
                  ) : (
                    'Save Changes'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Settings;