"use client";

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Suspense } from "react";
import LiveFeed from "./LiveFeed";
import { RefreshCw } from "lucide-react";
import type { Camera, ConnectionDetails } from "../constants/type";
import logo from "/assets/monotype-white.svg";
import { CustomSelect } from "@/components/common/CustomSelect";

interface ClientConnectFormProps {
  cameras: Camera[];
  albums: { id: string; name: string }[];
  username: string;
}

interface ElectronAPI {
  selectFolder: () => Promise<string | null>;
  startFtp: (config: {
    username: string;
    directory: string;
    albumId: string;
    albumName: string; // Add albumName to interface
    token: string;
  }) => Promise<ConnectionDetails | { error: string }>; // Allow error response
  getFtpCredentials: () => Promise<ConnectionDetails[]>;
  resetFtpCredentials: () => Promise<{ message: string }>;
  testFtpCredentials: (credentials: {
    username: string;
    password: string;
  }) => Promise<{ valid: boolean; expected?: string }>;
  regenerateFtpPassword: (username: string) => Promise<{ password: string }>;
  onImageStream: (callback: (data: { action: string; imageUrl?: string }) => void) => void;
  removeImageStreamListener: (callback: (data: { action: string; imageUrl?: string }) => void) => void;
  closeFtp: () => Promise<{ message: string }>;
  checkFtpStatus: () => Promise<{ isRunning: boolean; credentials: ConnectionDetails[] }>;
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
  const [isFtpCleared, setIsFtpCleared] = useState<boolean>(true);

  const loadCredentials = useCallback(async () => {
    try {
      const savedCredentials = localStorage.getItem("ftpCredentials");
      const ftpCleared = localStorage.getItem("ftpCleared") === "true";

      const { isRunning, credentials: backendCredentials } = await window.electronAPI.checkFtpStatus();
      // console.log("FTP server status:", { isRunning, backendCredentials });

      if (isRunning && backendCredentials.length > 0) {
        const creds = backendCredentials[0];
        setCredentials(creds);
        localStorage.setItem("ftpCredentials", JSON.stringify(creds));
        localStorage.setItem("ftpCleared", "false");
        setIsFtpCleared(false);
        console.log("Set backend credentials:", creds);
        return;
      }

      // If no backend credentials, check localStorage
      if (savedCredentials && !ftpCleared) {
        const parsedCreds = JSON.parse(savedCredentials);
        // Validate credentials without strict username check
        const { valid } = await window.electronAPI.testFtpCredentials({
          username: parsedCreds.username,
          password: parsedCreds.password,
        });
        if (valid) {
          setCredentials(parsedCreds);
          setIsFtpCleared(false);
          localStorage.setItem("ftpCleared", "false");
          console.log("Set valid localStorage credentials:", parsedCreds);
        } else {
          setCredentials(null);
          setIsFtpCleared(true);
          localStorage.removeItem("ftpCredentials");
          localStorage.setItem("ftpCleared", "true");
          console.log("Invalid credentials in localStorage, cleared");
        }
      } else {
        setCredentials(null);
        setIsFtpCleared(true);
        localStorage.setItem("ftpCleared", "true");
        console.log("No valid credentials found");
      }
    } catch (err) {
      console.error("Failed to load credentials:", err);
      toast.error("Failed to load FTP server status");
      if (!credentials) {
        setIsFtpCleared(true);
        localStorage.setItem("ftpCleared", "true");
      }
    }
  }, [credentials]);

  useEffect(() => {
    const loadPersistedState = async () => {
      let initialFormValues;
      const savedFormValues = localStorage.getItem("formValues");
      // console.log("Loading form values from localStorage:", savedFormValues);

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

      await loadCredentials();
    };

    loadPersistedState();
  }, [loadCredentials]);

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
          prev ? { ...prev, password: result.password } : null
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

      const pathRegex = /^(?:[a-zA-Z]:[\\\/][^\0<>*:"|?*]+|\/[\w\/.-]+)$/;
      if (!pathRegex.test(directory)) {
        setError("Invalid directory path");
        toast.error(
          "Please enter a valid directory path (e.g., C:\\Users\\Example\\Pictures or /home/user/images)"
        );
        setLoading(false);
        return;
      }

      // Get albumName from the user-selected album
      const selectedAlbum = albums.find((a) => a.id === album);
      const albumName = selectedAlbum ? selectedAlbum.name : "";

      if (!albumName) {
        setError("Selected album not found");
        toast.error("Album not found");
        setLoading(false);
        return;
      }

      try {
        const savedCredentials = localStorage.getItem("ftpCredentials");
        let existingCredentials = savedCredentials ? JSON.parse(savedCredentials) : null;

        if (existingCredentials) {
          await window.electronAPI.closeFtp();
          localStorage.removeItem("ftpCredentials");
          localStorage.setItem("ftpCleared", "true");
          setIsFtpCleared(true);
          existingCredentials = null;
        }

        console.log(albumName + "dddeee");

        const data = await window.electronAPI.startFtp({
          username,
          directory,
          albumId: album,
          albumName,
          token,
        });

        if ("error" in data) {
          throw new Error(data.error);
        }

        setCredentials(data);
        setIsFtpCleared(false);
        localStorage.setItem("ftpCredentials", JSON.stringify(data));
        localStorage.setItem("ftpCleared", "false");
        toast.success("FTP server started successfully");
      } catch (err: any) {
        const message = err.message || "Failed to start FTP server";
        setError(message);
        toast.error(message);
      } finally {
        setLoading(false);
      }
    },
    [formValues, navigate, username, albums]
  );

  const handleCloseConnection = useCallback(async () => {
    try {
      await window.electronAPI.closeFtp();
      console.log("FTP server closed");
      setCredentials(null);
      setIsFtpCleared(true);
      localStorage.removeItem("ftpCredentials");
      localStorage.removeItem("liveFeedImages");
      localStorage.setItem("ftpCleared", "true");
      toast.success("Connection closed successfully");
      navigate("/connect", { replace: true });
    } catch (err: any) {
      console.error("Error closing connection:", err);
      toast.error("Failed to close connection");
      setCredentials(null);
      setIsFtpCleared(true);
      localStorage.removeItem("ftpCredentials");
      localStorage.removeItem("liveFeedImages");
      localStorage.setItem("ftpCleared", "true");
      navigate("/connect", { replace: true });
    }
  }, [navigate]);

  return (
    <div className="min-h-60 flex items-center justify-center">
      <div className="max-w-7xl w-full grid grid-cols-1 lg:grid-cols-2 gap-4 mx-auto">
        <div className="space-y-4">
          <div className="bg-white/70 rounded-2xl shadow-md border border-gray-200 p-4 sm:p-6">
            <h3 className="text-xl font-semibold text-gray-900 mb-4 leading-6">Event</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="camera" className="block text-sm font-medium text-gray-700 leading-5">
                  Select Camera
                </label>
                <CustomSelect
                  id="camera"
                  value={formValues.camera}
                  onChange={(value) => handleValueChange("camera", value)}
                  options={cameras.map(camera => ({ id: camera.id, name: camera.name }))}
                  placeholder="Choose a camera"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="album" className="block text-sm font-medium text-gray-700 leading-5">
                  Select Album
                </label>
                <CustomSelect
                  id="album"
                  value={formValues.album}
                  onChange={(value) => handleValueChange("album", value)}
                  options={albums}
                  placeholder="Choose an album"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="directory" className="block text-sm font-medium text-gray-700 leading-5">
                  Select Local Directory
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    id="directory"
                    placeholder="Enter directory path (e.g., C:\Users\Name\Pictures)"
                    value={formValues.directory}
                    onChange={(e) => handleValueChange("directory", e.target.value)}
                    className="flex-1 px-4 py-3 bg-white text-gray-900 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-600 placeholder-gray-500 transition-all duration-300 ease-in-out text-sm leading-5"
                  />
                  <button
                    type="button"
                    onClick={openDirectoryPicker}
                    className="px-4 py-3 bg-gray-100 text-gray-900 border border-gray-300 rounded-xl hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-600 transition-all duration-300 ease-in-out text-sm leading-5"
                  >
                    Browse
                  </button>
                </div>
              </div>

              {(!credentials || isFtpCleared) && (
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full px-4 py-3 bg-black text-white rounded-xl hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-600 disabled:opacity-50 transition-all duration-300 ease-in-out text-sm leading-5"
                >
                  {loading ? (
                    <span className="flex items-center justify-center">
                      <svg
                        className="animate-spin h-4 w-4 mr-2 text-white"
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
              {error && <p className="text-sm text-red-500 leading-5">{error}</p>}
            </form>
          </div>

          {credentials && !isFtpCleared && (
            <div className="bg-black/95 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-700/50 p-4 sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <img src={logo} alt="Fotos Logo" className="h-6 object-contain" />
                <div className="flex items-center space-x-2">
                  <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse shadow-lg shadow-green-400/50"></span>
                  <span className="text-sm font-medium text-green-400 leading-5">Live</span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between gap-4">
                <div className="flex-shrink-0">
                  <img
                    src="https://cdn-icons-png.flaticon.com/512/10770/10770967.png"
                    alt="Avatar"
                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover border-2 border-gray-600/80 shadow-lg"
                  />
                </div>

                <div className="space-y-1 w-full">
                  <div className="flex items-center justify-between rounded-lg p-2">
                    <span className="w-16 font-semibold text-white text-sm leading-5">Host:</span>
                    <span className="truncate text-white font-medium text-sm leading-5">{credentials.host}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg p-2">
                    <span className="w-16 font-semibold text-white text-sm leading-5">Username:</span>
                    <span className="truncate text-white font-medium text-sm leading-5">{credentials.username}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg p-2">
                    <span className="w-16 font-semibold text-white text-sm leading-5">Password:</span>
                    <div className="flex items-center space-x-2">
                      <span className="truncate text-white font-medium text-sm leading-5">{credentials.password}</span>
                      <button
                        onClick={handleRegeneratePassword}
                        className="p-1.5 rounded-lg focus:outline-none focus:ring-2 transition-all duration-200 ease-in-out shadow-md"
                      >
                        <RefreshCw className="h-4 w-4 text-white" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-lg p-2">
                    <span className="w-16 font-semibold text-white text-sm leading-5">Port:</span>
                    <span className="text-white text-sm font-medium leading-5">{credentials.port}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg p-2">
                    <span className="w-16 font-semibold text-white text-sm leading-5">Mode:</span>
                    <span className="text-white text-sm font-medium leading-5">{credentials.mode}</span>
                  </div>
                </div>
              </div>

              <button
                onClick={handleCloseConnection}
                className="w-full mt-6 px-4 py-3 bg-red-600/90 hover:bg-red-500 text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-red-400/50 transition-all duration-200 ease-in-out text-sm font-medium leading-5 shadow-lg hover:shadow-red-500/25"
              >
                Close Connection
              </button>
            </div>
          )}
        </div>

        <div className="bg-white/70 rounded-2xl shadow-md border p-4 sm:p-6">
          {formValues.camera && formValues.album && formValues.directory ? (
            <Suspense
              fallback={
                <div className="text-center py-8">
                  <svg
                    className="animate-spin h-6 w-6 text-gray-500 mx-auto"
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
                  <p className="mt-2 text-gray-600 text-sm leading-5">Loading...</p>
                </div>
              }
            >
              <LiveFeed reset={credentials === null || isFtpCleared} />
            </Suspense>
          ) : (
            <div className="flex flex-col items-center justify-center py-8">
              <svg
                className="h-12 w-12 text-gray-500 mb-2"
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
              <p className="text-gray-600 text-center text-sm leading-5">
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
