import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Loader2, User, Building2, Table2 } from 'lucide-react';
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
  { id: 'date', label: 'Month (YYYY-MM)' },
];

const VALUE_OPTIONS = [
  { id: 'score', label: 'Overall score' },
  { id: 'selfScore', label: 'Self score' },
  { id: 'supervisorScore', label: 'Supervisor score' },
  { id: 'count', label: 'Record count' },
];

const AGG_OPTIONS = [
  { id: 'avg', label: 'Average' },
  { id: 'count', label: 'Count' },
  { id: 'sum', label: 'Sum' },
];

const inputCls = 'w-full h-9 px-3 rounded-lg border border-gray-300 focus-brand text-sm bg-white';

export default function NewReportModal({ onClose }) {
  const { show } = useToast();
  const queryClient = useQueryClient();
  const { filterParams, activeFilterCount } = useReports();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('ORGANIZATION');
  const [employee, setEmployee] = useState(null);
  const [rowField, setRowField] = useState('department');
  const [colField, setColField] = useState('competency');
  const [valueField, setValueField] = useState('score');
  const [aggregation, setAggregation] = useState('avg');

  const submitMutation = useMutation({
    mutationFn: async () => {
      const body = { title: title.trim(), description: description.trim(), type, filters: filterParams() };
      if (type === 'INDIVIDUAL') body.employeeId = employee._id;
      if (type === 'CUSTOM_PIVOT') {
        body.pivot = { rowField, colField: colField || null, valueField, aggregation };
      }
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
    submitMutation.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto scrollbar-none"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 sticky top-0 bg-white">
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1.5">Row field</label>
                <select value={rowField} onChange={e => setRowField(e.target.value)} className={inputCls}>
                  {PIVOT_FIELDS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1.5">Column field <span className="font-normal text-gray-400">(optional)</span></label>
                <select value={colField} onChange={e => setColField(e.target.value)} className={inputCls}>
                  <option value="">— None —</option>
                  {PIVOT_FIELDS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1.5">Value</label>
                <select value={valueField} onChange={e => setValueField(e.target.value)} className={inputCls}>
                  {VALUE_OPTIONS.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1.5">Aggregation</label>
                <select value={aggregation} onChange={e => setAggregation(e.target.value)} className={inputCls}>
                  {AGG_OPTIONS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100 sticky bottom-0 bg-white">
          <button type="button" onClick={onClose}
            className="px-4 py-2 border border-gray-300 bg-white rounded-lg text-[13px] font-semibold text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={submitMutation.isPending}
            className="flex items-center gap-1.5 px-4 py-2 bg-brand-red text-white rounded-lg text-[13px] font-semibold hover:bg-brand-red-dark disabled:opacity-50 transition-colors">
            {submitMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Generating…</> : 'Generate Excel'}
          </button>
        </div>
      </div>
    </div>
  );
}
