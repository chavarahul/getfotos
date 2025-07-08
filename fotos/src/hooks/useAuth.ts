import { useEffect, useState } from "react";
import axiosInstance from "../utils/api";

export const useAuth = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    const verifyToken = async () => {
      const token = localStorage.getItem("result");
      if (!token) {
        setIsAuthenticated(false);
        return;
      }
      setIsAuthenticated(true)
    };
    verifyToken();
  }, []);

  return { isAuthenticated };
};