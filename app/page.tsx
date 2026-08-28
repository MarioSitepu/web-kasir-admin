"use client";

import { useEffect, useState, useMemo } from "react";
import { db } from "@/lib/firebase";
import { ref, onValue, set, update, remove, push } from "firebase/database";
import { Product, Transaction, TransactionItem, InventoryLog } from "@/lib/types";
import { getStoredSession, logoutAdmin, AuthUser } from "@/lib/auth";
import LoginScreen from "@/components/LoginScreen";
import {
  LayoutDashboard,
  Menu,
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
  Link as LinkIcon,
  LogOut
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
  const grandTotal = Number(val.grandTotal ?? val.total_amount ?? val.total ?? 0);
  const rawItems = val.cart_items || val.items || val.cartItems || [];
  
  let items: TransactionItem[] = [];
  if (Array.isArray(rawItems) && rawItems.length > 0) {
    items = rawItems.map((i: any, idx: number) => {
      // Extract from Flutter CartItem nested product: { product: { name, price, id }, quantity: 1, subtotal: ... }
      const prod = (i && typeof i.product === "object" && i.product !== null) ? i.product : (typeof i === "object" && i !== null ? i : {});
      let rawName = String(prod.name || i.name || i.product_name || "");
      if (!rawName || rawName === "Item" || rawName === "Unnamed Product") {
        rawName = "Paket Ayam Geprek"; // Sensible default for Sapo Sapo UMKM
      }
      
      const qty = Number(i.quantity ?? i.qty ?? 1) || 1;
      let price = Number(prod.price ?? i.price ?? 0);
      let subtotal = Number(i.subtotal ?? (price * qty));
      
      // If price is 0 but transaction has total, calculate unit price
      if (price <= 0 && grandTotal > 0) {
        price = Math.round(grandTotal / (rawItems.length || 1) / qty);
        subtotal = price * qty;
      }
      
      return {
        id: String(prod.id || i.id || i.product_id || "item_" + idx),
        name: rawName,
        price: price > 0 ? price : 15000,
        qty,
        subtotal: subtotal > 0 ? subtotal : (price > 0 ? price * qty : 15000),
      };
    });
  } else if (grandTotal > 0) {
    items = [{
      id: "item_auto",
      name: "Paket Ayam Geprek",
      price: grandTotal,
      qty: 1,
      subtotal: grandTotal,
    }];
  }

  let createdAt = Date.now();
  if (val.timestamp) {
    if (typeof val.timestamp === "number") createdAt = val.timestamp;
    else if (typeof val.timestamp === "string") createdAt = new Date(val.timestamp).getTime() || Date.now();
  } else if (val.createdAt) {
    createdAt = Number(val.createdAt);
  }

  const paymentMethod = String(val.paymentMethod || val.payment_method || "CASH").toUpperCase();

  return {
    id: key,
    invoiceNumber: val.invoiceNumber || val.id || key,
    items,
    subtotal: Number(val.subtotal || grandTotal),
    discount: Number(val.discount || 0),
    grandTotal,
    paymentMethod,
    cashReceived: Number(val.cashReceived ?? val.cash_given ?? 0),
    changeGiven: Number(val.changeGiven ?? val.change_due ?? 0),
    createdAt,
    cashierName: val.cashierName || "Kasir Utama",
  };
};

export default function IndigoPOSDashboard() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
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
  const [reportProductFilter, setReportProductFilter] = useState<string>("all");
  const [reportMenuSortBy, setReportMenuSortBy] = useState<"qty_desc" | "rev_desc" | "qty_asc" | "name_asc">("qty_desc");
  const [reportMenuSearch, setReportMenuSearch] = useState<string>("");
  const [reportSubTab, setReportSubTab] = useState<"menu" | "transactions" | "analytics">("menu");
  const [reportPaymentFilter, setReportPaymentFilter] = useState<string>("all");
  const [reportCategoryFilter, setReportCategoryFilter] = useState<string>("Semua");

const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);

  // Check persisted session on load
  useEffect(() => {
    const session = getStoredSession();
    if (session) {
      setCurrentUser(session);
    }
    setIsAuthChecking(false);
  }, []);

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
  const [deleteScope, setDeleteScope] = useState<"month" | "all_transactions" | "all_logs" | "reset_all">("month");
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

  // Extract unique months from transactions & inventory logs (e.g., '2026-08', '2026-07')
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
    inventoryLogs.forEach((l) => {
      if (l.timestamp) {
        const d = new Date(l.timestamp);
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
        if ((t.createdAt || 0) < startOfToday) return false;
      } else if (reportDateFilter === "7days") {
        if ((t.createdAt || 0) < startOfToday - 7 * 24 * 60 * 60 * 1000) return false;
      } else if (reportDateFilter === "30days") {
        if ((t.createdAt || 0) < startOfToday - 30 * 24 * 60 * 60 * 1000) return false;
      }

      // 3. Product / Menu Filter
      if (reportProductFilter !== "all") {
        const hasMatch = (t.items || []).some((item) =>
          item.name.toLowerCase().includes(reportProductFilter.toLowerCase())
        );
        if (!hasMatch) return false;
      }

      // 4. Payment Method Filter
      if (reportPaymentFilter !== "all") {
        if (t.paymentMethod !== reportPaymentFilter) return false;
      }

      return true;
    });
  }, [transactions, selectedMonth, reportDateFilter, reportProductFilter, reportPaymentFilter]);

  // Aggregated Menu Sales Breakdown & Sorting
  const menuSalesBreakdown = useMemo(() => {
    const map: { [name: string]: { name: string; category: string; price: number; qty: number; revenue: number; txCount: number } } = {};
    let totalRevenueSum = 0;

    filteredTransactions.forEach((t) => {
      (t.items || []).forEach((item) => {
        const name = (item.name && item.name !== "Item" && item.name !== "Unnamed Product") ? item.name : "Paket Ayam Geprek";
        if (!map[name]) {
          const prod = products.find((p) => p.name.toLowerCase() === name.toLowerCase());
          map[name] = {
            name,
            category: prod?.category || "Makanan",
            price: item.price || prod?.price || 15000,
            qty: 0,
            revenue: 0,
            txCount: 0,
          };
        }
        const qty = item.qty || 1;
        const rev = (item.subtotal && item.subtotal > 0) ? item.subtotal : ((item.price || 0) * qty);
        map[name].qty += qty;
        map[name].revenue += rev > 0 ? rev : (t.grandTotal || 15000);
        map[name].txCount += 1;
        totalRevenueSum += rev > 0 ? rev : (t.grandTotal || 15000);
      });
    });

    let list = Object.values(map);

    // Filter by Category
    if (reportCategoryFilter !== "Semua") {
      list = list.filter((m) => m.category.toLowerCase() === reportCategoryFilter.toLowerCase());
    }

    // Menu search filter
    if (reportMenuSearch.trim()) {
      const q = reportMenuSearch.toLowerCase();
      list = list.filter((m) => m.name.toLowerCase().includes(q) || m.category.toLowerCase().includes(q));
    }

    // Sort by criteria
    if (reportMenuSortBy === "qty_desc") {
      list.sort((a, b) => b.qty - a.qty);
    } else if (reportMenuSortBy === "rev_desc") {
      list.sort((a, b) => b.revenue - a.revenue);
    } else if (reportMenuSortBy === "qty_asc") {
      list.sort((a, b) => a.qty - b.qty);
    } else if (reportMenuSortBy === "name_asc") {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }

    return {
      list,
      totalRevenueSum,
      totalItemsSold: list.reduce((acc, curr) => acc + curr.qty, 0),
    };
  }, [filteredTransactions, products, reportMenuSearch, reportMenuSortBy, reportCategoryFilter]);

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
        const rawName = (item.name && item.name !== "Item" && item.name !== "Unnamed Product") ? item.name : "Paket Ayam Geprek";
        if (!itemMap[rawName]) itemMap[rawName] = { qty: 0, revenue: 0 };
        const qty = item.qty || 1;
        itemMap[rawName].qty += qty;
        const rev = (item.subtotal && item.subtotal > 0)
          ? item.subtotal
          : (item.price && item.price > 0 ? item.price * qty : (t.grandTotal || 15000));
        itemMap[rawName].revenue += rev;
      });
    });
    const sortedItems = Object.entries(itemMap)
      .map(([name, stat]) => ({ name, ...stat }))
      .sort((a, b) => b.qty - a.qty);
    const topItem = sortedItems[0] || (products[0] ? { name: products[0].name, qty: 0, revenue: 0 } : { name: "Belum Ada Penjualan", qty: 0, revenue: 0 });

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

    // --- REALTIME 7 DAYS REVENUE BREAKDOWN FROM DATABASE ---
    const dayNames = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
    const last7Days: {
      dateStr: string;
      dayName: string;
      shortDate: string;
      fullDate: string;
      revenue: number;
      orderCount: number;
      pctOfMax: number;
      x: number;
      y: number;
    }[] = [];

    let maxDailyRev = 10000; // minimum floor for visual scaling

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
      const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();

      const dayTx = transactions.filter((t) => (t.createdAt || 0) >= dayStart && (t.createdAt || 0) <= dayEnd);
      const dailyRevenue = dayTx.reduce((acc, t) => acc + (t.grandTotal || 0), 0);
      const orderCount = dayTx.length;

      if (dailyRevenue > maxDailyRev) {
        maxDailyRev = dailyRevenue;
      }

      const dayName = i === 0 ? "Hari Ini" : dayNames[d.getDay()];
      const shortDate = d.getDate() + "/" + (d.getMonth() + 1);
      const fullDate = d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "short" });

      last7Days.push({
        dateStr: d.toISOString().slice(0, 10),
        dayName,
        shortDate,
        fullDate,
        revenue: dailyRevenue,
        orderCount,
        pctOfMax: 0,
        x: Math.round(((6 - i) / 6) * 640) + 30, // x coordinate in 700 width viewBox
        y: 135, // default baseline
      });
    }

    // Compute coordinates and heights
    last7Days.forEach((d) => {
      d.pctOfMax = maxDailyRev > 0 ? Math.round((d.revenue / maxDailyRev) * 100) : 0;
      // y-range: from 135 (0 rev) up to 25 (max rev)
      d.y = Math.round(135 - (d.pctOfMax / 100) * 110);
    });

    const total7DaysSales = last7Days.reduce((acc, d) => acc + d.revenue, 0);
    const total7DaysOrders = last7Days.reduce((acc, d) => acc + d.orderCount, 0);

    // Build smooth SVG curve path and area path from real data
    const pts = last7Days.map((p) => p.x + " " + p.y);
    let svgLinePath = "M " + pts[0];
    for (let i = 1; i < pts.length; i++) {
      const prev = last7Days[i - 1];
      const curr = last7Days[i];
      const cpX1 = prev.x + (curr.x - prev.x) / 2;
      const cpY1 = prev.y;
      const cpX2 = prev.x + (curr.x - prev.x) / 2;
      const cpY2 = curr.y;
      svgLinePath += " C " + cpX1 + " " + cpY1 + ", " + cpX2 + " " + cpY2 + ", " + curr.x + " " + curr.y;
    }

    const firstPt = last7Days[0];
    const lastPt = last7Days[last7Days.length - 1];
    const svgAreaPath = svgLinePath + " L " + lastPt.x + " 155 L " + firstPt.x + " 155 Z";

    const days = last7Days.map((d) => d.dayName);

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
      qrisPct,
      cashPct,
      transferPct,
      totalKB,
      totalMB,
      storageUsagePercent,
      days,
      last7Days,
      maxDailyRev,
      total7DaysSales,
      total7DaysOrders,
      svgLinePath,
      svgAreaPath,
    };}, [transactions, products, inventoryLogs, filteredTransactions]);

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
        showToast("Buku Mutasi Direset", "Seluruh catatan mutasi stok telah dikosongkan.", "info");
      } else if (deleteScope === "reset_all") {
        await remove(ref(db, "transactions"));
        await remove(ref(db, "inventory_logs"));
        showToast("Database Direset Total", "Seluruh transaksi dan catatan mutasi stok telah dikosongkan.", "info");
      } else {
        // Delete by selected month: Clears BOTH transactions AND inventory logs for that month
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

        const logsToDelete = inventoryLogs.filter((l) => {
          const d = new Date(l.timestamp);
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, "0");
          return yyyy + "-" + mm === targetMonth;
        });

        if (txToDelete.length === 0 && logsToDelete.length === 0) {
          alert("Tidak ada data transaksi atau mutasi stok pada bulan " + targetMonth + ".");
          setIsDeleting(false);
          return;
        }

        // Delete matching transactions
        for (const tx of txToDelete) {
          await remove(ref(db, "transactions/" + tx.id));
        }

        // Delete matching inventory logs
        for (const log of logsToDelete) {
          await remove(ref(db, "inventory_logs/" + log.id));
        }

        showToast(
          "Data Bulan " + targetMonth + " Dihapus",
          txToDelete.length + " transaksi dan " + logsToDelete.length + " log mutasi berhasil dibersihkan.",
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
          createdBy: "Admin",
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
        createdBy: "Admin",
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

  // 1. Loading splash screen while checking session
  if (isAuthChecking) {
    return (
      <div className="min-h-screen w-full bg-[#0F172A] flex flex-col items-center justify-center p-4 text-white">
        <div className="w-12 h-12 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mb-4" />
        <p className="font-extrabold text-sm tracking-wide text-slate-300">Memeriksa Sesi Login Kasir...</p>
      </div>
    );
  }

  // 2. If not authenticated, render Login Screen
  if (!currentUser) {
    return (
      <LoginScreen
        onLoginSuccess={(user) => {
          setCurrentUser(user);
          showToast("Selamat Datang!", "Berhasil masuk sebagai " + user.name);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-800 flex flex-col md:flex-row antialiased text-left w-full">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl bg-slate-900 text-white shadow-2xl animate-in fade-in slide-in-from-bottom-5 duration-200 text-left max-w-sm">
          <CheckCircle2 className={"w-5 h-5 shrink-0 " + (toastMsg.type === "danger" ? "text-rose-400" : "text-emerald-400")} />
          <div className="text-left">
            <p className="text-xs font-bold text-white text-left">{toastMsg.title}</p>
            <p className="text-[11px] text-slate-300 text-left">{toastMsg.desc}</p>
          </div>
        </div>
      )}

      {/* ================= MOBILE STICKY TOP HEADER ================= */}
      <header className="md:hidden bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between sticky top-0 z-40 shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-xs shrink-0">
            <Store className="w-4 h-4" />
          </div>
          <div>
            <h1 className="font-extrabold text-sm text-slate-900 leading-tight">Monitoring Kasir</h1>
            <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.2 rounded-full border border-indigo-100">
              Sapo Sapo
            </span>
          </div>
        </div>

        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
          aria-label="Menu Navigasi"
        >
          {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </header>

      {/* ================= MOBILE DRAWER MENU ================= */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex flex-col">
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <div className="relative bg-white w-4/5 max-w-xs h-full shadow-2xl p-5 flex flex-col justify-between z-10 animate-in slide-in-from-left duration-200">
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-sm shrink-0">
                    <Store className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="font-extrabold text-sm text-slate-900 leading-tight">Monitoring Kasir</h2>
                    <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.2 rounded-full border border-indigo-100">
                      Sapo Sapo
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-xs"
                >
                  ?
                </button>
              </div>

              <nav className="space-y-1.5 text-left">
                <button
                  onClick={() => { setActiveTab("overview"); setIsMobileMenuOpen(false); }}
                  className={"w-full flex items-center justify-start text-left gap-3 px-3.5 py-2.5 rounded-xl font-bold text-sm transition-all " + (
                    activeTab === "overview"
                      ? "bg-indigo-600 text-white shadow-sm shadow-indigo-200"
                      : "text-slate-600 hover:bg-slate-50"
                  )}
                >
                  <LayoutDashboard className="w-4 h-4 shrink-0" />
                  <span>Ringkasan Penjualan</span>
                </button>

                <button
                  onClick={() => { setActiveTab("menu"); setIsMobileMenuOpen(false); }}
                  className={"w-full flex items-center justify-start text-left gap-3 px-3.5 py-2.5 rounded-xl font-bold text-sm transition-all " + (
                    activeTab === "menu"
                      ? "bg-indigo-600 text-white shadow-sm shadow-indigo-200"
                      : "text-slate-600 hover:bg-slate-50"
                  )}
                >
                  <UtensilsCrossed className="w-4 h-4 shrink-0" />
                  <span>Manajemen Menu</span>
                  <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold">
                    {products.length}
                  </span>
                </button>

                <button
                  onClick={() => { setActiveTab("inventory"); setIsMobileMenuOpen(false); }}
                  className={"w-full flex items-center justify-start text-left gap-3 px-3.5 py-2.5 rounded-xl font-bold text-sm transition-all " + (
                    activeTab === "inventory"
                      ? "bg-indigo-600 text-white shadow-sm shadow-indigo-200"
                      : "text-slate-600 hover:bg-slate-50"
                  )}
                >
                  <Boxes className="w-4 h-4 shrink-0" />
                  <span>Stok & Inventori</span>
                  {metrics.lowStockCount > 0 && (
                    <span className="ml-auto text-[11px] px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 font-bold">
                      {metrics.lowStockCount}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => { setActiveTab("reports"); setIsMobileMenuOpen(false); }}
                  className={"w-full flex items-center justify-start text-left gap-3 px-3.5 py-2.5 rounded-xl font-bold text-sm transition-all " + (
                    activeTab === "reports"
                      ? "bg-indigo-600 text-white shadow-sm shadow-indigo-200"
                      : "text-slate-600 hover:bg-slate-50"
                  )}
                >
                  <BarChart3 className="w-4 h-4 shrink-0" />
                  <span>Laporan Keuangan</span>
                </button>
              </nav>
            </div>

            <div className="pt-4 border-t border-slate-100 text-left space-y-2">
              <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 text-left">
                <div className="flex items-center gap-2.5 overflow-hidden">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-600 to-indigo-400 text-white flex items-center justify-center font-black text-xs shadow-sm shrink-0">
                    {currentUser.name.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="text-left overflow-hidden">
                    <p className="text-xs font-bold text-slate-900 truncate">{currentUser.name}</p>
                    <p className="text-[10px] text-slate-500 truncate">"Administrator"</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsLogoutModalOpen(true)}
                  className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 transition-colors"
                  title="Keluar / Logout"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= DESKTOP SIDEBAR NAVIGATION ================= */}
      <aside className="hidden md:flex md:w-64 bg-white border-r border-slate-200 p-5 flex-col justify-between shrink-0 shadow-sm text-left sticky top-0 h-screen overflow-y-auto">
        <div className="space-y-6 text-left">
          <div className="flex items-center justify-start gap-3 px-2 text-left">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-200 shrink-0">
              <Store className="w-5 h-5" />
            </div>
            <div className="text-left">
              <h1 className="font-extrabold text-base text-slate-900 tracking-tight leading-none text-left">Monitoring Kasir</h1>
              <span className="text-[11px] font-black text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-full mt-1 inline-block border border-indigo-100 text-left">
                Sapo Sapo
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
          <div className="flex items-center justify-between p-2.5 rounded-2xl bg-slate-50/80 border border-slate-200/60 text-left">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-600 to-indigo-400 text-white flex items-center justify-center font-black text-xs shadow-md shrink-0">
                {currentUser.name.substring(0, 2).toUpperCase()}
              </div>
              <div className="text-left overflow-hidden">
                <p className="text-xs font-extrabold text-slate-900 truncate text-left">{currentUser.name}</p>
                <p className="text-[10px] text-slate-500 font-semibold truncate text-left">"Administrator"</p>
              </div>
            </div>
            <button
              onClick={() => setIsLogoutModalOpen(true)}
              className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
              title="Keluar / Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ================= MAIN CONTENT AREA ================= */}
      <main className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto w-full text-left">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 w-full text-left">
              {/* KARTU 1: OMZET HARI INI */}
              <div className="figma-card p-5 text-left bg-white border border-slate-200/80 rounded-2xl shadow-sm">
                <div className="flex items-center justify-between text-left">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider text-left">Penjualan Hari Ini</span>
                  <span className="text-[11px] font-extrabold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200/70 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3 text-emerald-600" />
                    <span>Real-Time</span>
                  </span>
                </div>
                <div className="text-2xl font-black text-slate-900 tracking-tight mt-3 text-left">
                  {formatIDR(metrics.todaySales)}
                </div>
                <p className="text-xs text-slate-400 mt-1 font-medium text-left">Total omzet terverifikasi hari ini</p>
              </div>

              {/* KARTU 2: TOTAL TRANSAKSI */}
              <div className="figma-card p-5 text-left bg-white border border-slate-200/80 rounded-2xl shadow-sm">
                <div className="flex items-center justify-between text-left">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider text-left">Total Transaksi</span>
                  <span className="text-[11px] font-extrabold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-200/70 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-indigo-600" />
                    <span>Selesai</span>
                  </span>
                </div>
                <div className="text-2xl font-black text-slate-900 tracking-tight mt-3 text-left">
                  {metrics.todayOrders} <span className="text-base font-bold text-slate-600">Pesanan</span>
                </div>
                <p className="text-xs text-slate-400 mt-1 font-medium text-left">Struk terbit dari Kasir Android</p>
              </div>

              {/* KARTU 3: MENU TERLARIS */}
              <div className="figma-card p-5 text-left bg-white border border-slate-200/80 rounded-2xl shadow-sm">
                <div className="flex items-center justify-between text-left">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider text-left">Menu Terlaris</span>
                  <span className="text-[11px] font-extrabold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200/70 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-500" />
                    <span>Favorit</span>
                  </span>
                </div>
                <div className="text-base sm:text-lg font-black text-slate-900 tracking-tight mt-3 truncate text-left" title={metrics.topItem.name}>
                  {metrics.topItem.name}
                </div>
                <p className="text-xs text-slate-500 mt-1 font-medium text-left">
                  {metrics.topItem.qty > 0 ? (
                    <span className="font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded text-[11px]">
                      {metrics.topItem.qty} porsi terjual ({formatIDR(metrics.topItem.revenue)})
                    </span>
                  ) : (
                    "Belum ada penjualan hari ini"
                  )}
                </p>
              </div>

              {/* KARTU 4: STOK MENIPIS */}
              <div className="figma-card p-5 text-left bg-white border border-slate-200/80 rounded-2xl shadow-sm">
                <div className="flex items-center justify-between text-left">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider text-left">Stok Menipis</span>
                  <button
                    onClick={() => setActiveTab("inventory")}
                    className="text-[11px] text-indigo-600 hover:text-indigo-700 font-extrabold text-left underline cursor-pointer"
                  >
                    Lihat Detail &rarr;
                  </button>
                </div>
                <div className="text-2xl font-black text-rose-600 tracking-tight mt-3 text-left">
                  {metrics.lowStockCount} <span className="text-base font-bold text-slate-600">Menu</span>
                </div>
                <p className="text-xs text-slate-400 mt-1 font-medium text-left">
                  {metrics.lowStockCount > 0 ? "Perlu restock segera" : "Semua stok menu aman"}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full text-left">
              <div className="lg:col-span-7 bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs text-left">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 text-left">
                  <div className="text-left">
                    <h3 className="font-extrabold text-base text-slate-900 text-left flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-indigo-600" />
                      <span>Tren Penjualan (7 Hari Terakhir)</span>
                    </h3>
                    <p className="text-xs text-slate-400 text-left">
                      Grafik pendapatan harian otomatis dari database kasir
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black px-2.5 py-1 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-lg">
                      7 Hari: {formatIDR(metrics.total7DaysSales)}
                    </span>
                  </div>
                </div>

                {/* DYNAMIC REALTIME DATABASE CHART */}
                <div className="mt-4 w-full text-left">
                  <div className="h-48 w-full relative flex items-end">
                    <svg className="w-full h-full overflow-visible" viewBox="0 0 700 160" preserveAspectRatio="none">
                      <defs>
                        <linearGradient id="purpleGradReal" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#4F46E5" stopOpacity="0.30" />
                          <stop offset="100%" stopColor="#4F46E5" stopOpacity="0.0" />
                        </linearGradient>
                      </defs>

                      {/* Horizontal Grid lines */}
                      <line x1="20" y1="25" x2="680" y2="25" stroke="#F1F5F9" strokeWidth="1" strokeDasharray="4 4" />
                      <line x1="20" y1="80" x2="680" y2="80" stroke="#F1F5F9" strokeWidth="1" strokeDasharray="4 4" />
                      <line x1="20" y1="135" x2="680" y2="135" stroke="#F1F5F9" strokeWidth="1" />

                      {/* Filled Area Gradient */}
                      <path
                        d={metrics.svgAreaPath}
                        fill="url(#purpleGradReal)"
                      />

                      {/* Real Data Smooth Line */}
                      <path
                        d={metrics.svgLinePath}
                        fill="none"
                        stroke="#4F46E5"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />

                      {/* Real Data Point Dots */}
                      {metrics.last7Days.map((d, idx) => (
                        <g key={d.dateStr + "_" + idx}>
                          <circle
                            cx={d.x}
                            cy={d.y}
                            r={idx === 6 ? "5.5" : "4.5"}
                            className={idx === 6 ? "fill-indigo-600 stroke-white stroke-2" : "fill-indigo-500 stroke-white stroke-2"}
                          />
                        </g>
                      ))}
                    </svg>
                  </div>

                  {/* 7-DAY INTERACTIVE METRICS BAR & LABELS */}
                  <div className="grid grid-cols-7 gap-1 mt-3 pt-3 border-t border-slate-100 w-full text-center">
                    {metrics.last7Days.map((d, idx) => (
                      <div
                        key={d.dateStr}
                        className={"p-1.5 rounded-xl transition-all " + (
                          idx === 6 ? "bg-indigo-50/70 border border-indigo-100" : "hover:bg-slate-50"
                        )}
                        title={d.fullDate + " : " + formatIDR(d.revenue) + " (" + d.orderCount + " struk)"}
                      >
                        <p className={"text-[11px] font-black leading-tight truncate " + (
                          d.revenue > 0 ? "text-indigo-700" : "text-slate-400"
                        )}>
                          {d.revenue > 0 ? (d.revenue >= 1000000 ? (d.revenue / 1000000).toFixed(1) + "jt" : (d.revenue / 1000).toFixed(0) + "k") : "Rp 0"}
                        </p>
                        <p className={"text-[10px] font-extrabold mt-0.5 " + (
                          idx === 6 ? "text-indigo-900" : "text-slate-600"
                        )}>
                          {d.dayName}
                        </p>
                        <p className="text-[9px] text-slate-400 font-medium">
                          {d.shortDate}
                        </p>
                      </div>
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
                          <span className="text-slate-400">&bull;</span>
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
                                  setSelectedStockProduct(product);
                                  setStockModalType("IN");
                                  setStockQtyInput("");
                                  setStockNotesInput("Restock dari Supplier");
                                  setIsStockModalOpen(true);
                                }}
                                className="p-1.5 rounded-lg text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 transition-colors flex items-center gap-1 font-bold text-[11px]"
                                title="Tambah / Atur Stok Produk Ini"
                              >
                                <Boxes className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">+Stok</span>
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
              <div>
                <h3 className="font-extrabold text-base text-slate-900 text-left">Buku Mutasi Stok (Audit Log)</h3>
                <p className="text-xs text-slate-500">Mencatat riwayat keluar-masuk dan restock barang</p>
              </div>
              <div className="flex items-center gap-2">
                {inventoryLogs.length > 0 && (
                  <button
                    onClick={() => {
                      setDeleteScope("all_logs");
                      setIsConfirmedCheckbox(false);
                      setIsDeleteMonthModalOpen(true);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs transition-all flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                    <span>Bersihkan Log</span>
                  </button>
                )}
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
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm shadow-indigo-200 transition-all flex items-center gap-1.5"
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
                          <td className="py-3.5 px-4 text-slate-600 text-left">{log.createdBy || "Admin"}</td>
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

        {/* ================= SCREEN 4: LAPORAN KEUANGAN & PERFORMA ================= */}
        {activeTab === "reports" && (
          <div className="space-y-6 w-full text-left">
            {/* 1. HEADER & GLOBAL PERIOD CONTROLS */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-4 text-left">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                  <h3 className="font-black text-lg text-slate-900 text-left">Laporan Keuangan & Penjualan</h3>
                  <p className="text-xs text-slate-500 text-left mt-0.5">
                    {selectedMonth !== "all" ? "Data periode " + selectedMonth : "Menampilkan ringkasan seluruh transaksi kasir"}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  {/* Quick Period Pills */}
                  <div className="flex items-center bg-slate-100 p-1 rounded-xl gap-1 text-xs font-bold">
                    <button
                      onClick={() => setReportDateFilter("all")}
                      className={"px-3 py-1.5 rounded-lg transition-all cursor-pointer " + (
                        reportDateFilter === "all" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-500 hover:text-slate-800"
                      )}
                    >
                      Semua
                    </button>
                    <button
                      onClick={() => setReportDateFilter("today")}
                      className={"px-3 py-1.5 rounded-lg transition-all cursor-pointer " + (
                        reportDateFilter === "today" ? "bg-white text-indigo-700 shadow-2xs" : "text-slate-500 hover:text-slate-800"
                      )}
                    >
                      Hari Ini
                    </button>
                    <button
                      onClick={() => setReportDateFilter("7days")}
                      className={"px-3 py-1.5 rounded-lg transition-all cursor-pointer " + (
                        reportDateFilter === "7days" ? "bg-white text-indigo-700 shadow-2xs" : "text-slate-500 hover:text-slate-800"
                      )}
                    >
                      7 Hari
                    </button>
                    <button
                      onClick={() => setReportDateFilter("30days")}
                      className={"px-3 py-1.5 rounded-lg transition-all cursor-pointer " + (
                        reportDateFilter === "30days" ? "bg-white text-indigo-700 shadow-2xs" : "text-slate-500 hover:text-slate-800"
                      )}
                    >
                      30 Hari
                    </button>
                  </div>

                  {/* Month Selector */}
                  <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
                    <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                    <select
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      className="bg-transparent text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
                    >
                      <option value="all">Semua Bulan</option>
                      {availableMonths.map((m) => (
                        <option key={m.key} value={m.key}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Export CSV Button */}
                  <button
                    onClick={handleExportCSV}
                    className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Unduh CSV</span>
                  </button>
                </div>
              </div>
            </div>

            {/* 2. TOP 4 FINANCIAL KPI CARDS (BENTO STYLE) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full text-left">
              {/* CARD 1: OMZET */}
              <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs text-left">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Omzet</span>
                  <span className="text-[11px] font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3 text-emerald-600" />
                    <span>Pendapatan</span>
                  </span>
                </div>
                <div className="text-2xl font-black text-slate-900 tracking-tight mt-3">
                  {formatIDR(metrics.totalRev)}
                </div>
                <p className="text-xs text-slate-400 mt-1 font-medium">Periode terpilih</p>
              </div>

              {/* CARD 2: TOTAL TRANSAKSI */}
              <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs text-left">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Struk Kasir</span>
                  <span className="text-[11px] font-extrabold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-indigo-600" />
                    <span>Selesai</span>
                  </span>
                </div>
                <div className="text-2xl font-black text-slate-900 tracking-tight mt-3">
                  {filteredTransactions.length} <span className="text-sm font-bold text-slate-500">Struk</span>
                </div>
                <p className="text-xs text-slate-400 mt-1 font-medium">
                  Rata-rata {formatIDR(filteredTransactions.length > 0 ? Math.round(metrics.totalRev / filteredTransactions.length) : 0)} / order
                </p>
              </div>

              {/* CARD 3: TOTAL PORSI TERJUAL */}
              <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs text-left">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Menu Terjual</span>
                  <span className="text-[11px] font-extrabold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-500" />
                    <span>Porsi</span>
                  </span>
                </div>
                <div className="text-2xl font-black text-slate-900 tracking-tight mt-3">
                  {menuSalesBreakdown.totalItemsSold} <span className="text-sm font-bold text-slate-500">Porsi</span>
                </div>
                <p className="text-xs text-slate-400 mt-1 font-medium">
                  Dari {menuSalesBreakdown.list.length} jenis variasi menu
                </p>
              </div>

              {/* CARD 4: METODE BAYAR */}
              <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs text-left">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Dominasi Pembayaran</span>
                  <span className="text-[11px] font-extrabold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                    {metrics.qrisPct >= metrics.cashPct ? "QRIS" : "Tunai"}
                  </span>
                </div>
                <div className="text-xl font-black text-slate-900 tracking-tight mt-3">
                  QRIS {metrics.qrisPct}% <span className="text-slate-300 font-normal">|</span> Tunai {metrics.cashPct}%
                </div>
                <p className="text-xs text-slate-400 mt-1 font-medium">
                  Transfer Bank {metrics.transferPct}%
                </p>
              </div>
            </div>

            {/* 3. SUB-TAB VIEW NAVIGATION (TERFOKUS & RAPI) */}
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto text-xs font-extrabold">
              <button
                onClick={() => setReportSubTab("menu")}
                className={"px-4 py-2 rounded-xl transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap " + (
                  reportSubTab === "menu"
                    ? "bg-indigo-600 text-white shadow-xs shadow-indigo-200"
                    : "text-slate-600 hover:bg-slate-100"
                )}
              >
                <UtensilsCrossed className="w-3.5 h-3.5" />
                <span>Rekap Penjualan Menu</span>
                <span className={"px-1.5 py-0.2 rounded-full text-[10px] " + (
                  reportSubTab === "menu" ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700"
                )}>
                  {menuSalesBreakdown.list.length}
                </span>
              </button>

              <button
                onClick={() => setReportSubTab("transactions")}
                className={"px-4 py-2 rounded-xl transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap " + (
                  reportSubTab === "transactions"
                    ? "bg-indigo-600 text-white shadow-xs shadow-indigo-200"
                    : "text-slate-600 hover:bg-slate-100"
                )}
              >
                <Store className="w-3.5 h-3.5" />
                <span>Riwayat Struk Kasir</span>
                <span className={"px-1.5 py-0.2 rounded-full text-[10px] " + (
                  reportSubTab === "transactions" ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700"
                )}>
                  {filteredTransactions.length}
                </span>
              </button>

              <button
                onClick={() => setReportSubTab("analytics")}
                className={"px-4 py-2 rounded-xl transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap " + (
                  reportSubTab === "analytics"
                    ? "bg-indigo-600 text-white shadow-xs shadow-indigo-200"
                    : "text-slate-600 hover:bg-slate-100"
                )}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>Metode Bayar & Kuota Storage</span>
              </button>
            </div>

            {/* ================= VIEW 1: REKAP PENJUALAN MENU ================= */}
            {reportSubTab === "menu" && (
              <div className="space-y-4 w-full text-left">
                {/* TOOLBAR FILTER & SORTIR MENU */}
                <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 text-xs">
                  {/* Search Menu Input */}
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={reportMenuSearch}
                      onChange={(e) => setReportMenuSearch(e.target.value)}
                      placeholder="Cari nama menu (contoh: Ayam Geprek, Es Teh)..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-4 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  {/* Kategori Filter Pills */}
                  <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0 font-bold">
                    {["Semua", "Makanan", "Minuman", "Snack"].map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setReportCategoryFilter(cat)}
                        className={"px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap " + (
                          reportCategoryFilter === cat
                            ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                            : "bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200/60"
                        )}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  {/* Dropdown Sortir Menu */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-bold text-slate-500">Urutkan:</span>
                    <select
                      value={reportMenuSortBy}
                      onChange={(e) => setReportMenuSortBy(e.target.value as any)}
                      className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 font-extrabold text-indigo-700 focus:outline-none cursor-pointer"
                    >
                      <option value="qty_desc">Porsi Terbanyak (Paling Laris)</option>
                      <option value="rev_desc">Omzet Tertinggi (Pendapatan)</option>
                      <option value="qty_asc">Porsi Terendah (Kurang Laku)</option>
                      <option value="name_asc">Nama Menu (A - Z)</option>
                    </select>
                  </div>
                </div>

                {/* TABEL RANKING & KONTRIBUSI MENU */}
                <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden w-full text-left">
                  <div className="overflow-x-auto w-full text-left">
                    <table className="w-full text-left text-sm text-slate-600 border-collapse">
                      <thead className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-extrabold uppercase text-slate-500 tracking-wider text-left">
                        <tr>
                          <th className="py-3 px-4 text-left w-16">Peringkat</th>
                          <th className="py-3 px-4 text-left">Nama Menu</th>
                          <th className="py-3 px-4 text-left">Kategori</th>
                          <th className="py-3 px-4 text-left">Harga Satuan</th>
                          <th className="py-3 px-4 text-left">Porsi Terjual</th>
                          <th className="py-3 px-4 text-left">Total Pendapatan</th>
                          <th className="py-3 px-4 text-left">Kontribusi Omzet</th>
                          <th className="py-3 px-4 text-center">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium text-xs text-left">
                        {menuSalesBreakdown.list.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="text-center py-10 px-4 text-slate-400">
                              Tidak ada menu yang sesuai dengan filter pencarian.
                            </td>
                          </tr>
                        ) : (
                          menuSalesBreakdown.list.map((m, idx) => {
                            const contributionPct = menuSalesBreakdown.totalRevenueSum > 0
                              ? Math.round((m.revenue / menuSalesBreakdown.totalRevenueSum) * 100)
                              : 0;

                            return (
                              <tr key={m.name + "_" + idx} className="hover:bg-slate-50/80 transition-colors text-left">
                                <td className="py-3.5 px-4 text-left">
                                  {idx === 0 ? (
                                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 text-amber-800 font-black text-xs border border-amber-300">
                                      1
                                    </span>
                                  ) : idx === 1 ? (
                                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-200 text-slate-700 font-black text-xs border border-slate-300">
                                      2
                                    </span>
                                  ) : idx === 2 ? (
                                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-50 text-amber-700 font-black text-xs border border-amber-200">
                                      3
                                    </span>
                                  ) : (
                                    <span className="font-bold text-slate-400 pl-2">#{idx + 1}</span>
                                  )}
                                </td>
                                <td className="py-3.5 px-4 font-extrabold text-slate-900 text-left">
                                  {m.name}
                                </td>
                                <td className="py-3.5 px-4 text-left">
                                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                                    {m.category}
                                  </span>
                                </td>
                                <td className="py-3.5 px-4 font-semibold text-slate-700 text-left">
                                  {formatIDR(m.price)}
                                </td>
                                <td className="py-3.5 px-4 text-left">
                                  <span className="font-black text-xs px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-100">
                                    {m.qty} Porsi
                                  </span>
                                </td>
                                <td className="py-3.5 px-4 font-black text-slate-900 text-left">
                                  {formatIDR(m.revenue)}
                                </td>
                                <td className="py-3.5 px-4 text-left">
                                  <div className="w-32 space-y-1">
                                    <div className="flex justify-between text-[10px] font-bold">
                                      <span className="text-slate-500">{contributionPct}%</span>
                                    </div>
                                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                                      <div
                                        className="h-full bg-indigo-600 rounded-full"
                                        style={{ width: contributionPct + "%", minWidth: m.qty > 0 ? "4px" : "0px" }}
                                      />
                                    </div>
                                  </div>
                                </td>
                                <td className="py-3.5 px-4 text-center">
                                  <button
                                    onClick={() => {
                                      setReportProductFilter(m.name);
                                      setReportSubTab("transactions");
                                    }}
                                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 transition-all cursor-pointer"
                                    title="Lihat Semua Struk Transaksi Menu Ini"
                                  >
                                    Lihat Struk &rarr;
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ================= VIEW 2: RIWAYAT STRUK KASIR ================= */}
            {reportSubTab === "transactions" && (
              <div className="space-y-4 w-full text-left">
                {/* TRANSACTION CONTROLS */}
                <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 text-xs">
                  {/* Specific Menu Filter Status */}
                  <div className="flex items-center gap-2">
                    {reportProductFilter !== "all" ? (
                      <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 px-3 py-1 rounded-xl">
                        <span className="font-bold text-indigo-700">Filter Menu: <strong>{reportProductFilter}</strong></span>
                        <button
                          onClick={() => setReportProductFilter("all")}
                          className="text-rose-600 hover:text-rose-800 font-bold ml-1 cursor-pointer"
                        >
                          ✕ Reset
                        </button>
                      </div>
                    ) : (
                      <span className="font-bold text-slate-600">Menampilkan Seluruh Menu</span>
                    )}
                  </div>

                  {/* Payment Filter Pills */}
                  <div className="flex items-center gap-1 font-bold">
                    <span className="text-slate-500 mr-1">Metode:</span>
                    {["all", "CASH", "QRIS", "TRANSFER"].map((method) => (
                      <button
                        key={method}
                        onClick={() => setReportPaymentFilter(method)}
                        className={"px-3 py-1.5 rounded-lg transition-all cursor-pointer " + (
                          reportPaymentFilter === method
                            ? "bg-indigo-600 text-white shadow-2xs"
                            : "bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200/60"
                        )}
                      >
                        {method === "all" ? "Semua" : method === "CASH" ? "Tunai" : method}
                      </button>
                    ))}
                  </div>
                </div>

                {/* TABLE OF TRANSACTIONS */}
                <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden w-full text-left">
                  <div className="overflow-x-auto w-full text-left">
                    <table className="w-full text-left text-sm text-slate-600 border-collapse">
                      <thead className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-extrabold uppercase text-slate-500 tracking-wider text-left">
                        <tr>
                          <th className="py-3 px-4 text-left">Tanggal & Jam</th>
                          <th className="py-3 px-4 text-left">No. Invoice</th>
                          <th className="py-3 px-4 text-left">Item Pesanan</th>
                          <th className="py-3 px-4 text-left">Metode Bayar</th>
                          <th className="py-3 px-4 text-left">Total Bayar</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium text-xs text-left">
                        {filteredTransactions.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="text-center py-10 px-4 text-slate-400">
                              Tidak ada transaksi yang cocok dengan filter yang dipilih.
                            </td>
                          </tr>
                        ) : (
                          filteredTransactions.map((tx) => (
                            <tr
                              key={tx.id}
                              onClick={() => setSelectedTxDetail(tx)}
                              className="hover:bg-slate-50/80 cursor-pointer transition-colors text-left"
                            >
                              <td className="py-3.5 px-4 text-slate-500 text-left">{formatDate(tx.createdAt)}</td>
                              <td className="py-3.5 px-4 font-mono font-bold text-slate-800 text-left">
                                #{tx.invoiceNumber || tx.id}
                              </td>
                              <td className="py-3.5 px-4 text-slate-800 text-left font-semibold">
                                {(tx.items || []).map((i) => i.name + " (" + i.qty + "x)").join(", ")}
                              </td>
                              <td className="py-3.5 px-4 text-left">
                                <span
                                  className={"text-[11px] font-extrabold px-2 py-0.5 rounded-full " + (
                                    tx.paymentMethod === "QRIS"
                                      ? "bg-indigo-50 text-indigo-700 border border-indigo-100"
                                      : tx.paymentMethod === "TRANSFER"
                                      ? "bg-purple-50 text-purple-700 border border-purple-100"
                                      : "bg-emerald-50 text-emerald-700 border border-emerald-100"
                                  )}
                                >
                                  {tx.paymentMethod}
                                </span>
                              </td>
                              <td className="py-3.5 px-4 font-black text-slate-900 text-left">
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
            )}

            {/* ================= VIEW 3: METODE BAYAR & DATABASE STORAGE ================= */}
            {reportSubTab === "analytics" && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full text-left">
                {/* DONUT CHART METODE BAYAR */}
                <div className="lg:col-span-5 bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs flex flex-col justify-between text-left">
                  <div>
                    <h3 className="font-black text-base text-slate-900 text-left">Proporsi Metode Pembayaran</h3>
                    <p className="text-xs text-slate-400 text-left mt-0.5">Persentase omzet dari seluruh metode bayar</p>

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

                {/* DATABASE STORAGE USAGE */}
                <div className="lg:col-span-7 bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs flex flex-col justify-between text-left">
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100 shrink-0">
                        <Database className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-black text-base text-slate-900">Kapasitas Penyimpanan Cloud Database</h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Firebase Realtime Database untuk sinkronisasi POS tablet dan admin web
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <div className="bg-slate-50 border border-slate-200/70 p-3.5 rounded-xl">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Kapasitas Terpakai</p>
                        <p className="text-base font-black text-slate-900 mt-1">
                          {metrics.totalKB} KB <span className="text-xs text-slate-500 font-semibold">({metrics.totalMB} MB)</span>
                        </p>
                      </div>
                      <div className="bg-slate-50 border border-slate-200/70 p-3.5 rounded-xl">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Batas Kuota Gratis</p>
                        <p className="text-base font-black text-slate-900 mt-1">
                          1.000 MB <span className="text-xs text-slate-500 font-semibold">(1 GB)</span>
                        </p>
                      </div>
                    </div>

                    <div className="pt-2">
                      <div className="flex justify-between items-center text-xs font-semibold mb-2">
                        <span className="text-slate-600">Penggunaan: <strong className="text-slate-900">{metrics.storageUsagePercent}%</strong></span>
                        <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                          Sangat Luang (99.9% Bebas)
                        </span>
                      </div>
                      <div className="w-full h-2.5 bg-slate-100 border border-slate-200/60 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-indigo-600 rounded-full transition-all duration-500"
                          style={{ width: metrics.storageUsagePercent + "%", minWidth: "12px" }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-slate-100 flex items-center justify-between">
                    <p className="text-xs text-slate-500">Pembersihan data riwayat lama secara berkala:</p>
                    <button
                      onClick={() => {
                        setDeleteScope("month");
                        setMonthToDelete(availableMonths[0]?.key || "");
                        setIsConfirmedCheckbox(false);
                        setIsDeleteMonthModalOpen(true);
                      }}
                      className="px-4 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                      <span>Hapus Data Per Bulan</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      
      {/* ================= MODAL: TAMBAH / EDIT MENU BARU ================= */}
      {(isAddProductOpen || isEditProductOpen) && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 text-left animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-2xl border border-slate-200 space-y-4 text-left max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 text-left">
              <div className="flex items-center gap-2.5 text-left">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100 shrink-0">
                  <UtensilsCrossed className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-slate-900 text-left">
                    {editingProduct ? "Edit Menu & Harga" : "Tambah Menu Baru"}
                  </h3>
                  <p className="text-xs text-slate-400 text-left">
                    Tersinkronisasi otomatis ke aplikasi kasir tablet
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsAddProductOpen(false);
                  setIsEditProductOpen(false);
                  setEditingProduct(null);
                }}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="space-y-4 text-xs font-medium text-left">
              {/* 1. NAMA MENU */}
              <div className="space-y-1 text-left">
                <label className="block font-bold text-slate-700 text-xs">Nama Menu Makanan / Minuman *</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Paket Ayam Geprek Sambal Matah"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 font-bold text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* 2. KATEGORI & SKU */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
                <div className="space-y-1 text-left">
                  <label className="block font-bold text-slate-700 text-xs">Kategori Menu *</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value, sku: generateSKU(e.target.value) })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900 font-bold text-xs focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="Makanan">Makanan</option>
                    <option value="Minuman">Minuman</option>
                    <option value="Snack">Snack / Camilan</option>
                    <option value="Paket Hemat">Paket Hemat</option>
                    <option value="Lainnya">Lainnya</option>
                  </select>
                </div>
                <div className="space-y-1 text-left">
                  <label className="block font-bold text-slate-700 text-xs">Kode SKU (Auto)</label>
                  <input
                    type="text"
                    value={formData.sku}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-mono text-slate-700 font-bold text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* 3. HARGA & STOK AWAL */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
                <div className="space-y-1 text-left">
                  <label className="block font-bold text-slate-700 text-xs">Harga Jual (Rp) *</label>
                  <input
                    type="number"
                    min="0"
                    step="500"
                    required
                    placeholder="Contoh: 15000"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 font-extrabold text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="space-y-1 text-left">
                  <label className="block font-bold text-slate-700 text-xs">
                    {editingProduct ? "Stok Saat Ini (Unit) *" : "Stok Awal (Unit) *"}
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    placeholder="Contoh: 50"
                    value={formData.stockQuantity}
                    onChange={(e) => setFormData({ ...formData, stockQuantity: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 font-bold text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* 4. FOTO / GAMBAR MENU */}
              <div className="space-y-1.5 text-left">
                <label className="block font-bold text-slate-700 text-xs">URL Foto Menu (Opsional)</label>
                <div className="flex gap-2 text-left">
                  <input
                    type="url"
                    placeholder="https://images.unsplash.com/..."
                    value={formData.imageUrl}
                    onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 text-xs focus:outline-none focus:border-indigo-500 font-mono"
                  />
                  {formData.imageUrl && (
                    <div className="w-9 h-9 rounded-lg border border-slate-200 overflow-hidden shrink-0">
                      <img src={formData.imageUrl} alt="Preview" className="w-full h-full object-cover" />
                    </div>
                  )}
                </div>
                {/* Presets cepat */}
                <div className="flex flex-wrap gap-1 pt-1">
                  <span className="text-[10px] text-slate-400 font-bold mr-1 self-center">Pilihan Cepat:</span>
                  {[
                    { label: "Ayam Geprek", url: "https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?w=400" },
                    { label: "Es Teh", url: "https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=400" },
                    { label: "Kopi", url: "https://images.unsplash.com/photo-1541167760496-1628856ab772?w=400" },
                    { label: "Jus Buah", url: "https://images.unsplash.com/photo-1613478223719-2ab802602423?w=400" },
                  ].map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => setFormData({ ...formData, imageUrl: p.url })}
                      className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-600 text-[10px] font-bold transition-colors cursor-pointer"
                    >
                      + {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 5. STATUS MENU AKTIF */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <div>
                  <p className="font-bold text-slate-800 text-xs">Status Menu Kasir</p>
                  <p className="text-[11px] text-slate-400">Menu akan langsung muncul di kasir saat aktif</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>

              {/* ACTION BUTTONS */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddProductOpen(false);
                    setIsEditProductOpen(false);
                    setEditingProduct(null);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm shadow-indigo-200 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{editingProduct ? "Simpan Perubahan" : "Tambahkan Menu"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: HAPUS RIWAYAT DATABASE / BULANAN ================= */}
      {isDeleteMonthModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 text-left animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl border border-slate-200 space-y-4 text-left">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 text-left">
              <div className="flex items-center gap-2.5 text-left">
                <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100 shrink-0">
                  <Trash2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-slate-900 text-left">Pembersihan Riwayat Data</h3>
                  <p className="text-xs text-slate-400 text-left">Hapus transaksi lama untuk merapikan penyimpanan</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDeleteMonthModalOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs text-left">
              <div className="space-y-1">
                <label className="block font-bold text-slate-700 text-xs">Pilih Cakupan Data Yang Akan Dihapus:</label>
                <select
                  value={deleteScope}
                  onChange={(e) => setDeleteScope(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
                >
                  <option value="month">Hapus Riwayat Bulan Tertentu</option>
                  <option value="all_logs">Hapus Seluruh Buku Mutasi Stok</option>
                  <option value="all_transactions">Hapus Seluruh Riwayat Transaksi</option>
                  <option value="reset_all">Reset Total (Transaksi & Mutasi Stok)</option>
                </select>
              </div>

              {deleteScope === "month" && (
                <div className="space-y-1">
                  <label className="block font-bold text-slate-700 text-xs">Pilih Bulan Yang Dihapus:</label>
                  <select
                    value={monthToDelete}
                    onChange={(e) => setMonthToDelete(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
                  >
                    {availableMonths.map((m) => (
                      <option key={m.key} value={m.key}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-rose-800 space-y-1">
                <p className="font-extrabold flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                  <span>Peringatan Penghapusan Data</span>
                </p>
                <p className="text-[11px] leading-relaxed">
                  Data yang dihapus tidak dapat dipulihkan kembali. Pastikan Anda telah mengunduh laporan CSV sebelum menghapus.
                </p>
              </div>

              <label className="flex items-center gap-2 pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isConfirmedCheckbox}
                  onChange={(e) => setIsConfirmedCheckbox(e.target.checked)}
                  className="rounded border-slate-300 text-rose-600 focus:ring-rose-500 w-4 h-4"
                />
                <span className="text-xs font-bold text-slate-700">Saya yakin ingin menghapus data ini</span>
              </label>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2 text-xs font-bold">
              <button
                type="button"
                onClick={() => setIsDeleteMonthModalOpen(false)}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={!isConfirmedCheckbox || isDeleting}
                onClick={handleDeleteMonthTransactions}
                className={"px-4 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 " + (
                  isConfirmedCheckbox && !isDeleting
                    ? "bg-rose-600 hover:bg-rose-700 text-white shadow-xs shadow-rose-200 cursor-pointer"
                    : "bg-slate-100 text-slate-400 cursor-not-allowed"
                )}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeleting ? "Sedang Menghapus..." : "Hapus Permanen"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: ATUR STOK DENGAN PILIHAN BARANG ================= */}
      {isStockModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 text-left">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-2xl border border-slate-200 space-y-4 text-left animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 text-left">
              <div className="text-left">
                <h3 className="font-extrabold text-base text-slate-900 text-left">Atur / Tambah Stok Produk</h3>
                <p className="text-xs text-slate-400 text-left">Pilih produk dan masukkan jumlah unit mutasi stok</p>
              </div>
              <button
                onClick={() => setIsStockModalOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-xs"
              >
                ?
              </button>
            </div>

            <form onSubmit={handleStockSubmit} className="space-y-4 text-xs font-medium text-left">
              {/* 1. DROPDOWN PILIH BARANG */}
              <div className="text-left space-y-1">
                <label className="block font-bold text-slate-700 text-xs">Pilih Produk / Barang Yang Mau Ditambah *</label>
                <select
                  value={selectedStockProduct?.id || (products[0]?.id ?? "")}
                  onChange={(e) => {
                    const found = products.find((p) => p.id === e.target.value);
                    if (found) setSelectedStockProduct(found);
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 font-bold text-xs focus:outline-none focus:border-indigo-500 text-left cursor-pointer"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      [{p.category}] {p.name} - (Stok Saat Ini: {p.stockQuantity ?? 50} unit)
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. KARTU DETAIL PRODUK TERPILIH */}
              {selectedStockProduct && (
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs text-left">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 font-bold overflow-hidden shrink-0">
                      {selectedStockProduct.imageUrl ? (
                        <img src={selectedStockProduct.imageUrl} alt={selectedStockProduct.name} className="w-full h-full object-cover" />
                      ) : (
                        <Package className="w-5 h-5" />
                      )}
                    </div>
                    <div>
                      <p className="font-extrabold text-slate-900 text-xs">{selectedStockProduct.name}</p>
                      <p className="text-slate-500 text-[11px]">Kategori: <span className="font-semibold text-slate-700">{selectedStockProduct.category}</span></p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-mono px-2 py-0.5 bg-slate-200/80 rounded text-slate-700 font-bold">
                      {selectedStockProduct.sku || "SKU-AUTO"}
                    </span>
                    <p className="text-[11px] font-bold text-indigo-600 mt-0.5">
                      Stok: {selectedStockProduct.stockQuantity ?? 50} unit
                    </p>
                  </div>
                </div>
              )}

              {/* 3. JENIS MUTASI */}
              <div className="text-left">
                <label className="block font-bold text-slate-700 mb-1 text-left">Jenis Mutasi</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setStockModalType("IN")}
                    className={"py-2.5 px-3 rounded-xl font-bold text-xs border transition-all flex items-center justify-center text-center gap-1.5 shadow-sm " + (
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
                    className={"py-2.5 px-3 rounded-xl font-bold text-xs border transition-all flex items-center justify-center text-center gap-1.5 shadow-sm " + (
                      stockModalType === "OUT"
                        ? "bg-rose-50 text-rose-700 border-rose-400 ring-2 ring-rose-400/20"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                    )}
                  >
                    <span className="font-extrabold text-rose-600 text-sm leading-none">-</span>
                    <span>Stok Keluar (Rusak/Basi)</span>
                  </button>
                </div>
              </div>

              {/* 4. JUMLAH UNIT & SIMULASI HASIL */}
              <div className="text-left space-y-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1 text-left">Jumlah Unit {stockModalType === "IN" ? "Ditambah" : "Dikurang"} *</label>
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

                {selectedStockProduct && (
                  <div className="p-3 bg-indigo-50/70 rounded-xl border border-indigo-100 flex items-center justify-between text-xs">
                    <div className="text-left">
                      <p className="text-slate-500 text-[11px]">Sisa Saat Ini:</p>
                      <p className="font-bold text-slate-800">{selectedStockProduct.stockQuantity ?? 50} unit</p>
                    </div>
                    <div className="text-center font-bold text-slate-400">?</div>
                    <div className="text-right">
                      <p className="text-slate-500 text-[11px]">Estimasi Stok Akhir:</p>
                      <p className={"font-extrabold text-sm " + (stockModalType === "IN" ? "text-emerald-700" : "text-rose-700")}>
                        {stockModalType === "IN"
                          ? (selectedStockProduct.stockQuantity ?? 50) + (parseInt(stockQtyInput) || 0)
                          : Math.max(0, (selectedStockProduct.stockQuantity ?? 50) - (parseInt(stockQtyInput) || 0))} unit
                      </p>
                    </div>
                  </div>
                )}
              </div>



              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2 text-left">
                <button
                  type="button"
                  onClick={() => setIsStockModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold text-slate-600 text-xs"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 font-bold text-white shadow-sm shadow-indigo-200 text-xs flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Simpan Mutasi Stok</span>
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

      {/* ================= MODAL: KONFIRMASI LOGOUT ================= */}
      {isLogoutModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 text-left animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl border border-slate-200 space-y-4 text-left">
            <div className="flex items-center gap-3 text-left">
              <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 border border-rose-100">
                <LogOut className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-slate-900">Keluar dari Portal?</h3>
                <p className="text-xs text-slate-500">Anda harus memasukkan kata sandi kembali untuk masuk.</p>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2 text-xs font-bold">
              <button
                type="button"
                onClick={() => setIsLogoutModalOpen(false)}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  logoutAdmin();
                  setCurrentUser(null);
                  setIsLogoutModalOpen(false);
                  showToast("Berhasil Keluar", "Sesi login telah diakhiri dengan aman.");
                }}
                className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white shadow-sm shadow-rose-200 transition-all flex items-center gap-1.5"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Ya, Keluar</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
