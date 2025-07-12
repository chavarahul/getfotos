"use client";

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import BGonboarding from "/assets/bg-onboarding.png";
import OnBoardingSVG from "/assets/onboarding.svg";
import Logo from "/assets/monotype-white.svg";
import { Link } from "react-router-dom";
import axiosInstance from "../utils/api";
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useAuth } from "@/hooks/useAuth";
import { Eye, EyeOff } from 'lucide-react';

interface FormData {
  firstName: string;
  lastName: string;
  email: string;
  otp: string;
  password: string;
  confirmPassword: string;
  phone: string;
  phoneOtp: string;
}

const Login = () => {
  const [step, setStep] = useState<'login' | 'register1' | 'register2'>('login');
  const [formData, setFormData] = useState<FormData>({
    firstName: '',
    lastName: '',
    email: '',
    otp: '',
    password: '',
    confirmPassword: '',
    phone: '',
    phoneOtp: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showOtp, setShowOtp] = useState(false);
  const navigate = useNavigate();
  const { isAuthenticated, login } = useAuth();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError('');
  };

  const validateEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const handleVerifyEmail = async () => {
    if (!formData.firstName || !formData.lastName || !formData.email) {
      setError('Please fill in all fields');
      return;
    }
    if (!validateEmail(formData.email)) {
      setError('Please enter a valid email address');
      return;
    }

    try {
      setIsLoading(true);
      await axiosInstance.post('/api/auth/send-email-otp', {
        email: formData.email
      });
      setShowOtp(true);
      toast.success('OTP sent to your email');
    } catch (err) {
      setError('Failed to send OTP. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegisterStep1 = async () => {
    if (!formData.otp) {
      setError('Please enter OTP');
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    try {
      setIsLoading(true);
      await axiosInstance.post('/api/auth/verify-email-otp', {
        email: formData.email,
        otp: formData.otp,
        firstName: formData.firstName,
        lastName: formData.lastName,
        password: formData.password
      });
      setStep('register2');
      toast.success('Email verified successfully');
    } catch (err) {
      setError('Invalid OTP or registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyPhone = async () => {
    if (!formData.phone) {
      setError('Please enter phone number');
      return;
    }
    try {
      setIsLoading(true);
      await axiosInstance.post('/api/auth/send-phone-otp', {
        phone: formData.phone
      });
      setShowOtp(true);
      toast.success('OTP sent to your phone');
    } catch (err) {
      setError('Failed to send OTP. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegisterStep2 = async () => {
    if (!formData.phoneOtp) {
      setError('Please enter OTP');
      return;
    }
    try {
      setIsLoading(true);
      const response = await axiosInstance.post('/api/auth/verify-phone-otp', {
        email: formData.email,
        phone: formData.phone,
        phoneOtp: formData.phoneOtp
      });
      localStorage.setItem('token', response.data.token);
      login();
      toast.success('Registration Successful');
      navigate('/dashboard');
    } catch (err) {
      setError('Invalid OTP or registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!formData.email || !formData.password) {
      setError('Please fill in all fields');
      return;
    }
    try {
      setIsLoading(true);
      const response = await axiosInstance.post('/api/auth/login', {
        email: formData.email,
        password: formData.password
      });
      localStorage.setItem('token', response.data.token);
      login();
      toast.success('Login Successful');
      navigate('/dashboard');
    } catch (err) {
      setError('Invalid email or password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex w-full h-screen overflow-hidden font-sans">
      <div className="w-1/2 p-20 flex flex-col justify-between">
        <div>
          <div className="text-4xl font-bold mb-2">
            Welcome <span className="inline-block transform rotate-12">✌️</span>
          </div>
          <div className="text-gray-600 mb-8">Glad to see you back</div>
          {error && <div className="text-red-500 text-sm mb-4">{error}</div>}
          
          {step === 'login' && (
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
                  type={showPassword ? 'text' : 'password'}
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
                {isLoading ? 'Signing in...' : 'Sign In'}
              </Button>
              <div className="text-center">
                <button
                  onClick={() => setStep('register1')}
                  className="text-blue-600 text-sm"
                >
                  Create an account
                </button>
              </div>
            </div>
          )}

          {step === 'register1' && (
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
                name="lastName

"                placeholder="Last Name"
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
                {isLoading ? 'Verifying...' : 'Verify Email'}
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
                      type={showPassword ? 'text' : 'password'}
                      name="password"
                      placeholder="Password"
                      value={formData.password}
                      onChange={handleInputChange}
                      className="w-full p-2 border rounded"
                    />
                    <button
                      type="button"
                      onClick---+() => setShowPassword(!showPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2"
                    >
                      {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
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
                    {isLoading ? 'Submitting...' : 'Submit'}
                  </Button>
                </>
              )}
              <div className="text-center">
                <button
                  onClick={() => setStep('login')}
                  className="text-blue-600 text-sm"
                >
                  Already have an account? Sign in
                </button>
              </div>
            </div>
          )}

          {step === 'register2' && (
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
                onClick={handleVerifyPhone}
                disabled={isLoading}
              >
                {isLoading ? 'Verifying...' : 'Verify Phone'}
              </Button>
              {showOtp && (
                <>
                  <input
                    type="text"
                    name="phoneOtp"
                    placeholder="Enter Phone OTP"
                    value={formData.phoneOtp}
                    onChange={handleInputChange}
                    className="w-full p-2 border rounded"
                  />
                  <Button
                    className="w-full bg-black text-white hover:bg-black/85 rounded-[6px] py-2"
                    onClick={handleRegisterStep2}
                    disabled={isLoading}
                  >
                    {isLoading ? 'Submitting...' : 'Complete Registration'}
                  </Button>
                </>
              )}
            </div>
          )}

          <div className="text-xs text-gray-600 mt-5">
            By continuing you agree to our{' '}
            <Link to="#" className="text-blue-600">terms and conditions</Link> and{' '}
            <Link to="#" className="text-blue-600">privacy policy</Link>
          </div>
        </div>
        <div className="text-xs text-gray-600 mt-5">
          For help, consult our{' '}
          <Link to="#" className="text-blue-600">documentation</Link> or contact{' '}
          <Link to="#" className="text-blue-600">support</Link>. The docs offer step-by-step guidance on common issues. If needed, reach out to our support team via email, chat, drifting phone. Prompt assistance ensures a smooth experience with our product or service.
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