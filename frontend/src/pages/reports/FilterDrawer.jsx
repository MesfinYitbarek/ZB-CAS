import { useState } from 'react';
import {
  X, ChevronUp, ChevronDown, SlidersHorizontal, RotateCcw,
  User as UserIcon, Layers, Sliders, Calendar,
} from 'lucide-react';
import { LEVELS } from './ui';

const FilterSection = ({ title, icon: Icon, color, children, defaultOpen = true }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <button type="button" onClick={() => setOpen(v => !v)}
        className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${open ? 'bg-gray-50' : 'bg-white hover:bg-gray-50'}`}>
        <div className="flex items-center gap-2">
          <div className={`w-6 h-6 rounded-md flex items-center justify-center ${color}`}><Icon className="w-3.5 h-3.5" /></div>
          <span className="text-sm font-semibold text-gray-700">{title}</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && (
        <div className="px-4 pb-4 pt-3 bg-white grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {children}
        </div>
      )}
    </div>
  );
};

const FF = ({ label, children }) => (
  <div>
    <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">{label}</label>
    {children}
  </div>
);

const sCls = "w-full h-9 px-3 rounded-lg border border-gray-200 text-sm text-gray-800 focus:ring-2 focus:ring-brand-red focus:border-brand-red bg-white";
const iCls = "w-full h-9 px-3 rounded-lg border border-gray-200 text-sm text-gray-800 focus:ring-2 focus:ring-brand-red focus:border-brand-red";

const FILTER_LABELS = {
  department: 'Department', position: 'Position', gender: 'Gender', employeeIdCode: 'Emp ID Code',
  assessmentId: 'Assessment', assessmentType: 'Assess Type', purpose: 'Purpose', targetGroup: 'Target Group',
  assessmentStartFrom: 'Assess Start ≥', assessmentStartTo: 'Assess Start ≤',
  assessmentEndFrom: 'Assess End ≥', assessmentEndTo: 'Assess End ≤',
  competencyId: 'Competency', competencyCategory: 'Category', competencyLevel: 'Comp Level',
  overallLevel: 'Overall Level',
  scoreMin: 'Score ≥', scoreMax: 'Score ≤',
  selfScoreMin: 'Self ≥', selfScoreMax: 'Self ≤',
  supervisorScoreMin: 'Sup ≥', supervisorScoreMax: 'Sup ≤',
  dateFrom: 'Generated ≥', dateTo: 'Generated ≤',
};

const ActiveFilterPills = ({ filters, filterOptions, onRemove }) => {
  const active = Object.entries(filters).filter(([k, v]) => v && k !== 'employeeId');
  if (!active.length) return null;
  const getVal = (key, val) => {
    if (key === 'assessmentId') return filterOptions.assessments?.find(a => String(a._id) === val)?.description?.substring(0, 25) || val;
    if (key === 'competencyId') return filterOptions.competencies?.find(c => String(c._id) === val)?.name || val;
    return val;
  };
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-gray-400 font-medium">Active:</span>
      {active.map(([key, val]) => (
        <span key={key} className="inline-flex items-center gap-1 text-xs bg-brand-red/10 text-brand-red px-2.5 py-1 rounded-full font-medium">
          <span className="text-brand-red/60">{FILTER_LABELS[key] || key}:</span>
          {getVal(key, val)}
          <button type="button" onClick={() => onRemove(key)} className="ml-0.5 hover:opacity-60"><X className="w-3 h-3" /></button>
        </span>
      ))}
    </div>
  );
};

export default function FilterDrawer(props) {
  const {
    filters, filterOptions, isAdmin,
    onClose, onClear, onRemove,
    setDepartment, setPosition, setGender, setEmployeeIdCode,
    setAssessmentId, setAssessmentType, setPurpose, setTargetGroup,
    setAssessmentStartFrom, setAssessmentStartTo, setAssessmentEndFrom, setAssessmentEndTo,
    setCompetencyId, setCompetencyCategory, setCompetencyLevel,
    setScoreMin, setScoreMax, setSelfScoreMin, setSelfScoreMax,
    setSupervisorScoreMin, setSupervisorScoreMax,
    setOverallLevel, setDateFrom, setDateTo,
  } = props;

  const activeCount = Object.entries(filters).filter(([k, v]) => v && k !== 'employeeId').length;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-lg mb-6 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-brand-red/10 rounded-lg flex items-center justify-center">
            <SlidersHorizontal className="w-4 h-4 text-brand-red" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 text-sm">Advanced Filters</h3>
            <p className="text-xs text-gray-400">Combine any filters to narrow results</p>
          </div>
          {activeCount > 0 && <span className="text-xs font-bold bg-brand-red text-white px-2 py-0.5 rounded-full">{activeCount} active</span>}
        </div>
        <div className="flex items-center gap-2">
          {activeCount > 0 && (
            <button type="button" onClick={onClear}
              className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-brand-red px-3 py-1.5 rounded-lg border border-gray-200 hover:border-brand-red/40 transition-colors">
              <RotateCcw className="w-3.5 h-3.5" /> Clear All
            </button>
          )}
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"><X className="w-4 h-4" /></button>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {isAdmin && (
          <FilterSection title="Employee / User" icon={UserIcon} color="bg-blue-100 text-blue-600">
            <FF label="Department">
              <select value={filters.department} onChange={e => setDepartment(e.target.value)} className={sCls}>
                <option value="">All Departments</option>
                {filterOptions.departments.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </FF>
            <FF label="Position">
              <select value={filters.position} onChange={e => setPosition(e.target.value)} className={sCls}>
                <option value="">All Positions</option>
                {filterOptions.positions.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </FF>
            <FF label="Gender">
              <select value={filters.gender} onChange={e => setGender(e.target.value)} className={sCls}>
                <option value="">Any Gender</option>
                {(filterOptions.genders || ['Male', 'Female']).map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </FF>
            <FF label="Employee ID Code">
              <input value={filters.employeeIdCode} onChange={e => setEmployeeIdCode(e.target.value)} placeholder="e.g. EMP-001" className={iCls} />
            </FF>
          </FilterSection>
        )}

        <FilterSection title="Competency & Assessment" icon={Layers} color="bg-emerald-100 text-emerald-600">
          <FF label="Competency">
            <select value={filters.competencyId} onChange={e => setCompetencyId(e.target.value)} className={sCls}>
              <option value="">All Competencies</option>
              {(filterOptions.competencies || []).map(c => (
                <option key={String(c._id)} value={String(c._id)}>{c.name}{c.category ? ` (${c.category})` : ''}</option>
              ))}
            </select>
          </FF>
          <FF label="Competency Category">
            <select value={filters.competencyCategory} onChange={e => setCompetencyCategory(e.target.value)} className={sCls}>
              <option value="">All Categories</option>
              {(filterOptions.competencyCategories || []).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </FF>
          <FF label="Competency Level">
            <select value={filters.competencyLevel} onChange={e => setCompetencyLevel(e.target.value)} className={sCls}>
              <option value="">Any Level</option>
              {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </FF>
          <FF label="Assessment Type">
            <select value={filters.assessmentType} onChange={e => setAssessmentType(e.target.value)} className={sCls}>
              <option value="">All Types</option>
              {(filterOptions.assessmentTypes || ['SelfAssessment', 'SupervisorOnly', 'Combined']).map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </FF>
          <FF label="Purpose">
            <select value={filters.purpose} onChange={e => setPurpose(e.target.value)} className={sCls}>
              <option value="">All Purposes</option>
              {(filterOptions.purposes || []).map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </FF>
          <FF label="Target Group">
            <select value={filters.targetGroup} onChange={e => setTargetGroup(e.target.value)} className={sCls}>
              <option value="">All Groups</option>
              {(filterOptions.targetGroups || ['managerial', 'non-managerial', 'common']).map(g => <option key={g} value={g} className="capitalize">{g}</option>)}
            </select>
          </FF>
        </FilterSection>

        <FilterSection title="Score Ranges" icon={Sliders} color="bg-amber-100 text-amber-600" defaultOpen={false}>
          <FF label="Overall Score Min (%)"><input type="number" min="0" max="100" value={filters.scoreMin} onChange={e => setScoreMin(e.target.value)} placeholder="0" className={iCls} /></FF>
          <FF label="Overall Score Max (%)"><input type="number" min="0" max="100" value={filters.scoreMax} onChange={e => setScoreMax(e.target.value)} placeholder="100" className={iCls} /></FF>
          <FF label="Self Score Min (%)"><input type="number" min="0" max="100" value={filters.selfScoreMin} onChange={e => setSelfScoreMin(e.target.value)} placeholder="0" className={iCls} /></FF>
          <FF label="Self Score Max (%)"><input type="number" min="0" max="100" value={filters.selfScoreMax} onChange={e => setSelfScoreMax(e.target.value)} placeholder="100" className={iCls} /></FF>
          <FF label="Supervisor Score Min (%)"><input type="number" min="0" max="100" value={filters.supervisorScoreMin} onChange={e => setSupervisorScoreMin(e.target.value)} placeholder="0" className={iCls} /></FF>
          <FF label="Supervisor Score Max (%)"><input type="number" min="0" max="100" value={filters.supervisorScoreMax} onChange={e => setSupervisorScoreMax(e.target.value)} placeholder="100" className={iCls} /></FF>
        </FilterSection>

        <FilterSection title="Period" icon={Calendar} color="bg-red-100 text-red-600">
          <FF label="From"><input type="date" value={filters.dateFrom} onChange={e => setDateFrom(e.target.value)} className={iCls} /></FF>
          <FF label="To"><input type="date" value={filters.dateTo} onChange={e => setDateTo(e.target.value)} className={iCls} /></FF>
        </FilterSection>
      </div>

      {activeCount > 0 && (
        <div className="px-5 pb-4">
          <ActiveFilterPills filters={filters} filterOptions={filterOptions} onRemove={onRemove} />
        </div>
      )}

      <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
        <p className="text-xs text-gray-400">{activeCount === 0 ? 'No filters active' : `${activeCount} filter(s) active`}</p>
        <button type="button" onClick={onClose}
          className="px-4 py-2 bg-brand-red text-white text-sm font-semibold rounded-lg hover:bg-brand-red/90 transition-colors">
          Apply &amp; Close
        </button>
      </div>
    </div>
  );
}

export { ActiveFilterPills, FILTER_LABELS };
