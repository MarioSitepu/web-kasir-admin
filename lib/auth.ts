export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: "OWNER" | "ADMIN";
  avatarUrl?: string;
  loginAt: number;
}

const AUTH_STORAGE_KEY = "sapo_kasir_admin_session";

// Single Master Administrator Account
const MASTER_ACCOUNT = {
  username: "admin",
  email: "admin@saposapo.com",
  name: "Admin",
  role: "OWNER" as const,
  password: process.env.NEXT_PUBLIC_ADMIN_PASSWORD || "sapo123",
};

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
  await new Promise((res) => setTimeout(res, 400));

  const cleanIdentity = identity.trim().toLowerCase();
  const cleanPass = pass.trim();

  const isUsernameMatch =
    cleanIdentity === MASTER_ACCOUNT.username.toLowerCase() ||
    cleanIdentity === MASTER_ACCOUNT.email.toLowerCase() ||
    cleanIdentity === "mario";

  const isPasswordMatch = cleanPass === MASTER_ACCOUNT.password;

  if (!isUsernameMatch || !isPasswordMatch) {
    return {
      success: false,
      error: "Username atau Kata Sandi salah. Silakan periksa kembali.",
    };
  }

  const user: AuthUser = {
    id: "usr_admin",
    name: MASTER_ACCOUNT.name,
    email: MASTER_ACCOUNT.email,
    role: MASTER_ACCOUNT.role,
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
