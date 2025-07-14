import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import type { Photo } from "../constants/type";

interface ElectronAPI {
  fetchPhotos: (albumName: string) => Promise<Photo[]>;
  deletePhoto: (params: { photoId: string }) => Promise<{ success: boolean; changes: number }>;
  bulkDeletePhotos: (params: { photoIds: string[] }) => Promise<{ success: boolean; changes: number }>;
  syncPhotosToCloud: (params: { albumName: string; albumId: string; token: string }) => Promise<Photo[]>;
  onImageStream: (callback: (data: any) => void) => () => void;
  getFtpCredentials: () => Promise<{ albumId: string; albumName: string }[]>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

// Confirmation Modal Component
const ConfirmationModal: React.FC<{
  isOpen: boolean;
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  onConfirm: () => void;
  onCancel: () => void;
  type?: 'danger' | 'warning';
}> = ({ isOpen, title, message, confirmText, cancelText, onConfirm, onCancel, type = 'danger' }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white p-6">
        <div className="flex items-center mb-4">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center mr-4 ${
            type === 'danger' ? 'bg-red-100' : 'bg-yellow-100'
          }`}>
            {type === 'danger' ? (
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            ) : (
              <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.664-.833-2.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            )}
          </div>
          <h3 className="text-xl font-semibold text-gray-900">{title}</h3>
        </div>
        <p className="text-gray-600 mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-white font-medium ${
              type === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-yellow-600 hover:bg-yellow-700'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

const ImagePreviewModal: React.FC<{
  isOpen: boolean;
  photo: Photo | null;
  onClose: () => void;
}> = ({ isOpen, photo, onClose }) => {
  if (!isOpen || !photo) return null;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="max-w-4xl w-full" onClick={(e) => e.stopPropagation()}>
        <img src={photo.url} alt={photo.caption || "Photo"} className="w-full h-auto object-contain" />
        <button
          onClick={onClose}
          className="absolute top-4 right-4 bg-white text-black px-3 py-1 font-medium"
        >
          Close
        </button>
      </div>
    </div>
  );
};

// Cloud Status Badge Component
const CloudStatusBadge: React.FC<{ isUploaded: boolean }> = ({ isUploaded }) => {
  if (!isUploaded) return null;
  
  return (
    <div className="absolute top-2 left-2 bg-black/80 text-white px-2 py-1 text-xs font-medium flex items-center gap-1">
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
      </svg>
      Cloud
    </div>
  );
};

const AlbumPage: React.FC = () => {
  const { albumName } = useParams<{ albumName: string }>();
  const navigate = useNavigate();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0, estimatedTime: 0 });
  const [uploadedPhotos, setUploadedPhotos] = useState<Set<string>>(new Set());
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    type: 'single' | 'bulk';
    photoId?: string;
  }>({ isOpen: false, type: 'single' });
  const [previewPhoto, setPreviewPhoto] = useState<Photo | null>(null);

  const fetchPhotos = useCallback(async () => {
    if (!albumName) {
      setError("No album name provided in URL");
      setLoading(false);
      return;
    }

    try {
      const decodedAlbumName = decodeURIComponent(albumName);
      const fetchedPhotos = await window.electronAPI.fetchPhotos(decodedAlbumName);
      setPhotos(fetchedPhotos);
      setUploadedPhotos(new Set(fetchedPhotos.filter(p => p.url.startsWith("https://res.cloudinary.com")).map(p => p.id)));
    } catch (err: any) {
      setError(err.message || "Failed to load photos. Check logs for details.");
      toast.error(err.message || "Failed to load photos");
    } finally {
      setLoading(false);
    }
  }, [albumName]);

  useEffect(() => {
    fetchPhotos();
  }, [fetchPhotos]);

  useEffect(() => {
    const handleImageStream = (data: any) => {
      if (albumName) {
        const decodedAlbumName = decodeURIComponent(albumName);
        if (data.action === "add" && data.albumName === decodedAlbumName) {
          fetchPhotos().then(() => {
            toast.success("New photo added to album!");
          }).catch((err) => {
            toast.error("Failed to refresh photos: " + err.message);
          });
        } else if (data.action === "error") {
          toast.error("Image upload failed: " + data.error);
        }
      }
    };

    const unsubscribe = window.electronAPI.onImageStream(handleImageStream);
    return () => unsubscribe();
  }, [albumName, fetchPhotos]);

  const handlePhotoSelect = (photoId: string) => {
    setSelectedPhotos((prev) =>
      prev.includes(photoId) ? prev.filter((id) => id !== photoId) : [...prev, photoId]
    );
  };

  const handleSelectAll = () => {
    if (selectedPhotos.length === photos.length) {
      setSelectedPhotos([]);
    } else {
      setSelectedPhotos(photos.map(p => p.id));
    }
  };

  const confirmDeletePhoto = (photoId: string) => {
    setConfirmModal({ isOpen: true, type: 'single', photoId });
  };

  const confirmBulkDelete = () => {
    setConfirmModal({ isOpen: true, type: 'bulk' });
  };

  const handleDeletePhoto = async (photoId: string) => {
    try {
      const result = await window.electronAPI.deletePhoto({ photoId });
      if (result.success) {
        setPhotos((prev) => prev.filter((photo) => photo.id !== photoId));
        setSelectedPhotos((prev) => prev.filter((id) => id !== photoId));
        setUploadedPhotos((prev) => {
          const newSet = new Set(prev);
          newSet.delete(photoId);
          return newSet;
        });
        toast.success("Photo deleted successfully");
      }
    } catch (err: any) {
      toast.error("Failed to delete photo: " + err.message);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedPhotos.length === 0) {
      toast.error("No photos selected");
      return;
    }

    try {
      const result = await window.electronAPI.bulkDeletePhotos({ photoIds: selectedPhotos });
      if (result.success) {
        setPhotos((prev) => prev.filter((photo) => !selectedPhotos.includes(photo.id)));
        setSelectedPhotos([]);
        setUploadedPhotos((prev) => {
          const newSet = new Set(prev);
          selectedPhotos.forEach(id => newSet.delete(id));
          return newSet;
        });
        toast.success(`${result.changes} photo(s) deleted successfully`);
      }
    } catch (err: any) {
      toast.error("Failed to delete photos: " + err.message);
    }
  };

  const handleConfirmAction = async () => {
    setConfirmModal({ isOpen: false, type: 'single' });
    
    if (confirmModal.type === 'single' && confirmModal.photoId) {
      await handleDeletePhoto(confirmModal.photoId);
    } else if (confirmModal.type === 'bulk') {
      await handleBulkDelete();
    }
  };

  const handleSyncToCloud = async () => {
    if (!albumName) {
      toast.error("Album name not provided");
      return;
    }

    const photosToSync = photos.filter(p => !uploadedPhotos.has(p.id));
    if (photosToSync.length === 0) {
      toast.success("All photos are already synced to cloud!");
      return;
    }

    setSyncing(true);
    setSyncProgress({ current: 0, total: photosToSync.length, estimatedTime: 0 });

    try {
      const token = localStorage.getItem("token");
      if (!token) {
        throw new Error("No authentication token found");
      }

      const credentials = await window.electronAPI.getFtpCredentials();
      const albumData = credentials.find((cred) => cred.albumName === decodeURIComponent(albumName));
      const albumId = albumData?.albumId;

      if (!albumId) {
        throw new Error("Album ID not found in FTP credentials");
      }

      const decodedAlbumName = decodeURIComponent(albumName);

      let totalTime = 0;
      let uploadedCount = 0;

      const startTime = performance.now();
      const syncedPhotos = await window.electronAPI.syncPhotosToCloud({
        albumName: decodedAlbumName,
        albumId,
        token,
      });

      for (const photo of syncedPhotos) {
        if (photo.url.startsWith("https://res.cloudinary.com")) {
          uploadedCount++;
          const elapsedTime = performance.now() - startTime;
          totalTime = elapsedTime / uploadedCount;
          setSyncProgress(prev => ({
            ...prev,
            current: uploadedCount,
            estimatedTime: ((prev.total - uploadedCount) * totalTime) / 1000,
          }));
          setUploadedPhotos(prev => new Set([...prev, photo.id]));
        }
      }

      setPhotos(syncedPhotos);
      toast.success(`Synced ${uploadedCount} new photo(s) to cloud successfully`);
    } catch (err: any) {
      toast.error("Failed to sync photos: " + err.message);
    } finally {
      setSyncing(false);
      setSyncProgress({ current: 0, total: 0, estimatedTime: 0 });
    }
  };

  const handleImageClick = (photo: Photo) => {
    setPreviewPhoto(photo);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <div className="text-center">
            <p className="text-xl font-semibold text-gray-700">Loading photos...</p>
            <p className="text-sm text-gray-500 mt-1">Please wait while we fetch your album</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-white p-8 max-w-md w-full text-center border-t border-b border-gray-200">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Oops! Something went wrong</h2>
          <p className="text-gray-600 mb-8">{error}</p>
          <button
            onClick={() => navigate("/dashboard")}
            className="w-full px-6 py-3 bg-blue-600 text-white hover:bg-blue-700 font-medium"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const uploadedCount = uploadedPhotos.size;
  const totalPhotos = photos.length;
  const pendingSync = totalPhotos - uploadedCount;

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="border-t border-b border-gray-200 p-6 mb-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                {decodeURIComponent(albumName || "Album")}
              </h1>
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <span className="flex items-center text-gray-600">
                  <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {totalPhotos} photos
                </span>
                {uploadedCount > 0 && (
                  <span className="flex items-center text-emerald-600 font-medium">
                    <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M13 10l3-3m0 0l-3-3m3 3H9" />
                    </svg>
                    {uploadedCount} synced to cloud
                  </span>
                )}
                {selectedPhotos.length > 0 && (
                  <span className="flex items-center text-blue-600 font-medium">
                    <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                    </svg>
                    {selectedPhotos.length} selected
                  </span>
                )}
              </div>
            </div>
            
            <div className="flex flex-wrap gap-3">
              {photos.length > 0 && (
                <button
                  onClick={handleSelectAll}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                  </svg>
                  {selectedPhotos.length === photos.length ? 'Deselect All' : 'Select All'}
                </button>
              )}
              
              {selectedPhotos.length > 0 && (
                <button
                  onClick={confirmBulkDelete}
                  className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 font-medium flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Delete {selectedPhotos.length}
                </button>
              )}
              
              <button
                onClick={handleSyncToCloud}
                className="px-4 py-2 bg-black/80 text-white hover:bg-emerald-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium flex items-center gap-2"
                disabled={syncing}
              >
                {syncing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Syncing...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M13 10l3-3m0 0l-3-3m3 3H9" />
                    </svg>
                    {pendingSync > 0 ? `Sync ${pendingSync} to Cloud` : 'All Synced'}
                  </>
                )}
              </button>
              
              <button
                onClick={() => navigate("/dashboard")}
                className="px-4 py-2 bg-white border-2 border-gray-200 hover:border-gray-300 text-gray-700 font-medium flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Back
              </button>
            </div>
          </div>
        </div>

        {photos.length === 0 ? (
          <div className="border-t border-b border-gray-200 p-12 text-center">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No photos yet</h3>
            <p className="text-gray-600 max-w-md mx-auto">
              Upload images via FTP to the selected directory to get started! Your photos will appear here once uploaded.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {photos.map((photo) => (
              <div key={photo.id} className="relative border-t border-b border-gray-200">
                <div className="aspect-square overflow-hidden">
                  <img
                    src={photo.url}
                    alt={photo.caption || "Photo"}
                    className="w-full h-full object-cover cursor-pointer"
                    onClick={() => handleImageClick(photo)}
                  />
                </div>
                
                <CloudStatusBadge isUploaded={uploadedPhotos.has(photo.id)} />
                
                <div className="absolute top-2 right-2">
                  <input
                    type="checkbox"
                    checked={selectedPhotos.includes(photo.id)}
                    onChange={() => handlePhotoSelect(photo.id)}
                    className="w-5 h-5 text-blue-600 border-2 border-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div className="p-2">
                  <button
                    onClick={() => confirmDeletePhoto(photo.id)}
                    className="w-full px-3 py-2 bg-red-600 text-white hover:bg-red-700 font-medium flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.type === 'single' ? 'Delete Photo' : 'Delete Selected Photos'}
        message={
          confirmModal.type === 'single'
            ? 'Are you sure you want to delete this photo? This action cannot be undone.'
            : `Are you sure you want to delete ${selectedPhotos.length} selected photo(s)? This action cannot be undone.`
        }
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={handleConfirmAction}
        onCancel={() => setConfirmModal({ isOpen: false, type: 'single' })}
        type="danger"
      />

      <ImagePreviewModal
        isOpen={!!previewPhoto}
        photo={previewPhoto}
        onClose={() => setPreviewPhoto(null)}
      />

      {syncing && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-8 text-center max-w-md w-full">
            <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Syncing to Cloud</h2>
            <p className="text-gray-600 mb-2">
              Uploading {syncProgress.current} of {syncProgress.total} photos
            </p>
            <p className="text-gray-500 text-sm">
              Estimated time remaining: {syncProgress.estimatedTime.toFixed(1)} seconds
            </p>
            <div className="mt-6 w-full bg-gray-200 rounded-full h-2.5">
              <div
                className="bg-black/80 h-2.5 rounded-full"
                style={{ width: `${(syncProgress.current / syncProgress.total) * 100}%` }}
              ></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AlbumPage;