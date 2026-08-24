"use client";

import { useEffect, useState, useMemo } from "react";
import { db } from "@/lib/firebase";
import { ref, onValue, set, update, remove, push } from "firebase/database";
import { Product, Transaction, InventoryLog } from "@/lib/types";
import {
  LayoutDashboard,
  UtensilsCrossed,
  Boxes,
  Receipt,
  TrendingUp,
  CreditCard,
  Banknote,
  AlertTriangle,
  Plus,
  Edit2,
  Trash2,
  PackagePlus,
  PackageMinus,
  Search,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Store,
  ShieldCheck,
  QrCode,
  DollarSign,
  Layers,
  LayoutGrid,
  List,
  Sparkles,
  ExternalLink,
  Check,
  Copy,
  SlidersHorizontal,
  ChevronRight,
  ArrowRight
} from "lucide-react";

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<"overview" | "products" | "inventory" | "transactions">("overview");
  
  // Realtime Data States
  const [products, setProducts] = useState<Product[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [inventoryLogs, setInventoryLogs] = useState<InventoryLog[]>([]);
  const [loading, setLoading] = useState(true);

  // View Preference
  const [productViewMode, setProductViewMode] = useState<"grid" | "table">("grid");

  // Filter & Search States
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Semua");
  const [txSearchQuery, setTxSearchQuery] = useState("");
  const [txPaymentFilter, setTxPaymentFilter] = useState<"ALL" | "CASH" | "QRIS">("ALL");
  const [dateFilter, setDateFilter] = useState<"today" | "week" | "month" | "all">("today");

  // Modal States
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [isEditProductOpen, setIsEditProductOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [stockModalType, setStockModalType] = useState<"IN" | "OUT">("IN");
  const [selectedStockProduct, setSelectedStockProduct] = useState<Product | null>(null);
  const [stockQtyInput, setStockQtyInput] = useState("");
  const [stockNotesInput, setStockNotesInput] = useState("");
  const [selectedTxDetail, setSelectedTxDetail] = useState<Transaction | null>(null);

  // Toast Notification State
  const [toastMsg, setToastMsg] = useState<{ title: string; desc: string; type: "success" | "info" } | null>(null);
  const [copiedInvoice, setCopiedInvoice] = useState<string | null>(null);

  const showToast = (title: string, desc: string, type: "success" | "info" = "success") => {
    setToastMsg({ title, desc, type });
    setTimeout(() => setToastMsg(null), 3500);
  };

  // Form State for Add / Edit
  const [formData, setFormData] = useState({
    name: "",
    sku: "",
    price: "",
    category: "Minuman",
    stockQuantity: "50",
    imageUrl: "",
    isActive: true,
  });

  const categories = [
    { id: "Semua", label: "Semua Menu", icon: "✨" },
    { id: "Minuman", label: "Minuman & Kopi", icon: "☕" },
    { id: "Makanan & Pastry", label: "Makanan & Pastry", icon: "🍽️" },
    { id: "Snack", label: "Snack & Cemilan", icon: "🍟" },
  ];

  // 1. Realtime Listeners to Firebase RTDB
  useEffect(() => {
    const productsRef = ref(db, "products");
    const unsubProducts = onValue(productsRef, (snapshot) => {
      const data = snapshot.val();
      if (data && typeof data === "object") {
        const list: Product[] = [];
        Object.entries(data).forEach(([key, val]) => {
          if (val && typeof val === "object") {
            const p = val as Product;
            list.push({ ...p, id: key });
          }
        });
        list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        setProducts(list);
      } else {
        setProducts([]);
      }
      setLoading(false);
    });

    const txRef = ref(db, "transactions");
    const unsubTx = onValue(txRef, (snapshot) => {
      const data = snapshot.val();
      if (data && typeof data === "object") {
        const list: Transaction[] = [];
        Object.entries(data).forEach(([key, val]) => {
          if (val && typeof val === "object") {
            const t = val as Transaction;
            list.push({ ...t, id: key });
          }
        });
        list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        setTransactions(list);
      } else {
        setTransactions([]);
      }
    });

    const logsRef = ref(db, "inventory_logs");
    const unsubLogs = onValue(logsRef, (snapshot) => {
      const data = snapshot.val();
      if (data && typeof data === "object") {
        const list: InventoryLog[] = [];
        Object.entries(data).forEach(([key, val]) => {
          if (val && typeof val === "object") {
            const l = val as InventoryLog;
            list.push({ ...l, id: key });
          }
        });
        list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        setInventoryLogs(list);
      } else {
        setInventoryLogs([]);
      }
    });

    return () => {
      unsubProducts();
      unsubTx();
      unsubLogs();
    };
  }, []);

  // Filtered Transactions by Date & Payment Method
  const filteredTransactions = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfWeek = startOfToday - 7 * 24 * 60 * 60 * 1000;
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    return transactions.filter((t) => {
      const txTime = t.createdAt || 0;
      let dateMatch = true;
      if (dateFilter === "today") dateMatch = txTime >= startOfToday;
      else if (dateFilter === "week") dateMatch = txTime >= startOfWeek;
      else if (dateFilter === "month") dateMatch = txTime >= startOfMonth;

      let paymentMatch = true;
      if (txPaymentFilter !== "ALL") {
        paymentMatch = t.paymentMethod === txPaymentFilter;
      }

      return dateMatch && paymentMatch;
    });
  }, [transactions, dateFilter, txPaymentFilter]);

  // Analytics Metrics
  const metrics = useMemo(() => {
    const totalOmzet = filteredTransactions.reduce((acc, t) => acc + (t.grandTotal || 0), 0);
    const totalOrders = filteredTransactions.length;
    const avgOrderValue = totalOrders > 0 ? Math.round(totalOmzet / totalOrders) : 0;

    let cashTotal = 0;
    let qrisTotal = 0;
    let cashCount = 0;
    let qrisCount = 0;

    filteredTransactions.forEach((t) => {
      if (t.paymentMethod === "QRIS") {
        qrisTotal += t.grandTotal || 0;
        qrisCount++;
      } else {
        cashTotal += t.grandTotal || 0;
        cashCount++;
      }
    });

    const cashPercent = totalOmzet > 0 ? Math.round((cashTotal / totalOmzet) * 100) : 0;
    const qrisPercent = totalOmzet > 0 ? Math.round((qrisTotal / totalOmzet) * 100) : 0;

    const lowStockList = products.filter((p) => (p.stockQuantity ?? 50) <= (p.minStockAlert ?? 10));

    // Top Selling Items
    const itemMap: { [name: string]: { qty: number; revenue: number; category: string } } = {};
    filteredTransactions.forEach((t) => {
      (t.items || []).forEach((item) => {
        if (!itemMap[item.name]) itemMap[item.name] = { qty: 0, revenue: 0, category: "Menu" };
        itemMap[item.name].qty += item.qty || 1;
        itemMap[item.name].revenue += (item.price || 0) * (item.qty || 1);
      });
    });
    const topItems = Object.entries(itemMap)
      .map(([name, stat]) => ({ name, ...stat }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);

    return {
      totalOmzet,
      totalOrders,
      avgOrderValue,
      cashTotal,
      qrisTotal,
      cashCount,
      qrisCount,
      cashPercent,
      qrisPercent,
      lowStockCount: lowStockList.length,
      lowStockList,
      topItems,
    };
  }, [filteredTransactions, products]);

  // Currency Formatter
  const formatIDR = (amount: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Date Formatter
  const formatDate = (timestamp: number) => {
    if (!timestamp) return "-";
    return new Date(timestamp).toLocaleString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Copy Invoice helper
  const copyInvoice = (invoice: string) => {
    navigator.clipboard.writeText(invoice);
    setCopiedInvoice(invoice);
    showToast("Nomor Disalin", `Nomor invoice ${invoice} berhasil disalin ke clipboard`, "info");
    setTimeout(() => setCopiedInvoice(null), 2000);
  };

  // 2. Product CRUD Operations
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const priceNum = parseFloat(formData.price) || 0;
      const stockNum = parseInt(formData.stockQuantity) || 0;

      if (editingProduct) {
        const productRef = ref(db, `products/${editingProduct.id}`);
        await update(productRef, {
          name: formData.name,
          sku: formData.sku || `SKU-${Date.now().toString().slice(-4)}`,
          price: priceNum,
          category: formData.category,
          stockQuantity: stockNum,
          imageUrl: formData.imageUrl || "https://images.unsplash.com/photo-1541167760496-1628856ab772?w=400",
          isActive: formData.isActive,
          updatedAt: Date.now(),
        });
        showToast("Menu Diperbarui", `Perubahan pada "${formData.name}" langsung aktif di kasir.`);
      } else {
        const newProductRef = push(ref(db, "products"));
        const newId = newProductRef.key!;
        await set(newProductRef, {
          id: newId,
          sku: formData.sku || `SKU-${Date.now().toString().slice(-4)}`,
          name: formData.name,
          price: priceNum,
          category: formData.category,
          stockQuantity: stockNum,
          minStockAlert: 10,
          imageUrl: formData.imageUrl || "https://images.unsplash.com/photo-1541167760496-1628856ab772?w=400",
          isActive: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });

        const logRef = push(ref(db, "inventory_logs"));
        await set(logRef, {
          id: logRef.key,
          productId: newId,
          productName: formData.name,
          type: "IN",
          quantity: stockNum,
          previousStock: 0,
          currentStock: stockNum,
          notes: "Stok awal saat penambahan menu baru",
          createdBy: "Pemilik Bisnis (Web)",
          timestamp: Date.now(),
        });
        showToast("Menu Berhasil Ditambah", `Menu "${formData.name}" kini tersedia di kasir.`);
      }

      setIsAddProductOpen(false);
      setIsEditProductOpen(false);
      setEditingProduct(null);
      setFormData({
        name: "",
        sku: "",
        price: "",
        category: "Minuman",
        stockQuantity: "50",
        imageUrl: "",
        isActive: true,
      });
    } catch (err) {
      alert("Gagal menyimpan produk: " + err);
    }
  };

  const handleToggleActive = async (p: Product) => {
    try {
      const pRef = ref(db, `products/${p.id}`);
      const nextState = p.isActive === false ? true : false;
      await update(pRef, { isActive: nextState, updatedAt: Date.now() });
      showToast(
        nextState ? "Menu Diaktifkan" : "Menu Dinonaktifkan",
        `Menu "${p.name}" ${nextState ? "dapat dipilih kasir" : "disembunyikan dari kasir"}.`
      );
    } catch (err) {
      alert("Gagal mengubah status: " + err);
    }
  };

  const handleDeleteProduct = async (p: Product) => {
    if (confirm(`Yakin ingin menghapus menu "${p.name}" dari katalog kasir?`)) {
      try {
        await remove(ref(db, `products/${p.id}`));
        showToast("Menu Dihapus", `"${p.name}" telah dihapus dari katalog.`, "info");
      } catch (err) {
        alert("Gagal menghapus produk: " + err);
      }
    }
  };

  const handleStockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStockProduct) return;

    const qty = parseInt(stockQtyInput);
    if (!qty || qty <= 0) {
      alert("Masukkan jumlah stok yang valid (angka positif)");
      return;
    }

    const prevStock = selectedStockProduct.stockQuantity ?? 50;
    const newStock = stockModalType === "IN" ? prevStock + qty : Math.max(0, prevStock - qty);

    try {
      await update(ref(db, `products/${selectedStockProduct.id}`), {
        stockQuantity: newStock,
        updatedAt: Date.now(),
      });

      const logRef = push(ref(db, "inventory_logs"));
      await set(logRef, {
        id: logRef.key,
        productId: selectedStockProduct.id,
        productName: selectedStockProduct.name,
        type: stockModalType,
        quantity: qty,
        previousStock: prevStock,
        currentStock: newStock,
        notes: stockNotesInput || (stockModalType === "IN" ? "Restock supplier" : "Barang rusak / waste"),
        createdBy: "Pemilik Bisnis (Web)",
        timestamp: Date.now(),
      });

      showToast(
        stockModalType === "IN" ? "Restock Berhasil" : "Stok Disesuaikan",
        `${stockModalType === "IN" ? "+" : "-"}${qty} unit untuk ${selectedStockProduct.name} (Sisa: ${newStock})`
      );

      setIsStockModalOpen(false);
      setSelectedStockProduct(null);
      setStockQtyInput("");
      setStockNotesInput("");
    } catch (err) {
      alert("Gagal memperbarui stok: " + err);
    }
  };
  return (
    <div className="min-h-screen bg-[#070B14] text-slate-100 flex flex-col antialiased selection:bg-indigo-500 selection:text-white">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl bg-slate-900/95 border border-indigo-500/30 text-white shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-bottom-5 duration-200">
          <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-bold text-white">{toastMsg.title}</p>
            <p className="text-[11px] text-slate-400">{toastMsg.desc}</p>
          </div>
        </div>
      )}

      {/* Top Navbar */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-xl sticky top-0 z-40 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-indigo-800 flex items-center justify-center shadow-lg shadow-indigo-500/25 border border-indigo-400/20">
            <Store className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-extrabold text-lg text-white tracking-tight">KASIR PRO EXECUTIVE</h1>
              <span className="text-[10px] uppercase font-extrabold px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Back-Office
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium">Pusat Kendali Manajerial & Realtime Multi-Device</p>
          </div>
        </div>

        {/* Live Cloud Sync & Profile Bar */}
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-emerald-950/40 border border-emerald-500/30 text-emerald-400 text-xs font-bold shadow-sm">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span>Cloud Realtime Synced (Firebase)</span>
          </div>

          <div className="flex items-center gap-3 pl-4 border-l border-slate-800/80">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 flex items-center justify-center text-xs font-black text-indigo-300 shadow-inner">
              MO
            </div>
            <div className="hidden md:block text-left">
              <p className="text-xs font-bold text-slate-100">Mario Sitepu</p>
              <p className="text-[10px] text-emerald-400 font-semibold">Owner / Business Admin</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex-1 flex flex-col md:flex-row">
        {/* Sidebar */}
        <aside className="w-full md:w-64 border-b md:border-b-0 md:border-r border-slate-800/80 bg-slate-900/30 p-4 flex md:flex-col gap-1.5">
          <div className="text-[11px] font-bold uppercase text-slate-500 tracking-wider px-3 py-1 hidden md:block">
            Menu Utama
          </div>

          <button
            onClick={() => setActiveTab("overview")}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all text-left ${
              activeTab === "overview"
                ? "bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-lg shadow-indigo-600/30 border border-indigo-400/20"
                : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>Executive Dashboard</span>
          </button>

          <button
            onClick={() => setActiveTab("products")}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all text-left ${
              activeTab === "products"
                ? "bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-lg shadow-indigo-600/30 border border-indigo-400/20"
                : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
            }`}
          >
            <UtensilsCrossed className="w-4 h-4" />
            <span>Katalog & Harga Menu</span>
            <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-bold border border-slate-700/60">
              {products.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("inventory")}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all text-left ${
              activeTab === "inventory"
                ? "bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-lg shadow-indigo-600/30 border border-indigo-400/20"
                : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
            }`}
          >
            <Boxes className="w-4 h-4" />
            <span>Stok & Kartu Mutasi</span>
            {metrics.lowStockCount > 0 && (
              <span className="ml-auto text-[11px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-black border border-amber-500/30 animate-pulse">
                {metrics.lowStockCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("transactions")}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all text-left ${
              activeTab === "transactions"
                ? "bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-lg shadow-indigo-600/30 border border-indigo-400/20"
                : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
            }`}
          >
            <Receipt className="w-4 h-4" />
            <span>Live Feed Transaksi</span>
            <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-bold border border-slate-700/60">
              {transactions.length}
            </span>
          </button>

          <div className="hidden md:block mt-auto pt-6 border-t border-slate-800/60">
            <div className="bg-gradient-to-br from-indigo-950/60 to-slate-900/80 p-4 rounded-2xl border border-indigo-500/20 shadow-lg">
              <div className="flex items-center gap-2 text-indigo-300 text-xs font-bold mb-1.5">
                <Sparkles className="w-4 h-4 text-indigo-400" />
                <span>Multi-Device Sync</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed font-medium">
                Setiap pembaruan menu & harga di web langsung muncul seketika di Tablet Kasir Android Anda.
              </p>
            </div>
          </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1 p-6 md:p-8 max-w-7xl overflow-y-auto">
          {/* ================= TAB 1: OVERVIEW ================= */}
          {activeTab === "overview" && (
            <div className="space-y-8">
              {/* Header Title & Date Filters */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-black text-white tracking-tight">Executive Sales Analytics</h2>
                  <p className="text-sm text-slate-400 font-medium mt-0.5">
                    Laporan keuangan & analitik performa kasir harian
                  </p>
                </div>

                <div className="flex items-center bg-slate-900/80 p-1.5 rounded-2xl border border-slate-800/90 text-xs font-bold shadow-md">
                  {[
                    { id: "today", label: "Hari Ini" },
                    { id: "week", label: "7 Hari" },
                    { id: "month", label: "Bulan Ini" },
                    { id: "all", label: "Semua Waktu" },
                  ].map((filter) => (
                    <button
                      key={filter.id}
                      onClick={() => setDateFilter(filter.id as any)}
                      className={`px-3.5 py-1.5 rounded-xl transition-all ${
                        dateFilter === filter.id
                          ? "bg-indigo-600 text-white shadow-md font-extrabold"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 4 Luxury KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {/* 1. Total Omzet */}
                <div className="p-5 rounded-3xl bg-slate-900/70 border border-slate-800/80 shadow-xl relative overflow-hidden group hover:border-emerald-500/40 transition-all">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl group-hover:bg-emerald-500/20 transition-all" />
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Pendapatan</span>
                    <div className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-inner">
                      <DollarSign className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="text-2xl font-black text-white tracking-tight">{formatIDR(metrics.totalOmzet)}</div>
                  <div className="flex items-center gap-1.5 mt-2.5 text-xs font-semibold text-emerald-400">
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span>Realtime terhubung ke kasir</span>
                  </div>
                </div>

                {/* 2. Total Transaksi */}
                <div className="p-5 rounded-3xl bg-slate-900/70 border border-slate-800/80 shadow-xl relative overflow-hidden group hover:border-indigo-500/40 transition-all">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl group-hover:bg-indigo-500/20 transition-all" />
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Struk Kasir</span>
                    <div className="p-2.5 rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-inner">
                      <Receipt className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="text-2xl font-black text-white tracking-tight">{metrics.totalOrders} Transaksi</div>
                  <div className="text-xs font-semibold text-slate-400 mt-2.5">
                    Rata-rata: <span className="text-slate-200 font-bold">{formatIDR(metrics.avgOrderValue)}</span> / struk
                  </div>
                </div>

                {/* 3. Pembayaran Tunai vs QRIS */}
                <div className="p-5 rounded-3xl bg-slate-900/70 border border-slate-800/80 shadow-xl relative overflow-hidden group hover:border-rose-500/40 transition-all">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/10 rounded-full blur-2xl group-hover:bg-rose-500/20 transition-all" />
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Metode Bayar</span>
                    <div className="p-2.5 rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/20 shadow-inner">
                      <QrCode className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-emerald-400 flex items-center gap-1">💵 Tunai ({metrics.cashPercent}%):</span>
                      <span className="text-slate-200">{formatIDR(metrics.cashTotal)}</span>
                    </div>
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-rose-400 flex items-center gap-1">📱 QRIS ({metrics.qrisPercent}%):</span>
                      <span className="text-slate-200">{formatIDR(metrics.qrisTotal)}</span>
                    </div>
                  </div>
                  <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden flex mt-2.5">
                    <div style={{ width: `${metrics.cashPercent}%` }} className="bg-emerald-500 h-full" />
                    <div style={{ width: `${metrics.qrisPercent}%` }} className="bg-rose-500 h-full" />
                  </div>
                </div>

                {/* 4. Stok Alert */}
                <div className="p-5 rounded-3xl bg-slate-900/70 border border-slate-800/80 shadow-xl relative overflow-hidden group hover:border-amber-500/40 transition-all">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl group-hover:bg-amber-500/20 transition-all" />
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Status Inventori</span>
                    <div className="p-2.5 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-inner">
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="text-2xl font-black text-amber-300 tracking-tight">
                    {metrics.lowStockCount} Menu Menipis
                  </div>
                  <div className="text-xs font-semibold text-slate-400 mt-2.5 flex items-center gap-1">
                    {metrics.lowStockCount > 0 ? (
                      <span className="text-amber-400 font-bold">⚠️ Butuh restock supplier</span>
                    ) : (
                      <span className="text-emerald-400 font-bold">✅ Seluruh stok aman</span>
                    )}
                  </div>
                </div>
              </div>

              {/* 2 Big Panels: Top Best Selling Menu & Live Activity */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Top Best Selling Menu */}
                <div className="p-6 rounded-3xl bg-slate-900/50 border border-slate-800/80 shadow-xl">
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="font-extrabold text-base text-white flex items-center gap-2.5">
                      <TrendingUp className="w-4 h-4 text-indigo-400" />
                      Top 5 Menu Paling Laris
                    </h3>
                    <span className="text-xs text-slate-400 font-semibold">Berdasarkan Total Porsi</span>
                  </div>

                  {metrics.topItems.length === 0 ? (
                    <div className="py-14 text-center text-slate-500 text-sm">
                      Belum ada pesanan pada filter waktu ini
                    </div>
                  ) : (
                    <div className="space-y-3.5">
                      {metrics.topItems.map((item, idx) => (
                        <div
                          key={item.name}
                          className="flex items-center justify-between p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80 hover:border-slate-700 transition-all group"
                        >
                          <div className="flex items-center gap-3.5">
                            <span className="w-7 h-7 rounded-xl bg-indigo-500/20 text-indigo-300 font-black text-xs flex items-center justify-center border border-indigo-500/30">
                              #{idx + 1}
                            </span>
                            <div>
                              <p className="font-bold text-sm text-slate-100 group-hover:text-indigo-300 transition-colors">
                                {item.name}
                              </p>
                              <p className="text-xs text-slate-400 font-medium">{item.qty} Porsi Terjual</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-black text-sm text-emerald-400">{formatIDR(item.revenue)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Live Activity Feed */}
                <div className="p-6 rounded-3xl bg-slate-900/50 border border-slate-800/80 shadow-xl">
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="font-extrabold text-base text-white flex items-center gap-2.5">
                      <Clock className="w-4 h-4 text-emerald-400" />
                      Aktivitas Kasir Terkini
                    </h3>
                    <button
                      onClick={() => setActiveTab("transactions")}
                      className="text-xs text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1"
                    >
                      <span>Lihat Semua</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {filteredTransactions.length === 0 ? (
                    <div className="py-14 text-center text-slate-500 text-sm">Belum ada transaksi kasir</div>
                  ) : (
                    <div className="space-y-3.5">
                      {filteredTransactions.slice(0, 5).map((t) => (
                        <div
                          key={t.id}
                          onClick={() => setSelectedTxDetail(t)}
                          className="flex items-center justify-between p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80 hover:border-indigo-500/40 cursor-pointer transition-all group"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-black text-xs text-slate-200 group-hover:text-indigo-300 transition-colors">
                                {t.invoiceNumber || t.id}
                              </span>
                              <span
                                className={`text-[10px] font-black px-2 py-0.5 rounded-md ${
                                  t.paymentMethod === "QRIS"
                                    ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                                    : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                }`}
                              >
                                {t.paymentMethod}
                              </span>
                            </div>
                            <p className="text-xs text-slate-400 mt-1 font-medium">{formatDate(t.createdAt)}</p>
                          </div>
                          <div className="text-right">
                            <span className="font-black text-base text-white">{formatIDR(t.grandTotal)}</span>
                            <p className="text-[11px] text-slate-400">{(t.items || []).length} Item</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          {/* ================= TAB 2: PRODUCTS CRUD ================= */}
          {activeTab === "products" && (
            <div className="space-y-6">
              {/* Header Action Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-black text-white tracking-tight">Katalog Menu & Harga Jual</h2>
                  <p className="text-sm text-slate-400 font-medium">
                    Atur menu, perbarui harga seketika, dan kendalikan item yang tampil di tablet kasir
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  {/* View Mode Toggle: Grid vs Table */}
                  <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-800">
                    <button
                      onClick={() => setProductViewMode("grid")}
                      className={`p-2 rounded-lg transition-all ${
                        productViewMode === "grid" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"
                      }`}
                      title="Tampilan Grid Menu"
                    >
                      <LayoutGrid className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setProductViewMode("table")}
                      className={`p-2 rounded-lg transition-all ${
                        productViewMode === "table" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"
                      }`}
                      title="Tampilan Tabel Rinci"
                    >
                      <List className="w-4 h-4" />
                    </button>
                  </div>

                  <button
                    onClick={() => {
                      setEditingProduct(null);
                      setFormData({
                        name: "",
                        sku: `SKU-${Date.now().toString().slice(-4)}`,
                        price: "",
                        category: "Minuman",
                        stockQuantity: "50",
                        imageUrl: "",
                        isActive: true,
                      });
                      setIsAddProductOpen(true);
                    }}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-extrabold text-sm shadow-lg shadow-indigo-600/30 border border-indigo-400/30 transition-all active:scale-[0.98]"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Tambah Menu Baru</span>
                  </button>
                </div>
              </div>

              {/* Search & Category Tabs Bar */}
              <div className="flex flex-col md:flex-row items-center gap-3">
                <div className="relative flex-1 w-full">
                  <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari nama menu, kategori, atau kode SKU..."
                    className="w-full bg-slate-900/90 border border-slate-800 rounded-2xl pl-11 pr-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all shadow-inner"
                  />
                </div>

                <div className="flex items-center gap-1.5 bg-slate-900/90 p-1.5 rounded-2xl border border-slate-800 w-full md:w-auto overflow-x-auto text-xs font-bold shadow-inner">
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCategory(cat.id)}
                      className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl whitespace-nowrap transition-all ${
                        selectedCategory === cat.id
                          ? "bg-indigo-600 text-white shadow-md font-extrabold"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <span>{cat.icon}</span>
                      <span>{cat.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Products Render: Grid or Table */}
              {productViewMode === "grid" ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                  {products
                    .filter((p) => {
                      const matchesCat = selectedCategory === "Semua" || p.category === selectedCategory;
                      const matchesSearch =
                        (p.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
                        (p.sku || "").toLowerCase().includes(searchQuery.toLowerCase());
                      return matchesCat && matchesSearch;
                    })
                    .map((product) => (
                      <div
                        key={product.id}
                        className={`rounded-3xl border bg-slate-900/60 p-4 flex flex-col justify-between shadow-xl transition-all hover:border-indigo-500/40 group relative overflow-hidden ${
                          product.isActive === false ? "opacity-60 border-slate-800" : "border-slate-800/80"
                        }`}
                      >
                        <div>
                          {/* Image & Status Badge */}
                          <div className="relative rounded-2xl overflow-hidden aspect-[4/3] bg-slate-800 mb-3.5 border border-slate-700/50">
                            <img
                              src={product.imageUrl || "https://images.unsplash.com/photo-1541167760496-1628856ab772?w=400"}
                              alt={product.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                            <span
                              className={`absolute top-2.5 left-2.5 text-[10px] font-black px-2.5 py-1 rounded-lg backdrop-blur-md border ${
                                product.isActive !== false
                                  ? "bg-emerald-950/80 text-emerald-300 border-emerald-500/40"
                                  : "bg-rose-950/80 text-rose-300 border-rose-500/40"
                              }`}
                            >
                              {product.isActive !== false ? "🟢 Aktif" : "🔴 Nonaktif"}
                            </span>
                            <span className="absolute bottom-2.5 right-2.5 text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-950/80 text-slate-300 border border-slate-700/60 font-mono">
                              {product.sku || "NO-SKU"}
                            </span>
                          </div>

                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-extrabold text-white text-base leading-snug">{product.name}</p>
                              <p className="text-xs text-slate-400 font-medium mt-0.5">{product.category}</p>
                            </div>
                          </div>

                          <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-800/80">
                            <span className="text-lg font-black text-emerald-400">{formatIDR(product.price)}</span>
                            <span
                              className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${
                                (product.stockQuantity ?? 50) <= 0
                                  ? "bg-rose-500/20 text-rose-300 border-rose-500/30"
                                  : (product.stockQuantity ?? 50) <= (product.minStockAlert ?? 10)
                                  ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                                  : "bg-slate-800 text-slate-300 border-slate-700/60"
                              }`}
                            >
                              Stok: {product.stockQuantity ?? 50}
                            </span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-800/80">
                          <button
                            onClick={() => handleToggleActive(product)}
                            className="flex-1 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 transition-all"
                          >
                            {product.isActive !== false ? "Nonaktifkan" : "Aktifkan"}
                          </button>
                          <button
                            onClick={() => {
                              setEditingProduct(product);
                              setFormData({
                                name: product.name,
                                sku: product.sku || "",
                                price: product.price.toString(),
                                category: product.category,
                                stockQuantity: (product.stockQuantity ?? 50).toString(),
                                imageUrl: product.imageUrl || "",
                                isActive: product.isActive !== false,
                              });
                              setIsEditProductOpen(true);
                            }}
                            className="p-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 border border-indigo-500/30 transition-all"
                            title="Edit Harga & Menu"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteProduct(product)}
                            className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition-all"
                            title="Hapus Menu"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                /* Table View */
                <div className="bg-slate-900/60 border border-slate-800/80 rounded-3xl overflow-hidden shadow-2xl">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-300">
                      <thead className="bg-slate-900 border-b border-slate-800 text-xs font-extrabold uppercase text-slate-400 tracking-wider">
                        <tr>
                          <th className="py-4 px-5">Foto & Nama Menu</th>
                          <th className="py-4 px-4">SKU</th>
                          <th className="py-4 px-4">Kategori</th>
                          <th className="py-4 px-4">Harga Jual</th>
                          <th className="py-4 px-4">Sisa Stok</th>
                          <th className="py-4 px-4">Status Kasir</th>
                          <th className="py-4 px-5 text-right">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-medium">
                        {products
                          .filter((p) => {
                            const matchesCat = selectedCategory === "Semua" || p.category === selectedCategory;
                            const matchesSearch =
                              (p.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
                              (p.sku || "").toLowerCase().includes(searchQuery.toLowerCase());
                            return matchesCat && matchesSearch;
                          })
                          .map((product) => (
                            <tr key={product.id} className="hover:bg-slate-800/30 transition-colors">
                              <td className="py-3.5 px-5">
                                <div className="flex items-center gap-3.5">
                                  <img
                                    src={product.imageUrl || "https://images.unsplash.com/photo-1541167760496-1628856ab772?w=400"}
                                    alt={product.name}
                                    className="w-12 h-12 rounded-2xl object-cover border border-slate-700 shadow-sm"
                                  />
                                  <div>
                                    <p className="font-bold text-white text-sm">{product.name}</p>
                                    <p className="text-xs text-slate-500 font-mono">ID: {product.id}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="py-3.5 px-4 font-mono text-xs text-slate-400">{product.sku || "-"}</td>
                              <td className="py-3.5 px-4">
                                <span className="px-3 py-1 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold border border-slate-700/60">
                                  {product.category}
                                </span>
                              </td>
                              <td className="py-3.5 px-4 font-black text-white text-sm">{formatIDR(product.price)}</td>
                              <td className="py-3.5 px-4">
                                <span
                                  className={`px-3 py-1 rounded-xl text-xs font-bold ${
                                    (product.stockQuantity ?? 50) <= 0
                                      ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                                      : (product.stockQuantity ?? 50) <= (product.minStockAlert ?? 10)
                                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                      : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                  }`}
                                >
                                  {product.stockQuantity ?? 50} unit
                                </span>
                              </td>
                              <td className="py-3.5 px-4">
                                <button
                                  onClick={() => handleToggleActive(product)}
                                  className={`px-3 py-1 rounded-full text-xs font-extrabold transition-all ${
                                    product.isActive !== false
                                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                      : "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                                  }`}
                                >
                                  {product.isActive !== false ? "Aktif di Kasir" : "Dinonaktifkan"}
                                </button>
                              </td>
                              <td className="py-3.5 px-5 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    onClick={() => {
                                      setEditingProduct(product);
                                      setFormData({
                                        name: product.name,
                                        sku: product.sku || "",
                                        price: product.price.toString(),
                                        category: product.category,
                                        stockQuantity: (product.stockQuantity ?? 50).toString(),
                                        imageUrl: product.imageUrl || "",
                                        isActive: product.isActive !== false,
                                      });
                                      setIsEditProductOpen(true);
                                    }}
                                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all"
                                    title="Edit Menu"
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteProduct(product)}
                                    className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-all"
                                    title="Hapus Menu"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ================= TAB 3: INVENTORY ================= */}
          {activeTab === "inventory" && (
            <div className="space-y-8">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-black text-white tracking-tight">Stok & Mutasi Inventori</h2>
                  <p className="text-sm text-slate-400 font-medium">
                    Input stok masuk dari supplier, catat barang rusak, dan pantau kartu stok
                  </p>
                </div>
              </div>

              {/* Master Stock Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {products.map((p) => {
                  const stock = p.stockQuantity ?? 50;
                  const isLow = stock <= (p.minStockAlert ?? 10);
                  return (
                    <div
                      key={p.id}
                      className="p-5 rounded-3xl bg-slate-900/60 border border-slate-800/80 shadow-xl flex flex-col justify-between hover:border-slate-700 transition-all"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-extrabold text-white text-base leading-snug">{p.name}</p>
                          <p className="text-xs text-slate-400 font-mono mt-0.5">SKU: {p.sku || "-"}</p>
                        </div>
                        <span
                          className={`px-3.5 py-1.5 rounded-2xl text-xs font-black border ${
                            stock <= 0
                              ? "bg-rose-500/20 text-rose-300 border-rose-500/30"
                              : isLow
                              ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                              : "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                          }`}
                        >
                          {stock} Unit
                        </span>
                      </div>

                      <div className="flex items-center gap-2.5 mt-5 pt-4 border-t border-slate-800/80">
                        <button
                          onClick={() => {
                            setSelectedStockProduct(p);
                            setStockModalType("IN");
                            setStockQtyInput("");
                            setStockNotesInput("Restock dari Supplier");
                            setIsStockModalOpen(true);
                          }}
                          className="flex-1 py-2.5 px-3 rounded-2xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 text-xs font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                        >
                          <PackagePlus className="w-4 h-4" />
                          <span>+ Stok Masuk</span>
                        </button>
                        <button
                          onClick={() => {
                            setSelectedStockProduct(p);
                            setStockModalType("OUT");
                            setStockQtyInput("");
                            setStockNotesInput("Barang Rusak / Basi / Waste");
                            setIsStockModalOpen(true);
                          }}
                          className="flex-1 py-2.5 px-3 rounded-2xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 border border-rose-500/30 text-xs font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                        >
                          <PackageMinus className="w-4 h-4" />
                          <span>- Stok Keluar</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Audit Ledger Table */}
              <div className="space-y-4">
                <h3 className="text-lg font-extrabold text-white flex items-center gap-2.5">
                  <Boxes className="w-5 h-5 text-indigo-400" />
                  Buku Besar Riwayat Mutasi Stok (Audit Logs)
                </h3>

                <div className="bg-slate-900/60 border border-slate-800/80 rounded-3xl overflow-hidden shadow-2xl">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-300">
                      <thead className="bg-slate-900 border-b border-slate-800 text-xs font-extrabold uppercase text-slate-400 tracking-wider">
                        <tr>
                          <th className="py-4 px-5">Waktu</th>
                          <th className="py-4 px-4">Nama Produk</th>
                          <th className="py-4 px-4">Jenis Mutasi</th>
                          <th className="py-4 px-4">Jumlah</th>
                          <th className="py-4 px-4">Sisa Stok</th>
                          <th className="py-4 px-4">Keterangan / Alasan</th>
                          <th className="py-4 px-5">Oleh</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-medium">
                        {inventoryLogs.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="text-center py-12 text-slate-500 text-sm">
                              Belum ada catatan mutasi stok
                            </td>
                          </tr>
                        ) : (
                          inventoryLogs.map((log) => (
                            <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                              <td className="py-3.5 px-5 text-xs text-slate-400">{formatDate(log.timestamp)}</td>
                              <td className="py-3.5 px-4 font-bold text-white">{log.productName}</td>
                              <td className="py-3.5 px-4">
                                <span
                                  className={`px-3 py-1 rounded-xl text-xs font-black ${
                                    log.type === "IN"
                                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                      : log.type === "OUT"
                                      ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                                      : "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                                  }`}
                                >
                                  {log.type === "IN" ? "MASUK (Restock)" : log.type === "OUT" ? "KELUAR (Waste)" : "PENJUALAN"}
                                </span>
                              </td>
                              <td className="py-3.5 px-4 font-black text-sm">
                                {log.type === "IN" ? `+${log.quantity}` : `-${log.quantity}`}
                              </td>
                              <td className="py-3.5 px-4 font-bold text-slate-300">{log.currentStock} unit</td>
                              <td className="py-3.5 px-4 text-xs text-slate-400">{log.notes || "-"}</td>
                              <td className="py-3.5 px-5 text-xs text-slate-400">{log.createdBy || "Sistem"}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}
          {/* ================= TAB 4: TRANSAKSI REALTIME ================= */}
          {activeTab === "transactions" && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-black text-white tracking-tight">Monitor Transaksi Kasir</h2>
                  <p className="text-sm text-slate-400 font-medium">
                    Pantau transaksi penjualan kasir secara live detik demi detik
                  </p>
                </div>

                {/* Filter Metode Bayar */}
                <div className="flex items-center bg-slate-900/90 p-1.5 rounded-2xl border border-slate-800 text-xs font-bold shadow-inner">
                  <button
                    onClick={() => setTxPaymentFilter("ALL")}
                    className={`px-3.5 py-1.5 rounded-xl transition-all ${
                      txPaymentFilter === "ALL" ? "bg-indigo-600 text-white font-extrabold shadow" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Semua ({transactions.length})
                  </button>
                  <button
                    onClick={() => setTxPaymentFilter("CASH")}
                    className={`px-3.5 py-1.5 rounded-xl transition-all ${
                      txPaymentFilter === "CASH" ? "bg-emerald-600 text-white font-extrabold shadow" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    💵 Tunai
                  </button>
                  <button
                    onClick={() => setTxPaymentFilter("QRIS")}
                    className={`px-3.5 py-1.5 rounded-xl transition-all ${
                      txPaymentFilter === "QRIS" ? "bg-rose-600 text-white font-extrabold shadow" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    📱 QRIS
                  </button>
                </div>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={txSearchQuery}
                  onChange={(e) => setTxSearchQuery(e.target.value)}
                  placeholder="Cari nomor invoice (contoh: INV/20260824/...) atau nama menu..."
                  className="w-full bg-slate-900/90 border border-slate-800 rounded-2xl pl-11 pr-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all shadow-inner"
                />
              </div>

              {/* Transactions Table */}
              <div className="bg-slate-900/60 border border-slate-800/80 rounded-3xl overflow-hidden shadow-2xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-slate-300">
                    <thead className="bg-slate-900 border-b border-slate-800 text-xs font-extrabold uppercase text-slate-400 tracking-wider">
                      <tr>
                        <th className="py-4 px-5">No. Invoice</th>
                        <th className="py-4 px-4">Waktu Transaksi</th>
                        <th className="py-4 px-4">Rincian Menu</th>
                        <th className="py-4 px-4">Metode Bayar</th>
                        <th className="py-4 px-4">Total Bayar</th>
                        <th className="py-4 px-5 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-medium">
                      {filteredTransactions
                        .filter((t) => {
                          const q = txSearchQuery.toLowerCase();
                          return (
                            (t.invoiceNumber || t.id).toLowerCase().includes(q) ||
                            (t.items || []).some((i) => i.name.toLowerCase().includes(q))
                          );
                        })
                        .map((tx) => (
                          <tr key={tx.id} className="hover:bg-slate-800/30 transition-colors">
                            <td className="py-4 px-5 font-mono font-bold text-white text-xs">
                              <div className="flex items-center gap-2">
                                <span>{tx.invoiceNumber || tx.id}</span>
                                <button
                                  onClick={() => copyInvoice(tx.invoiceNumber || tx.id)}
                                  className="text-slate-500 hover:text-slate-300 transition-colors"
                                  title="Salin No. Invoice"
                                >
                                  {copiedInvoice === (tx.invoiceNumber || tx.id) ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </div>
                            </td>
                            <td className="py-4 px-4 text-xs text-slate-400">{formatDate(tx.createdAt)}</td>
                            <td className="py-4 px-4 text-xs">
                              <span className="font-semibold text-slate-200">
                                {(tx.items || []).map((i) => `${i.name} (x${i.qty})`).join(", ") || "1x Transaksi"}
                              </span>
                            </td>
                            <td className="py-4 px-4">
                              <span
                                className={`px-3 py-1 rounded-xl text-xs font-black border ${
                                  tx.paymentMethod === "QRIS"
                                    ? "bg-rose-500/20 text-rose-300 border-rose-500/30"
                                    : "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                                }`}
                              >
                                {tx.paymentMethod}
                              </span>
                            </td>
                            <td className="py-4 px-4 font-black text-white text-base">
                              {formatIDR(tx.grandTotal)}
                            </td>
                            <td className="py-4 px-5 text-right">
                              <button
                                onClick={() => setSelectedTxDetail(tx)}
                                className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-indigo-400 hover:text-indigo-300 border border-slate-700/60 transition-all"
                              >
                                Buka Struk
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ================= MODAL: TAMBAH / EDIT PRODUK ================= */}
      {(isAddProductOpen || isEditProductOpen) && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg p-7 shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="font-black text-lg text-white tracking-tight">
                  {editingProduct ? "Edit Menu & Harga Jual" : "Tambah Menu Baru"}
                </h3>
                <p className="text-xs text-slate-400">Data akan tersinkronisasi langsung ke Tablet Kasir</p>
              </div>
              <button
                onClick={() => {
                  setIsAddProductOpen(false);
                  setIsEditProductOpen(false);
                }}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center font-bold text-sm transition-all"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">Nama Menu *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Contoh: Kopi Susu Aren"
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-2.5 text-slate-100 focus:outline-none focus:border-indigo-500 font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">Harga Jual (Rp) *</label>
                  <input
                    type="number"
                    required
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    placeholder="18000"
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-2.5 text-slate-100 focus:outline-none focus:border-indigo-500 font-black text-base text-emerald-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">Kategori *</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-2.5 text-slate-100 focus:outline-none focus:border-indigo-500 font-medium"
                  >
                    <option value="Minuman">Minuman & Kopi</option>
                    <option value="Makanan & Pastry">Makanan & Pastry</option>
                    <option value="Snack">Snack & Cemilan</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">SKU / Kode Barang</label>
                  <input
                    type="text"
                    value={formData.sku}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                    placeholder="KOP-01"
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-2.5 text-slate-100 font-mono text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">Stok Awal (Unit)</label>
                  <input
                    type="number"
                    value={formData.stockQuantity}
                    onChange={(e) => setFormData({ ...formData, stockQuantity: e.target.value })}
                    placeholder="50"
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-2.5 text-slate-100 focus:outline-none focus:border-indigo-500 font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">URL Foto Menu</label>
                <input
                  type="url"
                  value={formData.imageUrl}
                  onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                  placeholder="https://images.unsplash.com/..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-2.5 text-slate-100 text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddProductOpen(false);
                    setIsEditProductOpen(false);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 font-bold text-slate-300 text-xs transition-all"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 font-bold text-white text-xs shadow-lg shadow-indigo-600/30 transition-all active:scale-[0.98]"
                >
                  Simpan & Sinkronkan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: RESTOCK / MUTASI STOK ================= */}
      {isStockModalOpen && selectedStockProduct && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-7 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="font-black text-lg text-white tracking-tight">
                  {stockModalType === "IN" ? "Restock Stok Masuk" : "Catat Stok Keluar / Waste"}
                </h3>
                <p className="text-xs text-slate-400">Mutasi akan otomatis dicatat pada Audit Log</p>
              </div>
              <button
                onClick={() => setIsStockModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center font-bold text-sm transition-all"
              >
                ✕
              </button>
            </div>

            <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 flex items-center justify-between">
              <div>
                <p className="font-extrabold text-sm text-white">{selectedStockProduct.name}</p>
                <p className="text-xs text-slate-400 mt-0.5">Sisa stok: {selectedStockProduct.stockQuantity ?? 50} unit</p>
              </div>
              <span className="text-xs font-mono font-bold text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-lg border border-indigo-500/20">
                {selectedStockProduct.sku || "-"}
              </span>
            </div>

            <form onSubmit={handleStockSubmit} className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Jumlah {stockModalType === "IN" ? "Masuk (+)" : "Keluar (-)"} *
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  value={stockQtyInput}
                  onChange={(e) => setStockQtyInput(e.target.value)}
                  placeholder="Contoh: 20"
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-slate-100 text-xl font-black focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">Keterangan / No. Surat Jalan</label>
                <input
                  type="text"
                  value={stockNotesInput}
                  onChange={(e) => setStockNotesInput(e.target.value)}
                  placeholder="Contoh: Kiriman Supplier Kopi CV Mandiri"
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-2.5 text-slate-100 text-xs focus:outline-none focus:border-indigo-500 font-medium"
                />
              </div>

              <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsStockModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 font-bold text-slate-300 text-xs transition-all"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className={`px-6 py-2.5 rounded-xl font-bold text-white text-xs shadow-lg transition-all active:scale-[0.98] ${
                    stockModalType === "IN"
                      ? "bg-gradient-to-r from-emerald-600 to-emerald-700 shadow-emerald-600/30"
                      : "bg-gradient-to-r from-rose-600 to-rose-700 shadow-rose-600/30"
                  }`}
                >
                  Konfirmasi Mutasi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: STRUK TRANSAKSI DETAIL ================= */}
      {selectedTxDetail && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-7 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="font-black text-lg text-white tracking-tight">Rincian Struk Kasir</h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5">{selectedTxDetail.invoiceNumber || selectedTxDetail.id}</p>
              </div>
              <button
                onClick={() => setSelectedTxDetail(null)}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center font-bold text-sm transition-all"
              >
                ✕
              </button>
            </div>

            {/* Receipt Item List */}
            <div className="space-y-2.5 bg-slate-950 p-4 rounded-2xl border border-slate-800 max-h-64 overflow-y-auto">
              {(selectedTxDetail.items || []).map((item, idx) => (
                <div key={idx} className="flex justify-between items-center text-xs">
                  <div>
                    <p className="font-bold text-slate-200">{item.name}</p>
                    <p className="text-[11px] text-slate-500">
                      {item.qty} x {formatIDR(item.price)}
                    </p>
                  </div>
                  <span className="font-extrabold text-slate-200">
                    {formatIDR(item.subtotal || item.price * item.qty)}
                  </span>
                </div>
              ))}
            </div>

            {/* Financial Summary */}
            <div className="space-y-2 text-xs border-t border-slate-800 pt-4">
              <div className="flex justify-between text-slate-400 font-medium">
                <span>Waktu Transaksi:</span>
                <span className="text-slate-200">{formatDate(selectedTxDetail.createdAt)}</span>
              </div>
              <div className="flex justify-between text-slate-400 font-medium">
                <span>Metode Pembayaran:</span>
                <span className="font-black text-white px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700">
                  {selectedTxDetail.paymentMethod}
                </span>
              </div>
              {selectedTxDetail.cashReceived && (
                <>
                  <div className="flex justify-between text-slate-400 font-medium">
                    <span>Uang Diterima:</span>
                    <span className="text-slate-200 font-bold">{formatIDR(selectedTxDetail.cashReceived)}</span>
                  </div>
                  <div className="flex justify-between text-slate-400 font-medium">
                    <span>Kembalian:</span>
                    <span className="text-slate-200 font-bold">{formatIDR(selectedTxDetail.changeGiven || 0)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between text-base font-black text-emerald-400 pt-3 border-t border-slate-800">
                <span>Total Struk:</span>
                <span>{formatIDR(selectedTxDetail.grandTotal)}</span>
              </div>
            </div>

            <button
              onClick={() => setSelectedTxDetail(null)}
              className="w-full py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 font-extrabold text-white text-xs transition-all active:scale-[0.98]"
            >
              Tutup Struk
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
