import { useState, useEffect, useMemo, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Loader2, User, Building2, Table2, Plus, Trash2, AlertTriangle } from 'lucide-react';
import api from '../../../utils/api';
import { useToast } from '../../../context/ToastContext';
import { useReports } from '../ReportsContext';
import EmployeePicker from '../shared/EmployeePicker';
import { queryKeys } from '../../../hooks/queries';

const TYPES = [
  { id: 'INDIVIDUAL', label: 'Individual', hint: 'One employee', icon: User },
  { id: 'ORGANIZATION', label: 'Organization', hint: 'Everyone matching the filters', icon: Building2 },
  { id: 'CUSTOM_PIVOT', label: 'Custom Pivot', hint: 'Cross-tabulation', icon: Table2 },
];

const PIVOT_FIELDS = [
  { id: 'employeeName', label: 'Employee' },
  { id: 'department', label: 'Department' },
  { id: 'position', label: 'Position' },
  { id: 'gender', label: 'Gender' },
  { id: 'competency', label: 'Competency' },
  { id: 'competencyCategory', label: 'Comp. Category' },
  { id: 'level', label: 'Level' },
  { id: 'purpose', label: 'Purpose' },
  { id: 'assessmentType', label: 'Assessment Type' },
  { id: 'targetGroup', label: 'Target Group' },
  { id: 'date', label: 'Date' },
];

const VALUE_OPTIONS = [
  { id: 'score', label: 'Overall score' },
  { id: 'selfScore', label: 'Self score' },
  { id: 'supervisorScore', label: 'Supervisor score' },
  { id: 'gap', label: 'Gap (Supervisor − Self)' },
  { id: 'count', label: 'Record count' },
];

const AGG_OPTIONS = [
  { id: 'avg', label: 'Average' },
  { id: 'count', label: 'Count' },
  { id: 'sum', label: 'Sum' },
  { id: 'min', label: 'Minimum' },
  { id: 'max', label: 'Maximum' },
  { id: 'median', label: 'Median' },
  { id: 'distinct', label: 'Distinct staff' },
  { id: 'pctRow', label: '% of row' },
  { id: 'pctCol', label: '% of column' },
];

const DATE_TRUNCS = [
  { id: 'month', label: 'Month' },
  { id: 'quarter', label: 'Quarter' },
  { id: 'year', label: 'Year' },
  { id: 'week', label: 'Week' },
];

const ORDER_OPTIONS = [
  { id: 'label', label: 'Labels A–Z' },
  { id: 'value-desc', label: 'Value high → low' },
  { id: 'value-asc', label: 'Value low → high' },
];

const inputCls = 'w-full h-9 px-3 rounded-lg border border-gray-300 focus-brand text-sm bg-white';
const fmtCell = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));

export default function NewReportModal({ onClose }) {
  const { show } = useToast();
  const queryClient = useQueryClient();
  const { filterParams, activeFilterCount } = useReports();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('ORGANIZATION');
  const [employee, setEmployee] = useState(null);

  // ── Pivot config ──
  const [rowFields, setRowFields] = useState(['department']);
  const [colField, setColField] = useState('competency');
  const [values, setValues] = useState([{ valueField: 'score', aggregation: 'avg' }]);
  const [dateTrunc, setDateTrunc] = useState('month');
  const [orderRows, setOrderRows] = useState('label');
  const [topRows, setTopRows] = useState('');
  const [maxColumns, setMaxColumns] = useState(20);

  const toggleRowField = (id) => {
    setRowFields((prev) => {
      if (prev.includes(id)) {
        if (prev.length === 1) return prev;
        return prev.filter((f) => f !== id);
      }
      if (prev.length >= 3) { show('At most 3 row fields.', 'info'); return prev; }
      return [...prev, id];
    });
  };
  const updateValue = (i, patch) => setValues((prev) => prev.map((v, j) => (j === i ? { ...v, ...patch } : v)));
  const addValue = () => {
    if (values.length >= 3) { show('At most 3 metrics.', 'info'); return; }
    setValues((prev) => [...prev, { valueField: 'score', aggregation: 'avg' }]);
  };
  const removeValue = (i) => {
    if (values.length === 1) return;
    setValues((prev) => prev.filter((_, j) => j !== i));
  };

  const colCollision = colField && rowFields.includes(colField);

  const pivotCfg = useMemo(() => ({
    rowFields,
    colField: colField || null,
    values,
    dateTrunc,
    orderRows,
    topRows: topRows === '' ? null : Math.max(1, parseInt(topRows, 10) || 1),
    maxColumns: Math.min(100, Math.max(1, parseInt(maxColumns, 10) || 20)),
  }), [rowFields, colField, values, dateTrunc, orderRows, topRows, maxColumns]);

  const filtersKey = JSON.stringify(filterParams());

  // ── Live preview (debounced; stale responses ignored) ──
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState('');
  const reqIdRef = useRef(0);
  const previewMutation = useMutation({
    mutationFn: async ({ filters, pivot }) => {
      const myId = ++reqIdRef.current;
      const { data } = await api.post('/reports/pivot-preview', { filters, pivot });
      return { myId, payload: data.data };
    },
    onSuccess: ({ myId, payload }) => {
      if (myId !== reqIdRef.current) return;
      setPreview(payload);
      setPreviewError('');
    },
    onError: (err) => {
      setPreview(null);
      setPreviewError(err.response?.data?.message || 'Preview failed.');
    },
  });

  useEffect(() => {
    if (type !== 'CUSTOM_PIVOT' || !rowFields.length || colCollision) {
      setPreview(null);
      return;
    }
    const t = setTimeout(() => {
      previewMutation.mutate({ filters: JSON.parse(filtersKey), pivot: pivotCfg });
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, filtersKey, rowFields, colField, values, dateTrunc, orderRows, topRows, maxColumns]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      const body = { title: title.trim(), description: description.trim(), type, filters: filterParams() };
      if (type === 'INDIVIDUAL') body.employeeId = employee._id;
      if (type === 'CUSTOM_PIVOT') body.pivot = pivotCfg;
      const { data } = await api.post('/reports/generate', body);
      return data.data.report;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.reports.generated.all });
      show('Report queued — generating in the background.', 'success');
      onClose();
    },
    onError: (err) => {
      show(err.response?.data?.message || 'Generation failed.', 'error');
    },
  });

  const submit = () => {
    if (!title.trim()) { show('Title is required.', 'error'); return; }
    if (type === 'INDIVIDUAL' && !employee) { show('Select an employee first.', 'error'); return; }
    if (type === 'CUSTOM_PIVOT') {
      if (!rowFields.length) { show('Select at least one row field.', 'error'); return; }
      if (colCollision) { show('Column field must differ from the row fields.', 'error'); return; }
    }
    submitMutation.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className={`bg-white rounded-xl shadow-2xl w-full ${type === 'CUSTOM_PIVOT' ? 'max-w-3xl' : 'max-w-lg'} max-h-[90vh] overflow-y-auto scrollbar-none`}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div>
            <h3 className="text-sm font-bold text-gray-900">New Report</h3>
            <p className="text-[11px] text-gray-400">Title, description and filters are saved with the report</p>
          </div>
          <button type="button" onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-brand-red hover:bg-red-50">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1.5">Title *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} maxLength={120}
              placeholder="e.g. Q3 Organization Review" className={inputCls} />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1.5">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
              placeholder="What is this report for?" className="w-full px-3 py-2 rounded-lg border border-gray-300 focus-brand text-sm bg-white resize-none" />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1.5">Report type</label>
            <div className="grid grid-cols-3 gap-2">
              {TYPES.map(t => (
                <button key={t.id} type="button" onClick={() => setType(t.id)}
                  className={`flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl border text-center transition-all
                    ${type === t.id ? 'border-brand-red bg-brand-red/5 text-brand-red' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}>
                  <t.icon className="w-4 h-4" />
                  <span className="text-xs font-bold">{t.label}</span>
                  <span className="text-[10px] leading-tight opacity-70">{t.hint}</span>
                </button>
              ))}
            </div>
          </div>

          {type === 'INDIVIDUAL' && (
            <EmployeePicker value={employee} onChange={setEmployee} />
          )}

          {type !== 'INDIVIDUAL' && (
            <p className="text-[11px] text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
              Uses the current report filters
              {activeFilterCount > 0 ? ` (${activeFilterCount} active)` : ' (none set — whole organization)'}.
              They are frozen into this report at generation time.
            </p>
          )}

          {type === 'CUSTOM_PIVOT' && (
            <div className="space-y-4 border-t border-gray-100 pt-4">
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1.5">Row fields <span className="font-normal text-gray-400">(1–3, in order)</span></label>
                <div className="flex flex-wrap gap-1.5">
                  {PIVOT_FIELDS.map(f => {
                    const on = rowFields.includes(f.id);
                    return (
                      <button key={f.id} type="button" onClick={() => toggleRowField(f.id)}
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-all
                          ${on ? 'bg-brand-red text-white border-brand-red' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
                        {on && <span className="mr-1">{rowFields.indexOf(f.id) + 1}.</span>}{f.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1.5">Column field <span className="font-normal text-gray-400">(optional)</span></label>
                  <select value={colField} onChange={e => setColField(e.target.value)} className={inputCls}>
                    <option value="">— None —</option>
                    {PIVOT_FIELDS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                  {colCollision && (
                    <p className="text-[11px] text-red-600 mt-1">Column must differ from the row fields.</p>
                  )}
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1.5">Max columns</label>
                  <input type="number" min={1} max={100} value={maxColumns}
                    onChange={e => setMaxColumns(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                    className={inputCls} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1.5">Date grouping</label>
                  <select value={dateTrunc} onChange={e => setDateTrunc(e.target.value)} className={inputCls}>
                    {DATE_TRUNCS.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1.5">Row order</label>
                  <select value={orderRows} onChange={e => setOrderRows(e.target.value)} className={inputCls}>
                    {ORDER_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-gray-600">Metrics <span className="font-normal text-gray-400">(1–3)</span></label>
                  {values.length < 3 && (
                    <button type="button" onClick={addValue} className="flex items-center gap-1 text-xs font-semibold text-brand-red hover:underline">
                      <Plus className="w-3.5 h-3.5" /> Add metric
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {values.map((v, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <select value={v.valueField} disabled={v.aggregation === 'count'}
                        onChange={e => updateValue(i, { valueField: e.target.value })}
                        className={`${inputCls} disabled:opacity-50`}>
                        {VALUE_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                      </select>
                      <select value={v.aggregation} onChange={e => updateValue(i, { aggregation: e.target.value })} className={inputCls}>
                        {AGG_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                      </select>
                      {values.length > 1 && (
                        <button type="button" onClick={() => removeValue(i)} title="Remove metric"
                          className="w-9 h-9 flex-shrink-0 rounded-lg flex items-center justify-center text-gray-400 hover:text-brand-red hover:bg-red-50">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1.5">Top rows <span className="font-normal text-gray-400">(blank = all)</span></label>
                <input type="number" min={1} value={topRows} onChange={e => setTopRows(e.target.value)}
                  placeholder="e.g. 10" className={inputCls} />
              </div>

              {/* ── Live preview ── */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                  <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">Live preview</p>
                  {previewMutation.isPending && (
                    <span className="flex items-center gap-1.5 text-[11px] text-gray-400">
                      <Loader2 className="w-3 h-3 animate-spin" /> Updating…
                    </span>
                  )}
                </div>
                <div className="max-h-72 overflow-auto scrollbar-none">
                  {previewError ? (
                    <p className="text-xs text-gray-500 px-3 py-4 text-center">{previewError}</p>
                  ) : !preview ? (
                    <p className="text-xs text-gray-400 px-3 py-4 text-center">
                      {colCollision ? 'Fix the column collision to preview.' : 'Configure the pivot to preview.'}
                    </p>
                  ) : (
                    <PivotPreviewTable preview={preview} />
                  )}
                </div>
                {preview && preview.notices?.length > 0 && (
                  <div className="px-3 py-2 bg-amber-50 border-t border-amber-100 space-y-1">
                    {preview.notices.map((n, i) => (
                      <p key={i} className="flex items-start gap-1.5 text-[11px] text-amber-700">
                        <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />{n.message || n}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100 sticky bottom-0 bg-white">
          <button type="button" onClick={onClose}
            className="px-4 py-2 border border-gray-300 bg-white rounded-lg text-[13px] font-semibold text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={submitMutation.isPending || (type === 'CUSTOM_PIVOT' && colCollision)}
            className="flex items-center gap-1.5 px-4 py-2 bg-brand-red text-white rounded-lg text-[13px] font-semibold hover:bg-brand-red-dark disabled:opacity-50 transition-colors">
            {submitMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Generating…</> : 'Generate Excel'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PivotPreviewTable({ preview }) {
  const L = preview.rowFields?.length || 1;
  const M = preview.metrics?.length || 1;
  const cols = preview.colValues || null;
  const multi = L > 1 || M > 1;
  return (
    <table className="w-full">
      <thead className="sticky top-0 z-10">
        {multi ? (
          <>
            <tr>
              {preview.rowFields.map((f, i) => (
                <th key={i} className="px-2 py-1.5 text-left text-[11px] font-bold text-white bg-gray-800 whitespace-nowrap">{f}</th>
              ))}
              {cols ? cols.map((c) => (
                <th key={c} colSpan={M} className="px-2 py-1.5 text-center text-[11px] font-bold text-white bg-gray-800 whitespace-nowrap border-l border-gray-700">{c}</th>
              )) : null}
              <th colSpan={M} className="px-2 py-1.5 text-center text-[11px] font-bold text-white bg-gray-800 whitespace-nowrap border-l border-gray-700">Total</th>
            </tr>
            <tr>
              {preview.rowFields.map((f, i) => (
                <th key={i} className="px-2 py-1 text-left text-[10px] font-semibold text-gray-300 bg-gray-700 whitespace-nowrap" />
              ))}
              {cols ? cols.flatMap((c) => preview.metrics.map((m) => (
                <th key={`${c}::${m}`} className="px-2 py-1 text-right text-[10px] font-semibold text-gray-300 bg-gray-700 whitespace-nowrap border-l border-gray-600">{m}</th>
              ))) : null}
              {preview.metrics.map((m) => (
                <th key={`t::${m}`} className="px-2 py-1 text-right text-[10px] font-semibold text-gray-300 bg-gray-700 whitespace-nowrap border-l border-gray-600">{m}</th>
              ))}
            </tr>
          </>
        ) : (
          <tr>
            <th className="px-2 py-1.5 text-left text-[11px] font-bold text-white bg-gray-800 whitespace-nowrap">{preview.rowFields[0]}</th>
            {cols ? cols.map((c) => (
              <th key={c} className="px-2 py-1.5 text-right text-[11px] font-bold text-white bg-gray-800 whitespace-nowrap">{c}</th>
            )) : (
              <th className="px-2 py-1.5 text-right text-[11px] font-bold text-white bg-gray-800 whitespace-nowrap">{preview.metrics[0]}</th>
            )}
            {cols && <th className="px-2 py-1.5 text-right text-[11px] font-bold text-white bg-gray-800 whitespace-nowrap">Total</th>}
          </tr>
        )}
      </thead>
      <tbody>
        {preview.body.map((e, i) => {
          const isSub = e.kind === 'subtotal';
          const labels = new Array(L).fill('');
          if (isSub) labels[e.depth] = `${e.path[e.depth]} Total`;
          else e.path.forEach((v, j) => { labels[j] = v; });
          return (
            <tr key={i} className={isSub ? 'bg-slate-100 font-bold' : i % 2 ? 'bg-gray-50' : 'bg-white'}>
              {labels.map((lab, j) => (
                <td key={j} className="px-2 py-1 text-[11px] text-gray-700 whitespace-nowrap font-semibold">{lab}</td>
              ))}
              {cols ? cols.flatMap((c) => (e.cells[c] || []).map((v, k) => (
                <td key={`${c}::${k}`} className="px-2 py-1 text-[11px] text-gray-700 whitespace-nowrap text-right border-l border-gray-100">{fmtCell(v)}</td>
              ))) : null}
              {e.totals.map((v, k) => (
                <td key={`t${k}`} className="px-2 py-1 text-[11px] text-gray-700 whitespace-nowrap text-right border-l border-gray-100 font-semibold">{fmtCell(v)}</td>
              ))}
            </tr>
          );
        })}
        {preview.body.length === 0 && (
          <tr><td colSpan={L + (cols ? cols.length * M : 0) + M} className="px-2 py-3 text-xs text-gray-400 text-center">No groups to display.</td></tr>
        )}
        {cols && (
          <tr className="bg-red-50 font-bold">
            <td className="px-2 py-1 text-[11px] text-gray-700 whitespace-nowrap">Total</td>
            {new Array(L - 1).fill('').map((_, j) => <td key={j} />)}
            {cols.flatMap((c) => (preview.colTotals[c] || []).map((v, k) => (
              <td key={`${c}::${k}`} className="px-2 py-1 text-[11px] text-gray-700 whitespace-nowrap text-right border-l border-gray-100">{fmtCell(v)}</td>
            )))}
            {preview.grand.map((v, k) => (
              <td key={`g${k}`} className="px-2 py-1 text-[11px] text-gray-700 whitespace-nowrap text-right border-l border-gray-100">{fmtCell(v)}</td>
            ))}
          </tr>
        )}
      </tbody>
    </table>
  );
}
