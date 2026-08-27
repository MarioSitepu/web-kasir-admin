export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: "OWNER" | "ADMIN" | "SUPERVISOR";
  avatarUrl?: string;
  loginAt: number;
}

const AUTH_STORAGE_KEY = "sapo_kasir_admin_session";

// Default Master Credentials
const MASTER_ACCOUNTS = [
  {
    username: "admin",
    email: "admin@saposapo.com",
    name: "Mario Sitepu",
    role: "OWNER" as const,
    password: process.env.NEXT_PUBLIC_ADMIN_PASSWORD || "sapo123",
  },
  {
    username: "mario",
    email: "mario@saposapo.com",
    name: "Mario Sitepu (Pemilik)",
    role: "OWNER" as const,
    password: process.env.NEXT_PUBLIC_ADMIN_PASSWORD || "sapo123",
  },
  {
    username: "kasir",
    email: "kasir@saposapo.com",
    name: "Petugas Kasir Outlet",
    role: "ADMIN" as const,
    password: "kasir123",
  }
];

export const getStoredSession = (): AuthUser | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const user: AuthUser = JSON.parse(raw);
    // Session validity: 30 days
    if (Date.now() - user.loginAt > 30 * 24 * 60 * 60 * 1000) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      return null;
    }
    return user;
  } catch {
    return null;
  }
};

export const loginAdmin = async (
  identity: string,
  pass: string
): Promise<{ success: boolean; user?: AuthUser; error?: string }> => {
  // Simulate brief realistic async auth delay
  await new Promise((res) => setTimeout(res, 450));

  const cleanIdentity = identity.trim().toLowerCase();
  const cleanPass = pass.trim();

  const matched = MASTER_ACCOUNTS.find(
    (acc) =>
      (acc.username.toLowerCase() === cleanIdentity ||
        acc.email.toLowerCase() === cleanIdentity) &&
      acc.password === cleanPass
  );

  if (!matched) {
    return {
      success: false,
      error: "Username/Email atau Kata Sandi salah. Silakan periksa kembali.",
    };
  }

  const user: AuthUser = {
    id: "usr_" + matched.username,
    name: matched.name,
    email: matched.email,
    role: matched.role,
    loginAt: Date.now(),
  };

  if (typeof window !== "undefined") {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
  }

  return {
    success: true,
    user,
  };
};

export const logoutAdmin = (): void => {
  if (typeof window !== "undefined") {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  }
};
