"use client";

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Suspense } from "react";
import LiveFeed from "./LiveFeed";
import { RefreshCw } from "lucide-react";
import type { Camera, ConnectionDetails } from "../constants/type";
import logo from "/assets/monotype-white.svg";

interface ClientConnectFormProps {
  cameras: Camera[];
  albums: { id: string; name: string }[];
  username: string; // Removed default "user"
}

interface ElectronAPI {
  selectFolder: () => Promise<string | null>;
  startFtp: (config: {
    username: string;
    directory: string;
    albumId: string;
    token: string;
  }) => Promise<ConnectionDetails>;
  getFtpCredentials: () => Promise<ConnectionDetails[]>;
  resetFtpCredentials: () => Promise<{ message: string }>;
  testFtpCredentials: (credentials: {
    username: string;
    password: string;
  }) => Promise<{ valid: boolean; expected?: string }>;
  regenerateFtpPassword: (username: string) => Promise<{ password: string }>;
  onImageStream: (callback: (data: { action: string; imageUrl: string }) => void) => void;
  removeImageStreamListener: (callback: (data: { action: string; imageUrl: string }) => void) => void;
  closeFtp: () => Promise<void>;
  onClearFtpCredentials: (callback: (data: { message: string }) => void) => void;
  removeClearFtpCredentialsListener: (callback: (data: { message: string }) => void) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

const ClientConnectForm: React.FC<ClientConnectFormProps> = ({
  cameras,
  albums,
  username,
}) => {
  const navigate = useNavigate();
  const [credentials, setCredentials] = useState<ConnectionDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [formValues, setFormValues] = useState<{
    camera: string;
    album: string;
    directory: string;
  }>({
    camera: "",
    album: "",
    directory: "",
  });
  const [isFtpCleared, setIsFtpCleared] = useState<boolean>(false);
  // console.log(username)

  useEffect(() => {
    const loadPersistedState = async () => {
      let initialFormValues;
      const savedFormValues = localStorage.getItem("formValues");
      console.log("Loading form values from localStorage:", savedFormValues);

      if (savedFormValues) {
        try {
          initialFormValues = JSON.parse(savedFormValues);
          initialFormValues = {
            camera: initialFormValues.camera || "",
            album: initialFormValues.album || "",
            directory: initialFormValues.directory || "",
          };
        } catch (err) {
          console.error("Error parsing formValues from localStorage:", err);
          initialFormValues = { camera: "", album: "", directory: "" };
        }
      } else {
        initialFormValues = { camera: "", album: "", directory: "" };
        localStorage.setItem("formValues", JSON.stringify(initialFormValues));
      }

      setFormValues(initialFormValues);

      try {
        const backendCredentials = await window.electronAPI.getFtpCredentials();
        const ftpCleared = localStorage.getItem("ftpCleared") === "true";
        setIsFtpCleared(ftpCleared);

        if (backendCredentials.length > 0 && !ftpCleared) {
          const creds = backendCredentials[0];
          if (creds.username === username) {
            setCredentials(creds);
            localStorage.setItem("ftpCredentials", JSON.stringify(creds));
            localStorage.setItem("ftpCleared", "false");
          } else {
            await window.electronAPI.resetFtpCredentials();
            setCredentials(null);
            localStorage.removeItem("ftpCredentials");
            localStorage.setItem("ftpCleared", "true");
          }
        } else {
          setCredentials(null);
          setIsFtpCleared(true);
          localStorage.removeItem("ftpCredentials");
          localStorage.setItem("ftpCleared", "true");
          localStorage.removeItem("liveFeedImages");
        }
      } catch (err) {
        console.error("Failed to fetch FTP credentials from backend:", err);
        toast.error("Failed to load FTP credentials");
        setCredentials(null);
        setIsFtpCleared(true);
        localStorage.removeItem("ftpCredentials");
        localStorage.setItem("ftpCleared", "true");
        localStorage.removeItem("liveFeedImages");
      }
    };

    loadPersistedState();
  }, [username]);

  useEffect(() => {
    const handleClearCredentials = (data: { message: string }) => {
      console.log("Received IPC message to clear FTP credentials:", data.message);
      localStorage.removeItem("ftpCredentials");
      localStorage.setItem("ftpCleared", "true");
      localStorage.removeItem("liveFeedImages");
      setCredentials(null);
      setIsFtpCleared(true);
      toast.info("FTP connection closed by app shutdown");
    };

    window.electronAPI.onClearFtpCredentials(handleClearCredentials);
    return () => {
      window.electronAPI.removeClearFtpCredentialsListener(handleClearCredentials);
    };
  }, []);

  const handleValueChange = useCallback((field: string, value: string) => {
    setFormValues((prev) => {
      const updatedValues = { ...prev, [field]: value };
      localStorage.setItem("formValues", JSON.stringify(updatedValues));
      return updatedValues;
    });
  }, []);

  const openDirectoryPicker = useCallback(async () => {
    try {
      const path = await window.electronAPI.selectFolder();
      if (path) {
        handleValueChange("directory", path);
        toast.success(`Selected folder: ${path}`);
      } else {
        toast.warning("No folder selected.");
      }
    } catch (err: any) {
      console.error("Electron selectFolder error:", err);
      toast.error("Failed to select folder.");
    }
  }, [handleValueChange]);

  const handleRegeneratePassword = useCallback(async () => {
    try {
      const result = await window.electronAPI.regenerateFtpPassword(username);
      if (result.password) {
        setCredentials((prev) =>
          prev ? { ...prev, password: result.password } : prev
        );
        localStorage.setItem(
          "ftpCredentials",
          JSON.stringify({ ...credentials, username, password: result.password })
        );
        toast.success("Password regenerated successfully");
      }
    } catch (err: any) {
      console.error("Regenerate password error:", err);
      toast.error("Failed to regenerate password");
    }
  }, [credentials, username]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setLoading(true);
      setError(null);

      const { camera, album, directory } = formValues;
      const token = localStorage.getItem("token");

      if (!camera || !album || !directory || !token) {
        setError("Please fill all fields and ensure you are logged in");
        toast.error("All fields and authentication token are required");
        setLoading(false);
        return;
      }

      const pathRegex = /^(?:[a-zA-Z]:[\\/][^\0<>:;"|?*]+|\/[\w\/.-]+)$/;
      if (!pathRegex.test(directory)) {
        setError("Invalid directory path");
        toast.error(
          "Please enter a valid directory path (e.g., C:\\Users\\chava\\Pictures or /home/user/images)"
        );
        setLoading(false);
        return;
      }

      try {
        const savedCredentials = localStorage.getItem("ftpCredentials");
        let credentials = savedCredentials ? JSON.parse(savedCredentials) : null;

        if (credentials && credentials.username !== username) {
          await window.electronAPI.resetFtpCredentials();
          credentials = null;
        }

        const data = await window.electronAPI.startFtp({
          username,
          directory,
          albumId: album,
          token,
        });

        if (data.error) {
          throw new Error(data.error);
        }

        setCredentials(data);
        setIsFtpCleared(false);
        localStorage.setItem("ftpCredentials", JSON.stringify(data));
        localStorage.setItem("ftpCleared", "false");
        toast.success("FTP server started successfully");
        navigate(`/connect`, { replace: true });
      } catch (err: any) {
        const message = err.message || "Failed to start FTP server";
        setError(message);
        toast.error(message);
      } finally {
        setLoading(false);
      }
    },
    [formValues, navigate, username]
  );

  const handleCloseConnection = useCallback(async () => {
    try {
      await window.electronAPI.closeFtp();
      setCredentials(null);
      setIsFtpCleared(true);
      localStorage.setItem("ftpCleared", "true");
      localStorage.removeItem("liveFeedImages");
      navigate(`/connect`, { replace: true });
      toast.success("Connection closed");
    } catch (err: any) {
      console.error("Error closing connection:", err);
      toast.error("Failed to close connection");
      setCredentials(null);
      setIsFtpCleared(true);
      localStorage.setItem("ftpCleared", "true");
      localStorage.removeItem("liveFeedImages");
      navigate(`/connect`, { replace: true });
    }
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl w-full grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Side: Form and Credentials */}
        <div className="space-y-6">
          {/* Form Container */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 sm:p-8">
            <h3 className="text-2xl font-semibold text-black mb-6">Setup FTP Connection</h3>
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Camera Selection */}
              <div className="space-y-2">
                <label htmlFor="camera" className="block text-sm font-medium text-black">
                  Select Camera
                </label>
                <select
                  id="camera"
                  value={formValues.camera}
                  onChange={(e) => handleValueChange("camera", e.target.value)}
                  className="w-full px-4 py-2 bg-white text-black border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black transition-colors"
                >
                  <option value="" disabled>
                    Choose a camera
                  </option>
                  {cameras.map((camera) => (
                    <option key={camera.id} value={camera.id}>
                      {camera.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Album Selection */}
              <div className="space-y-2">
                <label htmlFor="album" className="block text-sm font-medium text-black">
                  Select Album
                </label>
                <select
                  id="album"
                  value={formValues.album}
                  onChange={(e) => handleValueChange("album", e.target.value)}
                  className="w-full px-4 py-2 bg-white text-black border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black transition-colors"
                >
                  <option value="" disabled>
                    Choose an album
                  </option>
                  {albums.map((album) => (
                    <option key={album.id} value={album.id}>
                      {album.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Directory Input */}
              <div className="space-y-2">
                <label htmlFor="directory" className="block text-sm font-medium text-black">
                  Select Local Directory
                </label>
                <div className="flex items-center space-x-3">
                  <input
                    id="directory"
                    placeholder="Select or enter directory path (e.g., C:\Users\chava\Pictures)"
                    value={formValues.directory}
                    onChange={(e) => handleValueChange("directory", e.target.value)}
                    className="flex-1 px-4 py-2 bg-white text-black border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black transition-colors"
                  />
                  <button
                    type="button"
                    onClick={openDirectoryPicker}
                    className="px-4 py-2 bg-white text-black border border-gray-300 rounded-md hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-black transition-colors"
                  >
                    Browse
                  </button>
                </div>
                {formValues.directory && (
                  <p className="text-sm text-gray-500">Selected: {formValues.directory}</p>
                )}
              </div>

              {/* Connect to FTP Button */}
              {(!credentials || isFtpCleared) && (
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full px-4 py-2 bg-black text-white rounded-md hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-black disabled:opacity-50 transition-colors"
                >
                  {loading ? (
                    <span className="flex items-center justify-center">
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
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>
                      Connecting...
                    </span>
                  ) : (
                    "Connect to FTP"
                  )}
                </button>
              )}
              {error && <p className="text-sm text-red-500">{error}</p>}
            </form>
          </div>

          {/* Credentials Card */}
          {credentials && !isFtpCleared && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 sm:p-8">
              <div className="flex items-center justify-between mb-6">
                <img src={logo} alt="Fotos Logo" className="h-8 object-contain" />
                <div className="flex items-center space-x-2">
                  <span className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></span>
                  <span className="text-sm font-medium text-black">Live</span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between gap-6">
                <div className="flex-shrink-0">
                  <img
                    src="https://cdn-icons-png.flaticon.com/512/10770/10770967.png"
                    alt="Avatar"
                    className="w-24 h-24 sm:w-32 sm:h-32 rounded-full object-cover"
                  />
                </div>

                <div className="space-y-3 w-full">
                  <div className="flex items-center justify-between">
                    <span className="w-24 font-semibold text-black">Host:</span>
                    <span className="truncate text-black">{credentials.host}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="w-24 font-semibold text-black">Username:</span>
                    <span className="truncate text-black">{credentials.username}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="w-24 font-semibold text-black">Password:</span>
                    <div className="flex items-center space-x-2">
                      <span className="truncate text-black">{credentials.password}</span>
                      <button
                        onClick={handleRegeneratePassword}
                        className="p-1.5 bg-white border border-gray-300 rounded-full hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-black transition-colors"
                      >
                        <RefreshCw className="h-4 w-4 text-black" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="w-24 font-semibold text-black">Port:</span>
                    <span className="text-black">{credentials.port}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="w-24 font-semibold text-black">Mode:</span>
                    <span className="text-black">{credentials.mode}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={handleCloseConnection}
                className="w-full mt-6 px-4 py-2 bg-black text-white rounded-md hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-black transition-colors"
              >
                Close Connection
              </button>
            </div>
          )}
        </div>

        {/* Right Side: Live Feed */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 sm:p-8">
          {formValues.camera && formValues.album && formValues.directory ? (
            <Suspense
              fallback={
                <div className="text-center py-12">
                  <svg
                    className="animate-spin h-8 w-8 text-black mx-auto"
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
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  <p className="mt-2 text-gray-500">Loading...</p>
                </div>
              }
            >
              <LiveFeed reset={credentials === null || isFtpCleared} />
            </Suspense>
          ) : (
            <div className="flex flex-col items-center justify-center py-12">
              <svg
                className="h-16 w-16 text-gray-500 mb-4"
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
              <p className="text-gray-500 text-center text-sm">
                Please connect to FTP to view the live feed.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ClientConnectForm;