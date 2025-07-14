import { useEffect, useState } from "react";

export const useAuth = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    const verifyToken = async () => {
      const token = localStorage.getItem("token");
      console.log("Token:", token);
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