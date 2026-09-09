import { useState } from 'react';
import { useToast } from '../../context/ToastContext';
import {
  Loader2, RefreshCw, FileSpreadsheet, Table2, X, GripVertical, BookOpen,
} from 'lucide-react';
import api from '../../utils/api';

const PIVOT_FIELDS = [
  { id: 'employeeName',       label: 'Employee',          icon: '👤' },
  { id: 'department',         label: 'Department',        icon: '🏢' },
  { id: 'position',           label: 'Position',          icon: '💼' },
  { id: 'gender',             label: 'Gender',            icon: '⚧' },
  { id: 'competency',         label: 'Competency',        icon: '🎯' },
  { id: 'competencyCategory', label: 'Comp. Category',    icon: '📂' },
  { id: 'level',              label: 'Level',             icon: '⭐' },
  { id: 'purpose',            label: 'Purpose',           icon: '🏷' },
  { id: 'assessmentType',     label: 'Assessment Type',   icon: '📋' },
  { id: 'targetGroup',        label: 'Target Group',      icon: '👥' },
  { id: 'date',               label: 'Month (YYYY-MM)',   icon: '📅' },
];

const VALUE_OPTIONS = [
  { id: 'score',          label: 'Overall score' },
  { id: 'selfScore',      label: 'Self score' },
  { id: 'supervisorScore',label: 'Supervisor score' },
  { id: 'count',          label: 'Record count' },
];

const AGG_OPTIONS = [
  { id: 'avg',   label: 'Average' },
  { id: 'count', label: 'Count' },
  { id: 'sum',   label: 'Sum' },
];

const LEVEL_COLOR = { Expert: '#16A34A', Advanced: '#2563EB', Intermediate: '#EA580C', Basic: '#F59E0B' };

function scoreStyle(val, valueField) {
  if (val === null || val === undefined) return {};
  if (valueField === 'count') {
    const intensity = Math.min(val / 20, 1);
    return { background: `rgba(59,130,246,${0.08 + intensity * 0.22})`, color: '#1e40af', fontWeight: 600 };
  }
  if (val >= 80) return { background: 'rgba(16,185,129,0.1)', color: '#065f46', fontWeight: 600 };
  if (val >= 65) return { background: 'rgba(59,130,246,0.1)', color: '#1e40af', fontWeight: 600 };
  if (val >= 50) return { background: 'rgba(245,158,11,0.12)', color: '#92400e', fontWeight: 600 };
  if (val >= 35) return { background: 'rgba(234,88,12,0.1)', color: '#7c2d12', fontWeight: 600 };
  return { background: 'rgba(239,68,68,0.1)', color: '#991b1b', fontWeight: 600 };
}

function FieldPill({ field, zone, onDrop, children }) {
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={e => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); const id = e.dataTransfer.getData('fieldId'); if (id) onDrop(id, zone); }}
      className={`min-h-[36px] flex items-center gap-1.5 px-3 rounded-lg border transition-all text-sm flex-wrap
        ${over ? 'border-brand-red bg-brand-red/5' : 'border-dashed border-gray-300 bg-gray-50'}`}
    >
      {children || <span className="text-gray-400 text-xs italic">Drag field here</span>}
    </div>
  );
}

export default function CustomReportBuilder({ filterParams }) {
  const { show } = useToast();
  const [rowField, setRowField]   = useState('department');
  const [colField, setColField]   = useState('competency');
  const [valueField, setValueField] = useState('score');
  const [aggregation, setAgg]     = useState('avg');
  const [result, setResult]       = useState(null);
  const [loading, setLoading]     = useState(false);
  const [exporting, setExporting] = useState(false);
  const [dragging, setDragging]   = useState(null);

  const runQuery = async () => {
    setLoading(true);
    try {
      const params = { ...filterParams(), rowField, valueField, aggregation };
      if (colField) params.colField = colField;
      const { data } = await api.get('/reports/custom/pivot', { params });
      setResult(data.data);
    } catch (err) {
      show(err.response?.data?.message || 'Failed to build report.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const doExport = async () => {
    setExporting(true);
    try {
      const params = { ...filterParams(), rowField, valueField, aggregation };
      if (colField) params.colField = colField;
      const res = await api.get('/reports/custom/export/excel', { params, responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a'); a.href = url;
      a.download = `custom_report_${rowField}_${Date.now()}.xlsx`; a.click();
      URL.revokeObjectURL(url);
      show('Exported to Excel.', 'success');
    } catch {
      show('Export failed.', 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleDrop = (fieldId, zone) => {
    if (zone === 'row') { setRowField(fieldId); }
    else if (zone === 'col') { setColField(fieldId === colField ? '' : fieldId); }
  };

  const fieldLabel = id => PIVOT_FIELDS.find(f => f.id === id)?.label || id;
  const cols = result?.columns;
  const rows = result?.rows || [];

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-gray-100 shadow-card p-5">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-8 h-8 bg-brand-red/10 rounded-xl flex items-center justify-center">
            <Table2 className="w-4 h-4 text-brand-red" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 text-sm">Pivot configuration</h3>
            <p className="text-xs text-gray-400">Drag fields to build any cross-tabulation you need</p>
          </div>
        </div>

        <div className="mb-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Available fields</p>
          <div className="flex flex-wrap gap-2">
            {PIVOT_FIELDS.map(f => (
              <div
                key={f.id}
                draggable
                onDragStart={e => { e.dataTransfer.setData('fieldId', f.id); setDragging(f.id); }}
                onDragEnd={() => setDragging(null)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium cursor-grab active:cursor-grabbing transition-all select-none
                  ${dragging === f.id ? 'opacity-40' : ''}
                  ${rowField === f.id ? 'border-brand-red bg-brand-red/10 text-brand-red' :
                    colField === f.id ? 'border-blue-500 bg-blue-50 text-blue-700' :
                    'border-gray-300 bg-white text-gray-700 hover:border-gray-400'}`}
              >
                <GripVertical className="w-3 h-3 opacity-40" />
                {f.label}
                {rowField === f.id && <span className="text-[10px] font-bold ml-0.5 opacity-60">ROW</span>}
                {colField === f.id && <span className="text-[10px] font-bold ml-0.5 opacity-60">COL</span>}
              </div>
            ))}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          <div>
            <p className="text-xs font-semibold text-gray-600 mb-1.5 flex items-center gap-1">
              <span className="w-4 h-4 rounded bg-brand-red/20 text-brand-red text-[9px] font-bold flex items-center justify-center">R</span>
              Row field
            </p>
            <FieldPill field={rowField} zone="row" onDrop={handleDrop}>
              {rowField && (
                <div className="flex items-center gap-1.5 w-full">
                  <span className="text-xs font-semibold text-brand-red">{fieldLabel(rowField)}</span>
                  <button onClick={() => setRowField('')} className="ml-auto text-gray-400 hover:text-red-500"><X className="w-3 h-3" /></button>
                </div>
              )}
            </FieldPill>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-600 mb-1.5 flex items-center gap-1">
              <span className="w-4 h-4 rounded bg-blue-100 text-blue-700 text-[9px] font-bold flex items-center justify-center">C</span>
              Column field <span className="text-[10px] text-gray-400 font-normal">(optional)</span>
            </p>
            <FieldPill field={colField} zone="col" onDrop={handleDrop}>
              {colField && (
                <div className="flex items-center gap-1.5 w-full">
                  <span className="text-xs font-semibold text-blue-700">{fieldLabel(colField)}</span>
                  <button onClick={() => setColField('')} className="ml-auto text-gray-400 hover:text-red-500"><X className="w-3 h-3" /></button>
                </div>
              )}
            </FieldPill>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-600 mb-1.5">Value</p>
            <select value={valueField} onChange={e => setValueField(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm bg-white">
              {VALUE_OPTIONS.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-600 mb-1.5">Aggregation</p>
            <select value={aggregation} onChange={e => setAgg(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm bg-white">
              {AGG_OPTIONS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={runQuery} disabled={!rowField || loading}
            className="flex items-center gap-2 px-5 py-2.5 bg-brand-red text-white rounded-lg text-sm font-semibold hover:bg-brand-red-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            {loading
              ? <><Loader2 className="w-4 h-4 animate-spin" />Building…</>
              : <><RefreshCw className="w-4 h-4" />Build report</>}
          </button>

          {result && (
            <button onClick={doExport} disabled={exporting}
              className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 bg-white rounded-lg text-sm font-semibold text-brand-black hover:bg-gray-50 disabled:opacity-50 transition-colors">
              {exporting
                ? <><Loader2 className="w-4 h-4 animate-spin" />Exporting…</>
                : <><FileSpreadsheet className="w-4 h-4 text-green-600" />Export Excel</>}
            </button>
          )}

          {result && (
            <p className="text-xs text-gray-400 ml-auto">
              {result.rows.length} row{result.rows.length !== 1 ? 's' : ''}
              {result.columns ? ` × ${result.columns.length} column${result.columns.length !== 1 ? 's' : ''}` : ''}
              &nbsp;·&nbsp;{result.totalRows.toLocaleString()} source records
            </p>
          )}
        </div>
      </div>

      {!result && !loading && (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 text-center">
          <Table2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-gray-600 mb-1">Your pivot table will appear here</p>
          <p className="text-xs text-gray-400">Set a row field, optionally a column field, choose a value and aggregation, then click Build report.</p>
        </div>
      )}

      {result && rows.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-card overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
            <div>
              <span className="text-sm font-bold text-gray-800">
                {fieldLabel(result.rowField)}
                {result.colField ? <> <span className="text-gray-400 font-normal">×</span> {fieldLabel(result.colField)}</> : ''}
              </span>
              <span className="ml-2 text-xs text-gray-400">
                — {AGG_OPTIONS.find(a => a.id === result.aggregation)?.label} of {VALUE_OPTIONS.find(v => v.id === result.valueField)?.label}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-max">
              <thead className="border-b border-gray-100 bg-gray-50 sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap min-w-[160px]">
                    {fieldLabel(result.rowField)}
                  </th>
                  {cols
                    ? cols.map(col => (
                        <th key={col} className="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap min-w-[90px]">
                          {col.length > 20 ? col.slice(0, 20) + '…' : col}
                        </th>
                      ))
                    : null}
                  {cols && (
                    <th className="text-right px-3 py-2.5 text-xs font-bold text-gray-700 uppercase tracking-wide whitespace-nowrap bg-gray-100">
                      Total
                    </th>
                  )}
                  {!cols && (
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {AGG_OPTIONS.find(a => a.id === result.aggregation)?.label}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row, ri) => (
                  <tr key={ri} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-gray-800 whitespace-nowrap">
                      {result.valueField === 'level'
                        ? <span className="inline-flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full" style={{ background: LEVEL_COLOR[row.rowLabel] || '#888' }} />
                            {row.rowLabel}
                          </span>
                        : row.rowLabel}
                    </td>
                    {cols
                      ? cols.map(col => {
                          const val = row.cells[col];
                          return (
                            <td key={col} className="px-3 py-2.5 text-right">
                              {val !== null && val !== undefined
                                ? <span className="inline-block px-2 py-0.5 rounded text-xs tabular-nums" style={scoreStyle(val, result.valueField)}>
                                    {result.valueField === 'count' || result.aggregation === 'count' ? val : `${val}%`}
                                  </span>
                                : <span className="text-gray-200 text-xs">—</span>}
                            </td>
                          );
                        })
                      : null}
                    {cols && (
                      <td className="px-3 py-2.5 text-right bg-gray-50">
                        {row.cells.__rowTotal !== null && row.cells.__rowTotal !== undefined
                          ? <span className="inline-block px-2 py-0.5 rounded text-xs font-bold tabular-nums" style={scoreStyle(row.cells.__rowTotal, result.valueField)}>
                              {result.valueField === 'count' || result.aggregation === 'count' ? row.cells.__rowTotal : `${row.cells.__rowTotal}%`}
                            </span>
                          : <span className="text-gray-200 text-xs">—</span>}
                      </td>
                    )}
                    {!cols && (
                      <td className="px-4 py-2.5 text-right">
                        {row.cells.__value !== null && row.cells.__value !== undefined
                          ? <span className="inline-block px-2 py-0.5 rounded text-xs tabular-nums" style={scoreStyle(row.cells.__value, result.valueField)}>
                              {result.valueField === 'count' || result.aggregation === 'count' ? row.cells.__value : `${row.cells.__value}%`}
                            </span>
                          : <span className="text-gray-200 text-xs">—</span>}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              {cols && result.colTotals && (
                <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                  <tr>
                    <td className="px-4 py-2.5 text-xs font-bold text-gray-700 uppercase tracking-wide">Total</td>
                    {cols.map(col => {
                      const val = result.colTotals[col];
                      return (
                        <td key={col} className="px-3 py-2.5 text-right">
                          {val !== null && val !== undefined
                            ? <span className="inline-block px-2 py-0.5 rounded text-xs font-bold tabular-nums" style={scoreStyle(val, result.valueField)}>
                                {result.valueField === 'count' || result.aggregation === 'count' ? val : `${val}%`}
                              </span>
                            : '—'}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2.5 text-right bg-gray-100">
                      {result.colTotals.__rowTotal !== null && result.colTotals.__rowTotal !== undefined
                        ? <span className="inline-block px-2 py-0.5 rounded text-xs font-bold tabular-nums bg-brand-red/10 text-brand-red">
                            {result.valueField === 'count' || result.aggregation === 'count' ? result.colTotals.__rowTotal : `${result.colTotals.__rowTotal}%`}
                          </span>
                        : '—'}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {result && rows.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-10 text-center">
          <BookOpen className="w-8 h-8 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-400">No data found for the current configuration and filters.</p>
        </div>
      )}
    </div>
  );
}