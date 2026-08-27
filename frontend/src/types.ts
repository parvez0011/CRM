export type Role = 'admin' | 'manager' | 'staff';

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  is_active?: number;
  created_at?: string;
}

export interface Customer {
  id: number;
  name: string;
  company?: string;
  country?: string;
  email?: string;
  phone?: string;
  address?: string;
  tax_id?: string;
  currency?: string;
  credit_limit?: number;
  notes?: string;
  created_at?: string;
}

export interface Supplier {
  id: number;
  name: string;
  company?: string;
  country?: string;
  email?: string;
  phone?: string;
  address?: string;
  materials_supplied?: string;
  notes?: string;
  created_at?: string;
}

export interface Material {
  id: number;
  name: string;
  category?: string;
  unit: string;
  unit_cost: number;
  stock_qty: number;
  reorder_level: number;
  supplier_id?: number | null;
  supplier_name?: string;
  created_at?: string;
}

export interface BomItem {
  id: number;
  material_id: number;
  qty_required: number;
  material_name?: string;
  unit?: string;
  unit_cost?: number;
}

export interface Product {
  id: number;
  sku?: string;
  name: string;
  category?: string;
  description?: string;
  hsn_code?: string;
  unit: string;
  unit_price: number;
  currency?: string;
  stock_qty: number;
  image_url?: string;
  labour_cost?: number;
  labour_cost_category?: string | null;
  labour_cost_mode?: 'fixed' | 'per_kg';
  labour_cost_per_kg?: number;
  finishing_cost?: number;
  packaging_cost?: number;
  weight_kg?: number;
  material_type?: string;
  finish_type?: string;
  packaging_type?: string;
  box_dimension?: string;
  box_weight?: number;
  units_per_carton?: number;
  customer_id?: number;
  customer_name?: string;
  bom?: BomItem[];
  created_at?: string;
}

export interface ManufacturingCostItem {
  product_id: number;
  product_name: string;
  sku?: string;
  qty: number;
  sale_rate: number;
  line_value: number;
  material_type: string | null;
  material_rate: number;
  material_unit: string | null;
  weight_kg: number;
  raw_material_cost: number;
  labour_cost: number;
  labour_cost_fixed?: number;
  labour_cost_category?: string | null;
  labour_cost_mode?: 'fixed' | 'per_kg';
  labour_cost_per_kg?: number;
  finishing_cost: number;
  packaging_cost: number;
  unit_manufacturing_cost: number;
  line_manufacturing_cost: number;
  missing_rate: boolean;
}

export interface ManufacturingCostReport {
  pi_id: number;
  pi_no: string;
  currency: string;
  total_value: number;
  total_manufacturing_cost: number;
  estimated_margin: number;
  estimated_margin_percent: number;
  items: ManufacturingCostItem[];
}

export interface ProductCostSheet {
  product_id: number;
  sku?: string;
  name: string;
  category?: string;
  unit?: string;
  unit_price: number;
  currency?: string;
  weight_kg?: number;
  material_type?: string;
  bom: (BomItem & { material_name: string; line_cost: number })[];
  raw_material_cost: number;
  labour_cost: number;
  labour_cost_fixed?: number;
  labour_cost_category?: string | null;
  labour_cost_mode?: 'fixed' | 'per_kg';
  labour_cost_per_kg?: number;
  finishing_cost: number;
  packaging_cost: number;
  total_cost: number;
  margin: number;
  margin_percent: number;
}

export type ProductionStage = 'cutting' | 'assembly' | 'finishing' | 'quality_check' | 'packing' | 'completed';
export type ProductionStatus = 'planned' | 'in_progress' | 'quality_check' | 'completed' | 'cancelled';

export interface ProductionOrder {
  id: number;
  order_no: string;
  product_id: number;
  product_name?: string;
  sku?: string;
  sales_order_id?: number | null;
  sales_order_no?: string;
  qty: number;
  stage: ProductionStage;
  status: ProductionStatus;
  start_date?: string;
  due_date?: string;
  completed_date?: string;
  notes?: string;
  qc_status?: 'pending' | 'passed' | 'failed';
  qc_notes?: string;
  packaging_notes?: string;
  cartons_count?: number;
}

export interface PurchaseOrderItem {
  id?: number;
  material_id: number;
  qty: number;
  rate: number;
  material_name?: string;
  unit?: string;
}

export type PurchaseOrderStatus = 'draft' | 'ordered' | 'received' | 'cancelled';

export interface PurchaseOrder {
  id: number;
  po_no: string;
  supplier_id: number;
  supplier_name?: string;
  supplier_company?: string;
  status: PurchaseOrderStatus;
  order_date?: string;
  expected_date?: string;
  received_date?: string;
  currency?: string;
  notes?: string;
  total_amount?: number;
  items?: PurchaseOrderItem[];
}

export interface SalesOrderItem {
  id?: number;
  product_id: number;
  qty: number;
  rate: number;
  product_name?: string;
  sku?: string;
  unit?: string;
}

export type SalesOrderStatus = 'draft' | 'confirmed' | 'in_production' | 'ready_to_ship' | 'shipped' | 'delivered' | 'cancelled';

export interface SalesOrder {
  id: number;
  order_no: string;
  customer_id: number;
  customer_name?: string;
  customer_company?: string;
  customer_email?: string;
  status: SalesOrderStatus;
  order_date?: string;
  delivery_date?: string;
  incoterm?: string;
  currency?: string;
  port_of_loading?: string;
  port_of_discharge?: string;
  notes?: string;
  total_amount?: number;
  items?: SalesOrderItem[];
}

export type ShipmentStatus = 'pending' | 'booked' | 'shipped' | 'in_transit' | 'delivered';

export interface Shipment {
  id: number;
  shipment_no: string;
  sales_order_id: number;
  sales_order_no?: string;
  customer_name?: string;
  shipping_line?: string;
  container_no?: string;
  bl_number?: string;
  port_of_loading?: string;
  port_of_discharge?: string;
  etd?: string;
  eta?: string;
  status: ShipmentStatus;
  gross_weight?: number;
  net_weight?: number;
  cbm?: number;
  notes?: string;
}

export type InvoiceStatus = 'unpaid' | 'partial' | 'paid' | 'overdue';

export interface Payment {
  id: number;
  invoice_id: number;
  amount: number;
  payment_date: string;
  method?: string;
  reference?: string;
  notes?: string;
  invoice_no?: string;
  currency?: string;
  customer_name?: string;
}

export interface Invoice {
  id: number;
  invoice_no: string;
  sales_order_id?: number | null;
  sales_order_no?: string;
  customer_id: number;
  customer_name?: string;
  customer_company?: string;
  customer_address?: string;
  customer_country?: string;
  customer_email?: string;
  invoice_date?: string;
  due_date?: string;
  currency?: string;
  total_amount: number;
  paid_amount: number;
  status: InvoiceStatus;
  notes?: string;
  container_id?: number | null;
  container_no?: string;
  invoice_type?: 'commercial' | string;
  customer_po_id?: number | null;
  proforma_invoice_id?: number | null;
  payment_transaction_number?: string;
  pi_no?: string;
  customer_po_no?: string;
  payments?: Payment[];
  items?: SalesOrderItem[];
}

export interface DashboardSummary {
  totals: {
    customers: number;
    suppliers: number;
    products: number;
    activeProformaInvoices: number;
    activeProduction: number;
    pendingShipments: number;
    outstandingReceivables: number;
  };
  lowStockMaterials: { id: number; name: string; unit: string; stock_qty: number; reorder_level: number }[];
  proformaInvoicesByStatus: { status: string; count: number }[];
  productionByStage: { stage: string; count: number }[];
  revenueByMonth: { month: string; total: number }[];
  topProducts: { name: string; total_qty: number }[];
  recentProformaInvoices: {
    id: number;
    pi_no: string;
    status: string;
    pi_date?: string;
    customer_name: string;
    total_amount: number;
    currency?: string;
  }[];
}

export interface CompanySettings {
  company_name: string;
  address?: string;
  city?: string;
  country?: string;
  email?: string;
  phone?: string;
  gstin?: string;
  iec_code?: string;
  pan?: string;
  bank_name?: string;
  bank_account_name?: string;
  bank_account_no?: string;
  bank_ifsc?: string;
  bank_swift?: string;
  bank_address?: string;
  authorized_signatory?: string;
}

export interface PackingListLine {
  ctn_range: string;
  sku: string;
  name: string;
  finish: string;
  size: string;
  hs_code: string;
  qty: number;
  cartons: number;
  packing_ratio: string;
  per_carton_net: number;
  per_carton_gross: number;
  total_net: number;
  total_gross: number;
}

export interface PackingListData {
  pi_no: string;
  pi_date?: string;
  invoice_no: string;
  invoice_date?: string;
  exporter: { name: string; address_lines: string[]; iec_code: string };
  consignee: { name: string; address_lines: string[]; country: string };
  buyer_order_no: string;
  buyer_order_date: string;
  other_reference: string;
  pre_carriage_by: string;
  place_of_receipt: string;
  vessel_flight_no: string;
  notify_party: string;
  country_of_origin: string;
  final_destination: string;
  terms_of_delivery_payment: string;
  port_of_loading: string;
  port_of_discharge: string;
  lines: PackingListLine[];
  totals: { cartons: number; net: number; gross: number };
  material_breakdown: { material: string; weight: number }[];
}

export type ContainerStatus = 'planning' | 'booked' | 'loading' | 'shipped' | 'in_transit' | 'delivered';

export interface ShippingExpense {
  id: number;
  container_id: number;
  expense_type: string;
  amount: number;
  currency?: string;
  notes?: string;
}

export interface ContainerOrderLink {
  id: number;
  proforma_invoice_id?: number | null;
  pi_no?: string;
  sales_order_id?: number | null;
  sales_order_no?: string;
  customer_name?: string;
  total_amount: number;
}

export interface Container {
  id: number;
  container_no: string;
  container_type?: string;
  status: ContainerStatus;
  shipping_line?: string;
  booking_no?: string;
  bl_number?: string;
  port_of_loading?: string;
  port_of_discharge?: string;
  etd?: string;
  eta?: string;
  max_cbm?: number;
  max_weight_kg?: number;
  notes?: string;
  totalValue?: number;
  totalExpenses?: number;
  currency?: string | null;
  orderCount?: number;
  orders?: ContainerOrderLink[];
  expenses?: ShippingExpense[];
}

export interface ProductProfitability {
  product_id: number;
  name: string;
  sku?: string;
  revenue: number;
  cost: number;
  profit: number;
  margin_percent: number;
}

export interface ContainerProfitability {
  container_id: number;
  container_no: string;
  status: string;
  revenue: number;
  product_cost: number;
  shipping_expenses: number;
  net_profit: number;
  margin_percent: number;
}

export interface ProfitabilityReport {
  topProfitableProducts: ProductProfitability[];
  byProformaInvoice: ProformaInvoiceProfitability[];
  currencyGroups: ProfitabilityCurrencyGroup[];
}

export interface ProformaInvoiceProfitability {
  id: number;
  pi_no: string;
  pi_date?: string;
  status: string;
  currency: string;
  customer_name: string;
  revenue: number;
  product_cost: number;
  shipping_expenses: number;
  gross_profit: number;
  net_profit: number;
  invoiced_amount: number;
  paid_amount: number;
  receivable_amount: number;
  margin_percent: number;
}

export interface ProfitabilityCurrencyGroup {
  currency: string;
  revenue: number;
  product_cost: number;
  shipping_expenses: number;
  gross_profit: number;
  net_profit: number;
  invoiced_amount: number;
  paid_amount: number;
  receivable_amount: number;
  pi_count: number;
  margin_percent: number;
}

export interface ProformaInvoiceItem {
  id?: number;
  product_id: number;
  customer_po_item_id?: number | null;
  description?: string;
  hsn_code?: string;
  qty: number;
  unit?: string;
  rate: number;
  product_name?: string;
  sku?: string;
}

export type ProformaInvoiceStatus = 'draft' | 'sent' | 'accepted' | 'cancelled';
export type ShipmentMode = 'Sea Freight' | 'Air Freight' | 'Sea/Air' | 'Courier' | 'Road';
export type AllowedFlag = 'Allowed' | 'Not Allowed';

export interface ProformaInvoice {
  id: number;
  pi_no: string;
  customer_id: number;
  customer_name?: string;
  customer_company?: string;
  customer_email?: string;
  customer_address?: string;
  customer_country?: string;
  customer_pi_item_format?: 'standard' | 'sku_simple';
  sales_order_id?: number | null;
  sales_order_no?: string;
  customer_po_id?: number | null;
  customer_po_no?: string;
  status: ProformaInvoiceStatus;
  pi_date?: string;
  validity_date?: string;
  currency?: string;
  incoterm?: string;
  port_of_loading?: string;
  port_of_discharge?: string;
  country_of_origin?: string;
  final_destination?: string;
  shipment_mode?: ShipmentMode;
  partial_shipment?: AllowedFlag;
  transshipment?: AllowedFlag;
  payment_terms?: string;
  bank_details?: string;
  notes?: string;
  total_amount?: number;
  items?: ProformaInvoiceItem[];
  company?: CompanySettings;
}

// The buyer's own commercial Purchase Order - parent of one or more Proforma Invoices.
export type CustomerPoStatus = 'draft' | 'received' | 'under_review' | 'approved' | 'in_progress' | 'completed' | 'cancelled';

export interface CustomerPurchaseOrderItem {
  id?: number;
  product_id: number;
  description?: string;
  hsn_code?: string;
  unit?: string;
  qty: number;
  rate: number;
  product_name?: string;
  sku?: string;
  allocated_qty?: number;
  remaining_qty?: number;
}

export interface CustomerPurchaseOrder {
  id: number;
  po_no: string;
  customer_id: number;
  customer_name?: string;
  customer_company?: string;
  customer_currency?: string;
  status: CustomerPoStatus;
  po_date?: string;
  delivery_date?: string;
  currency?: string;
  payment_terms?: string;
  incoterm?: string;
  destination?: string;
  port_of_loading?: string;
  buyer_reference?: string;
  salesperson?: string;
  advance_payment_amount?: number;
  advance_payment_paid?: number;
  advance_payment_transaction_number?: string;
  remaining_payment_paid?: number;
  remaining_payment_transaction_number?: string;
  notes?: string;
  total_qty?: number;
  total_value?: number;
  allocated_value?: number;
  items?: CustomerPurchaseOrderItem[];
  proforma_invoices?: (ProformaInvoice & { pnl?: ProformaInvoiceProfitability | null })[];
  freight_invoices?: (Invoice & { pi_no?: string })[];
}
