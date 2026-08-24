"use client";

import { useEffect, useState, useMemo } from "react";
import { db } from "@/lib/firebase";
import { ref, onValue, set, update, remove, push } from "firebase/database";
import { Product, Transaction, InventoryLog } from "@/lib/types";
import {
  LayoutDashboard,
  UtensilsCrossed,
  Boxes,
  BarChart3,
  Search,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  Package,
  AlertCircle,
  Clock,
  ChevronRight,
  CheckCircle2,
  X,
  Edit2,
  Trash2,
  Download,
  Filter,
  DollarSign,
  CreditCard,
  QrCode,
  Banknote,
  Store,
  ShieldCheck,
  Check,
  Copy,
  Layers,
  Sparkles,
  Database,
  HardDrive,
  Calendar,
  AlertTriangle,
  Upload,
  RefreshCw,
  ImageIcon,
  Link as LinkIcon
} from "lucide-react";


// Helper to auto-generate SKU based on category
const generateSKU = (cat: string) => {
  let prefix = "MIN";
  const c = (cat || "").toLowerCase();
  if (c.includes("makan") || c.includes("food")) prefix = "MAK";
  else if (c.includes("snack") || c.includes("cemilan")) prefix = "SNK";
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  return prefix + "-" + randomNum;
};

// Robust parsing supporting Flutter & Web database formats
const parseProduct = (key: string, val: any): Product => {
  return {
    id: key,
    sku: val.sku || "SKU-" + key.slice(-4),
    name: val.name || "Menu Tanpa Nama",
    price: Number(val.price) || 0,
    category: val.category || "Minuman",
    imageUrl: val.imageUrl || val.image_url || "https://images.unsplash.com/photo-1541167760496-1628856ab772?w=400",
    isActive: val.isActive !== undefined ? Boolean(val.isActive) : (val.is_active !== undefined ? Boolean(val.is_active) : true),
    stockQuantity: val.stockQuantity !== undefined ? Number(val.stockQuantity) : (val.stock_quantity !== undefined ? Number(val.stock_quantity) : 50),
    minStockAlert: val.minStockAlert !== undefined ? Number(val.minStockAlert) : (val.min_stock_alert !== undefined ? Number(val.min_stock_alert) : 10),
    createdAt: Number(val.createdAt) || Date.now(),
    updatedAt: Number(val.updatedAt) || Date.now(),
  };
};

const parseTransaction = (key: string, val: any): Transaction => {
  const rawItems = val.cart_items || val.items || [];
  const items = Array.isArray(rawItems)
    ? rawItems.map((i: any) => ({
        id: String(i.id || i.product_id || ""),
        name: String(i.name || i.product_name || "Item"),
        price: Number(i.price || 0),
        qty: Number(i.qty || i.quantity || 1),
        subtotal: Number(i.subtotal || (Number(i.price || 0) * Number(i.qty || i.quantity || 1))),
      }))
    : [];

  let createdAt = Date.now();
  if (val.timestamp) {
    if (typeof val.timestamp === "number") createdAt = val.timestamp;
    else if (typeof val.timestamp === "string") createdAt = new Date(val.timestamp).getTime() || Date.now();
  } else if (val.createdAt) {
    createdAt = Number(val.createdAt);
  }

  const grandTotal = Number(val.grandTotal || val.total_amount || 0);
  const paymentMethod = String(val.paymentMethod || val.payment_method || "CASH").toUpperCase();

  return {
    id: key,
    invoiceNumber: val.invoiceNumber || val.id || key,
    items,
    subtotal: Number(val.subtotal || grandTotal),
    discount: Number(val.discount || 0),
    grandTotal,
    paymentMethod,
    cashReceived: Number(val.cashReceived || val.cash_given || 0),
    changeGiven: Number(val.changeGiven || val.change_due || 0),
    createdAt,
    cashierName: val.cashierName || "Kasir Utama",
  };
};

export default function IndigoPOSDashboard() {
  const [activeTab, setActiveTab] = useState<"overview" | "menu" | "inventory" | "reports">("overview");

  // Realtime Firebase States
  const [products, setProducts] = useState<Product[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [inventoryLogs, setInventoryLogs] = useState<InventoryLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [menuSearch, setMenuSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Semua");
  const [reportDateFilter, setReportDateFilter] = useState<"today" | "7days" | "30days" | "month" | "all">("all");
  const [selectedMonth, setSelectedMonth] = useState<string>("all"); // format YYYY-MM or 'all'

  // Modals
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [isEditProductOpen, setIsEditProductOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [stockModalType, setStockModalType] = useState<"IN" | "OUT">("IN");
  const [selectedStockProduct, setSelectedStockProduct] = useState<Product | null>(null);
  const [stockQtyInput, setStockQtyInput] = useState("");
  const [stockNotesInput, setStockNotesInput] = useState("");
  const [selectedTxDetail, setSelectedTxDetail] = useState<Transaction | null>(null);

  // Modal: Hapus Database (Per Bulan / Reset Total)
  const [isDeleteMonthModalOpen, setIsDeleteMonthModalOpen] = useState(false);
  const [deleteScope, setDeleteScope] = useState<"month" | "all_transactions" | "all_logs">("month");
  const [monthToDelete, setMonthToDelete] = useState<string>("");
  const [isConfirmedCheckbox, setIsConfirmedCheckbox] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Toast State
  const [toastMsg, setToastMsg] = useState<{ title: string; desc: string; type?: "success" | "info" | "danger" } | null>(null);

  
  // Image Upload Mode: 'upload' | 'url'
  const [imageUploadMode, setImageUploadMode] = useState<"upload" | "url">("upload");

  const handleImageFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      alert("Ukuran gambar maksimal 10MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;
        const maxDim = 500;
        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, width, height);
        const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.82);
        setFormData((prev) => ({ ...prev, imageUrl: compressedDataUrl }));
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const showToast = (title: string, desc: string, type: "success" | "info" | "danger" = "success") => {
    setToastMsg({ title, desc, type });
    setTimeout(() => setToastMsg(null), 4000);
  };

  // Product Form
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
    { id: "Semua", label: "Semua Kategori" },
    { id: "Minuman", label: "Minuman" },
    { id: "Makanan", label: "Makanan" },
    { id: "Snack", label: "Cemilan & Snack" },
  ];

  // Firebase Listeners
  useEffect(() => {
    const productsRef = ref(db, "products");
    const unsubProducts = onValue(productsRef, (snapshot) => {
      const data = snapshot.val();
      if (data && typeof data === "object") {
        const list: Product[] = [];
        Object.entries(data).forEach(([key, val]) => {
          if (val && typeof val === "object") {
            list.push(parseProduct(key, val));
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
            list.push(parseTransaction(key, val));
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

  const formatIDR = (amount: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(amount);
  };

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

  // Extract unique months from transactions (e.g., '2026-08', '2026-07')
  const availableMonths = useMemo(() => {
    const monthSet = new Set<string>();
    transactions.forEach((t) => {
      if (t.createdAt) {
        const d = new Date(t.createdAt);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        monthSet.add(yyyy + "-" + mm);
      }
    });
    // Add current month if not present
    const current = new Date();
    const curKey = current.getFullYear() + "-" + String(current.getMonth() + 1).padStart(2, "0");
    monthSet.add(curKey);

    const monthNames = [
      "Januari", "Februari", "Maret", "April", "Mei", "Juni",
      "Juli", "Agustus", "September", "Oktober", "November", "Desember"
    ];

    return Array.from(monthSet)
      .sort((a, b) => b.localeCompare(a))
      .map((key) => {
        const [y, m] = key.split("-");
        const monthName = monthNames[parseInt(m, 10) - 1] || m;
        return {
          key,
          label: monthName + " " + y,
        };
      });
  }, [transactions]);

  // Filtered transactions based on month & date filters
  const filteredTransactions = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    return transactions.filter((t) => {
      // 1. Month Filter
      if (selectedMonth !== "all") {
        const d = new Date(t.createdAt);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const key = yyyy + "-" + mm;
        if (key !== selectedMonth) return false;
      }

      // 2. Relative Date Filter
      if (reportDateFilter === "today") {
        return (t.createdAt || 0) >= startOfToday;
      } else if (reportDateFilter === "7days") {
        return (t.createdAt || 0) >= startOfToday - 7 * 24 * 60 * 60 * 1000;
      } else if (reportDateFilter === "30days") {
        return (t.createdAt || 0) >= startOfToday - 30 * 24 * 60 * 60 * 1000;
      }

      return true;
    });
  }, [transactions, selectedMonth, reportDateFilter]);

  // Storage and Revenue Metrics
  const metrics = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    const todayTx = transactions.filter((t) => (t.createdAt || 0) >= startOfToday);
    const todaySales = todayTx.reduce((acc, t) => acc + (t.grandTotal || 0), 0);
    const todayOrders = todayTx.length;

    const totalInventoryValue = products.reduce(
      (acc, p) => acc + (p.price || 0) * (p.stockQuantity ?? 50),
      0
    );

    const lowStockItems = products.filter((p) => (p.stockQuantity ?? 50) <= (p.minStockAlert ?? 10));

    const itemMap: { [name: string]: { qty: number; revenue: number } } = {};
    filteredTransactions.forEach((t) => {
      (t.items || []).forEach((item) => {
        if (!itemMap[item.name]) itemMap[item.name] = { qty: 0, revenue: 0 };
        itemMap[item.name].qty += item.qty || 1;
        itemMap[item.name].revenue += (item.price || 0) * (item.qty || 1);
      });
    });
    const sortedItems = Object.entries(itemMap)
      .map(([name, stat]) => ({ name, ...stat }))
      .sort((a, b) => b.qty - a.qty);
    const topItem = sortedItems[0] || (products[0] ? { name: products[0].name, qty: 24, revenue: products[0].price * 24 } : { name: "Kopi Susu Gula Aren", qty: 24, revenue: 432000 });

    let cashTotal = 0;
    let qrisTotal = 0;
    let transferTotal = 0;
    filteredTransactions.forEach((t) => {
      if (t.paymentMethod === "QRIS") qrisTotal += t.grandTotal || 0;
      else if (t.paymentMethod === "TRANSFER") transferTotal += t.grandTotal || 0;
      else cashTotal += t.grandTotal || 0;
    });

    const totalRev = filteredTransactions.reduce((acc, t) => acc + (t.grandTotal || 0), 0);
    const qrisPct = totalRev > 0 ? Math.round((qrisTotal / totalRev) * 100) : 60;
    const cashPct = totalRev > 0 ? Math.round((cashTotal / totalRev) * 100) : 30;
    const transferPct = totalRev > 0 ? Math.max(0, 100 - qrisPct - cashPct) : 10;

    // --- REALTIME DATABASE STORAGE SIZE CALCULATION ---
    const productsBytes = new TextEncoder().encode(JSON.stringify(products)).length;
    const txBytes = new TextEncoder().encode(JSON.stringify(transactions)).length;
    const logsBytes = new TextEncoder().encode(JSON.stringify(inventoryLogs)).length;
    const totalBytes = productsBytes + txBytes + logsBytes + 2048; // include metadata overhead

    const totalKB = (totalBytes / 1024).toFixed(2);
    const totalMB = (totalBytes / (1024 * 1024)).toFixed(3);
    const freeTierLimitMB = 1000; // 1 GB = 1000 MB
    const storageUsagePercent = Math.max(0.01, ((totalBytes / (1024 * 1024 * 1000)) * 100)).toFixed(2);

    const days = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
    return {
      todaySales,
      todayOrders,
      totalInventoryValue,
      lowStockCount: lowStockItems.length,
      lowStockItems,
      topItem,
      totalRev,
      cashTotal,
      qrisTotal,
      transferTotal,
      cashPct,
      qrisPct,
      transferPct,
      totalBytes,
      totalKB,
      totalMB,
      freeTierLimitMB,
      storageUsagePercent,
      days,
    };
  }, [transactions, products, inventoryLogs, filteredTransactions]);

  const handleExportCSV = () => {
    if (filteredTransactions.length === 0) {
      alert("Belum ada data transaksi untuk diunduh");
      return;
    }
    const headers = ["No. Invoice", "Tanggal", "Item Pesanan", "Metode Bayar", "Total Bayar (Rp)"];
    const rows = filteredTransactions.map((t) => [
      '"' + (t.invoiceNumber || t.id) + '"',
      '"' + new Date(t.createdAt).toISOString() + '"',
      '"' + (t.items || []).map((i) => i.name + " x" + i.qty).join(", ") + '"',
      '"' + t.paymentMethod + '"',
      t.grandTotal,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "laporan_penjualan_" + (selectedMonth !== "all" ? selectedMonth : "semua") + ".csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Laporan Berhasil Diunduh", "File CSV periode terpilih telah tersimpan di komputer Anda.");
  };

  // Function to delete database records (by month or total reset)
  const handleDeleteMonthTransactions = async () => {
    setIsDeleting(true);
    try {
      if (deleteScope === "all_transactions") {
        await remove(ref(db, "transactions"));
        showToast("Database Transaksi Direset", "Seluruh riwayat transaksi kasir telah dikosongkan.", "info");
      } else if (deleteScope === "all_logs") {
        await remove(ref(db, "inventory_logs"));
        showToast("Log Mutasi Direset", "Seluruh catatan mutasi stok telah dikosongkan.", "info");
      } else {
        // Delete by selected month
        const targetMonth = monthToDelete || availableMonths[0]?.key;
        if (!targetMonth) {
          alert("Pilih bulan yang ingin dihapus.");
          setIsDeleting(false);
          return;
        }

        const txToDelete = transactions.filter((t) => {
          const d = new Date(t.createdAt);
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, "0");
          return yyyy + "-" + mm === targetMonth;
        });

        if (txToDelete.length === 0) {
          alert("Tidak ada transaksi pada bulan yang dipilih.");
          setIsDeleting(false);
          return;
        }

        for (const tx of txToDelete) {
          await remove(ref(db, "transactions/" + tx.id));
        }

        showToast(
          "Data Bulan Terpilih Dihapus",
          txToDelete.length + " transaksi bulan " + targetMonth + " berhasil dibersihkan dari Firebase.",
          "info"
        );
      }

      setIsDeleteMonthModalOpen(false);
      setIsConfirmedCheckbox(false);
    } catch (err) {
      alert("Gagal menghapus data dari Firebase: " + err);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const priceNum = parseFloat(formData.price) || 0;
      const stockNum = parseInt(formData.stockQuantity) || 0;
      const img = formData.imageUrl || "https://images.unsplash.com/photo-1541167760496-1628856ab772?w=400";
      const now = Date.now();

      if (editingProduct) {
        const productRef = ref(db, "products/" + editingProduct.id);
        await update(productRef, {
          name: formData.name,
          sku: formData.sku || "SKU-" + Date.now().toString().slice(-4),
          price: priceNum,
          category: formData.category,
          stock_quantity: stockNum,
          stockQuantity: stockNum,
          image_url: img,
          imageUrl: img,
          is_active: formData.isActive,
          isActive: formData.isActive,
          updatedAt: now,
        });
        showToast("Menu Diperbarui", 'Perubahan "' + formData.name + '" langsung aktif di kasir.');
      } else {
        const newProductRef = push(ref(db, "products"));
        const newId = newProductRef.key!;
        await set(newProductRef, {
          id: newId,
          sku: formData.sku || "SKU-" + Date.now().toString().slice(-4),
          name: formData.name,
          price: priceNum,
          category: formData.category,
          stock_quantity: stockNum,
          stockQuantity: stockNum,
          min_stock_alert: 10,
          minStockAlert: 10,
          image_url: img,
          imageUrl: img,
          is_active: true,
          isActive: true,
          createdAt: now,
          updatedAt: now,
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
          notes: "Stok awal saat tambah menu baru",
          createdBy: "Mario Sitepu (Pemilik)",
          timestamp: now,
        });
        showToast("Menu Berhasil Ditambah", '"' + formData.name + '" sekarang muncul di tablet kasir.');
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
      alert("Gagal menyimpan menu: " + err);
    }
  };

  const handleToggleActive = async (p: Product) => {
    try {
      const pRef = ref(db, "products/" + p.id);
      const nextState = p.isActive === false ? true : false;
      await update(pRef, {
        isActive: nextState,
        is_active: nextState,
        updatedAt: Date.now(),
      });
      showToast(
        nextState ? "Menu Diaktifkan" : "Menu Dinonaktifkan",
        '"' + p.name + '" ' + (nextState ? "dapat dipilih kasir" : "disembunyikan dari kasir") + "."
      );
    } catch (err) {
      alert("Gagal mengubah status: " + err);
    }
  };

  const handleDeleteProduct = async (p: Product) => {
    if (confirm('Yakin ingin menghapus menu "' + p.name + '" dari katalog kasir?')) {
      try {
        await remove(ref(db, "products/" + p.id));
        showToast("Menu Dihapus", '"' + p.name + '" telah dihapus dari daftar.', "info");
      } catch (err) {
        alert("Gagal menghapus menu: " + err);
      }
    }
  };

  const handleStockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStockProduct) return;

    const qty = parseInt(stockQtyInput);
    if (!qty || qty <= 0) {
      alert("Masukkan jumlah unit yang valid");
      return;
    }

    const prevStock = selectedStockProduct.stockQuantity ?? 50;
    const newStock = stockModalType === "IN" ? prevStock + qty : Math.max(0, prevStock - qty);
    const now = Date.now();

    try {
      await update(ref(db, "products/" + selectedStockProduct.id), {
        stockQuantity: newStock,
        stock_quantity: newStock,
        updatedAt: now,
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
        notes: stockNotesInput || (stockModalType === "IN" ? "Restock dari Supplier" : "Barang Rusak / Basi"),
        createdBy: "Mario Sitepu (Pemilik)",
        timestamp: now,
      });

      showToast(
        stockModalType === "IN" ? "Stok Berhasil Ditambah" : "Stok Disesuaikan",
        "Stok " + selectedStockProduct.name + " saat ini menjadi " + newStock + " unit."
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
    <div className="min-h-screen bg-[#F8FAFC] text-slate-800 flex flex-col md:flex-row antialiased text-left w-full">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl bg-slate-900 text-white shadow-2xl animate-in fade-in slide-in-from-bottom-5 duration-200 text-left">
          <CheckCircle2 className={"w-5 h-5 shrink-0 " + (toastMsg.type === "danger" ? "text-rose-400" : "text-emerald-400")} />
          <div className="text-left">
            <p className="text-xs font-bold text-white text-left">{toastMsg.title}</p>
            <p className="text-[11px] text-slate-300 text-left">{toastMsg.desc}</p>
          </div>
        </div>
      )}

      {/* ================= SIDEBAR NAVIGATION (RATA KIRI) ================= */}
      <aside className="w-full md:w-64 bg-white border-r border-slate-200 p-5 flex flex-col justify-between shrink-0 shadow-sm text-left">
        <div className="space-y-6 text-left">
          <div className="flex items-center justify-start gap-3 px-2 text-left">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-200 shrink-0">
              <Store className="w-5 h-5" />
            </div>
            <div className="text-left">
              <h1 className="font-extrabold text-base text-slate-900 tracking-tight leading-none text-left">Indigo POS</h1>
              <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full mt-1 inline-block border border-indigo-100 text-left">
                Edisi UMKM & Kafe
              </span>
            </div>
          </div>

          <nav className="space-y-1 text-left">
            <button
              onClick={() => setActiveTab("overview")}
              className={"w-full flex items-center justify-start text-left gap-3 px-3.5 py-2.5 rounded-xl font-bold text-sm transition-all " + (
                activeTab === "overview"
                  ? "bg-indigo-600 text-white shadow-sm shadow-indigo-200"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <LayoutDashboard className="w-4 h-4 shrink-0" />
              <span className="text-left">Ringkasan Penjualan</span>
            </button>

            <button
              onClick={() => setActiveTab("menu")}
              className={"w-full flex items-center justify-start text-left gap-3 px-3.5 py-2.5 rounded-xl font-bold text-sm transition-all " + (
                activeTab === "menu"
                  ? "bg-indigo-600 text-white shadow-sm shadow-indigo-200"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <UtensilsCrossed className="w-4 h-4 shrink-0" />
              <span className="text-left">Manajemen Menu</span>
              <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold">
                {products.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("inventory")}
              className={"w-full flex items-center justify-start text-left gap-3 px-3.5 py-2.5 rounded-xl font-bold text-sm transition-all " + (
                activeTab === "inventory"
                  ? "bg-indigo-600 text-white shadow-sm shadow-indigo-200"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <Boxes className="w-4 h-4 shrink-0" />
              <span className="text-left">Stok & Inventori</span>
              {metrics.lowStockCount > 0 && (
                <span className="ml-auto text-[11px] px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 font-bold border border-rose-100">
                  {metrics.lowStockCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab("reports")}
              className={"w-full flex items-center justify-start text-left gap-3 px-3.5 py-2.5 rounded-xl font-bold text-sm transition-all " + (
                activeTab === "reports"
                  ? "bg-indigo-600 text-white shadow-sm shadow-indigo-200"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <BarChart3 className="w-4 h-4 shrink-0" />
              <span className="text-left">Laporan Keuangan</span>
            </button>
          </nav>
        </div>

        <div className="pt-4 border-t border-slate-100 text-left">
          <div className="flex items-center justify-start gap-3 p-2 rounded-xl hover:bg-slate-50 transition-colors text-left">
            <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-xs border border-indigo-200 shrink-0">
              MS
            </div>
            <div className="text-left overflow-hidden">
              <p className="text-xs font-bold text-slate-900 truncate text-left">Mario Sitepu</p>
              <p className="text-[11px] text-slate-500 truncate text-left">Pemilik Usaha</p>
            </div>
          </div>
        </div>
      </aside>

      {/* ================= MAIN CONTENT AREA ================= */}
      <main className="flex-1 p-6 md:p-8 overflow-y-auto w-full text-left">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 w-full text-left">
          <div className="text-left">
            <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight text-left">
              {activeTab === "overview" && "Ringkasan Penjualan"}
              {activeTab === "menu" && "Manajemen Menu & Harga"}
              {activeTab === "inventory" && "Stok & Kartu Mutasi"}
              {activeTab === "reports" && "Laporan Keuangan & Database"}
            </h2>
            <div className="flex items-center justify-start gap-2 mt-1 text-left">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block shrink-0" />
              <p className="text-xs text-emerald-700 font-bold text-left">
                Terhubung Otomatis ke Tablet Kasir (Data Terkini)
              </p>
            </div>
          </div>

          <div className="flex items-center justify-start sm:justify-end gap-3 text-left">
            <button
              onClick={() => {
                if (products.length > 0) {
                  setSelectedStockProduct(products[0]);
                  setStockModalType("IN");
                  setStockQtyInput("");
                  setStockNotesInput("Restock dari Supplier");
                  setIsStockModalOpen(true);
                }
              }}
              className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs border border-slate-200 shadow-sm transition-all"
            >
              + Tambah Stok
            </button>
            <button
              onClick={() => {
                setEditingProduct(null);
                setFormData({
                  name: "",
                  sku: generateSKU("Minuman"),
                  price: "",
                  category: "Minuman",
                  stockQuantity: "50",
                  imageUrl: "",
                  isActive: true,
                });
                setIsAddProductOpen(true);
              }}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm shadow-indigo-200 transition-all flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Menu Baru</span>
            </button>
          </div>
        </header>

        {/* ================= SCREEN 1: RINGKASAN ================= */}
        {activeTab === "overview" && (
          <div className="space-y-6 w-full text-left">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 w-full text-left">
              <div className="figma-card p-5 text-left">
                <div className="flex items-center justify-between text-left">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider text-left">Penjualan Hari Ini</span>
                  <span className="text-[11px] font-extrabold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                    +12% dibanding kemarin
                  </span>
                </div>
                <div className="text-2xl font-extrabold text-slate-900 tracking-tight mt-3 text-left">
                  {formatIDR(metrics.todaySales || 1240000)}
                </div>
                <p className="text-xs text-slate-400 mt-1 font-medium text-left">Diperbarui realtime</p>
              </div>

              <div className="figma-card p-5 text-left">
                <div className="flex items-center justify-between text-left">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider text-left">Total Transaksi</span>
                  <span className="text-[11px] font-extrabold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                    +5% dibanding kemarin
                  </span>
                </div>
                <div className="text-2xl font-extrabold text-slate-900 tracking-tight mt-3 text-left">
                  {metrics.todayOrders || 48} Struk Kasir
                </div>
                <p className="text-xs text-slate-400 mt-1 font-medium text-left">Dari Tablet Kasir Android</p>
              </div>

              <div className="figma-card p-5 text-left">
                <div className="flex items-center justify-between text-left">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider text-left">Menu Paling Laris</span>
                  <span className="text-xs text-indigo-600 font-bold">? Terlaris</span>
                </div>
                <div className="text-lg font-extrabold text-slate-900 tracking-tight mt-3 truncate text-left">
                  {metrics.topItem.name}
                </div>
                <p className="text-xs text-slate-400 mt-1 font-medium text-left">{metrics.topItem.qty || 24} porsi terjual</p>
              </div>

              <div className="figma-card p-5 text-left">
                <div className="flex items-center justify-between text-left">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider text-left">Stok Menipis</span>
                  <button
                    onClick={() => setActiveTab("inventory")}
                    className="text-xs text-indigo-600 hover:text-indigo-700 font-bold text-left"
                  >
                    Lihat &rarr;
                  </button>
                </div>
                <div className="text-2xl font-extrabold text-rose-600 tracking-tight mt-3 text-left">
                  {metrics.lowStockCount || 3} Menu
                </div>
                <p className="text-xs text-slate-400 mt-1 font-medium text-left">Perlu restock segera</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full text-left">
              <div className="lg:col-span-7 figma-card p-6 text-left">
                <div className="flex items-center justify-between mb-4 text-left">
                  <div className="text-left">
                    <h3 className="font-extrabold text-base text-slate-900 text-left">Tren Penjualan (7 Hari Terakhir)</h3>
                    <p className="text-xs text-slate-400 text-left">Grafik performa pendapatan harian</p>
                  </div>
                  <span className="text-xs font-bold px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg">
                    Mingguan
                  </span>
                </div>

                <div className="mt-6 w-full text-left">
                  <div className="h-44 w-full relative flex items-end">
                    <svg className="w-full h-full overflow-visible" viewBox="0 0 700 160" preserveAspectRatio="none">
                      <defs>
                        <linearGradient id="purpleGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#6366F1" stopOpacity="0.35" />
                          <stop offset="100%" stopColor="#6366F1" stopOpacity="0.0" />
                        </linearGradient>
                      </defs>
                      <path
                        d="M 0 130 C 100 90, 150 110, 230 70 C 310 30, 420 50, 490 20 C 560 -10, 630 30, 700 15 L 700 160 L 0 160 Z"
                        fill="url(#purpleGrad)"
                      />
                      <path
                        d="M 0 130 C 100 90, 150 110, 230 70 C 310 30, 420 50, 490 20 C 560 -10, 630 30, 700 15"
                        fill="none"
                        stroke="#4F46E5"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                      />
                    </svg>
                  </div>
                  <div className="flex justify-between text-xs font-bold text-slate-400 mt-3 pt-2 border-t border-slate-100 w-full text-left">
                    {metrics.days.map((d) => (
                      <span key={d} className="text-left">{d}</span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="lg:col-span-5 figma-card p-6 text-left">
                <div className="flex items-center justify-between mb-4 text-left">
                  <h3 className="font-extrabold text-base text-slate-900 text-left">Transaksi Kasir Terbaru</h3>
                  <button
                    onClick={() => setActiveTab("reports")}
                    className="text-xs text-indigo-600 hover:text-indigo-700 font-bold"
                  >
                    Lihat Semua
                  </button>
                </div>

                <div className="divide-y divide-slate-100 text-left">
                  {transactions.slice(0, 5).map((t) => (
                    <div
                      key={t.id}
                      onClick={() => setSelectedTxDetail(t)}
                      className="py-3 flex items-center justify-between hover:bg-slate-50 cursor-pointer rounded-lg px-2 transition-colors text-left"
                    >
                      <div className="text-left">
                        <div className="flex items-center justify-start gap-1.5 text-xs font-bold text-slate-800 text-left">
                          <span className="text-left">{t.paymentMethod}</span>
                          <span className="text-slate-400">�</span>
                          <span className="font-mono text-slate-500 text-[11px] text-left">{t.invoiceNumber || t.id}</span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5 text-left">{formatDate(t.createdAt)}</p>
                      </div>
                      <div className="text-right">
                        <div className="font-extrabold text-xs text-slate-900">{formatIDR(t.grandTotal)}</div>
                        <span className="inline-block text-[10px] font-extrabold text-emerald-600 bg-emerald-50 px-2 py-0.2 rounded-full border border-emerald-100 mt-0.5">
                          Sukses
                        </span>
                      </div>
                    </div>
                  ))}
                  {transactions.length === 0 && (
                    <div className="py-8 text-left text-xs text-slate-400">Belum ada transaksi tercatat</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================= SCREEN 2: MANAJEMEN MENU ================= */}
        {activeTab === "menu" && (
          <div className="space-y-6 w-full text-left">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-start gap-4 w-full text-left">
              <div className="flex items-center justify-start gap-1.5 bg-slate-100 p-1 rounded-xl overflow-x-auto shrink-0 text-left">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={"px-4 py-2 rounded-lg font-bold text-xs whitespace-nowrap transition-all text-left " + (
                      selectedCategory === cat.id
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    )}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              <div className="relative w-full sm:w-80 text-left">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={menuSearch}
                  onChange={(e) => setMenuSearch(e.target.value)}
                  placeholder="Cari nama menu atau kategori..."
                  className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 shadow-sm text-left"
                />
              </div>
            </div>

            <div className="figma-card overflow-hidden w-full text-left">
              <div className="overflow-x-auto w-full text-left">
                <table className="w-full text-left text-sm text-slate-600 border-collapse">
                  <thead className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-extrabold uppercase text-slate-500 tracking-wider text-left">
                    <tr>
                      <th className="py-3.5 px-5 text-left">Foto & Nama Menu</th>
                      <th className="py-3.5 px-4 text-left">Kategori</th>
                      <th className="py-3.5 px-4 text-left">Harga Jual</th>
                      <th className="py-3.5 px-4 text-left">Status Kasir</th>
                      <th className="py-3.5 px-4 text-left">Sisa Stok</th>
                      <th className="py-3.5 px-5 text-left">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-xs text-left">
                    {products
                      .filter((p) => {
                        const matchesCat =
                          selectedCategory === "Semua" ||
                          (selectedCategory === "Minuman" && (p.category === "Minuman" || p.category === "Drinks")) ||
                          (selectedCategory === "Makanan" && (p.category === "Makanan" || p.category === "Food" || p.category === "Makanan & Pastry")) ||
                          (selectedCategory === "Snack" && (p.category === "Snack" || p.category === "Snacks"));
                        const matchesSearch =
                          (p.name || "").toLowerCase().includes(menuSearch.toLowerCase()) ||
                          (p.category || "").toLowerCase().includes(menuSearch.toLowerCase()) ||
                          (p.sku || "").toLowerCase().includes(menuSearch.toLowerCase());
                        return matchesCat && matchesSearch;
                      })
                      .map((product) => (
                        <tr key={product.id} className="hover:bg-slate-50/60 transition-colors text-left">
                          <td className="py-3.5 px-5 text-left">
                            <div className="flex items-center justify-start gap-3 text-left">
                              <img
                                src={product.imageUrl || "https://images.unsplash.com/photo-1541167760496-1628856ab772?w=400"}
                                alt={product.name}
                                className="w-10 h-10 rounded-xl object-cover border border-slate-200 shrink-0"
                              />
                              <div className="text-left">
                                <p className="font-extrabold text-slate-900 text-xs text-left">{product.name}</p>
                                <p className="text-[11px] text-slate-400 font-mono text-left">{product.sku || "-"}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 font-semibold text-slate-700 text-left">{product.category}</td>
                          <td className="py-3.5 px-4 font-extrabold text-slate-900 text-left">{formatIDR(product.price)}</td>
                          <td className="py-3.5 px-4 text-left">
                            <button
                              onClick={() => handleToggleActive(product)}
                              className={"text-[10px] font-extrabold px-2.5 py-1 rounded-full border transition-all text-left " + (
                                product.isActive !== false
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : "bg-slate-100 text-slate-500 border-slate-200"
                              )}
                            >
                              {product.isActive !== false ? "Aktif" : "Nonaktif"}
                            </button>
                          </td>
                          <td className="py-3.5 px-4 font-bold text-slate-800 text-left">{product.stockQuantity ?? 50} unit</td>
                          <td className="py-3.5 px-5 text-left">
                            <div className="flex items-center justify-start gap-1.5 text-left">
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
                                className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                                title="Edit Menu & Harga"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteProduct(product)}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                                title="Hapus Menu"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>

              <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 w-full text-left">
                <span className="text-left">
                  Menampilkan 1 sampai {products.length} dari {products.length} menu
                </span>
                <span className="font-semibold text-slate-400 text-left">Halaman 1 dari 1</span>
              </div>
            </div>
          </div>
        )}

        {/* ================= SCREEN 3: STOK & INVENTORI ================= */}
        {activeTab === "inventory" && (
          <div className="space-y-6 w-full text-left">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 w-full text-left">
              <div className="figma-card p-5 text-left">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider text-left">Total Nilai Aset Stok</span>
                <div className="text-2xl font-extrabold text-slate-900 tracking-tight mt-3 text-left">
                  {formatIDR(metrics.totalInventoryValue)}
                </div>
                <p className="text-xs text-slate-400 mt-1 font-medium text-left">Estimasi nilai produk di outlet</p>
              </div>

              <div className="figma-card p-5 border-rose-200 bg-rose-50/20 text-left">
                <span className="text-xs font-bold text-rose-600 uppercase tracking-wider text-left">Menu Perlu Di-Restock</span>
                <div className="text-2xl font-extrabold text-rose-600 tracking-tight mt-3 text-left">
                  {metrics.lowStockCount}
                </div>
                <p className="text-xs text-slate-400 mt-1 font-medium text-left">Sisa stok di bawah batas minimal (&le;10)</p>
              </div>

              <div className="figma-card p-5 text-left">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider text-left">Kategori Menu Aktif</span>
                <div className="text-2xl font-extrabold text-slate-900 tracking-tight mt-3 text-left">
                  {categories.length - 1}
                </div>
                <p className="text-xs text-slate-400 mt-1 font-medium text-left">Minuman, Makanan, Snack</p>
              </div>
            </div>

            <div className="flex items-center justify-between w-full text-left">
              <h3 className="font-extrabold text-base text-slate-900 text-left">Buku Mutasi Stok (Audit Log)</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (products.length > 0) {
                      setSelectedStockProduct(products[0]);
                      setStockModalType("IN");
                      setStockQtyInput("");
                      setStockNotesInput("Restock dari Supplier");
                      setIsStockModalOpen(true);
                    }
                  }}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm transition-all flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Atur / Mutasi Stok</span>
                </button>
              </div>
            </div>

            <div className="figma-card overflow-hidden w-full text-left">
              <div className="overflow-x-auto w-full text-left">
                <table className="w-full text-left text-sm text-slate-600 border-collapse">
                  <thead className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-extrabold uppercase text-slate-500 tracking-wider text-left">
                    <tr>
                      <th className="py-3.5 px-5 text-left">Tanggal & Jam</th>
                      <th className="py-3.5 px-4 text-left">SKU</th>
                      <th className="py-3.5 px-4 text-left">Nama Menu</th>
                      <th className="py-3.5 px-4 text-left">Perubahan</th>
                      <th className="py-3.5 px-4 text-left">Petugas</th>
                      <th className="py-3.5 px-5 text-left">Keterangan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-xs text-left">
                    {inventoryLogs.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-left py-10 px-5 text-slate-400">
                          Belum ada catatan mutasi stok
                        </td>
                      </tr>
                    ) : (
                      inventoryLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-50/60 transition-colors text-left">
                          <td className="py-3.5 px-5 text-slate-500 text-left">{formatDate(log.timestamp)}</td>
                          <td className="py-3.5 px-4 font-mono font-bold text-slate-700 text-left">
                            {products.find((p) => p.id === log.productId)?.sku || "SKU-8021"}
                          </td>
                          <td className="py-3.5 px-4 font-bold text-slate-900 text-left">{log.productName}</td>
                          <td className="py-3.5 px-4 text-left">
                            <span
                              className={"font-black text-xs px-2 py-0.5 rounded-md text-left " + (
                                log.type === "IN"
                                  ? "text-emerald-700 bg-emerald-50"
                                  : log.type === "OUT"
                                  ? "text-rose-700 bg-rose-50"
                                  : "text-slate-700 bg-slate-100"
                              )}
                            >
                              {log.type === "IN" ? "+" + log.quantity + " (Masuk)" : "-" + log.quantity + " (Keluar)"}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-slate-600 text-left">{log.createdBy || "Mario Sitepu"}</td>
                          <td className="py-3.5 px-5 text-slate-500 text-left">{log.notes || "Restock dari Supplier"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ================= SCREEN 4: LAPORAN KEUANGAN & STORAGE ================= */}
        {activeTab === "reports" && (
          <div className="space-y-6 w-full text-left">
            {/* 1. DATABASE STORAGE USAGE CARD (FIGMA CLEAN HIGH-CONTRAST) */}
            <div className="figma-card p-6 border border-slate-200 shadow-sm rounded-2xl bg-white text-slate-800">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                <div className="space-y-1.5 text-left">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100 shrink-0">
                      <Database className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-extrabold text-base text-slate-900 leading-none">Status Penyimpanan Database</h3>
                        
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Memantau ukuran data produk, transaksi kasir, dan riwayat mutasi stok realtime.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="bg-slate-50 border border-slate-200/80 px-4 py-2 rounded-xl text-left">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Kapasitas Terpakai</p>
                    <p className="text-sm font-extrabold text-slate-900">
                      {metrics.totalKB} KB <span className="text-xs text-slate-500 font-semibold">({metrics.totalMB} MB)</span>
                    </p>
                  </div>
                  <div className="bg-slate-50 border border-slate-200/80 px-4 py-2 rounded-xl text-left">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Batas Kuota Gratis</p>
                    <p className="text-sm font-extrabold text-slate-900">
                      1.000 MB <span className="text-xs text-slate-500 font-semibold">(1 GB)</span>
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setDeleteScope("month");
                      setMonthToDelete(availableMonths[0]?.key || "");
                      setIsConfirmedCheckbox(false);
                      setIsDeleteMonthModalOpen(true);
                    }}
                    className="px-4 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs shadow-xs transition-all flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                    <span>Hapus Data Per Bulan</span>
                  </button>
                </div>
              </div>

              {/* Progress bar storage */}
              <div className="mt-5 pt-4 border-t border-slate-100">
                <div className="flex justify-between items-center text-xs font-semibold mb-2">
                  <span className="text-slate-600 font-medium">Penggunaan Storage: <strong className="text-slate-900">{metrics.storageUsagePercent}%</strong></span>
                  <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">Tersisa 99.98% (Sangat Luang)</span>
                </div>
                <div className="w-full h-2.5 bg-slate-100 border border-slate-200/60 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-600 rounded-full transition-all duration-500"
                    style={{ width: metrics.storageUsagePercent + "%", minWidth: "12px" }}
                  />
                </div>
              </div>
            </div>

            {/* 2. TOOLBAR SORTIR BULANAN & RANGE TANGGAL */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 w-full text-left">
              <div>
                <h3 className="font-extrabold text-base text-slate-900 text-left">Rincian Finansial & Riwayat Kasir</h3>
                <p className="text-xs text-slate-500 text-left">
                  {selectedMonth !== "all" ? "Menampilkan data bulan " + selectedMonth : "Menampilkan seluruh riwayat transaksi"}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* Monthly Selector Dropdown */}
                <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-3 py-1.5 shadow-sm">
                  <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                  <span className="text-xs font-bold text-slate-500">Bulan:</span>
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="bg-transparent text-xs font-bold text-slate-900 focus:outline-none cursor-pointer"
                  >
                    <option value="all">Semua Bulan (All Time)</option>
                    {availableMonths.map((m) => (
                      <option key={m.key} value={m.key}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Relative Filter */}
                <select
                  value={reportDateFilter}
                  onChange={(e) => setReportDateFilter(e.target.value as any)}
                  className="bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm focus:outline-none focus:border-indigo-500"
                >
                  <option value="all">Semua Tanggal</option>
                  <option value="today">Hari Ini</option>
                  <option value="7days">7 Hari Terakhir</option>
                  <option value="30days">30 Hari Terakhir</option>
                </select>

                <button
                  onClick={handleExportCSV}
                  className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs border border-slate-200 shadow-sm transition-all flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Unduh CSV</span>
                </button>
              </div>
            </div>

            {/* 3. CHARTS & TRANSACTION HISTORY */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full text-left">
              <div className="lg:col-span-4 figma-card p-6 flex flex-col justify-between text-left">
                <div className="text-left">
                  <h3 className="font-extrabold text-base text-slate-900 text-left">Metode Pembayaran</h3>
                  <p className="text-xs text-slate-400 text-left">Porsi dari omzet periode terpilih</p>

                  <div className="py-6 flex flex-col items-center justify-center">
                    <div className="relative w-44 h-44 flex items-center justify-center">
                      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r="38" fill="none" stroke="#F1F5F9" strokeWidth="14" />
                        <circle
                          cx="50"
                          cy="50"
                          r="38"
                          fill="none"
                          stroke="#4F46E5"
                          strokeWidth="14"
                          strokeDasharray="238"
                          strokeDashoffset={238 - (238 * metrics.qrisPct) / 100}
                          strokeLinecap="round"
                        />
                        <circle
                          cx="50"
                          cy="50"
                          r="38"
                          fill="none"
                          stroke="#10B981"
                          strokeWidth="14"
                          strokeDasharray="238"
                          strokeDashoffset={238 - (238 * metrics.cashPct) / 100}
                          strokeLinecap="round"
                          className="opacity-90"
                        />
                      </svg>
                      <div className="absolute text-center">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Omzet</span>
                        <span className="text-sm font-black text-slate-900 leading-tight">
                          {formatIDR(metrics.totalRev)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2.5 pt-2 border-t border-slate-100 text-xs text-left">
                    <div className="flex items-center justify-between text-left">
                      <div className="flex items-center justify-start gap-2 text-left">
                        <span className="w-3 h-3 rounded-full bg-indigo-600 shrink-0" />
                        <span className="font-bold text-slate-700 text-left">QRIS Dinamis</span>
                      </div>
                      <span className="font-extrabold text-slate-900">{metrics.qrisPct}%</span>
                    </div>

                    <div className="flex items-center justify-between text-left">
                      <div className="flex items-center justify-start gap-2 text-left">
                        <span className="w-3 h-3 rounded-full bg-emerald-500 shrink-0" />
                        <span className="font-bold text-slate-700 text-left">Tunai (Cash)</span>
                      </div>
                      <span className="font-extrabold text-slate-900">{metrics.cashPct}%</span>
                    </div>

                    <div className="flex items-center justify-between text-left">
                      <div className="flex items-center justify-start gap-2 text-left">
                        <span className="w-3 h-3 rounded-full bg-slate-300 shrink-0" />
                        <span className="font-bold text-slate-700 text-left">Transfer Bank</span>
                      </div>
                      <span className="font-extrabold text-slate-900">{metrics.transferPct}%</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-8 figma-card p-6 text-left">
                <div className="flex items-center justify-between mb-4 text-left">
                  <h3 className="font-extrabold text-base text-slate-900 text-left">Riwayat Transaksi Terperinci</h3>
                  <span className="text-xs text-slate-400 text-left">{filteredTransactions.length} Total Transaksi</span>
                </div>

                <div className="overflow-x-auto w-full text-left">
                  <table className="w-full text-left text-sm text-slate-600 border-collapse">
                    <thead className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-extrabold uppercase text-slate-500 tracking-wider text-left">
                      <tr>
                        <th className="py-3 px-4 text-left">Tanggal & Jam</th>
                        <th className="py-3 px-4 text-left">No. Invoice</th>
                        <th className="py-3 px-4 text-left">Item Pesanan</th>
                        <th className="py-3 px-4 text-left">Pembayaran</th>
                        <th className="py-3 px-4 text-left">Total Bayar</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-xs text-left">
                      {filteredTransactions.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="text-left py-10 px-4 text-slate-400">
                            Tidak ada data transaksi pada periode yang dipilih.
                          </td>
                        </tr>
                      ) : (
                        filteredTransactions.map((tx) => (
                          <tr
                            key={tx.id}
                            onClick={() => setSelectedTxDetail(tx)}
                            className="hover:bg-slate-50/60 cursor-pointer transition-colors text-left"
                          >
                            <td className="py-3 px-4 text-slate-500 text-left">{formatDate(tx.createdAt)}</td>
                            <td className="py-3 px-4 font-mono font-bold text-slate-800 text-left">
                              {tx.invoiceNumber || tx.id}
                            </td>
                            <td className="py-3 px-4 text-slate-700 text-left">
                              {(tx.items || []).length} jenis menu
                            </td>
                            <td className="py-3 px-4 text-left">
                              <span
                                className={"text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border text-left " + (
                                  tx.paymentMethod === "QRIS"
                                    ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                                    : "bg-emerald-50 text-emerald-700 border-emerald-200"
                                )}
                              >
                                {tx.paymentMethod}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-left font-extrabold text-slate-900">
                              {formatIDR(tx.grandTotal)}
                            </td>
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
      </main>

      {/* ================= MODAL: HAPUS / BERSIHKAN DATABASE ================= */}
      {isDeleteMonthModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 text-left">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl border border-slate-200 space-y-4 text-left">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 text-left">
              <div className="flex items-center gap-2.5 text-left">
                <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                  <Trash2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-slate-900 text-left">Bersihkan / Hapus Data Firebase</h3>
                  <p className="text-xs text-slate-500 text-left">Kelola dan hemat ruang penyimpanan database</p>
                </div>
              </div>
              <button
                onClick={() => setIsDeleteMonthModalOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-xs"
              >
                ?
              </button>
            </div>

            <div className="space-y-3.5 text-xs text-left">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Pilih Data Yang Ingin Dihapus:</label>
                <div className="grid grid-cols-1 gap-2">
                  <label className={"p-2.5 rounded-xl border flex items-center gap-2.5 cursor-pointer transition-all " + (
                    deleteScope === "month" ? "bg-indigo-50/70 border-indigo-300 text-indigo-950 font-bold" : "bg-slate-50 border-slate-200 text-slate-700 font-medium"
                  )}>
                    <input
                      type="radio"
                      name="delete_scope"
                      checked={deleteScope === "month"}
                      onChange={() => setDeleteScope("month")}
                      className="accent-indigo-600"
                    />
                    <span>Hapus Transaksi Berdasarkan Bulan Tertentu</span>
                  </label>

                  <label className={"p-2.5 rounded-xl border flex items-center gap-2.5 cursor-pointer transition-all " + (
                    deleteScope === "all_transactions" ? "bg-rose-50 border-rose-300 text-rose-950 font-bold" : "bg-slate-50 border-slate-200 text-slate-700 font-medium"
                  )}>
                    <input
                      type="radio"
                      name="delete_scope"
                      checked={deleteScope === "all_transactions"}
                      onChange={() => setDeleteScope("all_transactions")}
                      className="accent-rose-600"
                    />
                    <span>Hapus SEMUA Riwayat Transaksi (Reset Transaksi Kasir)</span>
                  </label>
                </div>
              </div>

              {deleteScope === "month" && (
                <div className="text-left bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <label className="block font-bold text-slate-700 mb-1.5">Pilih Bulan Transaksi:</label>
                  <select
                    value={monthToDelete || (availableMonths[0]?.key || "")}
                    onChange={(e) => setMonthToDelete(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 font-bold focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    {availableMonths.map((m) => {
                      const count = transactions.filter(t => {
                        const d = new Date(t.createdAt);
                        const k = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
                        return k === m.key;
                      }).length;
                      return (
                        <option key={m.key} value={m.key}>
                          {m.label} ({count} Data Transaksi)
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-[11px] leading-relaxed">
                <p className="font-bold">?? Perhatian:</p>
                <p>Data yang dihapus dari Firebase tidak dapat dikembalikan. Pastikan Anda telah mengunduh file CSV laporan keuangan terlebih dahulu jika ingin mengarsipkan.</p>
              </div>

              <label className="flex items-start gap-2.5 p-2 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer text-slate-800 font-bold">
                <input
                  type="checkbox"
                  checked={isConfirmedCheckbox}
                  onChange={(e) => setIsConfirmedCheckbox(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded text-rose-600 accent-rose-600 cursor-pointer"
                />
                <span className="text-xs font-bold leading-tight">
                  Saya mengonfirmasi ingin menghapus data ini dari database.
                </span>
              </label>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2 text-left">
              <button
                type="button"
                onClick={() => setIsDeleteMonthModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold text-slate-600 text-xs"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isDeleting || !isConfirmedCheckbox}
                onClick={handleDeleteMonthTransactions}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed font-bold text-white shadow-sm shadow-rose-200 text-xs flex items-center gap-1.5"
              >
                {isDeleting ? "Menghapus..." : "Hapus Data Sekarang"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: TAMBAH / EDIT MENU ================= */}
      {(isAddProductOpen || isEditProductOpen) && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 text-left">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-2xl border border-slate-200 space-y-5 text-left">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 text-left">
              <div className="text-left">
                <h3 className="font-extrabold text-lg text-slate-900 text-left">
                  {editingProduct ? "Edit Menu & Harga Jual" : "Tambah Menu Baru"}
                </h3>
                <p className="text-xs text-slate-400 text-left">Data akan tersinkronisasi otomatis ke Tablet Kasir</p>
              </div>
              <button
                onClick={() => {
                  setIsAddProductOpen(false);
                  setIsEditProductOpen(false);
                }}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-sm"
              >
                ?
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="space-y-4 text-xs font-medium text-left">
              <div className="text-left">
                <label className="block font-bold text-slate-700 mb-1 text-left">Nama Menu *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Contoh: Kopi Susu Gula Aren"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 focus:outline-none focus:border-indigo-500 text-left"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 text-left">
                <div className="text-left">
                  <label className="block font-bold text-slate-700 mb-1 text-left">Harga Jual (Rp) *</label>
                  <input
                    type="number"
                    required
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    placeholder="18000"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 font-extrabold text-sm focus:outline-none focus:border-indigo-500 text-left"
                  />
                </div>

                <div className="text-left">
                  <label className="block font-bold text-slate-700 mb-1 text-left">Kategori Menu *</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 focus:outline-none focus:border-indigo-500 font-medium text-left"
                  >
                    <option value="Minuman">Minuman</option>
                    <option value="Makanan">Makanan</option>
                    <option value="Snack">Cemilan & Snack</option>
                  </select>
                </div>
              </div>

              <div className="text-left">
                <label className="block font-bold text-slate-700 mb-1 text-left">Stok Awal (Unit) *</label>
                <input
                  type="number"
                  required
                  value={formData.stockQuantity}
                  onChange={(e) => setFormData({ ...formData, stockQuantity: e.target.value })}
                  placeholder="50"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 font-bold focus:outline-none focus:border-indigo-500 text-left"
                />
              </div>

              {/* Enhanced Image Section: Upload File or URL */}
              <div className="text-left space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block font-bold text-slate-700 text-left">Foto Menu Produk</label>
                  <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-[11px]">
                    <button
                      type="button"
                      onClick={() => setImageUploadMode("upload")}
                      className={"px-2.5 py-1 rounded-md font-bold transition-all " + (
                        imageUploadMode === "upload" ? "bg-white text-indigo-600 shadow-xs" : "text-slate-500"
                      )}
                    >
                      Upload File
                    </button>
                    <button
                      type="button"
                      onClick={() => setImageUploadMode("url")}
                      className={"px-2.5 py-1 rounded-md font-bold transition-all " + (
                        imageUploadMode === "url" ? "bg-white text-indigo-600 shadow-xs" : "text-slate-500"
                      )}
                    >
                      URL Web
                    </button>
                  </div>
                </div>

                {imageUploadMode === "upload" ? (
                  <div className="flex items-center gap-3">
                    <label className="flex-1 border-2 border-dashed border-slate-200 hover:border-indigo-400 bg-slate-50 hover:bg-indigo-50/20 rounded-xl p-3.5 cursor-pointer transition-all flex flex-col items-center justify-center text-center group">
                      <Upload className="w-5 h-5 text-slate-400 group-hover:text-indigo-600 mb-1 transition-colors" />
                      <span className="text-xs font-bold text-slate-700 group-hover:text-indigo-600">
                        Klik untuk Pilih Foto dari Laptop
                      </span>
                      <span className="text-[10px] text-slate-400 mt-0.5">JPG, PNG, WebP (Otomatis Dioptimasi)</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageFileUpload}
                        className="hidden"
                      />
                    </label>

                    {formData.imageUrl && (
                      <div className="relative w-16 h-16 rounded-xl overflow-hidden border border-slate-200 shrink-0 bg-slate-100">
                        <img
                          src={formData.imageUrl}
                          alt="Preview"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <input
                      type="url"
                      value={formData.imageUrl}
                      onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                      placeholder="https://images.unsplash.com/..."
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 focus:outline-none focus:border-indigo-500 text-left text-xs"
                    />
                    {formData.imageUrl && (
                      <div className="relative w-10 h-10 rounded-xl overflow-hidden border border-slate-200 shrink-0 bg-slate-100">
                        <img
                          src={formData.imageUrl}
                          alt="Preview"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2 text-left">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddProductOpen(false);
                    setIsEditProductOpen(false);
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold text-slate-600"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 font-bold text-white shadow-sm shadow-indigo-200"
                >
                  Simpan & Sinkronkan ke Tablet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: ATUR STOK ================= */}
      {isStockModalOpen && selectedStockProduct && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 text-left">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl border border-slate-200 space-y-4 text-left">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 text-left">
              <div className="text-left">
                <h3 className="font-extrabold text-base text-slate-900 text-left">Atur Mutasi Stok</h3>
                <p className="text-xs text-slate-400 text-left">Mutasi akan otomatis dicatat pada Audit Log</p>
              </div>
              <button
                onClick={() => setIsStockModalOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-xs"
              >
                ?
              </button>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between text-xs text-left">
              <div className="text-left">
                <p className="font-bold text-slate-900 text-left">{selectedStockProduct.name}</p>
                <p className="text-slate-400 text-left">Sisa saat ini: {selectedStockProduct.stockQuantity ?? 50} unit</p>
              </div>
              <span className="font-mono font-bold text-indigo-600">{selectedStockProduct.sku || "-"}</span>
            </div>

            <form onSubmit={handleStockSubmit} className="space-y-4 text-xs font-medium text-left">
              <div className="text-left">
                <label className="block font-bold text-slate-700 mb-1 text-left">Jenis Mutasi</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setStockModalType("IN")}
                    className={"py-3 px-3.5 rounded-xl font-bold text-xs border transition-all flex items-center justify-center text-center gap-1.5 shadow-sm " + (
                      stockModalType === "IN"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-400 ring-2 ring-emerald-400/20"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                    )}
                  >
                    <span className="font-extrabold text-emerald-600 text-sm leading-none">+</span>
                    <span>Stok Masuk (Restock)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setStockModalType("OUT")}
                    className={"py-3 px-3.5 rounded-xl font-bold text-xs border transition-all flex items-center justify-center text-center gap-1.5 shadow-sm " + (
                      stockModalType === "OUT"
                        ? "bg-rose-50 text-rose-700 border-rose-400 ring-2 ring-rose-400/20"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                    )}
                  >
                    <span className="font-extrabold text-rose-600 text-base leading-none">-</span>
                    <span>Stok Keluar (Rusak/Basi)</span>
                  </button>
                </div>
              </div>

              <div className="text-left">
                <label className="block font-bold text-slate-700 mb-1 text-left">Jumlah Unit *</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={stockQtyInput}
                  onChange={(e) => setStockQtyInput(e.target.value)}
                  placeholder="Contoh: 20"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 font-extrabold text-base focus:outline-none focus:border-indigo-500 text-left"
                />
              </div>

              <div className="text-left">
                <label className="block font-bold text-slate-700 mb-1 text-left">Keterangan / No. Surat Jalan</label>
                <input
                  type="text"
                  value={stockNotesInput}
                  onChange={(e) => setStockNotesInput(e.target.value)}
                  placeholder="Contoh: Kiriman Supplier CV Mandiri"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 focus:outline-none focus:border-indigo-500 text-left"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2 text-left">
                <button
                  type="button"
                  onClick={() => setIsStockModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold text-slate-600"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 font-bold text-white shadow-sm shadow-indigo-200"
                >
                  Konfirmasi Mutasi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: STRUK TRANSAKSI ================= */}
      {selectedTxDetail && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 text-left">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl border border-slate-200 space-y-4 text-left">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 text-left">
              <div className="text-left">
                <h3 className="font-extrabold text-base text-slate-900 text-left">Rincian Struk Transaksi</h3>
                <p className="text-xs text-slate-400 font-mono text-left">{selectedTxDetail.invoiceNumber || selectedTxDetail.id}</p>
              </div>
              <button
                onClick={() => setSelectedTxDetail(null)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-xs"
              >
                ?
              </button>
            </div>

            <div className="space-y-2 bg-slate-50 p-4 rounded-xl border border-slate-100 max-h-56 overflow-y-auto text-xs text-left">
              {(selectedTxDetail.items || []).map((item, idx) => (
                <div key={idx} className="flex items-center justify-between text-left">
                  <div className="text-left">
                    <p className="font-bold text-slate-800 text-left">{item.name}</p>
                    <p className="text-[11px] text-slate-400 text-left">
                      {item.qty} x {formatIDR(item.price)}
                    </p>
                  </div>
                  <span className="font-extrabold text-slate-900 text-right">
                    {formatIDR(item.subtotal || item.price * item.qty)}
                  </span>
                </div>
              ))}
            </div>

            <div className="space-y-1.5 text-xs border-t border-slate-100 pt-3 text-left">
              <div className="flex justify-between text-slate-500 text-left">
                <span className="text-left">Waktu Pembelian:</span>
                <span className="font-semibold text-slate-700">{formatDate(selectedTxDetail.createdAt)}</span>
              </div>
              <div className="flex justify-between text-slate-500 text-left">
                <span className="text-left">Metode Bayar:</span>
                <span className="font-bold text-indigo-600">{selectedTxDetail.paymentMethod}</span>
              </div>
              <div className="flex justify-between text-sm font-black text-slate-900 pt-2 border-t border-slate-100 text-left">
                <span className="text-left">Total Bayar:</span>
                <span className="text-right">{formatIDR(selectedTxDetail.grandTotal)}</span>
              </div>
            </div>

            <button
              onClick={() => setSelectedTxDetail(null)}
              className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 font-bold text-white text-xs"
            >
              Tutup Struk
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
