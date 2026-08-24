export interface Product {
  id: string;
  sku?: string;
  name: string;
  price: number;
  category: string;
  imageUrl?: string;
  stockQuantity?: number;
  minStockAlert?: number;
  isActive?: boolean;
  createdAt?: number;
  updatedAt?: number;
}

export interface TransactionItem {
  productId: string;
  name: string;
  price: number;
  qty: number;
  subtotal: number;
  note?: string;
}

export interface Transaction {
  id: string;
  invoiceNumber: string;
  items: TransactionItem[];
  subtotal: number;
  discountAmount: number;
  grandTotal: number;
  paymentMethod: "CASH" | "QRIS";
  cashReceived?: number;
  changeGiven?: number;
  status: "SUCCESS" | "REFUNDED";
  createdAt: number;
}

export interface InventoryLog {
  id: string;
  productId: string;
  productName: string;
  type: "IN" | "OUT" | "SALE" | "ADJUSTMENT";
  quantity: number;
  previousStock: number;
  currentStock: number;
  notes: string;
  createdBy: string;
  timestamp: number;
}
