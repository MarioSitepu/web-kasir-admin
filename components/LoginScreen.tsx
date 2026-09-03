"use client";

import { useState } from "react";
import { loginAdmin, AuthUser } from "@/lib/auth";
import {
  UtensilsCrossed,
  Lock,
  User,
  Eye,
  EyeOff,
  LogIn,
  AlertCircle,
  ShieldCheck,
  Sparkles
} from "lucide-react";

interface LoginScreenProps {
  onLoginSuccess: (user: AuthUser) => void;
}

export default function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [identity, setIdentity] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identity.trim() || !password.trim()) {
      setErrorMessage("Silakan masukkan username dan kata sandi.");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await loginAdmin(identity, password);
      if (res.success && res.user) {
        onLoginSuccess(res.user);
      } else {
        setErrorMessage(res.error || "Gagal masuk. Periksa kembali akun Anda.");
      }
    } catch {
      setErrorMessage("Terjadi kesalahan sistem saat mencoba masuk.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickFill = () => {
    setIdentity("admin");
    setPassword("sapo123");
    setErrorMessage(null);
  };

  return (
    <div className="min-h-screen w-full bg-[#0F172A] text-slate-100 flex items-center justify-center p-4 sm:p-6 relative overflow-hidden font-sans">
      {/* Decorative Gradient Background Glows */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-emerald-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md z-10 space-y-6 animate-in fade-in zoom-in-95 duration-200">
        {/* Brand Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-400 text-white shadow-xl shadow-indigo-500/25 border border-indigo-300/30">
            <UtensilsCrossed className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center justify-center gap-2">
              <span>Sapo Sapo</span>
              <span className="text-xs uppercase font-black px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                Ayam Goreng Kencur Andaliman
              </span>
            </h1>
            <p className="text-xs text-slate-400 font-medium mt-1">
              Portal Monitoring Penjualan & Dashboard Admin
            </p>
          </div>
        </div>

        {/* Login Bento Card */}
        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-black/50 space-y-6">
          <div className="border-b border-slate-800 pb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-white">Login Admin</h2>
              <p className="text-xs text-slate-400">Masukkan akun administrator untuk melanjutkan</p>
            </div>
            <div className="p-2 rounded-xl bg-slate-800/80 text-indigo-400 border border-slate-700/60">
              <ShieldCheck className="w-5 h-5" />
            </div>
          </div>

          {/* Error Alert */}
          {errorMessage && (
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5 animate-in fade-in slide-in-from-top-2 duration-150">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="leading-relaxed">{errorMessage}</div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 text-xs font-medium">
            {/* Input: Username / Email */}
            <div className="space-y-1.5 text-left">
              <label className="block font-bold text-slate-300">Username Admin</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  required
                  value={identity}
                  onChange={(e) => setIdentity(e.target.value)}
                  placeholder="admin"
                  autoCapitalize="none"
                  className="w-full bg-slate-800/90 border border-slate-700 rounded-xl pl-10 pr-3.5 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all font-semibold"
                />
              </div>
            </div>

            {/* Input: Password */}
            <div className="space-y-1.5 text-left">
              <label className="block font-bold text-slate-300">Kata Sandi (Password)</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password admin"
                  className="w-full bg-slate-800/90 border border-slate-700 rounded-xl pl-10 pr-10 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all font-semibold"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-600 text-white font-extrabold text-sm shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed mt-2 active:scale-[0.99]"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Memverifikasi Akun...</span>
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>Masuk ke Dashboard</span>
                </>
              )}
            </button>
          </form>

          </div>

        {/* Footer info */}
        <div className="text-center text-[11px] text-slate-500">
          <p>Sapo Sapo Ayam Goreng Kencur Andaliman - Jl. Parang 1, Medan</p>
          <p className="text-[10px] mt-0.5 text-slate-600">Sistem Kasir Terintegrasi Android POS & Cloud Firebase</p>
        </div>
      </div>
    </div>
  );
}
