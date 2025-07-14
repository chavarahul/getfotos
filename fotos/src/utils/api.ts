import { fetchUser } from "@/lib/actions";
import axios from "axios";

const axiosInstance = axios.create({
  // baseURL: "https://backend-google-three.vercel.app",
  baseURL: " http://localhost:4000",

});


const loadUser = async () => {
  const userData = await fetchUser();
  return userData;
};

axiosInstance.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${loadUser().then(user => user.token)}`;
  }
  return config;
});

export default axiosInstance;