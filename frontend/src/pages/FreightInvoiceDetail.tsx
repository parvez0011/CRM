import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, apiErrorMessage } from '../api/client';
import { amountInWords } from '../utils/numberToWords';
import type { CompanySettings, Invoice } from '../types';

export function FreightInvoiceDetail() {
  const { id } = useParams();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    Promise.all([api.get(`/invoices/${id}`), api.get('/company-settings')])
      .then(([invoiceResponse, companyResponse]) => {
        if (invoiceResponse.data.invoice_type !== 'freight') throw new Error('This is not a freight invoice');
        setInvoice(invoiceResponse.data);
        setCompany(companyResponse.data);
      })
      .catch((err) => setError(apiErrorMessage(err)));
  }, [id]);

  async function downloadPdf() {
    if (!invoice) return;
    setDownloading(true);
    setError('');
    try {
      const response = await api.get(`/invoices/${id}/freight-pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `Freight Invoice - ${invoice.invoice_no}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setDownloading(false);
    }
  }

  if (error) return <div className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>;
  if (!invoice) return <div className="text-stone-400">Loading...</div>;

  const currency = invoice.currency || 'USD';
  return (
    <div>
      <div className="mb-4 flex items-center justify-between print:hidden">
        <div>
          <Link to={`/customer-purchase-orders/${invoice.customer_po_id}`} className="text-xs text-sky-600 hover:underline">
            &larr; Back to {invoice.customer_po_no || 'Customer PO'}
          </Link>
          <h1 className="text-2xl font-bold text-stone-800">{invoice.invoice_no}</h1>
        </div>
        <span className={`rounded px-2 py-1 text-xs font-semibold ${invoice.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
          {invoice.status === 'paid' ? 'Paid' : 'Unpaid'}
        </span>
      </div>

      <div className="mb-5 flex items-center gap-2 print:hidden">
        <button type="button" onClick={downloadPdf} disabled={downloading} className="rounded border border-stone-400 px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50">
          {downloading ? 'Preparing PDF...' : 'Download PDF'}
        </button>
        <button type="button" onClick={() => window.print()} className="ml-auto rounded bg-stone-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-stone-800">
          Print / Save PDF
        </button>
      </div>

      <div className="rounded-lg border border-stone-200 bg-white p-8 text-sm text-stone-800 shadow-sm print:border-0 print:p-0 print:shadow-none">
        <div className="mb-6 flex items-start justify-between border-b border-stone-300 pb-4">
          <div className="max-w-[55%]">
            <div className="text-xl font-bold">{company?.company_name || 'Akbar Handicrafts'}</div>
            <div className="text-stone-600">{company?.address}</div>
            <div className="text-stone-600">{[company?.city, company?.country].filter(Boolean).join(', ')}</div>
            <div className="text-stone-600">{[company?.email, company?.phone].filter(Boolean).join(' | ')}</div>
            <div className="mt-1 text-xs text-stone-500">GSTIN: {company?.gstin} &nbsp;|&nbsp; IEC Code: {company?.iec_code} &nbsp;|&nbsp; PAN: {company?.pan}</div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold uppercase text-amber-700">Freight Invoice</div>
            <div className="mt-2 text-stone-600">Invoice No: <span className="font-semibold text-stone-800">{invoice.invoice_no}</span></div>
            <div className="text-stone-600">Invoice Date: {invoice.invoice_date || '-'}</div>
            <div className="text-stone-600">Due Date: {invoice.due_date || '-'}</div>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-8">
          <div>
            <div className="mb-1 text-xs font-semibold uppercase text-stone-500">Buyer / Bill To</div>
            <div className="font-semibold">{invoice.customer_name}</div>
            <div>{invoice.customer_company}</div>
            <div className="whitespace-pre-line text-stone-600">{invoice.customer_address}</div>
            <div className="text-stone-600">{invoice.customer_country}</div>
            <div className="text-stone-600">{invoice.customer_email}</div>
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold uppercase text-stone-500">References</div>
            <div>Customer PO: <span className="font-semibold">{invoice.customer_po_no || '-'}</span></div>
            <div>Proforma Invoice: <span className="font-semibold">{invoice.pi_no || '-'}</span></div>
            <div>Payment Status: <span className="font-semibold uppercase">{invoice.status === 'paid' ? 'Paid' : 'Unpaid'}</span></div>
                      {invoice.payment_transaction_number && (
                        <div>Transaction No: <span className="font-semibold">{invoice.payment_transaction_number}</span></div>
                      )}
          </div>
        </div>

        <table className="mb-4 w-full border-collapse text-xs">
          <thead>
            <tr className="border-b-2 border-stone-700 text-left uppercase text-stone-600">
              <th className="py-2">Description</th>
              <th className="py-2 text-right">Amount ({currency})</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-stone-200">
              <td className="py-4">{invoice.notes || `Freight charges against ${invoice.pi_no || 'Proforma Invoice'}`}</td>
              <td className="py-4 text-right">{invoice.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td className="pt-3 text-right font-semibold">Total</td>
              <td className="pt-3 text-right text-base font-bold">{currency} {invoice.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
            </tr>
          </tfoot>
        </table>
        <div className="mb-6 text-xs italic text-stone-600">Amount in Words: {amountInWords(invoice.total_amount, currency)}</div>

        <div className="mb-8 grid grid-cols-2 gap-8">
          <div>
            <div className="mb-1 text-xs font-semibold uppercase text-stone-500">Bank Details</div>
            <div className="text-stone-700">Beneficiary: {company?.bank_account_name || company?.company_name}</div>
            <div className="text-stone-700">Bank: {company?.bank_name}</div>
            <div className="text-stone-700">A/C No: {company?.bank_account_no}</div>
            <div className="text-stone-700">IFSC: {company?.bank_ifsc}</div>
            <div className="text-stone-700">SWIFT: {company?.bank_swift}</div>
          </div>
        </div>

        <div className="mt-12 flex justify-end">
          <div className="text-center">
            <div className="mb-8 text-stone-500">For {company?.company_name}</div>
            <div className="border-t border-stone-400 pt-1 font-medium">{company?.authorized_signatory}</div>
            <div className="text-xs text-stone-500">Authorized Signatory</div>
          </div>
        </div>
      </div>
    </div>
  );
}