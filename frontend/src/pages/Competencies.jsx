import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus,
  Edit2,
  Trash2,
  Eye,
  X,
  Search,
  ChevronLeft,
  ChevronRight,
  Upload,
  Download,
  FileSpreadsheet,
  Loader2,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';
import api from '../utils/api';

const CATEGORIES = [
  'All',
  'Core-Personal effectiveness',
  'Core-Behavioral',
  'Managerial',
  'Leadership',
  'Technical',
];

const TARGET_GROUPS = ['managerial', 'non-managerial', 'common'];

const CAT_COLORS = {
  'Core-Personal effectiveness': 'text-brand-red bg-brand-red/10 border-brand-red',
  'Core-Behavioral': 'text-brand-red bg-brand-red/10 border-gray-700',
  Managerial: 'text-gray-700 bg-gray-200 border-gray-700',
  Leadership: 'text-gray-700 bg-gray-200 border-gray-700',
  Technical: 'text-gray-700 bg-gray-200 border-gray-700',
};

const TG_COLORS = {
  managerial: 'bg-gray-200 text-gray-700',
  'non-managerial': 'bg-gray-200 text-gray-700',
  common: 'bg-gray-100 text-gray-700',
};

export default function Competencies() {
  const { show } = useToast();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [catFilter, setCatFilter] = useState('All');
  const [search, setSearch] = useState('');

  const [modal, setModal] = useState(null); // 'create' | 'edit'
  const [selected, setSelected] = useState(null);
  const [viewItem, setViewItem] = useState(null);

  const initForm = () => ({
    name: '',
    category: 'Core-Personal effectiveness',
    targetGroups: [{ targetGroup: 'common', description: '' }],
  });

  const [form, setForm] = useState(initForm());

  const [pagination, setPagination] = useState({
    page: 1,
    limit: 12,
    total: 0,
    totalPages: 0,
  });

  // ── Bulk import ────────────────────────────────────────────────────────────
  const [showImport, setShowImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page: pagination.page, limit: pagination.limit };
      if (catFilter !== 'All') params.category = catFilter;
      if (search.trim()) params.search = search.trim();

      const { data } = await api.get('/competencies', { params });

      setItems(data.data.competencies);

      if (data.data.pagination) {
        setPagination((prev) => ({
          ...prev,
          total: data.data.pagination.total,
          totalPages: Math.ceil(data.data.pagination.total / prev.limit),
        }));
      }
    } catch {
      show('Failed to load competencies.', 'error');
    }
    setLoading(false);
  }, [catFilter, search, pagination.page, pagination.limit, show]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const openCreate = () => {
    setForm(initForm());
    setModal('create');
  };

  const openEdit = (c) => {
    setForm({
      name: c.name,
      category: c.category,
      targetGroups: c.targetGroups.map((tg) => ({ ...tg })),
    });
    setSelected(c);
    setModal('edit');
  };

  const handleSave = async () => {
    const usedTG = new Set(form.targetGroups.map((tg) => tg.targetGroup));
    if (usedTG.size !== form.targetGroups.length) {
      show('Duplicate target groups not allowed.', 'error');
      return;
    }
    if (form.targetGroups.length === 0) {
      show('At least one target group is required.', 'error');
      return;
    }

    try {
      if (modal === 'create') {
        await api.post('/competencies', form);
        show('Competency created or target groups merged.', 'success');
      } else {
        await api.put(`/competencies/${selected._id}`, form);
        show('Competency updated.', 'success');
      }
      setModal(null);
      fetch();
    } catch (err) {
      show(err.response?.data?.message || 'Save failed.', 'error');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this competency and all its target groups?')) return;
    try {
      await api.delete(`/competencies/${id}`);
      show('Competency deleted.', 'success');
      fetch();
    } catch (err) {
      show(err.response?.data?.message || 'Delete failed.', 'error');
    }
  };

  const goToPage = (page) => {
    if (page >= 1 && page <= pagination.totalPages) {
      setPagination((p) => ({ ...p, page }));
    }
  };

  // ── Bulk import helpers ────────────────────────────────────────────────────
  const resetImport = () => {
    setSelectedFile(null);
    setImportResult(null);
    setDragOver(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const openImport = () => {
    resetImport();
    setShowImport(true);
  };

  const onDropFile = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) setSelectedFile(file);
  };

  const formatBytes = (b) => {
    if (!b) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(b) / Math.log(k));
    return `${parseFloat((b / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const handleDownloadTemplate = async () => {
    try {
      const res = await api.get('/competencies/import/template', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'competency-import-template.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      show('Could not download the template.', 'error');
    }
  };

  const runImport = async () => {
    if (!selectedFile) { show('Please choose a file first.', 'error'); return; }
    setImporting(true);
    setImportResult(null);
    try {
      const fd = new FormData();
      fd.append('file', selectedFile);
      const { data } = await api.post('/competencies/import', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setImportResult(data.data);
      show(`Import complete: ${data.data.summary.imported} imported, ${data.data.summary.failed} failed.`,
        data.data.summary.failed > 0 ? 'info' : 'success');
      if (data.data.summary.imported > 0) fetch();
    } catch (err) {
      show(err.response?.data?.message || 'Import failed.', 'error');
    } finally {
      setImporting(false);
    }
  };

  const handlePageSizeChange = (e) => {
    const limit = parseInt(e.target.value, 10);
    setPagination((prev) => ({
      ...prev,
      page: 1,
      limit,
      totalPages: Math.ceil(prev.total / limit),
    }));
  };

  const handleCatFilter = (c) => {
    setCatFilter(c);
    setPagination((p) => ({ ...p, page: 1 }));
  };

  const addTargetGroup = () => {
    const used = form.targetGroups.map((tg) => tg.targetGroup);
    const available = TARGET_GROUPS.filter((tg) => !used.includes(tg));
    if (available.length === 0) return;
    setForm({
      ...form,
      targetGroups: [
        ...form.targetGroups,
        { targetGroup: available[0], description: '' },
      ],
    });
  };

  const removeTargetGroup = (index) => {
    const newTGs = form.targetGroups.filter((_, i) => i !== index);
    setForm({ ...form, targetGroups: newTGs });
  };

  const updateTargetGroup = (index, field, value) => {
    const newTGs = [...form.targetGroups];
    newTGs[index][field] = value;
    setForm({ ...form, targetGroups: newTGs });
  };

  return (
    <div className="p-7 h-[calc(100vh-4rem)] flex flex-col">
      {/* HEADER */}
      <div className="flex justify-between items-start mb-3 flex-shrink-0">
        <div>
          <h1 className="text-xl  font-bold text-brand-black">Competencies</h1>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={openImport}
            className="flex items-center gap-1.5 px-2 py-1 text-sm border border-gray-300 bg-white text-brand-black rounded-lg font-semibold hover:bg-gray-50 transition-colors"
          >
            <Upload className="w-3.5 h-3.5" /> Import
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 px-2 py-1 text-sm bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Add Competency
          </button>
        </div>
      </div>

      {/* FILTERS */}
      <div className="flex justify-between items-center gap-3 mb-5 flex-wrap flex-shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search bar */}
          <div className="relative min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}
              placeholder="Search competencies…"
              className="w-full h-10 pl-10 pr-4 rounded-lg border border-gray-300 focus-brand text-sm"
            />
            {search && (
              <button onClick={() => { setSearch(''); setPagination(p => ({ ...p, page: 1 })); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Category dropdown */}
          <select
            value={catFilter}
            onChange={(e) => handleCatFilter(e.target.value)}
            className="h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm font-medium cursor-pointer"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* Page size */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Show:</span>
          <select
            value={pagination.limit}
            onChange={handlePageSizeChange}
            className="px-2 py-1 rounded-lg border border-gray-300 focus-brand text-sm"
          >
            <option value="6">6 per page</option>
            <option value="12">12 per page</option>
            <option value="24">24 per page</option>
            <option value="48">48 per page</option>
          </select>
        </div>
      </div>

      {/* CONTENT - Scrollable */}
      <div className="flex-1 overflow-auto min-h-0 scrollbar-none">
        {loading ? (
          <div className="flex justify-center p-16">
            <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-card border border-gray-100 overflow-hidden mb-6">
            <div className="overflow-x-auto scrollbar-none">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100 bg-gray-50">
                    <th className="px-4 py-2.5 font-semibold">Competency</th>
                    <th className="px-4 py-2.5 font-semibold">Category</th>
                    <th className="px-4 py-2.5 font-semibold">Target Groups</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-center py-16 text-gray-400">
                        No competencies found.
                      </td>
                    </tr>
                  )}
                  {items.map((c) => (
                    <tr key={c._id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-semibold text-brand-black whitespace-nowrap">
                        {c.name}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${CAT_COLORS[c.category]}`}>
                          {c.category}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {c.targetGroups?.map((tg) => (
                            <span
                              key={tg.targetGroup}
                              className={`px-2 py-0.5 rounded-md text-[11px] ${TG_COLORS[tg.targetGroup]}`}
                            >
                              {tg.targetGroup}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => setViewItem(c)} className="p-1.5 rounded-lg hover:bg-gray-100 transition" title="View">
                            <Eye className="w-4 h-4 text-gray-700" />
                          </button>
                          <button onClick={() => openEdit(c)} className="p-1.5 rounded-lg hover:bg-gray-100 transition" title="Edit">
                            <Edit2 className="w-4 h-4 text-gray-500" />
                          </button>
                          <button onClick={() => handleDelete(c._id)} className="p-1.5 rounded-lg hover:bg-red-50 transition" title="Delete">
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination — fixed at bottom of the card */}
            <div className="flex-shrink-0 px-4 py-3 border-t border-gray-100 bg-white">
              {pagination.total > pagination.limit && (
                <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
                  <p className="text-sm text-gray-500">
                    Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
                    {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
                  </p>
                  <div className="flex items-center gap-1">
                    <button onClick={() => goToPage(pagination.page - 1)} disabled={pagination.page === 1} className="flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50">
                      <ChevronLeft className="w-4 h-4" /> Prev
                    </button>
                    {(() => {
                      const maxV = 5;
                      const pages = [];
                      if (pagination.totalPages <= maxV) {
                        for (let i = 1; i <= pagination.totalPages; i++) pages.push(i);
                      } else {
                        let start = Math.max(1, pagination.page - Math.floor(maxV / 2));
                        let end = Math.min(pagination.totalPages, start + maxV - 1);
                        if (end - start + 1 < maxV) start = Math.max(1, end - maxV + 1);
                        for (let i = start; i <= end; i++) pages.push(i);
                      }
                      return pages.map((p) => (
                        <button key={p} onClick={() => goToPage(p)}
                          className={`w-9 h-9 rounded-lg text-sm font-medium ${pagination.page === p ? 'bg-brand-red text-white' : 'border border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
                          {p}
                        </button>
                      ));
                    })()}
                    <button onClick={() => goToPage(pagination.page + 1)} disabled={pagination.page === pagination.totalPages} className="flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50">
                      Next <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* CREATE / EDIT MODAL */}
      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal === 'create' ? 'New Competency' : 'Edit Competency'}
      >
        <div className="space-y-4">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Competency Name"
            className="w-full h-10 px-3 border border-gray-300 focus-brand rounded-lg text-sm"
          />

          <select
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            className="w-full h-10 px-3 border border-gray-300 focus-brand rounded-lg text-sm"
          >
            {CATEGORIES.slice(1).map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <label className="font-medium">Target Groups</label>
              <button
                onClick={addTargetGroup}
                className="flex items-center gap-1 text-sm text-brand-red hover:underline"
                disabled={form.targetGroups.length >= TARGET_GROUPS.length}
              >
                <Plus className="w-4 h-4" /> Add Group
              </button>
            </div>
            {form.targetGroups.map((tg, index) => {
              const used = form.targetGroups.map((t) => t.targetGroup);
              const available = TARGET_GROUPS.filter((t) => used.includes(t) ? t === tg.targetGroup : true);
              return (
                <div key={index} className="flex gap-2 items-start">
                  <select
                    value={tg.targetGroup}
                    onChange={(e) => updateTargetGroup(index, 'targetGroup', e.target.value)}
                    className="w-1/3 h-10 px-3 border border-gray-300 focus-brand rounded-lg text-sm"
                  >
                    {available.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <textarea
                    rows={2}
                    value={tg.description}
                    onChange={(e) => updateTargetGroup(index, 'description', e.target.value)}
                    placeholder="Description..."
                    className="flex-1 px-3 py-2 border border-gray-300 focus-brand rounded-lg text-sm"
                  />
                  {form.targetGroups.length > 1 && (
                    <button
                      onClick={() => removeTargetGroup(index)}
                      className="p-2 text-brand-red hover:bg-red-50 rounded-lg"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setModal(null)} className="px-4 py-2 text-sm font-semibold text-brand-black border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-brand-red text-white rounded-lg text-sm font-semibold hover:bg-brand-red-dark transition-colors"
          >
            {modal === 'create' ? 'Create' : 'Save Changes'}
          </button>
        </div>
      </Modal>

      {/* VIEW MODAL */}
      <Modal
        open={!!viewItem}
        onClose={() => setViewItem(null)}
        title="Competency Details"
      >
        {viewItem && (
          <div className="space-y-6 text-sm">
            <div>
              <p className="text-gray-500">Name</p>
              <p className="font-semibold text-lg">{viewItem.name}</p>
            </div>
            <div>
              <p className="text-gray-500">Category</p>
              <p>{viewItem.category}</p>
            </div>

            <div>
              <p className="text-gray-500 mb-2">Target Groups & Descriptions</p>
              {viewItem.targetGroups?.map((tg) => (
                <div key={tg.targetGroup} className="border-l-2 border-brand-red pl-3 mb-4">
                  <p className="font-medium capitalize">{tg.targetGroup}</p>
                  <p className="text-gray-600 mt-1">{tg.description || 'No description provided.'}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>

      {/* BULK IMPORT MODAL */}
      <Modal open={showImport} onClose={() => setShowImport(false)} title="Bulk Import Competencies" large>
        {!importResult ? (
          <div className="space-y-4">
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDropFile}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                dragOver ? 'border-brand-red bg-brand-red-muted' : 'border-gray-300 hover:border-brand-red hover:bg-gray-50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv,.txt"
                className="hidden"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              />
              <FileSpreadsheet className="w-10 h-10 mx-auto text-gray-400 mb-3" />
              {selectedFile ? (
                <div>
                  <p className="font-semibold text-brand-black break-all">{selectedFile.name}</p>
                  <p className="text-xs text-gray-500 mt-1">{formatBytes(selectedFile.size)} · click to change</p>
                </div>
              ) : (
                <div>
                  <p className="font-semibold text-brand-black">Drag & drop a file here, or click to browse</p>
                  <p className="text-xs text-gray-500 mt-1">Supported: .xlsx, .xls, .csv</p>
                </div>
              )}
            </div>

            <p className="text-xs text-gray-500">
              Columns: <code className="font-mono bg-gray-100 px-1 rounded">name</code>,{' '}
              <code className="font-mono bg-gray-100 px-1 rounded">category</code>,{' '}
              <code className="font-mono bg-gray-100 px-1 rounded">targetGroups</code> (semicolon-separated),{' '}
              <code className="font-mono bg-gray-100 px-1 rounded">descriptions</code> (optional, semicolon-separated).
              Existing competencies get their target groups merged.
            </p>

            <button
              onClick={handleDownloadTemplate}
              className="flex items-center gap-2 text-brand-red font-semibold text-sm hover:text-brand-red-dark transition-colors"
            >
              <Download className="w-4 h-4" /> Download Excel template
            </button>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowImport(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={runImport}
                disabled={importing || !selectedFile}
                className="inline-flex items-center gap-2 px-4 py-2 bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {importing && <Loader2 className="w-4 h-4 animate-spin" />}
                {importing ? 'Importing...' : 'Import Competencies'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-brand-black">{importResult.summary.total}</p>
                <p className="text-xs text-gray-500 mt-1">Total Rows</p>
              </div>
              <div className="bg-gray-100 border border-gray-300 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-gray-700">{importResult.summary.imported}</p>
                <p className="text-xs text-gray-700 mt-1">Imported</p>
              </div>
              <div className={`${importResult.failed.length ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'} border rounded-lg p-4 text-center`}>
                <p className={`text-2xl font-bold ${importResult.failed.length ? 'text-brand-red' : 'text-gray-500'}`}>{importResult.summary.failed}</p>
                <p className={`text-xs mt-1 ${importResult.failed.length ? 'text-brand-red' : 'text-gray-500'}`}>Failed</p>
              </div>
            </div>

            {importResult.imported.length > 0 && (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <CheckCircle2 className="w-4 h-4 text-gray-700" /> Imported Competencies
                </div>
                <div className="max-h-52 overflow-y-auto custom-scrollbar">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-left text-xs text-gray-500">
                      <tr>
                        <th className="px-4 py-2">Name</th>
                        <th className="px-4 py-2">Category</th>
                        <th className="px-4 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {importResult.imported.map((c) => (
                        <tr key={c._id}>
                          <td className="px-4 py-2 font-medium">{c.name}</td>
                          <td className="px-4 py-2">{c.category}</td>
                          <td className="px-4 py-2 text-gray-500">{c.merged ? 'Target groups merged' : 'Created'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {importResult.failed.length > 0 && (
              <div className="border border-red-200 bg-red-50/30 rounded-lg overflow-hidden">
                <div className="bg-red-50 px-4 py-2 flex items-center gap-2 text-sm font-semibold text-brand-red">
                  <AlertTriangle className="w-4 h-4" /> Failed Rows ({importResult.failed.length})
                </div>
                <div className="max-h-52 overflow-y-auto custom-scrollbar divide-y divide-red-100">
                  {importResult.failed.map((f, i) => (
                    <div key={i} className="px-4 py-2 flex items-start gap-3 text-sm">
                      <span className="text-xs font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5">Row {f.row}</span>
                      <span className="text-gray-700">{f.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={() => { resetImport(); }}
                className="px-4 py-2 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Import More
              </button>
              <button
                onClick={() => { resetImport(); setShowImport(false); }}
                className="px-4 py-2 bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}