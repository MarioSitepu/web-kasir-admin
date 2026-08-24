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
  DollarSign
} from "lucide-react";

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<"overview" | "products" | "inventory" | "transactions">("overview");
  
  // Realtime Data States
  const [products, setProducts] = useState<Product[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [inventoryLogs, setInventoryLogs] = useState<InventoryLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter & Search States
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Semua");
  const [txSearchQuery, setTxSearchQuery] = useState("");
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

  const categories = ["Semua", "Minuman", "Makanan & Pastry", "Snack"];

  // 1. Realtime Listeners to Firebase RTDB
  useEffect(() => {
    // Products Listener
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

    // Transactions Listener
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

    // Inventory Logs Listener
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

  // Filtered Transactions by Date
  const filteredTransactions = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfWeek = startOfToday - 7 * 24 * 60 * 60 * 1000;
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    return transactions.filter((t) => {
      const txTime = t.createdAt || 0;
      if (dateFilter === "today") return txTime >= startOfToday;
      if (dateFilter === "week") return txTime >= startOfWeek;
      if (dateFilter === "month") return txTime >= startOfMonth;
      return true;
    });
  }, [transactions, dateFilter]);

  // Analytics Metrics
  const metrics = useMemo(() => {
    const totalOmzet = filteredTransactions.reduce((acc, t) => acc + (t.grandTotal || 0), 0);
    const totalOrders = filteredTransactions.length;
    const avgOrderValue = totalOrders > 0 ? Math.round(totalOmzet / totalOrders) : 0;

    let cashTotal = 0;
    let qrisTotal = 0;
    filteredTransactions.forEach((t) => {
      if (t.paymentMethod === "QRIS") qrisTotal += t.grandTotal || 0;
      else cashTotal += t.grandTotal || 0;
    });

    const lowStockCount = products.filter((p) => (p.stockQuantity ?? 50) <= (p.minStockAlert ?? 10)).length;

    // Top Selling Items
    const itemMap: { [name: string]: { qty: number; revenue: number } } = {};
    filteredTransactions.forEach((t) => {
      (t.items || []).forEach((item) => {
        if (!itemMap[item.name]) itemMap[item.name] = { qty: 0, revenue: 0 };
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
      lowStockCount,
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
      await update(pRef, { isActive: !p.isActive, updatedAt: Date.now() });
    } catch (err) {
      alert("Gagal mengubah status produk: " + err);
    }
  };

  const handleDeleteProduct = async (p: Product) => {
    if (confirm(`Yakin ingin menghapus menu "${p.name}" dari katalog?`)) {
      try {
        await remove(ref(db, `products/${p.id}`));
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
      alert("Masukkan jumlah stok yang valid");
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
        notes: stockNotesInput || (stockModalType === "IN" ? "Restock manual supplier" : "Barang rusak/waste"),
        createdBy: "Pemilik Bisnis (Web)",
        timestamp: Date.now(),
      });

      setIsStockModalOpen(false);
      setSelectedStockProduct(null);
      setStockQtyInput("");
      setStockNotesInput("");
    } catch (err) {
      alert("Gagal memperbarui stok: " + err);
    }
  };
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased">
      {/* Top Navbar */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-40 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Store className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-extrabold text-lg text-white tracking-tight">KASIR PRO EXECUTIVE</h1>
              <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                Back-Office
              </span>
            </div>
            <p className="text-xs text-slate-400">Pusat Kendali Manajerial & Realtime Multi-Device</p>
          </div>
        </div>

        {/* Live Cloud Sync Indicator */}
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            <span>Tablet Kasir Terhubung (Firebase RTDB)</span>
          </div>

          <div className="flex items-center gap-2 pl-4 border-l border-slate-800">
            <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-300">
              M
            </div>
            <div className="hidden md:block text-left">
              <p className="text-xs font-bold text-slate-200">Mario (Owner)</p>
              <p className="text-[10px] text-slate-400">Hak Akses Penuh</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 flex flex-col md:flex-row">
        {/* Navigation Sidebar */}
        <aside className="w-full md:w-64 border-b md:border-b-0 md:border-r border-slate-800 bg-slate-900/40 p-4 flex md:flex-col gap-1">
          <button
            onClick={() => setActiveTab("overview")}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all ${
              activeTab === "overview"
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>Dashboard & Analitik</span>
          </button>

          <button
            onClick={() => setActiveTab("products")}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all ${
              activeTab === "products"
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
            }`}
          >
            <UtensilsCrossed className="w-4 h-4" />
            <span>Manajemen Menu & Harga</span>
            <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-semibold">
              {products.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("inventory")}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all ${
              activeTab === "inventory"
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
            }`}
          >
            <Boxes className="w-4 h-4" />
            <span>Stok & Kartu Mutasi</span>
            {metrics.lowStockCount > 0 && (
              <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-bold border border-amber-500/30">
                {metrics.lowStockCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("transactions")}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all ${
              activeTab === "transactions"
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
            }`}
          >
            <Receipt className="w-4 h-4" />
            <span>Riwayat Transaksi Live</span>
            <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-semibold">
              {transactions.length}
            </span>
          </button>

          <div className="hidden md:block mt-auto pt-6 border-t border-slate-800/60">
            <div className="bg-gradient-to-br from-indigo-950/40 to-slate-900 p-4 rounded-2xl border border-indigo-900/30">
              <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold mb-1">
                <ShieldCheck className="w-4 h-4" />
                <span>Cloud Sync Otomatis</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Setiap perubahan harga & menu di web ini langsung terupdate di tablet kasir secara detik itu juga.
              </p>
            </div>
          </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1 p-6 md:p-8 max-w-7xl overflow-y-auto">
          {/* ================= TAB 1: OVERVIEW ================= */}
          {activeTab === "overview" && (
            <div className="space-y-8">
              {/* Header & Date Filter */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-black text-white">Ringkasan Eksekutif & Omzet</h2>
                  <p className="text-sm text-slate-400">Pantau performa penjualan outlet secara real-time</p>
                </div>

                {/* Filter Waktu */}
                <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs font-bold">
                  <button
                    onClick={() => setDateFilter("today")}
                    className={`px-3 py-1.5 rounded-lg transition-all ${
                      dateFilter === "today" ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Hari Ini
                  </button>
                  <button
                    onClick={() => setDateFilter("week")}
                    className={`px-3 py-1.5 rounded-lg transition-all ${
                      dateFilter === "week" ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    7 Hari
                  </button>
                  <button
                    onClick={() => setDateFilter("month")}
                    className={`px-3 py-1.5 rounded-lg transition-all ${
                      dateFilter === "month" ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Bulan Ini
                  </button>
                  <button
                    onClick={() => setDateFilter("all")}
                    className={`px-3 py-1.5 rounded-lg transition-all ${
                      dateFilter === "all" ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Semua
                  </button>
                </div>
              </div>

              {/* KPI Metric Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-900/60 border border-slate-800 shadow-xl relative overflow-hidden group">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Pendapatan</span>
                    <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <DollarSign className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="text-2xl font-black text-white tracking-tight">{formatIDR(metrics.totalOmzet)}</div>
                  <div className="flex items-center gap-1 mt-2 text-xs font-semibold text-emerald-400">
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span>Realtime terhubung ke kasir</span>
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-900/60 border border-slate-800 shadow-xl relative overflow-hidden group">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Pesanan</span>
                    <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                      <Receipt className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="text-2xl font-black text-white tracking-tight">{metrics.totalOrders} Transaksi</div>
                  <div className="text-xs font-semibold text-slate-400 mt-2">
                    Rata-rata: {formatIDR(metrics.avgOrderValue)} / struk
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-900/60 border border-slate-800 shadow-xl relative overflow-hidden group">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Metode Pembayaran</span>
                    <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
                      <QrCode className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-emerald-400 flex items-center gap-1">
                        <Banknote className="w-3.5 h-3.5" /> Tunai:
                      </span>
                      <span>{formatIDR(metrics.cashTotal)}</span>
                    </div>
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-rose-400 flex items-center gap-1">
                        <QrCode className="w-3.5 h-3.5" /> QRIS:
                      </span>
                      <span>{formatIDR(metrics.qrisTotal)}</span>
                    </div>
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-900/60 border border-slate-800 shadow-xl relative overflow-hidden group">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Peringatan Stok</span>
                    <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="text-2xl font-black text-amber-400 tracking-tight">
                    {metrics.lowStockCount} Menu Menipis
                  </div>
                  <div className="text-xs font-semibold text-slate-400 mt-2">
                    {metrics.lowStockCount > 0 ? "Perlu restock segera" : "Semua stok mencukupi"}
                  </div>
                </div>
              </div>

              {/* Top 5 & Recent */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800">
                  <h3 className="font-extrabold text-base text-white mb-4 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-indigo-400" />
                    Top 5 Menu Paling Laris
                  </h3>
                  {metrics.topItems.length === 0 ? (
                    <div className="py-12 text-center text-slate-500 text-sm">Belum ada data penjualan pada periode ini</div>
                  ) : (
                    <div className="space-y-3">
                      {metrics.topItems.map((item, idx) => (
                        <div
                          key={item.name}
                          className="flex items-center justify-between p-3.5 rounded-xl bg-slate-800/40 border border-slate-800"
                        >
                          <div className="flex items-center gap-3">
                            <span className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 font-black text-xs flex items-center justify-center">
                              #{idx + 1}
                            </span>
                            <span className="font-bold text-sm text-slate-200">{item.name}</span>
                          </div>
                          <div className="text-right">
                            <div className="font-black text-sm text-emerald-400">{formatIDR(item.revenue)}</div>
                            <div className="text-xs text-slate-400 font-semibold">{item.qty} Porsi Terjual</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-extrabold text-base text-white flex items-center gap-2">
                      <Clock className="w-4 h-4 text-emerald-400" />
                      Aktivitas Transaksi Terbaru
                    </h3>
                    <button
                      onClick={() => setActiveTab("transactions")}
                      className="text-xs text-indigo-400 hover:text-indigo-300 font-bold"
                    >
                      Lihat Semua &rarr;
                    </button>
                  </div>
                  {filteredTransactions.length === 0 ? (
                    <div className="py-12 text-center text-slate-500 text-sm">Belum ada transaksi</div>
                  ) : (
                    <div className="space-y-3">
                      {filteredTransactions.slice(0, 5).map((t) => (
                        <div
                          key={t.id}
                          onClick={() => setSelectedTxDetail(t)}
                          className="flex items-center justify-between p-3.5 rounded-xl bg-slate-800/40 border border-slate-800 hover:border-slate-700 cursor-pointer transition-all"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-black text-xs text-slate-300">{t.invoiceNumber || t.id}</span>
                              <span
                                className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                                  t.paymentMethod === "QRIS"
                                    ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                                    : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                }`}
                              >
                                {t.paymentMethod}
                              </span>
                            </div>
                            <p className="text-xs text-slate-400 mt-0.5">{formatDate(t.createdAt)}</p>
                          </div>
                          <div className="font-black text-base text-white">{formatIDR(t.grandTotal)}</div>
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
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-black text-white">Katalog Menu & Harga</h2>
                  <p className="text-sm text-slate-400">
                    Tambah, edit harga, atau aktifkan/nonaktifkan menu untuk tablet kasir
                  </p>
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
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm shadow-lg shadow-indigo-600/30 transition-all self-start sm:self-auto"
                >
                  <Plus className="w-4 h-4" />
                  <span>Tambah Menu Baru</span>
                </button>
              </div>

              {/* Search & Category Tabs */}
              <div className="flex flex-col md:flex-row items-center gap-3">
                <div className="relative flex-1 w-full">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari nama menu atau SKU..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 w-full md:w-auto overflow-x-auto text-xs font-bold">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-3 py-2 rounded-lg whitespace-nowrap transition-all ${
                        selectedCategory === cat ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-white"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Products Table */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-slate-300">
                    <thead className="bg-slate-900 border-b border-slate-800 text-xs font-extrabold uppercase text-slate-400">
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
                            <td className="py-3 px-5">
                              <div className="flex items-center gap-3">
                                <img
                                  src={product.imageUrl || "https://images.unsplash.com/photo-1541167760496-1628856ab772?w=400"}
                                  alt={product.name}
                                  className="w-11 h-11 rounded-xl object-cover border border-slate-700 shadow-sm"
                                />
                                <div>
                                  <p className="font-bold text-white text-sm">{product.name}</p>
                                  <p className="text-xs text-slate-500">ID: {product.id}</p>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-4 font-mono text-xs text-slate-400">{product.sku || "-"}</td>
                            <td className="py-3 px-4">
                              <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold">
                                {product.category}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-black text-white text-sm">{formatIDR(product.price)}</td>
                            <td className="py-3 px-4">
                              <span
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                                  (product.stockQuantity ?? 50) <= 0
                                    ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                                    : (product.stockQuantity ?? 50) <= (product.minStockAlert ?? 10)
                                    ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                                    : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                }`}
                              >
                                {product.stockQuantity ?? 50} unit
                              </span>
                            </td>
                            <td className="py-3 px-4">
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
                            <td className="py-3 px-5 text-right">
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
                                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all"
                                  title="Edit Harga & Menu"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteProduct(product)}
                                  className="p-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-all"
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
            </div>
          )}

          {/* ================= TAB 3: INVENTORY ================= */}
          {activeTab === "inventory" && (
            <div className="space-y-8">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-black text-white">Stok & Mutasi Inventori</h2>
                  <p className="text-sm text-slate-400">
                    Input stok masuk dari supplier, catat barang rusak, dan lacak seluruh mutasi
                  </p>
                </div>
              </div>

              {/* Master Stok Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {products.map((p) => {
                  const stock = p.stockQuantity ?? 50;
                  const isLow = stock <= (p.minStockAlert ?? 10);
                  return (
                    <div
                      key={p.id}
                      className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-bold text-white text-base">{p.name}</p>
                          <p className="text-xs text-slate-400 font-mono">SKU: {p.sku || "-"}</p>
                        </div>
                        <span
                          className={`px-3 py-1 rounded-xl text-xs font-black ${
                            stock <= 0
                              ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                              : isLow
                              ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                              : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                          }`}
                        >
                          {stock} Unit
                        </span>
                      </div>

                      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-800/80">
                        <button
                          onClick={() => {
                            setSelectedStockProduct(p);
                            setStockModalType("IN");
                            setStockQtyInput("");
                            setStockNotesInput("Restock dari Supplier");
                            setIsStockModalOpen(true);
                          }}
                          className="flex-1 py-2 px-3 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 text-xs font-bold flex items-center justify-center gap-1.5 transition-all"
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
                          className="flex-1 py-2 px-3 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 border border-rose-500/30 text-xs font-bold flex items-center justify-center gap-1.5 transition-all"
                        >
                          <PackageMinus className="w-4 h-4" />
                          <span>- Stok Keluar</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Riwayat Mutasi Stok */}
              <div className="space-y-4">
                <h3 className="text-lg font-extrabold text-white flex items-center gap-2">
                  <Boxes className="w-5 h-5 text-indigo-400" />
                  Buku Besar Riwayat Mutasi Stok (Audit Logs)
                </h3>

                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-300">
                      <thead className="bg-slate-900 border-b border-slate-800 text-xs font-extrabold uppercase text-slate-400">
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
                            <td colSpan={7} className="text-center py-10 text-slate-500 text-sm">
                              Belum ada catatan mutasi stok
                            </td>
                          </tr>
                        ) : (
                          inventoryLogs.map((log) => (
                            <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                              <td className="py-3 px-5 text-xs text-slate-400">{formatDate(log.timestamp)}</td>
                              <td className="py-3 px-4 font-bold text-white">{log.productName}</td>
                              <td className="py-3 px-4">
                                <span
                                  className={`px-2.5 py-1 rounded-lg text-xs font-black ${
                                    log.type === "IN"
                                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                      : log.type === "OUT"
                                      ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                                      : "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30"
                                  }`}
                                >
                                  {log.type === "IN" ? "MASUK (Restock)" : log.type === "OUT" ? "KELUAR (Waste)" : "PENJUALAN"}
                                </span>
                              </td>
                              <td className="py-3 px-4 font-black text-sm">
                                {log.type === "IN" ? `+${log.quantity}` : `-${log.quantity}`}
                              </td>
                              <td className="py-3 px-4 font-bold text-slate-300">{log.currentStock} unit</td>
                              <td className="py-3 px-4 text-xs text-slate-400">{log.notes || "-"}</td>
                              <td className="py-3 px-5 text-xs text-slate-400">{log.createdBy || "Sistem"}</td>
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
                  <h2 className="text-2xl font-black text-white">Monitor Transaksi Kasir</h2>
                  <p className="text-sm text-slate-400">Detik demi detik transaksi penjualan dari tablet kasir</p>
                </div>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={txSearchQuery}
                  onChange={(e) => setTxSearchQuery(e.target.value)}
                  placeholder="Cari nomor invoice (INV/...) atau metode bayar..."
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Transactions Table */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-slate-300">
                    <thead className="bg-slate-900 border-b border-slate-800 text-xs font-extrabold uppercase text-slate-400">
                      <tr>
                        <th className="py-4 px-5">No. Invoice</th>
                        <th className="py-4 px-4">Waktu Transaksi</th>
                        <th className="py-4 px-4">Rincian Menu</th>
                        <th className="py-4 px-4">Metode Bayar</th>
                        <th className="py-4 px-4">Total Bayar</th>
                        <th className="py-4 px-5 text-right">Detail</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-medium">
                      {transactions
                        .filter((t) => {
                          const q = txSearchQuery.toLowerCase();
                          return (
                            (t.invoiceNumber || t.id).toLowerCase().includes(q) ||
                            (t.paymentMethod || "").toLowerCase().includes(q)
                          );
                        })
                        .map((tx) => (
                          <tr key={tx.id} className="hover:bg-slate-800/30 transition-colors">
                            <td className="py-3.5 px-5 font-mono font-bold text-white text-xs">
                              {tx.invoiceNumber || tx.id}
                            </td>
                            <td className="py-3.5 px-4 text-xs text-slate-400">{formatDate(tx.createdAt)}</td>
                            <td className="py-3.5 px-4 text-xs">
                              <span className="font-semibold text-slate-200">
                                {(tx.items || []).map((i) => `${i.name} (x${i.qty})`).join(", ") || "1x Transaksi"}
                              </span>
                            </td>
                            <td className="py-3.5 px-4">
                              <span
                                className={`px-2.5 py-1 rounded-lg text-xs font-black ${
                                  tx.paymentMethod === "QRIS"
                                    ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                                    : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                }`}
                              >
                                {tx.paymentMethod}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 font-black text-white text-base">
                              {formatIDR(tx.grandTotal)}
                            </td>
                            <td className="py-3.5 px-5 text-right">
                              <button
                                onClick={() => setSelectedTxDetail(tx)}
                                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-all"
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
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-black text-lg text-white">
                {editingProduct ? "Edit Menu & Harga Jual" : "Tambah Menu Baru"}
              </h3>
              <button
                onClick={() => {
                  setIsAddProductOpen(false);
                  setIsEditProductOpen(false);
                }}
                className="text-slate-400 hover:text-white font-bold"
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
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-200 focus:outline-none focus:border-indigo-500"
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
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-200 focus:outline-none focus:border-indigo-500 font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">Kategori *</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-200 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="Minuman">Minuman</option>
                    <option value="Makanan & Pastry">Makanan & Pastry</option>
                    <option value="Snack">Snack</option>
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
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-200 font-mono text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">Stok Awal (Unit)</label>
                  <input
                    type="number"
                    value={formData.stockQuantity}
                    onChange={(e) => setFormData({ ...formData, stockQuantity: e.target.value })}
                    placeholder="50"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-200 focus:outline-none focus:border-indigo-500 font-bold"
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
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddProductOpen(false);
                    setIsEditProductOpen(false);
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 font-bold text-slate-300 text-xs"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-bold text-white text-xs shadow-lg shadow-indigo-600/30"
                >
                  Simpan & Sinkronkan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: RESTOCK / STOK MUTASI ================= */}
      {isStockModalOpen && selectedStockProduct && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-black text-lg text-white">
                {stockModalType === "IN" ? "Restock Stok Masuk" : "Catat Stok Keluar / Waste"}
              </h3>
              <button onClick={() => setIsStockModalOpen(false)} className="text-slate-400 hover:text-white font-bold">
                ✕
              </button>
            </div>

            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
              <div>
                <p className="font-bold text-sm text-white">{selectedStockProduct.name}</p>
                <p className="text-xs text-slate-400">Sisa saat ini: {selectedStockProduct.stockQuantity ?? 50} unit</p>
              </div>
              <span className="text-xs font-mono font-bold text-indigo-400">{selectedStockProduct.sku || "-"}</span>
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
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-200 text-lg font-black focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">Keterangan / No. Surat Jalan</label>
                <input
                  type="text"
                  value={stockNotesInput}
                  onChange={(e) => setStockNotesInput(e.target.value)}
                  placeholder="Contoh: Kiriman Supplier Kopi CV Mandiri"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsStockModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 font-bold text-slate-300 text-xs"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className={`px-5 py-2 rounded-xl font-bold text-white text-xs shadow-lg ${
                    stockModalType === "IN"
                      ? "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/30"
                      : "bg-rose-600 hover:bg-rose-500 shadow-rose-600/30"
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
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-black text-lg text-white">Struk Transaksi Kasir</h3>
                <p className="text-xs text-slate-400">{selectedTxDetail.invoiceNumber || selectedTxDetail.id}</p>
              </div>
              <button onClick={() => setSelectedTxDetail(null)} className="text-slate-400 hover:text-white font-bold">
                ✕
              </button>
            </div>

            {/* Receipt Items */}
            <div className="space-y-2 bg-slate-950 p-4 rounded-xl border border-slate-800 max-h-60 overflow-y-auto">
              {(selectedTxDetail.items || []).map((item, idx) => (
                <div key={idx} className="flex justify-between items-center text-xs">
                  <div>
                    <p className="font-bold text-slate-200">{item.name}</p>
                    <p className="text-[11px] text-slate-500">
                      {item.qty} x {formatIDR(item.price)}
                    </p>
                  </div>
                  <span className="font-bold text-slate-300">{formatIDR(item.subtotal || item.price * item.qty)}</span>
                </div>
              ))}
            </div>

            {/* Summary */}
            <div className="space-y-1.5 text-xs border-t border-slate-800 pt-3">
              <div className="flex justify-between text-slate-400">
                <span>Waktu Pembelian:</span>
                <span>{formatDate(selectedTxDetail.createdAt)}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Metode Bayar:</span>
                <span className="font-bold text-white">{selectedTxDetail.paymentMethod}</span>
              </div>
              {selectedTxDetail.cashReceived && (
                <>
                  <div className="flex justify-between text-slate-400">
                    <span>Uang Diterima:</span>
                    <span>{formatIDR(selectedTxDetail.cashReceived)}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Kembalian:</span>
                    <span>{formatIDR(selectedTxDetail.changeGiven || 0)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between text-base font-black text-emerald-400 pt-2 border-t border-slate-800">
                <span>Total Dibayar:</span>
                <span>{formatIDR(selectedTxDetail.grandTotal)}</span>
              </div>
            </div>

            <button
              onClick={() => setSelectedTxDetail(null)}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 font-bold text-white text-xs transition-all"
            >
              Tutup
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
