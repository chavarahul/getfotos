"use client";

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import BGonboarding from "/assets/bg-onboarding.png";
import OnBoardingSVG from "/assets/onboarding.svg";
import Logo from "/assets/monotype-white.svg";
import { Link } from "react-router-dom";
import axiosInstance from "../utils/api";
import debounce from "lodash.debounce";
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useAuth } from "@/hooks/useAuth";

interface User {
  id: string;
  name: string;
  email: string;
}

interface ElectronAPI {
  saveCollections: (collections: any) => Promise<{ success: boolean; error?: string }>;
  loadCollections: () => Promise<any[]>;
  saveData: (type: string, data: any) => Promise<{ success: boolean; error?: string }>;
  loadData: (type: string) => Promise<any[]>;
  googleLogin: () => Promise<string>;
  exchangeAuthCode: (code: string) => Promise<{ id_token: string }>;
  nodeVersion: (msg: string) => Promise<string>;
  selectFolder: () => Promise<string | null>;
  ping: () => Promise<string>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

const Login = () => {
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string>("");
  const [isElectron, setIsElectron] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();


  useEffect(() => {
    if (isAuthenticated) navigate("/dashboard");
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    const checkElectron = async () => {
      if (window.electronAPI) {
        try {
          const response = await window.electronAPI.ping();
          console.log("Ping response:", response);
          setIsElectron(response === "pong");
        } catch (err) {
          console.log("Not running in Electron:", err);
          setIsElectron(false);
        }
      } else {
        console.log("window.electronAPI not available");
        setIsElectron(false);
      }
    };

    checkElectron();
  }, [navigate]);

  const handleGoogleLogin = useCallback(
    debounce(async () => {
      if (isLoading) {
        console.log("Login already in progress, ignoring request");
        return;
      }

      try {
        setError("");
        setIsLoading(true);

        if (!isElectron || !window.electronAPI) {
          throw new Error("This feature is only available in the desktop app");
        }

        console.log("Step 1: Initiating Google OAuth flow");
        const code = await window.electronAPI.googleLogin();
        console.log("Authorization code received:", code ? code.slice(0, 10) + "..." : "null");
        if (!code) {
          throw new Error("No authorization code received");
        }

        const { id_token } = await window.electronAPI.exchangeAuthCode(code);
        console.log("ID token received:", id_token ? id_token.slice(0, 10) + "..." : "null");
        if (!id_token) {
          throw new Error("No ID token received");
        }

        const response = await axiosInstance.post("/api/auth/google", {
          token: id_token,
        });
        console.log("Backend response:", response.data);

        const userData: User = response.data.user;
        setUser(userData);

        if (!response.data.token) {
          throw new Error("No token received from backend");
        }

        const saveResult = await window.electronAPI.saveUser(userData);
        if (!saveResult.success) {
          console.error("Failed to save user locally:", saveResult.error);
        } else {
          console.log("User data saved locally via Electron IPC.");
        }

        localStorage.setItem("token", response.data.token);
        localStorage.setItem("result", saveResult.success ? "true" : "false");

        toast.success("Login Successful");
        console.log(response.data.token)
        navigate("/dashboard");
      } catch (err) {
        console.error("Error during Google sign-in:", err);
        const errorMessage =
          err instanceof Error
            ? err.message
            : "Failed to sign in with Google. Please try again.";
        setError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    }, 1000, { leading: true, trailing: false }),
    [isElectron, isLoading, navigate]
  );

  return (
    <div className="flex w-full h-screen overflow-hidden font-sans">
      <div className="w-1/2 p-20 flex flex-col justify-between">
        <div>
          <div className="text-4xl font-bold mb-2">
            Welcome <span className="inline-block transform rotate-12">✌️</span>
          </div>
          <div className="text-gray-600 mb-8">Glad to see you back</div>
          {error && <div className="text-red-500 text-sm mb-4">{error}</div>}
          <Button
            className="cursor-pointer border w-full bg-black text-white font-semibold font-['Montserrat'] hover:bg-black/85 rounded-[6px] py-2"
            onClick={handleGoogleLogin}
            disabled={isLoading}
          >
            {isLoading ? "Signing in..." : "Sign in with Google"}
          </Button>
          <div className="text-xs text-gray-600 mt-5">
            by continuing you agree to our{' '}
            <Link to="#" className="text-blue-600">terms and conditions</Link> and{' '}
            <Link to="#" className="text-blue-600">privacy policy</Link>
          </div>
        </div>
        <div className="text-xs text-gray-600 mt-5">
          For help, consult our{' '}
          <Link to="#" className="text-blue-600">documentation</Link> or contact{' '}
          <Link to="#" className="text-blue-600">support</Link>. The docs offer step-by-step guidance on common issues. If needed, reach out to our support team via email, chat, or phone. Prompt assistance ensures a smooth experience with our product or service.
        </div>
      </div>
      <div className="w-1/2 bg-black text-white flex flex-col justify-center items-center relative">
        <div
          className="w-full h-screen bg-cover opacity-10 bg-center"
          style={{ backgroundImage: `url(${BGonboarding})` }}
        ></div>
        <div className="absolute top-0 max-h-screen w-full h-screen flex flex-col items-center justify-between">
          <img src={Logo} alt="Logo" className="my-4 w-60 px-14 py-7" />
          <div className="h-40 mb-4 flex-col justify-center items-center gap-4 inline-flex">
            <div className="text-4xl px-8 font-bold font-['Montserrat'] text-center">
              Your attendee experience<br /> is our utmost priority
            </div>
            <div className="text-xl font-medium font-['Montserrat']">
              Making Events Memorable with AI
            </div>
          </div>
          <img src={OnBoardingSVG} alt="Onboarding" className="w-full" />
        </div>
      </div>
    </div>
  );
};

export default Login;