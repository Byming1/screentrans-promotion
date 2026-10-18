import { supabase } from "../config/supabase.js";

// POST /api/auth/register
export const register = async (req, res) => {
  try {
    const { email, password, fullName } = req.body ?? {};

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      typeof fullName !== "string" ||
      !email.trim() ||
      !fullName.trim() ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      password.length < 8
    ) {
      return res.status(400).json({
        message: "Invalid registration information",
      });
    }

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: fullName.trim(),
        },
      },
    });

    if (error) {
      return res
        .status(error.status >= 400 && error.status < 500 ? error.status : 500)
        .json({
          message: error.message,
        });
    }

    return res.status(201).json({
      message: "Registration request accepted",
      user: data.user
        ? {
            id: data.user.id,
            email: data.user.email,
          }
        : null,
      emailConfirmationRequired: !data.session,
    });
  } catch (error) {
    console.error("Register error:", error);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
};

// POST /api/auth/login
export const login = async (req, res) => {
  try {
    const { email, password } = req.body ?? {};

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      return res.status(401).json({
        message: "Invalid credentials or unverified email",
      });
    }

    return res.status(200).json({
      message: "Login successful",
      user: {
        id: data.user.id,
        email: data.user.email,
      },
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_in: data.session.expires_in,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
};

// GET /api/auth/me
export const getMe = async (req, res) => {
  try {
    const { data, error } = await req.supabase
      .from("profiles")
      .select("id, full_name, created_at")
      .eq("id", req.user.id)
      .single();

    if (error) {
      return res.status(500).json({
        message: "Could not load profile",
      });
    }

    return res.status(200).json({
      user: {
        id: req.user.id,
        email: req.user.email,
      },
      profile: data,
    });
  } catch (error) {
    console.error("GetMe error:", error);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
};
