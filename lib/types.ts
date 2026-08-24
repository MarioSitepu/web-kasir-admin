export interface Product {
  id: string;
  sku?: string;
  name: string;
  category: string;
  price: number;
  stockQuantity?: number;
  minStockAlert?: number;
  imageUrl?: string;
  isActive?: boolean;
  createdAt?: number;
  updatedAt?: number;
}

export interface TransactionItem {
  id: string;
  name: string;
  price: number;
  qty: number;
  subtotal: number;
}

export interface Transaction {
  id: string;
  invoiceNumber?: string;
  items: TransactionItem[];
  subtotal: number;
  discount: number;
  grandTotal: number;
  paymentMethod: "CASH" | "QRIS" | "TRANSFER" | string;
  cashReceived?: number;
  changeGiven?: number;
  createdAt: number;
  cashierName?: string;
}

export interface InventoryLog {
  id: string;
  productId: string;
  productName: string;
  type: "IN" | "OUT" | "SALE";
  quantity: number;
  previousStock: number;
  currentStock: number;
  notes?: string;
  createdBy?: string;
  timestamp: number;
}
