import type { ReactNode } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { Customers } from "./pages/Customers";
import { Suppliers } from "./pages/Suppliers";
import { Materials } from "./pages/Materials";
import { Products } from "./pages/Products";
import { ProductionOrders } from "./pages/ProductionOrders";
import { PurchaseOrders } from "./pages/PurchaseOrders";
import { CustomerPurchaseOrders } from "./pages/CustomerPurchaseOrders";
import { CustomerPurchaseOrderDetail } from "./pages/CustomerPurchaseOrderDetail";
import { ProformaInvoices } from "./pages/ProformaInvoices";
import { ProformaInvoiceDetail } from "./pages/ProformaInvoiceDetail";
import { FreightInvoiceDetail } from "./pages/FreightInvoiceDetail";
import { PackingListDetail } from "./pages/PackingListDetail";
import { SalesOrders } from "./pages/SalesOrders";
import { SalesOrderDetail } from "./pages/SalesOrderDetail";
import { Shipments } from "./pages/Shipments";
import { Containers } from "./pages/Containers";
import { ContainerDetail } from "./pages/ContainerDetail";
import { Invoices } from "./pages/Invoices";
import { Users } from "./pages/Users";
import { CompanySettings } from "./pages/CompanySettings";

function Shell({ children }: { children: ReactNode }) {
  return (
    <ProtectedRoute>
      <Layout>{children}</Layout>
    </ProtectedRoute>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Shell><Dashboard /></Shell>} />
          <Route path="/customers" element={<Shell><Customers /></Shell>} />
          <Route path="/suppliers" element={<Shell><Suppliers /></Shell>} />
          <Route path="/materials" element={<Shell><Materials /></Shell>} />
          <Route path="/products" element={<Shell><Products /></Shell>} />
          <Route path="/production-orders" element={<Shell><ProductionOrders /></Shell>} />
          <Route path="/purchase-orders" element={<Shell><PurchaseOrders /></Shell>} />
          <Route path="/customer-purchase-orders" element={<Shell><CustomerPurchaseOrders /></Shell>} />
          <Route path="/customer-purchase-orders/:id" element={<Shell><CustomerPurchaseOrderDetail /></Shell>} />
          <Route path="/proforma-invoices" element={<Shell><ProformaInvoices /></Shell>} />
          <Route path="/proforma-invoices/:id" element={<Shell><ProformaInvoiceDetail /></Shell>} />
          <Route path="/proforma-invoices/:id/packing-list" element={<Shell><PackingListDetail /></Shell>} />
          <Route path="/invoices/:id/freight" element={<Shell><FreightInvoiceDetail /></Shell>} />
          <Route path="/sales-orders" element={<Shell><SalesOrders /></Shell>} />
          <Route path="/sales-orders/:id" element={<Shell><SalesOrderDetail /></Shell>} />
          <Route path="/shipments" element={<Shell><Shipments /></Shell>} />
          <Route path="/containers" element={<Shell><Containers /></Shell>} />
          <Route path="/containers/:id" element={<Shell><ContainerDetail /></Shell>} />
          <Route path="/invoices" element={<Shell><Invoices /></Shell>} />
          <Route
            path="/users"
            element={
              <ProtectedRoute roles={["admin"]}>
                <Layout>
                  <Users />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/company-settings"
            element={
              <ProtectedRoute roles={["admin"]}>
                <Layout>
                  <CompanySettings />
                </Layout>
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;