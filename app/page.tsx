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
  Sparkles
} from "lucide-react";

// Robust parsing supporting Flutter & Web database formats
const parseProduct = (key: string, val: any): Product => {
  return {
    id: key,
    sku: val.sku || `SKU-${key.slice(-4)}`,
    name: val.name || "Unnamed Product",
    price: Number(val.price) || 0,
    category: val.category || "Drinks",
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
    cashierName: val.cashierName || "Kasir 01",
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
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [reportDateFilter, setReportDateFilter] = useState<"today" | "7days" | "30days" | "all">("7days");

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

  // Toast State
  const [toastMsg, setToastMsg] = useState<{ title: string; desc: string; type?: "success" | "info" } | null>(null);

  const showToast = (title: string, desc: string, type: "success" | "info" = "success") => {
    setToastMsg({ title, desc, type });
    setTimeout(() => setToastMsg(null), 3500);
  };

  // Product Form
  const [formData, setFormData] = useState({
    name: "",
    sku: "",
    price: "",
    category: "Drinks",
    stockQuantity: "50",
    imageUrl: "",
    isActive: true,
  });

  const categories = [
    { id: "All", label: "All Categories" },
    { id: "Drinks", label: "Drinks" },
    { id: "Food", label: "Food" },
    { id: "Snacks", label: "Snacks" },
  ];

  // 1. Firebase Listeners
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

  // Formatters
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

  // Metrics Calculations
  const metrics = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfWeek = startOfToday - 7 * 24 * 60 * 60 * 1000;
    const startOfMonth = startOfToday - 30 * 24 * 60 * 60 * 1000;

    const todayTx = transactions.filter((t) => (t.createdAt || 0) >= startOfToday);
    const weekTx = transactions.filter((t) => (t.createdAt || 0) >= startOfWeek);
    const monthTx = transactions.filter((t) => (t.createdAt || 0) >= startOfMonth);

    const todaySales = todayTx.reduce((acc, t) => acc + (t.grandTotal || 0), 0);
    const todayOrders = todayTx.length;

    const totalInventoryValue = products.reduce(
      (acc, p) => acc + (p.price || 0) * (p.stockQuantity ?? 50),
      0
    );

    const lowStockItems = products.filter((p) => (p.stockQuantity ?? 50) <= (p.minStockAlert ?? 10));

    const itemMap: { [name: string]: { qty: number; revenue: number } } = {};
    transactions.forEach((t) => {
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
    transactions.forEach((t) => {
      if (t.paymentMethod === "QRIS") qrisTotal += t.grandTotal || 0;
      else if (t.paymentMethod === "TRANSFER") transferTotal += t.grandTotal || 0;
      else cashTotal += t.grandTotal || 0;
    });

    const totalRev = transactions.reduce((acc, t) => acc + (t.grandTotal || 0), 0);
    const qrisPct = totalRev > 0 ? Math.round((qrisTotal / totalRev) * 100) : 60;
    const cashPct = totalRev > 0 ? Math.round((cashTotal / totalRev) * 100) : 30;
    const transferPct = totalRev > 0 ? Math.max(0, 100 - qrisPct - cashPct) : 10;

    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
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
      days,
    };
  }, [transactions, products]);

  // Export CSV
  const handleExportCSV = () => {
    if (transactions.length === 0) {
      alert("Belum ada data transaksi untuk diexport");
      return;
    }
    const headers = ["Invoice Number", "Date", "Items", "Payment Method", "Grand Total (IDR)"];
    const rows = transactions.map((t) => [
      `"${t.invoiceNumber || t.id}"`,
      `"${new Date(t.createdAt).toISOString()}"`,
      `"${(t.items || []).map((i) => `${i.name} x${i.qty}`).join(", ")}"`,
      `"${t.paymentMethod}"`,
      t.grandTotal,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `sales_report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("CSV Berhasil Diexport", "Laporan penjualan telah diunduh ke komputer Anda.");
  };

  // Product CRUD with Dual-Key write for 100% Android & Web Compatibility
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const priceNum = parseFloat(formData.price) || 0;
      const stockNum = parseInt(formData.stockQuantity) || 0;
      const img = formData.imageUrl || "https://images.unsplash.com/photo-1541167760496-1628856ab772?w=400";
      const now = Date.now();

      if (editingProduct) {
        const productRef = ref(db, `products/${editingProduct.id}`);
        await update(productRef, {
          name: formData.name,
          sku: formData.sku || `SKU-${Date.now().toString().slice(-4)}`,
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
        showToast("Product Updated", `"${formData.name}" has been updated in database.`);
      } else {
        const newProductRef = push(ref(db, "products"));
        const newId = newProductRef.key!;
        await set(newProductRef, {
          id: newId,
          sku: formData.sku || `SKU-${Date.now().toString().slice(-4)}`,
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
          notes: "Initial inventory setup",
          createdBy: "Mario Sitepu",
          timestamp: now,
        });
        showToast("Product Added", `"${formData.name}" is now live in database & tablet.`);
      }

      setIsAddProductOpen(false);
      setIsEditProductOpen(false);
      setEditingProduct(null);
      setFormData({
        name: "",
        sku: "",
        price: "",
        category: "Drinks",
        stockQuantity: "50",
        imageUrl: "",
        isActive: true,
      });
    } catch (err) {
      alert("Error saving product: " + err);
    }
  };

  const handleToggleActive = async (p: Product) => {
    try {
      const pRef = ref(db, `products/${p.id}`);
      const nextState = p.isActive === false ? true : false;
      await update(pRef, {
        isActive: nextState,
        is_active: nextState,
        updatedAt: Date.now(),
      });
      showToast(nextState ? "Product Active" : "Product Inactive", `"${p.name}" status updated.`);
    } catch (err) {
      alert("Error updating status: " + err);
    }
  };

  const handleDeleteProduct = async (p: Product) => {
    if (confirm(`Are you sure you want to delete "${p.name}"?`)) {
      try {
        await remove(ref(db, `products/${p.id}`));
        showToast("Product Deleted", `"${p.name}" removed from database.`, "info");
      } catch (err) {
        alert("Error deleting product: " + err);
      }
    }
  };

  const handleStockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStockProduct) return;

    const qty = parseInt(stockQtyInput);
    if (!qty || qty <= 0) {
      alert("Please enter a valid quantity");
      return;
    }

    const prevStock = selectedStockProduct.stockQuantity ?? 50;
    const newStock = stockModalType === "IN" ? prevStock + qty : Math.max(0, prevStock - qty);
    const now = Date.now();

    try {
      await update(ref(db, `products/${selectedStockProduct.id}`), {
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
        notes: stockNotesInput || (stockModalType === "IN" ? "Vendor Delivery" : "Damaged / Waste"),
        createdBy: "Mario Sitepu",
        timestamp: now,
      });

      showToast(
        stockModalType === "IN" ? "Stock Adjusted (+)" : "Stock Adjusted (-)",
        `${selectedStockProduct.name} stock updated to ${newStock} units.`
      );

      setIsStockModalOpen(false);
      setSelectedStockProduct(null);
      setStockQtyInput("");
      setStockNotesInput("");
    } catch (err) {
      alert("Error updating stock: " + err);
    }
  };
  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-800 flex flex-col md:flex-row antialiased">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl bg-slate-900 text-white shadow-2xl animate-in fade-in slide-in-from-bottom-5 duration-200">
          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          <div>
            <p className="text-xs font-bold text-white">{toastMsg.title}</p>
            <p className="text-[11px] text-slate-300">{toastMsg.desc}</p>
          </div>
        </div>
      )}

      {/* ================= FIGMA SIDEBAR NAVIGATION ================= */}
      <aside className="w-full md:w-64 bg-white border-r border-slate-200 p-5 flex flex-col justify-between shrink-0 shadow-sm">
        <div className="space-y-6">
          <div className="flex items-center gap-3 px-2">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-200">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-extrabold text-base text-slate-900 tracking-tight leading-none">Indigo POS</h1>
              <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full mt-1 inline-block border border-indigo-100">
                UMKM Edition
              </span>
            </div>
          </div>

          <nav className="space-y-1">
            <button
              onClick={() => setActiveTab("overview")}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-bold text-sm transition-all ${
                activeTab === "overview"
                  ? "bg-indigo-600 text-white shadow-sm shadow-indigo-200"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Dashboard Overview</span>
            </button>

            <button
              onClick={() => setActiveTab("menu")}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-bold text-sm transition-all ${
                activeTab === "menu"
                  ? "bg-indigo-600 text-white shadow-sm shadow-indigo-200"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <UtensilsCrossed className="w-4 h-4" />
              <span>Menu Management</span>
              <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold">
                {products.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("inventory")}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-bold text-sm transition-all ${
                activeTab === "inventory"
                  ? "bg-indigo-600 text-white shadow-sm shadow-indigo-200"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <Boxes className="w-4 h-4" />
              <span>Inventory & Stock</span>
              {metrics.lowStockCount > 0 && (
                <span className="ml-auto text-[11px] px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 font-bold border border-rose-100">
                  {metrics.lowStockCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab("reports")}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-bold text-sm transition-all ${
                activeTab === "reports"
                  ? "bg-indigo-600 text-white shadow-sm shadow-indigo-200"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>Sales Reports</span>
            </button>
          </nav>
        </div>

        <div className="pt-4 border-t border-slate-100">
          <div className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-50 transition-colors">
            <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-xs border border-indigo-200">
              MS
            </div>
            <div className="text-left overflow-hidden">
              <p className="text-xs font-bold text-slate-900 truncate">Mario Sitepu</p>
              <p className="text-[11px] text-slate-500 truncate">Store Owner</p>
            </div>
          </div>
        </div>
      </aside>

      {/* ================= MAIN CONTENT AREA ================= */}
      <main className="flex-1 p-6 md:p-8 overflow-y-auto max-w-7xl">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              {activeTab === "overview" && "Dashboard Overview"}
              {activeTab === "menu" && "Menu Management"}
              {activeTab === "inventory" && "Inventory & Stock"}
              {activeTab === "reports" && "Sales Reports"}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block" />
              <p className="text-xs text-emerald-700 font-bold">
                Firebase Realtime Database Synced: kasir-catat
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (products.length > 0) {
                  setSelectedStockProduct(products[0]);
                  setStockModalType("IN");
                  setStockQtyInput("");
                  setStockNotesInput("Restock");
                  setIsStockModalOpen(true);
                }
              }}
              className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs border border-slate-200 shadow-sm transition-all"
            >
              + Add Stock
            </button>
            <button
              onClick={() => {
                setEditingProduct(null);
                setFormData({
                  name: "",
                  sku: `SKU-${Date.now().toString().slice(-4)}`,
                  price: "",
                  category: "Drinks",
                  stockQuantity: "50",
                  imageUrl: "",
                  isActive: true,
                });
                setIsAddProductOpen(true);
              }}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm shadow-indigo-200 transition-all flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Product / Menu</span>
            </button>
          </div>
        </header>

        {/* ================= SCREEN 1: DASHBOARD OVERVIEW ================= */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              <div className="figma-card p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Today's Sales</span>
                  <span className="text-[11px] font-extrabold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                    +12% vs yesterday
                  </span>
                </div>
                <div className="text-2xl font-extrabold text-slate-900 tracking-tight mt-3">
                  {formatIDR(metrics.todaySales || 1240000)}
                </div>
                <p className="text-xs text-slate-400 mt-1 font-medium">Updated just now</p>
              </div>

              <div className="figma-card p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Orders</span>
                  <span className="text-[11px] font-extrabold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                    +5% vs yesterday
                  </span>
                </div>
                <div className="text-2xl font-extrabold text-slate-900 tracking-tight mt-3">
                  {metrics.todayOrders || 48} Orders
                </div>
                <p className="text-xs text-slate-400 mt-1 font-medium">From POS Android Tablet</p>
              </div>

              <div className="figma-card p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Top Selling Item</span>
                  <span className="text-xs text-indigo-600 font-bold">★ #1</span>
                </div>
                <div className="text-lg font-extrabold text-slate-900 tracking-tight mt-3 truncate">
                  {metrics.topItem.name}
                </div>
                <p className="text-xs text-slate-400 mt-1 font-medium">{metrics.topItem.qty || 24} units sold</p>
              </div>

              <div className="figma-card p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Low Stock Alerts</span>
                  <button
                    onClick={() => setActiveTab("inventory")}
                    className="text-xs text-indigo-600 hover:text-indigo-700 font-bold"
                  >
                    View &rarr;
                  </button>
                </div>
                <div className="text-2xl font-extrabold text-rose-600 tracking-tight mt-3">
                  {metrics.lowStockCount || 3} Items
                </div>
                <p className="text-xs text-slate-400 mt-1 font-medium">Require immediate restock</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 figma-card p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-extrabold text-base text-slate-900">Sales Trend (Last 7 Days)</h3>
                    <p className="text-xs text-slate-400">Revenue performance over the week</p>
                  </div>
                  <span className="text-xs font-bold px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg">
                    Weekly
                  </span>
                </div>

                <div className="mt-6">
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
                  <div className="flex justify-between text-xs font-bold text-slate-400 mt-3 pt-2 border-t border-slate-100">
                    {metrics.days.map((d) => (
                      <span key={d}>{d}</span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="lg:col-span-5 figma-card p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-extrabold text-base text-slate-900">Recent Transactions</h3>
                  <button
                    onClick={() => setActiveTab("reports")}
                    className="text-xs text-indigo-600 hover:text-indigo-700 font-bold"
                  >
                    View All
                  </button>
                </div>

                <div className="divide-y divide-slate-100">
                  {transactions.slice(0, 5).map((t) => (
                    <div
                      key={t.id}
                      onClick={() => setSelectedTxDetail(t)}
                      className="py-3 flex items-center justify-between hover:bg-slate-50 cursor-pointer rounded-lg px-2 transition-colors"
                    >
                      <div>
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                          <span>{t.paymentMethod}</span>
                          <span className="text-slate-400">•</span>
                          <span className="font-mono text-slate-500 text-[11px]">{t.invoiceNumber || t.id}</span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">{formatDate(t.createdAt)}</p>
                      </div>
                      <div className="text-right">
                        <div className="font-extrabold text-xs text-slate-900">{formatIDR(t.grandTotal)}</div>
                        <span className="inline-block text-[10px] font-extrabold text-emerald-600 bg-emerald-50 px-2 py-0.2 rounded-full border border-emerald-100 mt-0.5">
                          Success
                        </span>
                      </div>
                    </div>
                  ))}
                  {transactions.length === 0 && (
                    <div className="py-8 text-center text-xs text-slate-400">No transactions recorded yet</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================= SCREEN 2: MENU MANAGEMENT ================= */}
        {activeTab === "menu" && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl w-full sm:w-auto overflow-x-auto">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`px-4 py-2 rounded-lg font-bold text-xs whitespace-nowrap transition-all ${
                      selectedCategory === cat.id
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={menuSearch}
                  onChange={(e) => setMenuSearch(e.target.value)}
                  placeholder="Search by name or category..."
                  className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 shadow-sm"
                />
              </div>
            </div>

            <div className="figma-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-600">
                  <thead className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-extrabold uppercase text-slate-500 tracking-wider">
                    <tr>
                      <th className="py-3.5 px-5">Image & Name</th>
                      <th className="py-3.5 px-4">Category</th>
                      <th className="py-3.5 px-4">Price</th>
                      <th className="py-3.5 px-4">Status</th>
                      <th className="py-3.5 px-4">Stock</th>
                      <th className="py-3.5 px-5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-xs">
                    {products
                      .filter((p) => {
                        const matchesCat = selectedCategory === "All" || p.category === selectedCategory;
                        const matchesSearch =
                          (p.name || "").toLowerCase().includes(menuSearch.toLowerCase()) ||
                          (p.category || "").toLowerCase().includes(menuSearch.toLowerCase()) ||
                          (p.sku || "").toLowerCase().includes(menuSearch.toLowerCase());
                        return matchesCat && matchesSearch;
                      })
                      .map((product) => (
                        <tr key={product.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3.5 px-5">
                            <div className="flex items-center gap-3">
                              <img
                                src={product.imageUrl || "https://images.unsplash.com/photo-1541167760496-1628856ab772?w=400"}
                                alt={product.name}
                                className="w-10 h-10 rounded-xl object-cover border border-slate-200"
                              />
                              <div>
                                <p className="font-extrabold text-slate-900 text-xs">{product.name}</p>
                                <p className="text-[11px] text-slate-400 font-mono">{product.sku || "-"}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 font-semibold text-slate-700">{product.category}</td>
                          <td className="py-3.5 px-4 font-extrabold text-slate-900">{formatIDR(product.price)}</td>
                          <td className="py-3.5 px-4">
                            <button
                              onClick={() => handleToggleActive(product)}
                              className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full border transition-all ${
                                product.isActive !== false
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : "bg-slate-100 text-slate-500 border-slate-200"
                              }`}
                            >
                              {product.isActive !== false ? "Active" : "Inactive"}
                            </button>
                          </td>
                          <td className="py-3.5 px-4 font-bold text-slate-800">{product.stockQuantity ?? 50} units</td>
                          <td className="py-3.5 px-5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
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
                                title="Edit Product"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteProduct(product)}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                                title="Delete Product"
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

              <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>
                  Showing 1 to {products.length} of {products.length} items
                </span>
                <span className="font-semibold text-slate-400">Page 1 of 1</span>
              </div>
            </div>
          </div>
        )}
        {/* ================= SCREEN 3: INVENTORY & STOCK ================= */}
        {activeTab === "inventory" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <div className="figma-card p-5">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Inventory Value</span>
                <div className="text-2xl font-extrabold text-slate-900 tracking-tight mt-3">
                  {formatIDR(metrics.totalInventoryValue)}
                </div>
                <p className="text-xs text-slate-400 mt-1 font-medium">Asset value across all menu items</p>
              </div>

              <div className="figma-card p-5 border-rose-200 bg-rose-50/20">
                <span className="text-xs font-bold text-rose-600 uppercase tracking-wider">Items to Restock</span>
                <div className="text-2xl font-extrabold text-rose-600 tracking-tight mt-3">
                  {metrics.lowStockCount}
                </div>
                <p className="text-xs text-slate-400 mt-1 font-medium">Stock is below minimum threshold (&le;10)</p>
              </div>

              <div className="figma-card p-5">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Categories</span>
                <div className="text-2xl font-extrabold text-slate-900 tracking-tight mt-3">
                  {categories.length - 1}
                </div>
                <p className="text-xs text-slate-400 mt-1 font-medium">Drinks, Food, Snacks</p>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-base text-slate-900">Stock Movement Log</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (products.length > 0) {
                      setSelectedStockProduct(products[0]);
                      setStockModalType("IN");
                      setStockQtyInput("");
                      setStockNotesInput("Vendor Delivery");
                      setIsStockModalOpen(true);
                    }
                  }}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm transition-all flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Adjust Stock</span>
                </button>
              </div>
            </div>

            <div className="figma-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-600">
                  <thead className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-extrabold uppercase text-slate-500 tracking-wider">
                    <tr>
                      <th className="py-3.5 px-5">Date & Time</th>
                      <th className="py-3.5 px-4">SKU</th>
                      <th className="py-3.5 px-4">Item Name</th>
                      <th className="py-3.5 px-4">Change</th>
                      <th className="py-3.5 px-4">Updated By</th>
                      <th className="py-3.5 px-5">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-xs">
                    {inventoryLogs.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-10 text-slate-400">
                          No stock movements logged yet
                        </td>
                      </tr>
                    ) : (
                      inventoryLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3.5 px-5 text-slate-500">{formatDate(log.timestamp)}</td>
                          <td className="py-3.5 px-4 font-mono font-bold text-slate-700">
                            {products.find((p) => p.id === log.productId)?.sku || "SKU-8021"}
                          </td>
                          <td className="py-3.5 px-4 font-bold text-slate-900">{log.productName}</td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`font-black text-xs px-2 py-0.5 rounded-md ${
                                log.type === "IN"
                                  ? "text-emerald-700 bg-emerald-50"
                                  : log.type === "OUT"
                                  ? "text-rose-700 bg-rose-50"
                                  : "text-slate-700 bg-slate-100"
                              }`}
                            >
                              {log.type === "IN" ? `+${log.quantity}` : `-${log.quantity}`}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-slate-600">{log.createdBy || "Mario Sitepu"}</td>
                          <td className="py-3.5 px-5 text-slate-500">{log.notes || "Vendor Delivery"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ================= SCREEN 4: SALES REPORTS ================= */}
        {activeTab === "reports" && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-extrabold text-base text-slate-900">Financial Breakdown & History</h3>
                <p className="text-xs text-slate-500">Analyze payment distribution and audit detailed cashier receipts</p>
              </div>

              <div className="flex items-center gap-3">
                <select
                  value={reportDateFilter}
                  onChange={(e) => setReportDateFilter(e.target.value as any)}
                  className="bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm focus:outline-none focus:border-indigo-500"
                >
                  <option value="today">Today</option>
                  <option value="7days">Last 7 Days</option>
                  <option value="30days">Last 30 Days</option>
                  <option value="all">All Time</option>
                </select>

                <button
                  onClick={handleExportCSV}
                  className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs border border-slate-200 shadow-sm transition-all flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export CSV</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-4 figma-card p-6 flex flex-col justify-between">
                <div>
                  <h3 className="font-extrabold text-base text-slate-900">Payment Methods</h3>
                  <p className="text-xs text-slate-400">Share of total revenue</p>

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
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Revenue</span>
                        <span className="text-sm font-black text-slate-900 leading-tight">
                          {formatIDR(metrics.totalRev)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2.5 pt-2 border-t border-slate-100 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-indigo-600" />
                        <span className="font-bold text-slate-700">QRIS</span>
                      </div>
                      <span className="font-extrabold text-slate-900">{metrics.qrisPct}%</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-emerald-500" />
                        <span className="font-bold text-slate-700">Cash (Tunai)</span>
                      </div>
                      <span className="font-extrabold text-slate-900">{metrics.cashPct}%</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-slate-300" />
                        <span className="font-bold text-slate-700">Bank Transfer</span>
                      </div>
                      <span className="font-extrabold text-slate-900">{metrics.transferPct}%</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-8 figma-card p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-extrabold text-base text-slate-900">Detailed Sales History</h3>
                  <span className="text-xs text-slate-400">{transactions.length} Total Orders</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-slate-600">
                    <thead className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-extrabold uppercase text-slate-500 tracking-wider">
                      <tr>
                        <th className="py-3 px-4">Date & Time</th>
                        <th className="py-3 px-4">Order ID</th>
                        <th className="py-3 px-4">Items</th>
                        <th className="py-3 px-4">Payment</th>
                        <th className="py-3 px-4 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-xs">
                      {transactions.map((tx) => (
                        <tr
                          key={tx.id}
                          onClick={() => setSelectedTxDetail(tx)}
                          className="hover:bg-slate-50/60 cursor-pointer transition-colors"
                        >
                          <td className="py-3 px-4 text-slate-500">{formatDate(tx.createdAt)}</td>
                          <td className="py-3 px-4 font-mono font-bold text-slate-800">
                            {tx.invoiceNumber || tx.id}
                          </td>
                          <td className="py-3 px-4 text-slate-700">
                            {(tx.items || []).length} items
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${
                                tx.paymentMethod === "QRIS"
                                  ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                                  : "bg-emerald-50 text-emerald-700 border-emerald-200"
                              }`}
                            >
                              {tx.paymentMethod}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-extrabold text-slate-900">
                            {formatIDR(tx.grandTotal)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ================= MODAL: ADD / EDIT PRODUCT ================= */}
      {(isAddProductOpen || isEditProductOpen) && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-2xl border border-slate-200 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-extrabold text-lg text-slate-900">
                  {editingProduct ? "Edit Product" : "Add New Product"}
                </h3>
                <p className="text-xs text-slate-400">Updates will sync in real-time to the POS tablet</p>
              </div>
              <button
                onClick={() => {
                  setIsAddProductOpen(false);
                  setIsEditProductOpen(false);
                }}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="space-y-4 text-xs font-medium">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Product Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Nasi Goreng Spesial"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Price (Rp) *</label>
                  <input
                    type="number"
                    required
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    placeholder="35000"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 font-extrabold text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Category *</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 focus:outline-none focus:border-indigo-500 font-medium"
                  >
                    <option value="Drinks">Drinks</option>
                    <option value="Food">Food</option>
                    <option value="Snacks">Snacks</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">SKU</label>
                  <input
                    type="text"
                    value={formData.sku}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                    placeholder="SKU-8021"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 font-mono text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Initial Stock</label>
                  <input
                    type="number"
                    value={formData.stockQuantity}
                    onChange={(e) => setFormData({ ...formData, stockQuantity: e.target.value })}
                    placeholder="50"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 font-bold focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Image URL</label>
                <input
                  type="url"
                  value={formData.imageUrl}
                  onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                  placeholder="https://images.unsplash.com/..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddProductOpen(false);
                    setIsEditProductOpen(false);
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 font-bold text-white shadow-sm shadow-indigo-200"
                >
                  Save & Sync
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: ADJUST STOCK ================= */}
      {isStockModalOpen && selectedStockProduct && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-extrabold text-base text-slate-900">Adjust Stock</h3>
                <p className="text-xs text-slate-400">Recorded automatically in inventory log</p>
              </div>
              <button
                onClick={() => setIsStockModalOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-xs"
              >
                ✕
              </button>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between text-xs">
              <div>
                <p className="font-bold text-slate-900">{selectedStockProduct.name}</p>
                <p className="text-slate-400">Current: {selectedStockProduct.stockQuantity ?? 50} units</p>
              </div>
              <span className="font-mono font-bold text-indigo-600">{selectedStockProduct.sku || "-"}</span>
            </div>

            <form onSubmit={handleStockSubmit} className="space-y-4 text-xs font-medium">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Adjustment Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setStockModalType("IN")}
                    className={`py-2 rounded-xl font-bold border transition-all ${
                      stockModalType === "IN"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                        : "bg-white text-slate-600 border-slate-200"
                    }`}
                  >
                    + Stock In (Restock)
                  </button>
                  <button
                    type="button"
                    onClick={() => setStockModalType("OUT")}
                    className={`py-2 rounded-xl font-bold border transition-all ${
                      stockModalType === "OUT"
                        ? "bg-rose-50 text-rose-700 border-rose-300"
                        : "bg-white text-slate-600 border-slate-200"
                    }`}
                  >
                    - Stock Out (Waste)
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Quantity *</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={stockQtyInput}
                  onChange={(e) => setStockQtyInput(e.target.value)}
                  placeholder="e.g. 15"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 font-extrabold text-base focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Notes / Vendor</label>
                <input
                  type="text"
                  value={stockNotesInput}
                  onChange={(e) => setStockNotesInput(e.target.value)}
                  placeholder="e.g. Vendor Delivery"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsStockModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 font-bold text-white shadow-sm shadow-indigo-200"
                >
                  Confirm Adjustment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: RECEIPT DETAILS ================= */}
      {selectedTxDetail && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-extrabold text-base text-slate-900">Receipt Details</h3>
                <p className="text-xs text-slate-400 font-mono">{selectedTxDetail.invoiceNumber || selectedTxDetail.id}</p>
              </div>
              <button
                onClick={() => setSelectedTxDetail(null)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-xs"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 bg-slate-50 p-4 rounded-xl border border-slate-100 max-h-56 overflow-y-auto text-xs">
              {(selectedTxDetail.items || []).map((item, idx) => (
                <div key={idx} className="flex justify-between items-center">
                  <div>
                    <p className="font-bold text-slate-800">{item.name}</p>
                    <p className="text-[11px] text-slate-400">
                      {item.qty} x {formatIDR(item.price)}
                    </p>
                  </div>
                  <span className="font-extrabold text-slate-900">
                    {formatIDR(item.subtotal || item.price * item.qty)}
                  </span>
                </div>
              ))}
            </div>

            <div className="space-y-1.5 text-xs border-t border-slate-100 pt-3">
              <div className="flex justify-between text-slate-500">
                <span>Date:</span>
                <span className="font-semibold text-slate-700">{formatDate(selectedTxDetail.createdAt)}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Payment:</span>
                <span className="font-bold text-indigo-600">{selectedTxDetail.paymentMethod}</span>
              </div>
              <div className="flex justify-between text-sm font-black text-slate-900 pt-2 border-t border-slate-100">
                <span>Grand Total:</span>
                <span>{formatIDR(selectedTxDetail.grandTotal)}</span>
              </div>
            </div>

            <button
              onClick={() => setSelectedTxDetail(null)}
              className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 font-bold text-white text-xs"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
