// src/components/Login.tsx
"use client";

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import BGonboarding from "/assets/bg-onboarding.png";
import OnBoardingSVG from "/assets/onboarding.svg";
import Logo from "/assets/monotype-white.svg";
import { Link } from "react-router-dom";
import axiosInstance from "../utils/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";

interface ElectronAPI {
  saveUser: (user: any) => Promise<{ success: boolean; error?: string }>;
  loadUser: () => Promise<{ id: any; success: boolean; user?: any; error?: string }>;
  ping: () => Promise<string>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

interface FormData {
  firstName: string;
  lastName: string;
  email: string;
  otp: string;
  password: string;
  confirmPassword: string;
  phone: string;
  phoneOtp: string;
  emailVerified: boolean;
  phoneVerified: boolean;
}

const Login = () => {
  const [step, setStep] = useState<"login" | "register1" | "register2" | "forgot1" | "forgot2">("login");
  const [formData, setFormData] = useState<FormData>({
    firstName: "",
    lastName: "",
    email: "",
    otp: "",
    password: "",
    confirmPassword: "",
    phone: "",
    phoneOtp: "",
    emailVerified: false,
    phoneVerified: false,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [showOtp, setShowOtp] = useState(false);
  const navigate = useNavigate();

  // Debug step changes
  useEffect(() => {
    console.log("Step changed to:", step, "formData:", formData);
  }, [step, formData]);

  const validateEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const validatePhone = (phone: string) => {
    return /^\+?[\d\s-]{10,}$/.test(phone);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError("");
  };

  const handleVerifyEmail = async () => {
    if (!formData.firstName || !formData.lastName || !formData.email) {
      setError("Please fill in all fields");
      return;
    }
    if (!validateEmail(formData.email)) {
      setError("Please enter a valid email address");
      return;
    }

    try {
      setIsLoading(true);
      await axiosInstance.post("/api/auth/send-email-otp", { email: formData.email });
      setShowOtp(true);
      toast.success("OTP sent to your email");
    } catch (err) {
      setError(err.response?.data?.error || "Failed to send OTP");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegisterStep1 = async () => {
    if (!formData.otp) {
      setError("Please enter OTP");
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (formData.password.length < 8) {
      setError("Password must be at least 8 characters long");
      return;
    }

    try {
      setIsLoading(true);
      await axiosInstance.post("/api/auth/verify-email-otp", {
        email: formData.email,
        otp: formData.otp,
      });
      setFormData({ ...formData, emailVerified: true });
      setStep("register2");
      setShowOtp(false);
      toast.success("Email verified successfully");
    } catch (err) {
      setError(err.response?.data?.error || "Invalid OTP or verification failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyPhone = async () => {
    if (!formData.phone) {
      setError("Please enter phone number");
      return;
    }
    if (!validatePhone(formData.phone)) {
      setError("Please enter a valid phone number");
      return;
    }
    try {
      setIsLoading(true);
      console.log("Simulated phone OTP sent for:", formData.phone);
      setShowOtp(true);
      toast.success("OTP sent to your phone (Use 654321 for testing)");
    } catch (err) {
      setError("Failed to process phone verification");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegisterStep2 = async () => {
    try {
      setIsLoading(true);
      const userData = {
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email.trim(),
        password: formData.password.trim(),
        phone: formData.phone.trim(),
        emailVerified: formData.emailVerified,
        phoneVerified: true,
      };

      if (navigator.onLine) {
        const response = await axiosInstance.post("/api/auth/register", userData);

        if (window.electronAPI) {
          const saveResult = await window.electronAPI.saveUser({
            id: response.data.user.id,
            name: response.data.user.name,
            email: response.data.user.email,
            phone: response.data.user.phone,
            emailVerified: !!response.data.user.emailVerified,
            phoneVerified: !!response.data.user.phoneVerified,
            token: response.data.token,
          });
          if (!saveResult.success) {
            console.error("Failed to save user data locally:", saveResult.error);
          }
        }

        localStorage.setItem("token", response.data.token);
        toast.success("Registration Successful");
        navigate("/dashboard");
      } else if (window.electronAPI) {
        const saveResult = await window.electronAPI.saveUser({
          id: Date.now().toString(),
          name: `${formData.firstName} ${formData.lastName}`,
          email: formData.email,
          phone: formData.phone,
          emailVerified: formData.emailVerified,
          phoneVerified: true,
          token: "offline-token",
        });
        if (saveResult.success) {
          localStorage.setItem("token", "offline-token");
          toast.success("Registration saved locally. Will sync when online.");
          navigate("/dashboard");
        } else {
          throw new Error("Failed to save user data locally");
        }
      } else {
        throw new Error("Offline registration not supported");
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Registration failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!formData.email || !formData.password) {
      setError("Please fill in all fields");
      return;
    }
    try {
      setIsLoading(true);
      const response = await axiosInstance.post("/api/auth/login", {
        email: formData.email.trim(),
        password: formData.password.trim(),
      });

      if (window.electronAPI) {
        await window.electronAPI.saveUser({
          id: response.data.user.id,
          name: response.data.user.name,
          email: response.data.user.email,
          phone: response.data.user.phone,
          emailVerified: !!response.data.user.emailVerified,
          phoneVerified: !!response.data.user.phoneVerified,
          token: response.data.token,
        });
      }
      localStorage.setItem("token", response.data.token);
      toast.success("Login Successful");
      navigate("/dashboard");
    } catch (err) {
      setError(err.response?.data?.error || "Invalid email or password");
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPasswordStep1 = async () => {
    if (!formData.email) {
      setError("Please enter your email");
      return;
    }
    if (!validateEmail(formData.email)) {
      setError("Please enter a valid email address");
      return;
    }
    try {
      setIsLoading(true);
      await axiosInstance.post("/api/auth/send-email-otp", { email: formData.email });
      setShowOtp(true);
      toast.success("OTP sent to your email");
      setStep("forgot2");
    } catch (err) {
      setError(err.response?.data?.error || "Failed to send OTP");
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPasswordStep2 = async () => {
    if (!formData.otp) {
      setError("Please enter OTP");
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (formData.password.length < 8) {
      setError("Password must be at least 8 characters long");
      return;
    }

    try {
      setIsLoading(true);
      if (navigator.onLine) {
        const response = await axiosInstance.post("/api/auth/forgot-password", {
          email: formData.email,
          otp: formData.otp,
          newPassword: formData.password,
        });

        if (window.electronAPI) {
          const saveResult = await window.electronAPI.saveUser({
            id: response.data.user.id,
            name: response.data.user.name,
            email: response.data.user.email,
            phone: response.data.user.phone,
            emailVerified: !!response.data.user.emailVerified,
            phoneVerified: !!response.data.user.phoneVerified,
            token: response.data.token,
          });
          if (!saveResult.success) {
            console.error("Failed to save user data locally:", saveResult.error);
          }
        }

        localStorage.setItem("token", response.data.token);
        toast.success("Password reset successfully");
        setStep("login");
        setShowOtp(false);
        setFormData({
          ...formData,
          otp: "",
          password: "",
          confirmPassword: "",
        });
      } else if (window.electronAPI) {
        await window.electronAPI.appendToSyncQueue({
          action: "forgot-password",
          email: formData.email,
          otp: formData.otp,
          newPassword: formData.password,
        });
        toast.success("Password reset queued. Will sync when online.");
        setStep("login");
        setShowOtp(false);
        setFormData({
          ...formData,
          otp: "",
          password: "",
          confirmPassword: "",
        });
      } else {
        throw new Error("Offline password reset not supported");
      }
    } catch (err) {
      setError(err.response?.data?.error || "Invalid OTP or reset failed");
    } finally {
      setIsLoading(false);
    }
  };

  console.log("Rendering Login with step:", step);

  return (
    <div className="flex w-full h-screen overflow-hidden font-sans">
      <div className="w-1/2 p-20 flex flex-col justify-between">
        <div>
          <div className="text-4xl font-bold mb-2">
            Welcome <span className="inline-block transform rotate-12">✌️</span>
          </div>
          <div className="text-gray-600 mb-8">Glad to see you back</div>
          {error && <div className="text-red-500 text-sm mb-4">{error}</div>}

          {step === "login" ? (
            <div className="space-y-4">
              <input
                type="email"
                name="email"
                placeholder="Email"
                value={formData.email}
                onChange={handleInputChange}
                className="w-full p-2 border rounded"
              />
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  placeholder="Password"
                  value={formData.password}
                  onChange={handleInputChange}
                  className="w-full p-2 border rounded"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              <Button
                className="w-full bg-black text-white hover:bg-black/85 rounded-[6px] py-2"
                onClick={handleLogin}
                disabled={isLoading}
              >
                {isLoading ? "Signing in..." : "Sign In"}
              </Button>
              <div className="text-center space-x-4">
                <button
                  onClick={() => setStep("register1")}
                  className="text-blue-600 text-sm"
                >
                  Create an account
                </button>
                <button
                  onClick={() => setStep("forgot1")}
                  className="text-blue-600 text-sm"
                >
                  Forgot Password?
                </button>
              </div>
            </div>
          ) : step === "register1" ? (
            <div className="space-y-4">
              <input
                type="text"
                name="firstName"
                placeholder="First Name"
                value={formData.firstName}
                onChange={handleInputChange}
                className="w-full p-2 border rounded"
              />
              <input
                type="text"
                name="lastName"
                placeholder="Last Name"
                value={formData.lastName}
                onChange={handleInputChange}
                className="w-full p-2 border rounded"
              />
              <input
                type="email"
                name="email"
                placeholder="Email"
                value={formData.email}
                onChange={handleInputChange}
                className="w-full p-2 border rounded"
              />
              <Button
                className="w-full bg-black text-white hover:bg-black/85 rounded-[6px] py-2"
                onClick={handleVerifyEmail}
                disabled={isLoading}
              >
                {isLoading ? "Verifying..." : "Verify Email"}
              </Button>
              {showOtp && (
                <>
                  <input
                    type="text"
                    name="otp"
                    placeholder="Enter OTP"
                    value={formData.otp}
                    onChange={handleInputChange}
                    className="w-full p-2 border rounded"
                  />
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      name="password"
                      placeholder="Password"
                      value={formData.password}
                      onChange={handleInputChange}
                      className="w-full p-2 border rounded"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2"
                    >
                      {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      name="confirmPassword"
                      placeholder="Confirm Password"
                      value={formData.confirmPassword}
                      onChange={handleInputChange}
                      className="w-full p-2 border rounded"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2"
                    >
                      {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                  <Button
                    className="w-full bg-black text-white hover:bg-black/85 rounded-[6px] py-2"
                    onClick={handleRegisterStep1}
                    disabled={isLoading}
                  >
                    {isLoading ? "Submitting..." : "Submit"}
                  </Button>
                </>
              )}
              <div className="text-center">
                <button
                  onClick={() => setStep("login")}
                  className="text-blue-600 text-sm"
                >
                  Already have an account? Sign in
                </button>
              </div>
            </div>
          ) : step === "register2" ? (
            <div className="space-y-4">
              <input
                type="tel"
                name="phone"
                placeholder="Phone Number"
                value={formData.phone}
                onChange={handleInputChange}
                className="w-full p-2 border rounded"
              />
              <Button
                className="w-full bg-black text-white hover:bg-black/85 rounded-[6px] py-2"
                onClick={handleRegisterStep2}
                disabled={isLoading}
              >
                {isLoading ? "Submitting..." : "Complete Registration"}
              </Button>
            </div>
          ) : step === "forgot1" ? (
            <div className="space-y-4">
              <input
                type="email"
                name="email"
                placeholder="Email"
                value={formData.email}
                onChange={handleInputChange}
                className="w-full p-2 border rounded"
              />
              <Button
                className="w-full bg-black text-white hover:bg-black/85 rounded-[6px] py-2"
                onClick={handleForgotPasswordStep1}
                disabled={isLoading}
              >
                {isLoading ? "Sending OTP..." : "Send OTP"}
              </Button>
              <div className="text-center">
                <button
                  onClick={() => setStep("login")}
                  className="text-blue-600 text-sm"
                >
                  Back to Sign In
                </button>
              </div>
            </div>
          ) : step === "forgot2" ? (
            <div className="space-y-4">
              <input
                type="text"
                name="otp"
                placeholder="Enter OTP"
                value={formData.otp}
                onChange={handleInputChange}
                className="w-full p-2 border rounded"
              />
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  placeholder="New Password"
                  value={formData.password}
                  onChange={handleInputChange}
                  className="w-full p-2 border rounded"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              <div className="relative">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  name="confirmPassword"
                  placeholder="Confirm New Password"
                  value={formData.confirmPassword}
                  onChange={handleInputChange}
                  className="w-full p-2 border rounded"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2"
                >
                  {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              <Button
                className="w-full bg-black text-white hover:bg-black/85 rounded-[6px] py-2"
                onClick={handleForgotPasswordStep2}
                disabled={isLoading}
              >
                {isLoading ? "Resetting..." : "Reset Password"}
              </Button>
              <div className="text-center">
                <button
                  onClick={() => setStep("login")}
                  className="text-blue-600 text-sm"
                >
                  Back to Sign In
                </button>
              </div>
            </div>
          ) : (
            <div className="text-red-500">Error: Invalid step state</div>
          )}

          <div className="text-xs text-gray-600 mt-5">
            By continuing you agree to our{" "}
            <Link to="#" className="text-blue-600">
              terms and conditions
            </Link>{" "}
            and{" "}
            <Link to="#" className="text-blue-600">
              privacy policy
            </Link>
          </div>
        </div>
        <div className="text-xs text-gray-600 mt-5">
          For help, consult our{" "}
          <Link to="#" className="text-blue-600">
            documentation
          </Link>{" "}
          or contact{" "}
          <Link to="#" className="text-blue-600">
            support
          </Link>
          . The docs offer step-by-step guidance on common issues. If needed,
          reach out to our support team via email, chat, or phone. Prompt
          assistance ensures a smooth experience with our product or service.
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