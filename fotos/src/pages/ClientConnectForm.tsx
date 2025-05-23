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
  username?: string;
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
  username = "user",
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

  // Load persisted state on mount
  useEffect(() => {
    const loadPersistedState = async () => {
      // Load form values from localStorage
      let initialFormValues;
      const savedFormValues = localStorage.getItem("formValues");
      console.log("Loading form values from localStorage:", savedFormValues);

      if (savedFormValues) {
        try {
          initialFormValues = JSON.parse(savedFormValues);
          console.log("Parsed form values from localStorage:", initialFormValues);
          // Ensure no null/undefined values
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
        console.log("No form values in localStorage, using default values");
        initialFormValues = { camera: "", album: "", directory: "" };
        localStorage.setItem("formValues", JSON.stringify(initialFormValues));
        console.log("Saved initial form values to localStorage:", initialFormValues);
      }

      setFormValues(initialFormValues);

      // Load FTP credentials, prioritizing backend state
      try {
        const backendCredentials = await window.electronAPI.getFtpCredentials();
        console.log("Backend FTP credentials:", backendCredentials);

        const ftpCleared = localStorage.getItem("ftpCleared") === "true";
        console.log("FTP cleared flag:", ftpCleared);
        setIsFtpCleared(ftpCleared);

        if (backendCredentials.length > 0) {
          const creds = backendCredentials[0];
          // If backend returns credentials, but ftpCleared is true, reset everything
          if (ftpCleared) {
            console.log("ftpCleared is true, resetting credentials despite backend response");
            setCredentials(null);
            setIsFtpCleared(true);
            localStorage.removeItem("ftpCredentials");
            localStorage.setItem("ftpCleared", "true");
            localStorage.removeItem("liveFeedImages");
            // Optionally, call resetFtpCredentials to clear backend state
            await window.electronAPI.resetFtpCredentials();
          } else {
            setCredentials(creds);
            setIsFtpCleared(false);
            localStorage.setItem("ftpCredentials", JSON.stringify(creds));
            localStorage.setItem("ftpCleared", "false");
            console.log("Set FTP credentials from backend:", creds);
          }
        } else {
          // Backend indicates no active FTP server, so clear localStorage and state
          console.log("No backend credentials, resetting localStorage and state");
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
  }, []); // No dependencies, runs only on mount

  // Listen for IPC message to clear FTP credentials and localStorage
  useEffect(() => {
    const handleClearCredentials = (data: { message: string }) => {
      console.log("Received IPC message to clear FTP credentials:", data.message);
      // Clear FTP-related items from localStorage
      localStorage.removeItem("ftpCredentials");
      localStorage.setItem("ftpCleared", "true");
      localStorage.removeItem("liveFeedImages");
      // Reset component state
      setCredentials(null);
      setIsFtpCleared(true);
      toast.info("FTP connection closed by app shutdown");
    };

    // Register the IPC listener
    window.electronAPI.onClearFtpCredentials(handleClearCredentials);

    // Cleanup the listener on component unmount
    return () => {
      window.electronAPI.removeClearFtpCredentialsListener(handleClearCredentials);
    };
  }, []);

  const handleValueChange = useCallback((field: string, value: string) => {
    console.log(`Updating ${field}: ${value}`);
    setFormValues((prev) => {
      const updatedValues = { ...prev, [field]: value };
      // Save to localStorage immediately on change
      console.log("Saving updated form values to localStorage:", updatedValues);
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
        console.log(`Selected directory: ${path}`);
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
      const result = await window.electronAPI.regenerateFtpPassword("user");
      if (result.password) {
        setCredentials((prev) =>
          prev ? { ...prev, password: result.password } : prev
        );
        localStorage.setItem(
          "ftpCredentials",
          JSON.stringify({ ...credentials, password: result.password })
        );
        toast.success("Password regenerated successfully");
        console.log("New password:", result.password);
      }
    } catch (err: any) {
      console.error("Regenerate password error:", err);
      toast.error("Failed to regenerate password");
    }
  }, [credentials]);

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

      console.log("Submitting:", { username: "user", directory, albumId: album });

      try {
        const savedCredentials = localStorage.getItem("ftpCredentials");
        let credentials = savedCredentials ? JSON.parse(savedCredentials) : null;

        if (!credentials || credentials.username !== "user") {
          await window.electronAPI.resetFtpCredentials();
          console.log("Credentials reset successfully");
        }

        const data = await window.electronAPI.startFtp({
          username: "user",
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
        console.log("FTP credentials received:", data);

        navigate(`/connect`, { replace: true });
      } catch (err: any) {
        const message = err.message || "Failed to start FTP server";
        setError(message);
        toast.error(message);
        console.error("FTP start error:", message);
      } finally {
        setLoading(false);
      }
    },
    [formValues, navigate]
  );

  const handleCloseConnection = useCallback(async () => {
    try {
      await window.electronAPI.closeFtp();
      console.log("FTP connection closed");
      setCredentials(null);
      setIsFtpCleared(true);
      localStorage.removeItem("ftpCredentials");
      localStorage.setItem("ftpCleared", "true");
      localStorage.removeItem("liveFeedImages");
      navigate(`/connect`, { replace: true });
      toast.success("Connection closed");
    } catch (err: any) {
      console.error("Error closing connection:", err);
      toast.error("Failed to close connection");
      setCredentials(null);
      setIsFtpCleared(true);
      localStorage.removeItem("ftpCredentials");
      localStorage.setItem("ftpCleared", "true");
      localStorage.removeItem("liveFeedImages");
      navigate(`/connect`, { replace: true });
    }
  }, [navigate]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
      {/* Left Side: Form and Credentials */}
      <div className="space-y-6">
        {/* Form Container */}
        <div className="bg-white/50 border border-gray-200 rounded-lg shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Setup FTP Connection</h3>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Camera Selection */}
            <div className="space-y-2">
              <label htmlFor="camera" className="block text-sm font-medium text-gray-700">
                Select Camera
              </label>
              <select
                id="camera"
                value={formValues.camera}
                onChange={(e) => handleValueChange("camera", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 sm:text-sm"
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
              <label htmlFor="album" className="block text-sm font-medium text-gray-700">
                Select Album
              </label>
              <select
                id="album"
                value={formValues.album}
                onChange={(e) => handleValueChange("album", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 sm:text-sm"
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
              <label htmlFor="directory" className="block text-sm font-medium text-gray-700">
                Select Local Directory
              </label>
              <div className="flex items-center space-x-2">
                <input
                  id="directory"
                  placeholder="Select or enter directory path (e.g., C:\\Users\\chava\\Pictures)"
                  value={formValues.directory}
                  onChange={(e) => handleValueChange("directory", e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 sm:text-sm"
                />
                <button
                  type="button"
                  onClick={openDirectoryPicker}
                  className="w-24 px-3 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-500"
                >
                  Browse
                </button>
              </div>
              {formValues.directory && (
                <p className="text-sm text-gray-500">Selected: {formValues.directory}</p>
              )}
            </div>

            {/* Conditionally render Connect to FTP button */}
            {(!credentials || isFtpCleared) && (
              <button
                type="submit"
                disabled={loading}
                className="w-full px-4 py-2 bg-gray-900 text-white rounded-md hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-700 disabled:opacity-50"
              >
                {loading ? "Connecting..." : "Connect to FTP"}
              </button>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
          </form>
        </div>

        {/* Credentials Card (Visible when connected) */}
        {credentials && !isFtpCleared && (
          <div className="bg-black rounded-xl shadow-lg p-6 w-full text-white">
            <div className="flex items-center justify-between mb-6">
              <img src={logo} alt="Fotos Logo" className="h-8 object-contain" />
              <div className="flex items-center space-x-1">
                <span className="w-3 h-3 bg-red-500 rounded-full"></span>
                <span className="text-sm font-medium">Live</span>
              </div>
            </div>

            <div className="flex items-center justify-around">
              <div>
                <img
                  src="https://cdn-icons-png.flaticon.com/512/10770/10770967.png"
                  alt="Avatar"
                  className="w-32 h-32"
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center">
                  <span className="w-24 font-semibold">Host:</span>
                  <span>{credentials.host}</span>
                </div>
                <div className="flex items-center">
                  <span className="w-24 font-semibold">Username:</span>
                  <span>{credentials.username}</span>
                </div>
                <div className="flex items-center">
                  <span className="w-24 font-semibold">Password:</span>
                  <span className="flex items-center">
                    {credentials.password}
                    <button
                      onClick={handleRegeneratePassword}
                      className="ml-2 p-1 hover:text-gray-300 focus:outline-none"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </button>
                  </span>
                </div>
                <div className="flex items-center">
                  <span className="w-24 font-semibold">Port:</span>
                  <span>{credentials.port}</span>
                </div>
                <div className="flex items-center">
                  <span className="w-24 font-semibold">Mode:</span>
                  <span>{credentials.mode}</span>
                </div>
              </div>
            </div>
            <button
              onClick={handleCloseConnection}
              className="w-full mt-6 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              Close Connection
            </button>
          </div>
        )}
      </div>

      {/* Right Side: Live Feed */}
      <div>
        {formValues.camera && formValues.album && formValues.directory ? (
          <Suspense fallback={<div className="text-center py-6">Loading...</div>}>
            <LiveFeed reset={credentials === null || isFtpCleared} />
          </Suspense>
        ) : (
          <div className="border border-gray-200 rounded-lg shadow-sm p-6 bg-white">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Live Image Feed</h3>
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
              <p className="text-gray-500 text-center">
                Please connect to FTP to view the live feed.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ClientConnectForm;