import { useEffect, useState, type FormEvent, Fragment } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, apiErrorMessage } from '../api/client';
import { Modal } from '../components/Modal';
import type { PackingListData } from '../types';

function EditShippingDetailsModal({
  data,
  onClose,
  onSaved,
}: {
  data: PackingListData;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { id } = useParams();
  const [preCarriageBy, setPreCarriageBy] = useState(data.pre_carriage_by);
  const [placeOfReceipt, setPlaceOfReceipt] = useState(data.place_of_receipt);
  const [vesselFlightNo, setVesselFlightNo] = useState(data.vessel_flight_no);
  const [notifyParty, setNotifyParty] = useState(data.notify_party);
  const [otherReference, setOtherReference] = useState(data.other_reference);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.patch(`/proforma-invoices/${id}/shipping-details`, {
        pre_carriage_by: preCarriageBy,
        place_of_receipt: placeOfReceipt,
        vessel_flight_no: vesselFlightNo,
        notify_party: notifyParty,
        packing_list_other_reference: otherReference,
      });
      onSaved();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Edit Shipment Details" onClose={onClose}>
      <form onSubmit={handleSave} className="space-y-3">
        {error && <div className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
        <div>
          <label className="mb-1 block text-xs font-medium text-stone-600">Pre-carriage By</label>
          <input value={preCarriageBy} onChange={(e) => setPreCarriageBy(e.target.value)} className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-stone-600">Place of Receipt</label>
          <input value={placeOfReceipt} onChange={(e) => setPlaceOfReceipt(e.target.value)} className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-stone-600">Vessel / Flight No.</label>
          <input value={vesselFlightNo} onChange={(e) => setVesselFlightNo(e.target.value)} className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-stone-600">Notify Party</label>
          <input
            value={notifyParty}
            onChange={(e) => setNotifyParty(e.target.value)}
            placeholder="Same as Consignee"
            className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-stone-600">Other Reference</label>
          <input value={otherReference} onChange={(e) => setOtherReference(e.target.value)} className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm" />
        </div>
        <div className="flex justify-end gap-2 border-t pt-3">
          <button type="button" onClick={onClose} className="rounded border border-stone-300 px-4 py-1.5 text-sm text-stone-600 hover:bg-stone-50">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function PackingListDetail() {
  const { id } = useParams();
  const [data, setData] = useState<PackingListData | null>(null);
  const [error, setError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  async function load() {
    try {
      const res = await api.get(`/proforma-invoices/${id}/packing-list`);
      setData(res.data);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleDownload() {
    setDownloading(true);
    setError('');
    try {
      const res = await api.post(`/proforma-invoices/${id}/packing-list/export`, {}, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `Packing List - ${data?.pi_no}.xlsx`;
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
  if (!data) return <div className="text-stone-400">Loading...</div>;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between print:hidden">
        <div>
          <Link to={`/proforma-invoices/${id}`} className="text-xs text-sky-600 hover:underline">
            &larr; Back to {data.pi_no}
          </Link>
          <h1 className="text-2xl font-bold text-stone-800">Packing List</h1>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2 print:hidden">
        <button
          onClick={() => setEditOpen(true)}
          className="rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700"
        >
          ✎ Edit Shipment Details
        </button>
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="rounded border border-stone-400 px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
        >
          {downloading ? 'Preparing...' : '⬇ Download Excel'}
        </button>
        <button
          onClick={() => window.print()}
          className="ml-auto rounded bg-stone-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-stone-800"
        >
          🖨 Print / Save PDF
        </button>
      </div>

      {/* Printable document */}
      <div className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm print:border-0 print:shadow-none print:p-0 text-xs text-stone-800">
        <div className="mb-2 border border-stone-400 text-center text-lg font-bold uppercase py-1">Packing List</div>

        <table className="w-full border-collapse border border-stone-400">
          <tbody>
            <tr>
              <td className="w-1/2 border border-stone-400 p-2 align-top" colSpan={2}>
                <div className="font-semibold">Exporter:</div>
                <div className="whitespace-pre-line">{[data.exporter.name, ...data.exporter.address_lines].join('\n')}</div>
              </td>
              <td className="border border-stone-400 p-2 align-top">
                <div className="font-semibold">Invoice No. &amp; Date</div>
                <div>{data.invoice_no} DTD {data.invoice_date}</div>
                <div className="mt-2 font-semibold">Exporter Ref. No.</div>
                <div>{data.exporter.iec_code ? `IEC# ${data.exporter.iec_code}` : ''}</div>
              </td>
            </tr>
            <tr>
              <td colSpan={2} className="border border-stone-400 p-2 align-top" rowSpan={2}>
                <div className="font-semibold">Consignee Address:</div>
                <div className="whitespace-pre-line">{[data.consignee.name, ...data.consignee.address_lines, data.consignee.country].join('\n')}</div>
              </td>
              <td className="border border-stone-400 p-2 align-top">
                <div className="font-semibold">Buyer Order No. &amp; Date</div>
                <div>{[data.buyer_order_no, data.buyer_order_date].filter(Boolean).join('  DTD  ')}</div>
              </td>
            </tr>
            <tr>
              <td className="border border-stone-400 p-2 align-top">
                <div className="font-semibold">Notify Party</div>
                <div>{data.notify_party || 'Same as Consignee'}</div>
              </td>
            </tr>
            <tr>
              <td className="border border-stone-400 p-2">
                <div className="font-semibold">Country of Origin</div>
                <div>{data.country_of_origin}</div>
              </td>
              <td className="border border-stone-400 p-2">
                <div className="font-semibold">Final Destination</div>
                <div>{data.final_destination}</div>
              </td>
              <td className="border border-stone-400 p-2" rowSpan={2}>
                <div className="font-semibold">Terms of Delivery &amp; Payment</div>
                <div>{data.terms_of_delivery_payment}</div>
                <div className="mt-2 font-semibold">Other Reference</div>
                <div>{data.other_reference}</div>
              </td>
            </tr>
            <tr>
              <td className="border border-stone-400 p-2">
                <div className="font-semibold">Pre-carriage By</div>
                <div>{data.pre_carriage_by}</div>
              </td>
              <td className="border border-stone-400 p-2">
                <div className="font-semibold">Place of Receipt</div>
                <div>{data.place_of_receipt}</div>
              </td>
            </tr>
            <tr>
              <td className="border border-stone-400 p-2">
                <div className="font-semibold">Vessel / Flight No.</div>
                <div>{data.vessel_flight_no}</div>
              </td>
              <td className="border border-stone-400 p-2">
                <div className="font-semibold">Port of Loading</div>
                <div>{data.port_of_loading}</div>
              </td>
              <td className="border border-stone-400 p-2">
                <div className="font-semibold">Port of Discharge</div>
                <div>{data.port_of_discharge}</div>
              </td>
            </tr>
          </tbody>
        </table>

        <table className="mt-3 w-full border-collapse border border-stone-400">
          <thead>
            <tr className="bg-stone-100">
              <th className="border border-stone-400 p-1">CTN#</th>
              <th className="border border-stone-400 p-1">Item#</th>
              <th className="border border-stone-400 p-1">Description</th>
              <th className="border border-stone-400 p-1">HS Code</th>
              <th className="border border-stone-400 p-1">Quantity</th>
              <th className="border border-stone-400 p-1">NWT/GWT/KG</th>
              <th className="border border-stone-400 p-1">T.CTN</th>
              <th className="border border-stone-400 p-1">T. NET WT/KG</th>
              <th className="border border-stone-400 p-1">T. GR WT/KG</th>
            </tr>
          </thead>
          <tbody>
            {data.lines.map((line, idx) => (
              <Fragment key={idx}>
                <tr key={`${idx}-a`}>
                  <td className="border border-stone-400 p-1 text-center" rowSpan={3}>{line.ctn_range}</td>
                  <td className="border border-stone-400 p-1 text-center" rowSpan={3}>{line.sku}</td>
                  <td className="border border-stone-400 p-1">{line.name}</td>
                  <td className="border border-stone-400 p-1 text-center" rowSpan={3}>{line.hs_code}</td>
                  <td className="border border-stone-400 p-1 text-center" rowSpan={3}>{line.qty}</td>
                  <td className="border border-stone-400 p-1 text-right">{line.per_carton_net.toFixed(2)}</td>
                  <td className="border border-stone-400 p-1 text-center" rowSpan={3}>{line.cartons}</td>
                  <td className="border border-stone-400 p-1 text-right" rowSpan={3}>{line.total_net.toFixed(2)}</td>
                  <td className="border border-stone-400 p-1 text-right" rowSpan={3}>{line.total_gross.toFixed(2)}</td>
                </tr>
                <tr key={`${idx}-b`}>
                  <td className="border border-stone-400 p-1">{line.finish} {line.size}</td>
                  <td className="border border-stone-400 p-1"></td>
                </tr>
                <tr key={`${idx}-c`}>
                  <td className="border border-stone-400 p-1">{line.packing_ratio}</td>
                  <td className="border border-stone-400 p-1 text-right">{line.per_carton_gross.toFixed(2)}</td>
                </tr>
              </Fragment>
            ))}
            <tr className="font-semibold">
              <td className="border border-stone-400 p-1" colSpan={6}>TOTAL CTNS: {data.totals.cartons}</td>
              <td className="border border-stone-400 p-1 text-center">{data.totals.cartons}</td>
              <td className="border border-stone-400 p-1 text-right">{data.totals.net.toFixed(2)}</td>
              <td className="border border-stone-400 p-1 text-right">{data.totals.gross.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>

        <div className="mt-3 flex justify-between gap-4">
          <div className="whitespace-pre-line border border-stone-400 p-2">
            <div className="font-semibold">WEIGHT DETAILS:-</div>
            {data.material_breakdown.map((m) => (
              <div key={m.material}>{m.material}: {m.weight.toFixed(3)} KGS</div>
            ))}
            <div className="mt-1 font-semibold">G. TOTAL: {data.totals.gross.toFixed(3)} KGS</div>
          </div>
          <div className="flex items-end border border-stone-400 p-2 font-semibold">FOR: {data.exporter.name}</div>
        </div>
      </div>

      {editOpen && (
        <EditShippingDetailsModal
          data={data}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            load();
          }}
        />
      )}
    </div>
  );
}
