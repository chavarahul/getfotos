import { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Card, CardHeader, CardTitle, CardContent } from "../components/ui/card";
import { Label } from "../components/ui/label";
import { Suspense } from "react";
import LiveFeed from "./LiveFeed";
import { PageLoader } from "../components/common/loaders";
import type { Camera, ConnectionDetails } from "../constants/type";
import logo from "/assets/monotype-white.svg";
import { RefreshCw } from "lucide-react";

interface ClientConnectFormProps {
  cameras: Camera[];
  albums: { id: string; name: string }[];
  username?: string;
  searchParams: { [key: string]: string | string[] | undefined };
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
  searchParams,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
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

  // Load persisted state and sync with backend
  useEffect(() => {
    const loadPersistedState = async () => {
      // Step 1: Check backend for existing FTP credentials
      try {
        const backendCredentials = await window.electronAPI.getFtpCredentials();
        if (backendCredentials.length > 0) {
          const creds = backendCredentials[0];
          setCredentials(creds);
          localStorage.setItem("ftpCredentials", JSON.stringify(creds));
        } else {
          const savedCredentials = localStorage.getItem("ftpCredentials");
          if (savedCredentials) {
            const parsedCredentials = JSON.parse(savedCredentials);
            setCredentials({
              host: parsedCredentials.host || "localhost",
              username: parsedCredentials.username || "user",
              password: parsedCredentials.password || "",
              port: parsedCredentials.port || 2121,
              mode: parsedCredentials.mode || "Passive",
            });
          }
        }
      } catch (err) {
        console.error("Failed to fetch FTP credentials from backend:", err);
      }

      // Step 2: Load form values, prioritizing localStorage
      const savedFormValues = localStorage.getItem("formValues");
      let initialFormValues;
      if (savedFormValues) {
        initialFormValues = JSON.parse(savedFormValues);
      } else {
        const urlParams = new URLSearchParams(location.search);
        initialFormValues = {
          camera: urlParams.get("camera") || (searchParams.camera as string) || "",
          album: urlParams.get("album") || (searchParams.album as string) || "",
          directory: urlParams.get("directory") || (searchParams.directory as string) || "",
        };
        localStorage.setItem("formValues", JSON.stringify(initialFormValues));
      }

      setFormValues(initialFormValues);

      // Step 3: Sync URL with loaded values
      const params = new URLSearchParams({
        camera: initialFormValues.camera,
        album: initialFormValues.album,
        directory: encodeURIComponent(initialFormValues.directory),
      });
      navigate(`${location.pathname}?${params.toString()}`, { replace: true });
    };

    loadPersistedState();
  }, [location.pathname, navigate]);

  // Save form values to localStorage and update URL
  useEffect(() => {
    localStorage.setItem("formValues", JSON.stringify(formValues));
    const params = new URLSearchParams({
      camera: formValues.camera,
      album: formValues.album,
      directory: encodeURIComponent(formValues.directory),
    });
    navigate(`${location.pathname}?${params.toString()}`, { replace: true });
  }, [formValues, navigate, location.pathname]);

  const openDirectoryPicker = useCallback(async () => {
    try {
      const path = await window.electronAPI.selectFolder();
      if (path) {
        setFormValues((prev) => ({ ...prev, directory: path }));
        toast.success(`Selected folder: ${path}`);
        console.log(`Selected directory: ${path}`);
      } else {
        toast.warning("No folder selected.");
      }
    } catch (err: any) {
      console.error("Electron selectFolder error:", err);
      toast.error("Failed to select folder.");
    }
  }, []);

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
      localStorage.setItem("ftpCredentials", JSON.stringify(data));
      toast.success("FTP server started successfully");
      console.log("FTP credentials received:", data);

      const params = new URLSearchParams({
        camera,
        album,
        directory: encodeURIComponent(directory),
        username: "user",
      });
      navigate(`/connect?${params.toString()}`);
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

  const handleValueChange = useCallback((field: string, value: string) => {
    console.log(`Updating ${field}: ${value}`);
    setFormValues((prev) => ({ ...prev, [field]: value }));
  }, []);

const handleCloseConnection = useCallback(async () => {
  try {
    await window.electronAPI.closeFtp();
    console.log("FTP connection closed, preserving credentials");
    setCredentials(null);
    localStorage.removeItem("liveFeedImages");
    navigate("/connect");
    toast.success("Connection closed");
  } catch (err: any) {
    console.error("Error closing connection:", err);
    toast.error("Failed to close connection");
  }
}, [navigate]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-6">
        <Card className="bg-white/50">
          <CardHeader>
            <CardTitle>Setup FTP Connection</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="camera">Select Camera</Label>
                <Select
                  value={formValues.camera}
                  onValueChange={(value) => handleValueChange("camera", value)}
                >
                  <SelectTrigger id="camera">
                    <SelectValue placeholder="Choose a camera" />
                  </SelectTrigger>
                  <SelectContent>
                    {cameras.map((camera) => (
                      <SelectItem key={camera.id} value={camera.id}>
                        {camera.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="album">Select Album</Label>
                <Select
                  value={formValues.album}
                  onValueChange={(value) => handleValueChange("album", value)}
                >
                  <SelectTrigger id="album">
                    <SelectValue placeholder="Choose an album" />
                  </SelectTrigger>
                  <SelectContent>
                    {albums.map((album) => (
                      <SelectItem key={album.id} value={album.id}>
                        {album.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="directory">Select Local Directory</Label>
                <div className="flex items-center space-x-2">
                  <Input
                    id="directory"
                    placeholder="Select or enter directory path (e.g., C:\\Users\\chava\\Pictures)"
                    value={formValues.directory}
                    onChange={(e) => handleValueChange("directory", e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={openDirectoryPicker}
                    className="w-24"
                  >
                    Browse
                  </Button>
                </div>
                {formValues.directory && (
                  <p className="text-sm text-gray-500">
                    Selected: {formValues.directory}
                  </p>
                )}
              </div>

              <Button type="submit" disabled={loading} className="w-full">
                {loading ? "Connecting..." : credentials ? "Reconnect FTP" : "Connect to FTP"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {credentials && (
          <div className="bg-black rounded-xl shadow-lg p-6 w-full">
            <div className="flex items-center justify-between mb-6">
              <img
                src={logo}
                alt="Fotos Logo"
                width={90}
                height={30}
                className="object-contain"
              />
              <div className="flex items-center space-x-1">
                <span className="w-3 h-3 bg-red-500 rounded-full"></span>
                <span className="text-sm font-medium text-white">Live</span>
              </div>
            </div>

            <div className="flex items-center justify-around">
              <div className="">
                <img
                  src="https://cdn-icons-png.flaticon.com/512/10770/10770967.png"
                  alt="Avatar"
                  className="w-32 h-32"
                />
              </div>

              <div className="">
                <div className="grid grid-cols-1 gap-y-3">
                  <div className="flex items-center">
                    <span className="w-24 font-semibold text-white">Host:</span>
                    <span className="text-white">{credentials.host}</span>
                  </div>
                  <div className="flex items-center">
                    <span className="w-24 font-semibold text-white">Username:</span>
                    <span className="text-white">{credentials.username}</span>
                  </div>
                  <div className="flex items-center">
                    <span className="w-24 font-semibold text-white">Password:</span>
                    <span className="text-white flex items-center">
                      {credentials.password}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleRegeneratePassword}
                        className="ml-2 text-white hover:text-gray-300"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </span>
                  </div>
                  <div className="flex items-center">
                    <span className="w-24 font-semibold text-white">Port:</span>
                    <span className="text-white">{credentials.port}</span>
                  </div>
                  <div className="flex items-center">
                    <span className="w-24 font-semibold text-white">Mode:</span>
                    <span className="text-white">{credentials.mode}</span>
                  </div>
                </div>
              </div>
            </div>
            <Button
              onClick={handleCloseConnection}
              variant="destructive"
              className="w-full mt-6"
            >
              Close Connection
            </Button>
          </div>
        )}
      </div>

      <div>
        {formValues.camera && formValues.album && formValues.directory ? (
          <Suspense fallback={<PageLoader />}>
            <LiveFeed reset={credentials === null} />
          </Suspense>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Live Image Feed</CardTitle>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default ClientConnectForm;