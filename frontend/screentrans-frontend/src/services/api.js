import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api",
  timeout: 90000,
});

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem("screentrans_access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export function errorMessage(error) {
  if (!error.response)
    return "Không kết nối được máy chủ. Hãy kiểm tra Backend và CORS.";
  const message = error.response.data?.message;
  if (error.response.status === 401)
    return "Phiên đăng nhập hết hạn hoặc thông tin không chính xác.";
  return typeof message === "string"
    ? message
    : "Đã xảy ra lỗi, vui lòng thử lại.";
}
