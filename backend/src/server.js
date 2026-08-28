import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import authRoutes from './routes/auth.js';
import customerRoutes from './routes/customers.js';
import supplierRoutes from './routes/suppliers.js';
import materialRoutes from './routes/materials.js';
import productRoutes from './routes/products.js';
import productionRoutes from './routes/production.js';
import purchaseOrderRoutes from './routes/purchaseOrders.js';
import salesOrderRoutes from './routes/salesOrders.js';
import shipmentRoutes from './routes/shipments.js';
import invoiceRoutes from './routes/invoices.js';
import paymentRoutes from './routes/payments.js';
import userRoutes from './routes/users.js';
import dashboardRoutes from './routes/dashboard.js';
import proformaInvoiceRoutes from './routes/proformaInvoices.js';
import companySettingsRoutes from './routes/companySettings.js';
import containerRoutes from './routes/containers.js';
import customerPurchaseOrderRoutes from './routes/customerPurchaseOrders.js';
import qcRoutes from './routes/qc.js';
import expenseRoutes from './routes/expenses.js';
import auditLogRoutes from './routes/auditLogs.js';

const app = express();
const PORT = process.env.PORT || 4000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDist = path.resolve(__dirname, '../../frontend/dist');
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet());
app.use(cors((req, callback) => {
  const origin = req.get('Origin');
  const applicationOrigin = `${req.protocol}://${req.get('host')}`;
  const originAllowed = !origin || allowedOrigins.includes(origin) || origin === applicationOrigin;

  if (!originAllowed) {
    const error = new Error('Origin not allowed');
    error.status = 403;
    return callback(error);
  }

  return callback(null, { origin: true, credentials: true });
}));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'Akbar Handicrafts CRM API' }));

app.use('/api/auth', authRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/materials', materialRoutes);
app.use('/api/products', productRoutes);
app.use('/api/production-orders', productionRoutes);
app.use('/api/purchase-orders', purchaseOrderRoutes);
app.use('/api/sales-orders', salesOrderRoutes);
app.use('/api/shipments', shipmentRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/users', userRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/proforma-invoices', proformaInvoiceRoutes);
app.use('/api/company-settings', companySettingsRoutes);
app.use('/api/containers', containerRoutes);
app.use('/api/customer-purchase-orders', customerPurchaseOrderRoutes);
app.use('/api/qc', qcRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/audit-logs', auditLogRoutes);

if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
    res.sendFile(path.join(frontendDist, 'index.html'), (err) => (err ? next(err) : undefined));
  });
} else {
  app.use((req, res) => res.status(404).json({ error: 'Not found' }));
}

// Centralized error handler
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (process.env.NODE_ENV === 'production') console.error(`Request failed (${status})`);
  else console.error(err);
  res.status(status).json({ error: status < 500 ? err.message : 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Akbar Handicrafts CRM API running on http://localhost:${PORT}`);
});
