import express from "express";
import cors from "cors";
import helmet from "helmet";
import subscriptionRoutes from "./routes/subscription.routes.js";
import authRoutes from "./routes/auth.routes.js";

const app = express();

app.disable("x-powered-by");

// API thuần JSON nên không cần CSP; giữ các header bảo mật còn lại.
app.use(helmet({ contentSecurityPolicy: false }));

// Chạy sau reverse proxy (Render/Railway...) nên cần tin X-Forwarded-For để
// rate limit tính đúng IP người dùng thay vì IP của proxy.
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

const allowedOrigins = [
  process.env.FRONTEND_URL?.replace(/\/$/, ""),
  ...(process.env.NODE_ENV !== "production" ? ["http://localhost:5173"] : []),
].filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.warn("CORS blocked origin:", origin);
      return callback(new Error("CORS origin denied"));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(express.json({ limit: "100kb" }));

app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    message: "EXE Promotion API is running",
  });
});

app.use("/api/auth", authRoutes);

app.use("/api/subscriptions", subscriptionRoutes);

// 404
app.use((req, res) => {
  res.status(404).json({
    message: "Route not found",
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error("API error:", err.message);

  res.status(500).json({
    message: "Internal server error",
  });
});

export default app;
