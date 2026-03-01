/**
 * Reports.jsx  –  Comprehensive HR Admin Analytics & Reporting
 *
 * Tabs:
 *  1. Overview      – KPI cards, trends, level dist, score histogram
 *  2. Workforce     – Dept, Position, Gender, Supervisor breakdowns
 *  3. Competencies  – Competency rankings + dept heatmap
 *  4. Assessments   – Per-assessment analytics + purpose/type breakdown
 *  5. Data Table    – Paginated rich table with ALL filter dimensions
 *  6. Deep Dive     – Single employee 360° profile
 *
 * All heavy filtering is pushed to the backend (no client-side re-filtering).
 * Exports (Excel multi-sheet, PDF) stream directly from the server.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  BarChart3, TrendingUp, TrendingDown, Users, Building2, Layers,
  User as UserIcon, FileText, FileSpreadsheet, SlidersHorizontal,
  Filter, X, Search, ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  RefreshCw, Download, Award, AlertCircle, Activity, Target, Scale,
  Calendar, BookOpen, Briefcase, Star, ArrowUpRight, ArrowDownRight,
  Minus as MinusIcon, Shield, Eye, Hash, PieChart, Zap, Globe, Clock,
  CheckCircle, XCircle, Info, BarChart2, Grid, List, Loader2
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
  LineChart, Line, CartesianGrid, AreaChart, Area, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis, Cell,
  ComposedChart, Scatter, ReferenceLine
} from 'recharts';
import api from '../utils/api';

// ─── constants ────────────────────────────────────────────────────────────────
const LEVEL_COLORS = { Basic:'#F59E0B', Intermediate:'#EA580C', Advanced:'#2563EB', Expert:'#16A34A' };
const LEVEL_BG     = { Basic:'bg-amber-100 text-amber-700 border-amber-200', Intermediate:'bg-orange-100 text-orange-700 border-orange-200', Advanced:'bg-blue-100 text-blue-700 border-blue-200', Expert:'bg-green-100 text-green-700 border-green-200' };
const LEVELS       = ['Basic','Intermediate','Advanced','Expert'];
const TYPE_COLORS  = { SelfAssessment:'#3B82F6', SupervisorOnly:'#F97316', Combined:'#8B5CF6' };
const CHART_COLORS = ['#C8102E','#3B82F6','#16A34A','#F59E0B','#8B5CF6','#06B6D4','#EC4899','#14B8A6'];
const MONTH_NAMES  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const EMPTY_FILTERS = {
  search:'', department:'', position:'', gender:'', userStatus:'',
  supervisorId:'', employeeId:'',
  competencyId:'', competencyCategory:'', competencyTargetGroup:'',
  assessmentId:'', assessmentType:'', assessmentStatus:'', purpose:'',
  level:'', scoreMin:'', scoreMax:'', resultStatus:'',
  dateFrom:'', dateTo:'',
  sortBy:'createdAt', sortDir:'desc',
};

// ─── tiny reusable components ─────────────────────────────────────────────────

const LevelBadge = ({ level }) => (
  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${LEVEL_BG[level] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>{level}</span>
);

const ScoreBar = ({ score, max = 100 }) => {
  const pct = Math.min(100, Math.max(0, score));
  const color = pct >= 80 ? '#16A34A' : pct >= 60 ? '#2563EB' : pct >= 40 ? '#F59E0B' : '#C8102E';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-1.5 min-w-16">
        <div className="h-1.5 rounded-full transition-all" style={{ width:`${pct}%`, background: color }} />
      </div>
      <span className="text-sm font-bold text-gray-800 w-12 text-right">{score?.toFixed(1)}%</span>
    </div>
  );
};

const KpiCard = ({ label, value, icon:Icon, color, sub, trend, onClick }) => (
  <div onClick={onClick} className={`bg-white rounded-xl p-5 border border-gray-100 shadow-sm flex items-start gap-4 ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}>
    <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
      <Icon className="w-5 h-5" />
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-gray-900 truncate">{value ?? '—'}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
    {trend !== undefined && (
      <div className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full flex-shrink-0 ${trend > 0 ? 'bg-green-50 text-green-600' : trend < 0 ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-500'}`}>
        {trend > 0 ? <ArrowUpRight className="w-3 h-3"/> : trend < 0 ? <ArrowDownRight className="w-3 h-3"/> : <MinusIcon className="w-3 h-3"/>}
        {Math.abs(trend)}%
      </div>
    )}
  </div>
);

const SectionCard = ({ title, icon:Icon, children, action }) => (
  <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
      <h3 className="font-bold text-gray-800 flex items-center gap-2 text-sm">
        {Icon && <Icon className="w-4 h-4 text-brand-red"/>}
        {title}
      </h3>
      {action}
    </div>
    <div className="p-5">{children}</div>
  </div>
);

const Paginator = ({ pagination, goToPage }) => {
  if (!pagination?.total || pagination.total <= pagination.limit) return null;
  const { page: cp, totalPages: tp } = pagination;
  const start = Math.max(1, Math.min(cp - 2, tp - 4));
  const pages = Array.from({ length: Math.min(5, tp) }, (_, i) => start + i);
  return (
    <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-4 border-t border-gray-100">
      <p className="text-sm text-gray-500">
        Showing {(cp-1)*pagination.limit+1}–{Math.min(cp*pagination.limit,pagination.total)} of <strong>{pagination.total}</strong>
      </p>
      <div className="flex items-center gap-1">
        <button onClick={()=>goToPage(cp-1)} disabled={cp===1} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40"><ChevronLeft className="w-4 h-4"/></button>
        {pages.map(p=>(
          <button key={p} onClick={()=>goToPage(p)} className={`w-9 h-9 rounded-lg text-sm font-medium ${cp===p?'bg-brand-red text-white':'border border-gray-200 text-gray-700 hover:bg-gray-50'}`}>{p}</button>
        ))}
        <button onClick={()=>goToPage(cp+1)} disabled={cp===tp} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40"><ChevronRight className="w-4 h-4"/></button>
      </div>
    </div>
  );
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3 text-xs">
      <p className="font-bold text-gray-800 mb-2">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="font-medium">{p.name}: <strong>{typeof p.value === 'number' && p.name?.includes('Score') ? `${p.value}%` : p.value}</strong></p>
      ))}
    </div>
  );
};

// ─── Heatmap cell ─────────────────────────────────────────────────────────────
const heatColor = (score) => {
  if (!score && score !== 0) return { bg:'#F3F4F6', text:'#9CA3AF' };
  if (score >= 80) return { bg:'#16A34A', text:'#fff' };
  if (score >= 65) return { bg:'#2563EB', text:'#fff' };
  if (score >= 50) return { bg:'#F59E0B', text:'#fff' };
  if (score >= 35) return { bg:'#EA580C', text:'#fff' };
  return { bg:'#C8102E', text:'#fff' };
};

// ═══════════════════════════════════════════════════════════════════════════════
// FILTER PANEL
// ═══════════════════════════════════════════════════════════════════════════════
function FilterPanel({ filters, setFilters, options, onApply, onClear, onClose }) {
  const [local, setLocal] = useState({ ...filters });
  const set = (k, v) => setLocal(p => ({ ...p, [k]: v }));
  const activeCount = Object.entries(local).filter(([k, v]) => v && !['sortBy','sortDir'].includes(k)).length;

  const Field = ({ label, children }) => (
    <div><label className="block text-xs font-semibold text-gray-600 mb-1.5">{label}</label>{children}</div>
  );
  const Select = ({ fkey, opts, placeholder }) => (
    <select value={local[fkey]} onChange={e=>set(fkey,e.target.value)} className="w-full h-9 px-3 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-brand-red focus:border-transparent">
      <option value="">{placeholder}</option>
      {opts.map(o => <option key={o.value??o} value={o.value??o}>{o.label??o}</option>)}
    </select>
  );
  const Input = ({ fkey, placeholder, type='text' }) => (
    <input type={type} value={local[fkey]} onChange={e=>set(fkey,e.target.value)} placeholder={placeholder}
      className="w-full h-9 px-3 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-brand-red" />
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-5">
      <div className="flex items-center justify-between mb-5">
        <h3 className="font-bold text-gray-900 flex items-center gap-2">
          <Filter className="w-4 h-4 text-brand-red"/>
          Advanced Filters
          {activeCount > 0 && <span className="bg-brand-red text-white text-xs px-2 py-0.5 rounded-full">{activeCount} active</span>}
        </h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4"/></button>
      </div>

      {/* SECTION: Employee */}
      <div className="mb-5">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
          <UserIcon className="w-3.5 h-3.5"/> Employee Attributes
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          <div className="xl:col-span-2">
            <Field label="Employee Search">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"/>
                <input value={local.search} onChange={e=>set('search',e.target.value)} placeholder="Name, email, employee ID..."
                  className="w-full h-9 pl-9 pr-3 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-brand-red"/>
              </div>
            </Field>
          </div>
          <Field label="Department"><Select fkey="department" opts={options.departments||[]} placeholder="All Departments"/></Field>
          <Field label="Position"><Input fkey="position" placeholder="Any position..."/></Field>
          <Field label="Gender"><Select fkey="gender" opts={(options.genders||[]).map(g=>({value:g,label:g}))} placeholder="All Genders"/></Field>
          <Field label="User Status"><Select fkey="userStatus" opts={['ACTIVE','INACTIVE'].map(s=>({value:s,label:s}))} placeholder="Any Status"/></Field>
          <Field label="Reports To (Supervisor)">
            <Select fkey="supervisorId" opts={(options.supervisors||[]).map(s=>({value:s._id,label:`${s.name}${s.department?` · ${s.department}`:''}`}))} placeholder="Any Supervisor"/>
          </Field>
        </div>
      </div>

      {/* SECTION: Competency */}
      <div className="mb-5 pt-4 border-t border-gray-100">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
          <Layers className="w-3.5 h-3.5"/> Competency Attributes
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <Field label="Competency">
              <Select fkey="competencyId" opts={(options.competencies||[]).map(c=>({value:c._id,label:`${c.name} (${c.category})`}))} placeholder="All Competencies"/>
            </Field>
          </div>
          <Field label="Competency Category"><Select fkey="competencyCategory" opts={options.competencyCategories||[]} placeholder="All Categories"/></Field>
          <Field label="Competency Target Group"><Select fkey="competencyTargetGroup" opts={['managerial','non-managerial','common'].map(t=>({value:t,label:t.replace('-',' ')}))} placeholder="All Groups"/></Field>
        </div>
      </div>

      {/* SECTION: Assessment */}
      <div className="mb-5 pt-4 border-t border-gray-100">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
          <BookOpen className="w-3.5 h-3.5"/> Assessment Attributes
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          <div className="xl:col-span-2">
            <Field label="Assessment">
              <Select fkey="assessmentId" opts={(options.assessments||[]).map(a=>({value:a._id,label:a.description||'(No description)'}))} placeholder="All Assessments"/>
            </Field>
          </div>
          <Field label="Assessment Type"><Select fkey="assessmentType" opts={['SelfAssessment','SupervisorOnly','Combined'].map(t=>({value:t,label:t.replace(/([A-Z])/g,' $1').trim()}))} placeholder="All Types"/></Field>
          <Field label="Assessment Status"><Select fkey="assessmentStatus" opts={['DRAFT','SCHEDULED','ACTIVE','COMPLETED','ARCHIVED'].map(s=>({value:s,label:s}))} placeholder="All Statuses"/></Field>
          <Field label="Purpose"><Select fkey="purpose" opts={options.purposes||[]} placeholder="All Purposes"/></Field>
        </div>
      </div>

      {/* SECTION: Result */}
      <div className="mb-5 pt-4 border-t border-gray-100">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
          <Award className="w-3.5 h-3.5"/> Result Attributes
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          <Field label="Proficiency Level"><Select fkey="level" opts={LEVELS.map(l=>({value:l,label:l}))} placeholder="All Levels"/></Field>
          <Field label="Min Score (%)"><Input fkey="scoreMin" placeholder="0" type="number"/></Field>
          <Field label="Max Score (%)"><Input fkey="scoreMax" placeholder="100" type="number"/></Field>
          <Field label="Result Status"><Select fkey="resultStatus" opts={['PENDING','FINAL'].map(s=>({value:s,label:s}))} placeholder="All"/></Field>
          <Field label="From Date"><Input fkey="dateFrom" type="date"/></Field>
          <Field label="To Date"><Input fkey="dateTo" type="date"/></Field>
          <Field label="Sort By">
            <div className="flex gap-1.5">
              <Select fkey="sortBy" opts={[{value:'createdAt',label:'Date'},{value:'finalScore',label:'Score'},{value:'level',label:'Level'}]}/>
              <button onClick={()=>set('sortDir', local.sortDir==='asc'?'desc':'asc')} className="h-9 w-9 flex items-center justify-center border border-gray-300 rounded-lg hover:bg-gray-50 flex-shrink-0">
                {local.sortDir==='asc' ? <ArrowUpRight className="w-4 h-4 text-gray-600"/> : <ArrowDownRight className="w-4 h-4 text-gray-600"/>}
              </button>
            </div>
          </Field>
        </div>
      </div>

      {/* Active chips */}
      {activeCount > 0 && (
        <div className="pt-4 border-t border-gray-100 flex flex-wrap gap-2 mb-4">
          {Object.entries(local).filter(([k,v])=>v&&!['sortBy','sortDir'].includes(k)).map(([k,v])=>(
            <span key={k} className="inline-flex items-center gap-1 px-2.5 py-1 bg-brand-red/10 text-brand-red text-xs rounded-full font-medium">
              {k.replace(/([A-Z])/g,' $1').replace(/^./,s=>s.toUpperCase())}: {String(v).substring(0,20)}
              <button onClick={()=>set(k,'')}><X className="w-3 h-3"/></button>
            </span>
          ))}
        </div>
      )}

      <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
        <button onClick={()=>{ setLocal({...EMPTY_FILTERS}); onClear(); }} className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-red-600">Clear All</button>
        <button onClick={()=>{ setFilters({...local}); onApply(); }} className="px-5 py-2 bg-brand-red text-white rounded-lg text-sm font-semibold hover:bg-brand-red-dark">Apply Filters</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// OVERVIEW TAB
// ═══════════════════════════════════════════════════════════════════════════════
function OverviewTab({ stats, loading }) {
  if (loading) return <LoadingSpinner/>;
  if (!stats) return <EmptyState msg="No data. Apply filters and load stats."/>;
  const { overall, levelDistribution, monthlyTrend, topEmployees, bottomEmployees, scoreDistribution } = stats;

  const levelData = LEVELS.map(l => {
    const found = levelDistribution?.find(d => d._id === l);
    return { name: l, count: found?.count || 0, avgScore: found?.avgScore || 0 };
  });

  const trendData = (monthlyTrend || []).map(t => ({ ...t, month: t.label }));

  const histData = (scoreDistribution || []).map(b => ({ ...b, label: `${b.range}%` }));

  return (
    <div className="space-y-5">
      {/* KPI Row 1 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Total Results"        value={(overall.total||0).toLocaleString()} icon={FileText}   color="bg-blue-50 text-blue-600"/>
        <KpiCard label="Avg Score"            value={`${overall.avgScore||0}%`}            icon={TrendingUp} color="bg-green-50 text-green-600" sub={`Max ${overall.maxScore?.toFixed(1)}% · Min ${overall.minScore?.toFixed(1)}%`}/>
        <KpiCard label="Employees Assessed"   value={(overall.uniqueEmployees||0).toLocaleString()} icon={Users}  color="bg-purple-50 text-purple-600" sub={`${overall.uniqueDepts||0} departments`}/>
        <KpiCard label="Competencies Covered" value={overall.uniqueCompetencies||0}        icon={Layers}     color="bg-indigo-50 text-indigo-600" sub={`${overall.uniqueAssessments||0} assessments`}/>
      </div>
      {/* KPI Row 2 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Expert Level"         value={levelData.find(l=>l.name==='Expert')?.count||0}       icon={Award}       color="bg-green-50 text-green-600"/>
        <KpiCard label="Advanced Level"       value={levelData.find(l=>l.name==='Advanced')?.count||0}     icon={Star}        color="bg-blue-50 text-blue-600"/>
        <KpiCard label="Need Support (Basic)" value={levelData.find(l=>l.name==='Basic')?.count||0}        icon={AlertCircle} color="bg-amber-50 text-amber-600"/>
        <KpiCard label="Std Deviation"        value={`${overall.stdDev||0}%`}                              icon={Activity}    color="bg-gray-50 text-gray-600" sub="Score variance"/>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Level Distribution */}
        <SectionCard title="Proficiency Level Distribution" icon={PieChart}>
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={levelData} barSize={36}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
              <XAxis dataKey="name" tick={{fontSize:12}}/>
              <YAxis tick={{fontSize:11}}/>
              <Tooltip content={<CustomTooltip/>}/>
              <Bar dataKey="count" radius={[4,4,0,0]} name="Count">
                {levelData.map(e=><Cell key={e.name} fill={LEVEL_COLORS[e.name]}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-4 mt-2 flex-wrap">
            {LEVELS.map(l=>(
              <div key={l} className="flex items-center gap-1.5 text-xs text-gray-600">
                <div className="w-3 h-3 rounded-full" style={{background:LEVEL_COLORS[l]}}/>
                {l}: <strong>{levelData.find(d=>d.name===l)?.count||0}</strong>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* Score distribution histogram */}
        <SectionCard title="Score Distribution" icon={BarChart2}>
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={histData} barSize={36}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
              <XAxis dataKey="label" tick={{fontSize:11}}/>
              <YAxis tick={{fontSize:11}}/>
              <Tooltip content={<CustomTooltip/>}/>
              <Bar dataKey="count" fill="#C8102E" radius={[4,4,0,0]} name="Employees"/>
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-2">
            <div className="w-full h-2 rounded-full overflow-hidden flex">
              {histData.map((b,i)=>(
                <div key={i} className="h-full transition-all" style={{flex: b.count, background: ['#C8102E','#EA580C','#F59E0B','#2563EB','#16A34A'][i]}}/>
              ))}
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Monthly trend */}
      {trendData.length > 0 && (
        <SectionCard title="Monthly Trend — Assessments Completed & Avg Score" icon={Activity}>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={trendData}>
              <defs>
                <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#C8102E" stopOpacity={0.15}/>
                  <stop offset="95%" stopColor="#C8102E" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
              <XAxis dataKey="month" tick={{fontSize:10}}/>
              <YAxis yAxisId="left" tick={{fontSize:11}}/>
              <YAxis yAxisId="right" orientation="right" domain={[0,100]} tick={{fontSize:11}}/>
              <Tooltip content={<CustomTooltip/>}/>
              <Legend/>
              <Bar yAxisId="left" dataKey="count" fill="#E5E7EB" radius={[3,3,0,0]} name="Completed"/>
              <Area yAxisId="right" type="monotone" dataKey="avgScore" stroke="#C8102E" fill="url(#scoreGrad)" strokeWidth={2} name="Avg Score (%)"/>
            </ComposedChart>
          </ResponsiveContainer>
        </SectionCard>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Top performers */}
        <SectionCard title="Top 10 Performers" icon={Star}>
          <div className="space-y-2.5">
            {(topEmployees||[]).map((p,i)=>(
              <div key={i} className="flex items-center gap-3">
                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${i===0?'bg-yellow-400 text-white':i===1?'bg-gray-300 text-gray-700':i===2?'bg-amber-600 text-white':'bg-gray-100 text-gray-500'}`}>{i+1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{p.name||'—'}</p>
                  <p className="text-xs text-gray-400 truncate">{p.department||'—'} · {p.position||'—'} · {p.count} result{p.count!==1?'s':''}</p>
                </div>
                <div className="flex-shrink-0 text-right">
                  <span className="text-sm font-bold text-green-600">{p.avgScore}%</span>
                  {p.expertCount > 0 && <p className="text-xs text-green-500">{p.expertCount} Expert</p>}
                </div>
              </div>
            ))}
            {(!topEmployees?.length) && <p className="text-sm text-gray-400 text-center py-6">No data</p>}
          </div>
        </SectionCard>

        {/* Needs support */}
        <SectionCard title="Needs Development Support" icon={TrendingDown}>
          <div className="space-y-2.5">
            {(bottomEmployees||[]).map((p,i)=>(
              <div key={i} className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-red-400">{i+1}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{p.name||'—'}</p>
                  <p className="text-xs text-gray-400 truncate">{p.department||'—'} · {p.count} result{p.count!==1?'s':''}</p>
                </div>
                <div className="flex-shrink-0 text-right">
                  <span className="text-sm font-bold text-red-500">{p.avgScore}%</span>
                  {p.basicCount > 0 && <p className="text-xs text-red-400">{p.basicCount} Basic</p>}
                </div>
              </div>
            ))}
            {(!bottomEmployees?.length) && <p className="text-sm text-gray-400 text-center py-6">No data</p>}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// WORKFORCE TAB
// ═══════════════════════════════════════════════════════════════════════════════
function WorkforceTab({ stats, loading }) {
  if (loading) return <LoadingSpinner/>;
  if (!stats) return <EmptyState msg="No data available."/>;
  const { departmentStats, genderStats, positionStats, targetGroupStats, supervisorStats } = stats;

  const deptData = (departmentStats||[]).slice(0,12).map(d => ({
    name: (d._id||'Unknown').length>14?(d._id||'Unknown').substring(0,14)+'…':(d._id||'Unknown'),
    fullName: d._id||'Unknown',
    avgScore: d.avgScore||0, count: d.count||0, employees: d.employeeCount||0,
    basic: d.basicCount||0, expert: d.expertCount||0,
  }));

  const posData = (positionStats||[]).slice(0,10).map(p=>({
    name:(p._id||'Unknown').length>18?(p._id||'Unknown').substring(0,18)+'…':(p._id||'Unknown'),
    avgScore:p.avgScore||0, count:p.count||0, employees:p.employeeCount||0,
  }));

  const genderColors = { Male:'#3B82F6', Female:'#EC4899', null:'#9CA3AF', undefined:'#9CA3AF' };

  return (
    <div className="space-y-5">
      {/* Department performance */}
      <SectionCard title="Department Performance Comparison" icon={Building2}>
        {deptData.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={deptData} barSize={22}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                <XAxis dataKey="name" tick={{fontSize:10}}/>
                <YAxis domain={[0,100]} tick={{fontSize:11}}/>
                <Tooltip content={({active,payload,label})=>{
                  if(!active||!payload?.length) return null;
                  const d = payload[0]?.payload;
                  return <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3 text-xs"><p className="font-bold text-gray-800 mb-1">{d.fullName}</p><p className="text-brand-red">Avg Score: <strong>{d.avgScore}%</strong></p><p className="text-gray-600">Results: {d.count} · Employees: {d.employees}</p><p className="text-green-600">Expert: {d.expert} · Basic: {d.basic}</p></div>;
                }}/>
                <Bar dataKey="avgScore" radius={[4,4,0,0]} name="Avg Score (%)">
                  {deptData.map((e,i)=><Cell key={i} fill={CHART_COLORS[i%CHART_COLORS.length]}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            {/* Department table */}
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="bg-gray-50 border-b border-gray-100">
                  {['Department','Results','Employees','Avg Score','Basic','Intermediate','Advanced','Expert'].map(h=>(
                    <th key={h} className="text-left px-3 py-2 font-semibold text-gray-600">{h}</th>
                  ))}
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {(departmentStats||[]).map((d,i)=>(
                    <tr key={i} className="hover:bg-gray-50/70">
                      <td className="px-3 py-2 font-medium text-gray-900">{d._id||'Unknown'}</td>
                      <td className="px-3 py-2 text-gray-600">{d.count}</td>
                      <td className="px-3 py-2 text-gray-600">{d.employeeCount}</td>
                      <td className="px-3 py-2"><ScoreBar score={d.avgScore}/></td>
                      <td className="px-3 py-2"><span className="text-amber-600 font-bold">{d.basicCount||0}</span></td>
                      <td className="px-3 py-2"><span className="text-orange-600 font-bold">{d.intermediateCount||0}</span></td>
                      <td className="px-3 py-2"><span className="text-blue-600 font-bold">{d.advancedCount||0}</span></td>
                      <td className="px-3 py-2"><span className="text-green-600 font-bold">{d.expertCount||0}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : <EmptyState msg="No department data."/>}
      </SectionCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Gender breakdown */}
        <SectionCard title="Gender Breakdown" icon={Users}>
          {genderStats?.length > 0 ? (
            <div className="space-y-3">
              {genderStats.map((g,i)=>(
                <div key={i}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-gray-800">{g._id||'Not specified'}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-500">{g.count} results</span>
                      <span className="text-sm font-bold" style={{color:genderColors[g._id]}}>{g.avgScore?.toFixed(1)}%</span>
                    </div>
                  </div>
                  <div className="flex gap-1 h-6">
                    {LEVELS.map(l=>{
                      const count = l==='Expert'?g.expertCount:l==='Basic'?g.basicCount:0;
                      const pct = g.count>0?(count/g.count*100):0;
                      return pct>0?<div key={l} className="h-full rounded" style={{width:`${pct}%`,background:LEVEL_COLORS[l]}} title={`${l}: ${count}`}/>:null;
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : <EmptyState msg="No gender data."/>}
        </SectionCard>

        {/* Target group */}
        <SectionCard title="Target Group Performance" icon={Target}>
          {targetGroupStats?.length > 0 ? (
            <div className="space-y-4">
              {targetGroupStats.map((t,i)=>(
                <div key={i} className="bg-gray-50 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-gray-900 capitalize">{(t._id||'Unknown').replace('-',' ')}</span>
                    <span className="text-sm font-bold text-brand-red">{t.avgScore}%</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span>{t.count} results</span>
                    <span className="text-green-600">{t.expertCount} Expert</span>
                    <span className="text-amber-600">{t.basicCount} Basic</span>
                  </div>
                  <div className="mt-2 flex-1 bg-gray-200 rounded-full h-1.5">
                    <div className="h-1.5 rounded-full bg-brand-red" style={{width:`${t.avgScore||0}%`}}/>
                  </div>
                </div>
              ))}
            </div>
          ) : <EmptyState msg="No target group data."/>}
        </SectionCard>
      </div>

      {/* Top positions */}
      {posData.length > 0 && (
        <SectionCard title="Top Positions by Volume" icon={Briefcase}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={posData} layout="vertical" barSize={16}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false}/>
              <XAxis type="number" domain={[0,100]} tick={{fontSize:10}}/>
              <YAxis type="category" dataKey="name" tick={{fontSize:10}} width={130}/>
              <Tooltip content={<CustomTooltip/>}/>
              <Bar dataKey="avgScore" fill="#C8102E" radius={[0,4,4,0]} name="Avg Score (%)"/>
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>
      )}

      {/* Supervisor team performance */}
      {supervisorStats?.length > 0 && (
        <SectionCard title="Supervisor Team Performance" icon={Shield}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>{['Supervisor','Department','Team Size','Results','Avg Score','Expert Count'].map(h=>(
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {supervisorStats.map((s,i)=>(
                  <tr key={i} className="hover:bg-gray-50/70">
                    <td className="px-4 py-3 font-semibold text-gray-900">{s.supervisorName||'—'}</td>
                    <td className="px-4 py-3 text-gray-600">{s.supervisorDept||'—'}</td>
                    <td className="px-4 py-3 text-gray-600">{s.teamSize}</td>
                    <td className="px-4 py-3 text-gray-600">{s.count}</td>
                    <td className="px-4 py-3 w-40"><ScoreBar score={s.avgScore}/></td>
                    <td className="px-4 py-3"><span className="text-green-600 font-bold">{s.expertCount}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPETENCIES TAB
// ═══════════════════════════════════════════════════════════════════════════════
function CompetenciesTab({ stats, heatmap, loading }) {
  if (loading) return <LoadingSpinner/>;
  if (!stats) return <EmptyState msg="No data available."/>;
  const { competencyStats } = stats;

  const comps = Object.keys(heatmap || {});
  const depts = [...new Set(Object.values(heatmap||{}).flatMap(a=>a.map(d=>d.department)))];

  return (
    <div className="space-y-5">
      {/* Competency ranking */}
      <SectionCard title="Competency Rankings by Avg Score" icon={Layers}>
        {(competencyStats||[]).length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>{['#','Competency','Category','Results','Avg Score','Best','Worst','Experts','Need Support'].map(h=>(
                  <th key={h} className="text-left px-3 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(competencyStats||[]).map((c,i)=>(
                  <tr key={i} className="hover:bg-gray-50/70">
                    <td className="px-3 py-3 text-gray-400 font-bold text-xs">{i+1}</td>
                    <td className="px-3 py-3 font-semibold text-gray-900 max-w-48"><p className="truncate">{c.name||c._id||'—'}</p></td>
                    <td className="px-3 py-3"><span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">{c.category||'—'}</span></td>
                    <td className="px-3 py-3 text-gray-600">{c.count}</td>
                    <td className="px-3 py-3 w-36"><ScoreBar score={c.avgScore}/></td>
                    <td className="px-3 py-3 text-green-600 font-semibold text-xs">{c.maxScore?.toFixed(1)}%</td>
                    <td className="px-3 py-3 text-red-500 font-semibold text-xs">{c.minScore?.toFixed(1)}%</td>
                    <td className="px-3 py-3"><span className="text-green-600 font-bold">{c.expertCount}</span></td>
                    <td className="px-3 py-3"><span className="text-amber-600 font-bold">{c.basicCount}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState msg="No competency data."/>}
      </SectionCard>

      {/* Category breakdown chart */}
      {(competencyStats||[]).length > 0 && (() => {
        const catMap = {};
        competencyStats.forEach(c => {
          const cat = c.category||'Other';
          if (!catMap[cat]) catMap[cat] = { count:0, totalScore:0, n:0 };
          catMap[cat].count += c.count; catMap[cat].totalScore += c.avgScore * c.count; catMap[cat].n += c.count;
        });
        const catData = Object.entries(catMap).map(([cat,v])=>({ name:cat, avgScore: parseFloat((v.totalScore/v.n).toFixed(1)), count:v.count }));
        return (
          <SectionCard title="Competency Category Performance" icon={Grid}>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={catData} barSize={30}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                <XAxis dataKey="name" tick={{fontSize:10}}/>
                <YAxis domain={[0,100]} tick={{fontSize:11}}/>
                <Tooltip content={<CustomTooltip/>}/>
                <Bar dataKey="avgScore" radius={[4,4,0,0]} name="Avg Score (%)">
                  {catData.map((_,i)=><Cell key={i} fill={CHART_COLORS[i%CHART_COLORS.length]}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </SectionCard>
        );
      })()}

      {/* Heatmap */}
      {comps.length > 0 && depts.length > 0 && (
        <SectionCard title="Competency × Department Heatmap" icon={Grid}
          action={<div className="flex items-center gap-2 flex-wrap">
            {[['≥80','bg-green-500'],['≥65','bg-blue-500'],['≥50','bg-yellow-400'],['≥35','bg-orange-500'],['<35','bg-red-500']].map(([l,c])=>(
              <div key={l} className="flex items-center gap-1 text-xs text-gray-500"><div className={`w-3 h-3 rounded ${c}`}/>{l}%</div>
            ))}
          </div>}>
          <div className="overflow-auto max-h-[500px]">
            <table className="text-xs min-w-max">
              <thead className="sticky top-0 bg-white z-10">
                <tr>
                  <th className="text-left px-3 py-2 text-gray-500 font-medium min-w-44 sticky left-0 bg-white">Competency</th>
                  {depts.map(d=>(
                    <th key={d} className="text-center px-2 py-2 text-gray-500 font-medium min-w-20 whitespace-nowrap">
                      {d.length>12?d.substring(0,12)+'…':d}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comps.map(comp=>{
                  const lookup = {};
                  (heatmap[comp]||[]).forEach(d=>{ lookup[d.department]=d; });
                  return (
                    <tr key={comp} className="border-t border-gray-50">
                      <td className="px-3 py-1.5 font-medium text-gray-800 sticky left-0 bg-white">{comp.length>28?comp.substring(0,28)+'…':comp}</td>
                      {depts.map(dept=>{
                        const cell = lookup[dept];
                        const { bg, text } = heatColor(cell?.avgScore);
                        return (
                          <td key={dept} className="px-1 py-1 text-center">
                            {cell ? (
                              <div className="inline-flex flex-col items-center justify-center w-16 h-9 rounded text-xs font-bold" style={{background:bg,color:text}} title={`${comp} / ${dept}: ${cell.avgScore}% (${cell.count})`}>
                                <span>{cell.avgScore}%</span>
                                <span className="opacity-70 text-[9px]">n={cell.count}</span>
                              </div>
                            ) : <div className="w-16 h-9 rounded bg-gray-50 inline-block"/>}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ASSESSMENTS TAB
// ═══════════════════════════════════════════════════════════════════════════════
function AssessmentsTab({ stats, loading }) {
  if (loading) return <LoadingSpinner/>;
  if (!stats) return <EmptyState msg="No data available."/>;
  const { assessmentStats, assessmentTypeStats, purposeStats } = stats;

  const typeData = (assessmentTypeStats||[]).map(t=>({ name:(t._id||'Unknown'), count:t.count, avgScore:t.avgScore||0 }));
  const purposeData = (purposeStats||[]).map(p=>({ name:p._id||'Other', count:p.count, avgScore:p.avgScore||0 }));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Type distribution */}
        <SectionCard title="Results by Assessment Type" icon={BarChart3}>
          {typeData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={typeData} barSize={36}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                <XAxis dataKey="name" tick={{fontSize:11}}/>
                <YAxis tick={{fontSize:11}}/>
                <Tooltip content={<CustomTooltip/>}/>
                <Bar dataKey="count" radius={[4,4,0,0]} name="Results">
                  {typeData.map((t,i)=><Cell key={i} fill={TYPE_COLORS[t.name]||CHART_COLORS[i]}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyState msg="No type data."/>}
        </SectionCard>

        {/* Purpose distribution */}
        <SectionCard title="Results by Purpose" icon={Target}>
          {purposeData.length > 0 ? (
            <div className="space-y-2">
              {purposeData.map((p,i)=>(
                <div key={i} className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{background:CHART_COLORS[i%CHART_COLORS.length]}}/>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-sm font-medium text-gray-800 truncate">{p.name}</span>
                      <span className="text-xs text-gray-500 ml-2 flex-shrink-0">{p.count} · {p.avgScore?.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full" style={{width:`${p.avgScore||0}%`,background:CHART_COLORS[i%CHART_COLORS.length]}}/>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : <EmptyState msg="No purpose data."/>}
        </SectionCard>
      </div>

      {/* Assessment details table */}
      <SectionCard title="Assessment-Level Breakdown" icon={BookOpen}>
        {(assessmentStats||[]).length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>{['Assessment','Type','Purpose','Status','Results','Avg Score','Pass Rate','Expert','Basic'].map(h=>(
                  <th key={h} className="text-left px-3 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(assessmentStats||[]).map((a,i)=>(
                  <tr key={i} className="hover:bg-gray-50/70">
                    <td className="px-3 py-3 font-medium text-gray-900 max-w-52"><p className="truncate">{a.description||'—'}</p></td>
                    <td className="px-3 py-3"><span className="text-xs px-2 py-0.5 rounded font-medium" style={{background:TYPE_COLORS[a.type]+'20',color:TYPE_COLORS[a.type]}}>{a.type}</span></td>
                    <td className="px-3 py-3 text-gray-500 text-xs">{a.purpose||'—'}</td>
                    <td className="px-3 py-3"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${a.status==='ACTIVE'?'bg-green-100 text-green-700':a.status==='COMPLETED'?'bg-blue-100 text-blue-700':'bg-gray-100 text-gray-600'}`}>{a.status}</span></td>
                    <td className="px-3 py-3 text-gray-600">{a.count}</td>
                    <td className="px-3 py-3 w-32"><ScoreBar score={a.avgScore}/></td>
                    <td className="px-3 py-3"><span className={`font-semibold text-sm ${a.passRate>=60?'text-green-600':'text-red-500'}`}>{a.passRate}%</span></td>
                    <td className="px-3 py-3 text-green-600 font-bold">{a.expertCount}</td>
                    <td className="px-3 py-3 text-amber-600 font-bold">{a.basicCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState msg="No assessment data."/>}
      </SectionCard>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DATA TABLE TAB
// ═══════════════════════════════════════════════════════════════════════════════
function DataTableTab({ filters, loading, results, pagination, goToPage, onPageSizeChange }) {
  const [expandedRow, setExpandedRow] = useState(null);

  if (loading) return <LoadingSpinner/>;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-gray-500">
          <strong className="text-gray-900">{pagination?.total?.toLocaleString()}</strong> results found
        </p>
        <select value={pagination?.limit||25} onChange={e=>onPageSizeChange(parseInt(e.target.value))}
          className="h-8 px-2 rounded-lg border border-gray-200 text-sm text-gray-600 focus:ring-2 focus:ring-brand-red">
          {[25,50,100,200].map(n=><option key={n} value={n}>{n} per page</option>)}
        </select>
      </div>

      {results.length === 0 ? (
        <EmptyState msg="No results match the current filters."/>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                <tr>
                  {['Employee','Dept','Competency','Category','Assessment Type','Score','Level','Purpose','Date','Status','Actions'].map(h=>(
                    <th key={h} className="text-left px-4 py-3.5 text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {results.map((r,i)=>(
                  <>
                    <tr key={r._id||i} className="hover:bg-gray-50/70 transition-colors">
                      <td className="px-4 py-3.5">
                        <p className="font-semibold text-gray-900 text-sm">{r.userName||'—'}</p>
                        <p className="text-xs text-gray-400">{r.userEmployeeId||''} · {r.userPosition||'—'}</p>
                      </td>
                      <td className="px-4 py-3.5 text-gray-600 text-sm">{r.userDepartment||'—'}</td>
                      <td className="px-4 py-3.5">
                        <p className="font-medium text-gray-900 max-w-36 truncate">{r.competencyName||'—'}</p>
                      </td>
                      <td className="px-4 py-3.5"><span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full whitespace-nowrap">{r.competencyCategory||'—'}</span></td>
                      <td className="px-4 py-3.5">
                        <span className="text-xs px-2 py-0.5 rounded font-medium whitespace-nowrap" style={{background:(TYPE_COLORS[r.assessmentType]||'#999')+'20',color:TYPE_COLORS[r.assessmentType]||'#666'}}>{r.assessmentType||'—'}</span>
                      </td>
                      <td className="px-4 py-3.5 w-36"><ScoreBar score={r.finalScore||0}/></td>
                      <td className="px-4 py-3.5"><LevelBadge level={r.level}/></td>
                      <td className="px-4 py-3.5 text-xs text-gray-500 whitespace-nowrap">{r.assessmentPurpose||'—'}</td>
                      <td className="px-4 py-3.5 text-xs text-gray-500 whitespace-nowrap">
                        <div className="flex items-center gap-1"><Calendar className="w-3 h-3"/>{r.createdAt?new Date(r.createdAt).toLocaleDateString():'—'}</div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.status==='FINAL'?'bg-green-100 text-green-700':'bg-yellow-100 text-yellow-700'}`}>{r.status}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <button onClick={()=>setExpandedRow(expandedRow===i?null:i)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
                          {expandedRow===i?<ChevronUp className="w-4 h-4"/>:<ChevronDown className="w-4 h-4"/>}
                        </button>
                      </td>
                    </tr>
                    {expandedRow===i && (
                      <tr key={`exp-${i}`} className="bg-blue-50/30">
                        <td colSpan={11} className="px-4 py-4">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                            <div><p className="text-gray-400 font-medium mb-1">Self Score</p><p className="font-bold text-gray-800">{r.selfScore!=null?`${r.selfScore?.toFixed(1)}%`:'N/A'}</p></div>
                            <div><p className="text-gray-400 font-medium mb-1">Supervisor Score</p><p className="font-bold text-gray-800">{r.supervisorScore!=null?`${r.supervisorScore?.toFixed(1)}%`:'N/A'}</p></div>
                            <div><p className="text-gray-400 font-medium mb-1">Questions</p><p className="font-bold text-gray-800">{r.totalQuestions||0} total · {r.correctAnswers||0} correct</p></div>
                            <div><p className="text-gray-400 font-medium mb-1">Gender</p><p className="font-bold text-gray-800">{r.userGender||'—'}</p></div>
                            <div className="md:col-span-2"><p className="text-gray-400 font-medium mb-1">Assessment</p><p className="font-medium text-gray-800">{r.assessmentDescription||'—'}</p></div>
                            <div><p className="text-gray-400 font-medium mb-1">Target Group</p><p className="font-bold text-gray-800">{r.assessmentTargetGroup||'—'}</p></div>
                            <div><p className="text-gray-400 font-medium mb-1">Assessment Status</p><p className="font-bold text-gray-800">{r.assessmentStatus||'—'}</p></div>
                            {r.recommendation && <div className="md:col-span-4"><p className="text-gray-400 font-medium mb-1">Recommendation</p><p className="text-gray-700">{r.recommendation}</p></div>}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-4">
            <Paginator pagination={pagination} goToPage={goToPage}/>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEEP DIVE TAB
// ═══════════════════════════════════════════════════════════════════════════════
function DeepDiveTab({ employees, loading }) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const { show } = useToast();

  const filtered = useMemo(() => {
    if (!search) return employees.slice(0, 20);
    const q = search.toLowerCase();
    return employees.filter(e =>
      e.name?.toLowerCase().includes(q) || e.email?.toLowerCase().includes(q) ||
      e.employeeId?.toLowerCase().includes(q) || e.department?.toLowerCase().includes(q)
    ).slice(0, 20);
  }, [employees, search]);

  const loadProfile = async (emp) => {
    setSelected(emp);
    setLoadingProfile(true);
    try {
      const { data } = await api.get(`/reports/advanced/employee/${emp._id}`);
      setProfile(data.data);
    } catch { show('Failed to load employee profile.', 'error'); }
    setLoadingProfile(false);
  };

  if (loading) return <LoadingSpinner/>;

  const radarData = (profile?.competencyProgress || []).slice(0, 8).map(c => ({
    subject: c.name?.length > 14 ? c.name.substring(0, 14) + '…' : c.name,
    score: c.latestScore || 0, fullMark: 100,
  }));

  return (
    <div className="space-y-5">
      {/* Employee selector */}
      <SectionCard title="Select Employee for Deep Dive" icon={Search}>
        <div className="flex gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"/>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by name, email, ID, department..."
              className="w-full h-9 pl-9 pr-3 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-brand-red"/>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 max-h-72 overflow-y-auto">
          {filtered.map(emp=>(
            <button key={emp._id} onClick={()=>loadProfile(emp)}
              className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${selected?._id===emp._id?'border-brand-red bg-brand-red/5':'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}>
              <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center font-bold text-sm text-gray-600 flex-shrink-0">
                {emp.name?.charAt(0) || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 text-sm truncate">{emp.name}</p>
                <p className="text-xs text-gray-400 truncate">{emp.department} · {emp.position||'—'}</p>
              </div>
            </button>
          ))}
        </div>
      </SectionCard>

      {/* Profile */}
      {loadingProfile && <LoadingSpinner/>}
      {profile && !loadingProfile && (
        <>
          {/* Header */}
          <div className="bg-gradient-to-r from-gray-900 to-gray-700 rounded-xl p-6 text-white">
            <div className="flex items-start gap-5">
              <div className="w-14 h-14 rounded-xl bg-white/20 flex items-center justify-center font-bold text-2xl flex-shrink-0">
                {profile.employee?.name?.charAt(0)||'?'}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-bold">{profile.employee?.name}</h2>
                <p className="text-gray-300 text-sm">{profile.employee?.position||'—'} · {profile.employee?.department||'—'}</p>
                <p className="text-gray-400 text-xs mt-1">{profile.employee?.email} · ID: {profile.employee?.employeeId}</p>
              </div>
              <div className="flex flex-col gap-2 flex-shrink-0">
                <span className={`text-xs px-3 py-1 rounded-full font-semibold ${profile.employee?.status==='ACTIVE'?'bg-green-500/30 text-green-300':'bg-red-500/30 text-red-300'}`}>{profile.employee?.status}</span>
                <span className="text-xs px-3 py-1 rounded-full bg-blue-500/30 text-blue-300">{profile.employee?.gender||'—'}</span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 mt-5">
              {[['Total Assessments', profile.results?.length||0], ['Competencies', profile.competencyProgress?.length||0], ['Avg Score', `${profile.competencyProgress?.length ? (profile.competencyProgress.reduce((s,c)=>s+c.avgScore,0)/profile.competencyProgress.length).toFixed(1) : 0}%`]].map(([label,val])=>(
                <div key={label} className="bg-white/10 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold">{val}</p>
                  <p className="text-gray-400 text-xs mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Radar chart */}
            {radarData.length > 0 && (
              <SectionCard title="Competency Radar" icon={Target}>
                <ResponsiveContainer width="100%" height={260}>
                  <RadarChart data={radarData}>
                    <PolarGrid/>
                    <PolarAngleAxis dataKey="subject" tick={{fontSize:10}}/>
                    <PolarRadiusAxis angle={30} domain={[0,100]} tick={{fontSize:9}}/>
                    <Radar name="Score" dataKey="score" stroke="#C8102E" fill="#C8102E" fillOpacity={0.3}/>
                    <Tooltip/>
                  </RadarChart>
                </ResponsiveContainer>
              </SectionCard>
            )}

            {/* Competency progress */}
            <SectionCard title="Competency Progress" icon={Layers}>
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {(profile.competencyProgress||[]).map((c,i)=>(
                  <div key={i} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-medium text-gray-800 truncate">{c.name}</p>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                          <LevelBadge level={c.latestLevel}/>
                          <span className="text-sm font-bold text-gray-900">{c.latestScore?.toFixed(1)}%</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <span>Best: {c.bestScore?.toFixed(1)}%</span>
                        <span>·</span>
                        <span>Avg: {c.avgScore?.toFixed(1)}%</span>
                        <span>·</span>
                        <span>{c.attempts} attempt{c.attempts!==1?'s':''}</span>
                      </div>
                      <div className="mt-1.5 bg-gray-100 rounded-full h-1.5">
                        <div className="h-1.5 rounded-full bg-brand-red" style={{width:`${c.latestScore||0}%`}}/>
                      </div>
                    </div>
                  </div>
                ))}
                {(!profile.competencyProgress?.length) && <EmptyState msg="No competency data."/>}
              </div>
            </SectionCard>
          </div>

          {/* Assessment history */}
          <SectionCard title="Full Assessment History" icon={Clock}>
            {(profile.results||[]).length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>{['Assessment','Competency','Type','Score','Level','Status','Date'].map(h=>(
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {(profile.results||[]).map((r,i)=>(
                      <tr key={i} className="hover:bg-gray-50/70">
                        <td className="px-4 py-3 font-medium text-gray-900 max-w-48"><p className="truncate">{r.assessmentId?.description||'—'}</p></td>
                        <td className="px-4 py-3 text-gray-700">{r.competencyId?.name||'—'}</td>
                        <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 rounded font-medium" style={{background:(TYPE_COLORS[r.assessmentId?.type]||'#999')+'20',color:TYPE_COLORS[r.assessmentId?.type]||'#666'}}>{r.assessmentId?.type||'—'}</span></td>
                        <td className="px-4 py-3 w-32"><ScoreBar score={r.finalScore||0}/></td>
                        <td className="px-4 py-3"><LevelBadge level={r.level}/></td>
                        <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.status==='FINAL'?'bg-green-100 text-green-700':'bg-yellow-100 text-yellow-700'}`}>{r.status}</span></td>
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{r.createdAt?new Date(r.createdAt).toLocaleDateString():'—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <EmptyState msg="No assessment history."/>}
          </SectionCard>
        </>
      )}
    </div>
  );
}

// ─── Loading / Empty helpers ──────────────────────────────────────────────────
const LoadingSpinner = () => (
  <div className="flex items-center justify-center p-16">
    <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin"/>
  </div>
);

const EmptyState = ({ msg }) => (
  <div className="text-center py-12">
    <FileText className="w-10 h-10 text-gray-200 mx-auto mb-3"/>
    <p className="text-gray-400 text-sm">{msg}</p>
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export default function Reports() {
  const { user, isAdmin } = useAuth();
  const { show } = useToast();

  // ── Tab ───────────────────────────────────────────────────────────────────
  const TABS = isAdmin ? [
    { id:'overview',     label:'Overview',     icon:BarChart3  },
    { id:'workforce',    label:'Workforce',    icon:Users      },
    { id:'competencies', label:'Competencies', icon:Layers     },
    { id:'assessments',  label:'Assessments',  icon:BookOpen   },
    { id:'data',         label:'Data Table',   icon:List       },
    { id:'deepdive',     label:'Deep Dive',    icon:Eye        },
  ] : [{ id:'individual', label:'My Reports', icon:UserIcon }];
  const [tab, setTab] = useState(isAdmin ? 'overview' : 'individual');

  // ── Filters ───────────────────────────────────────────────────────────────
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS });
  const [showFilters, setShowFilters] = useState(false);
  const [filterOptions, setFilterOptions] = useState({});
  const activeFilterCount = Object.entries(filters).filter(([k,v])=>v&&!['sortBy','sortDir'].includes(k)).length;

  // ── Data ──────────────────────────────────────────────────────────────────
  const [stats, setStats]       = useState(null);
  const [heatmap, setHeatmap]   = useState({});
  const [results, setResults]   = useState([]);
  const [employees, setEmployees] = useState([]);
  const [pagination, setPagination] = useState({ page:1, limit:25, total:0, totalPages:0 });
  const [loadingStats, setLoadingStats]     = useState(false);
  const [loadingResults, setLoadingResults] = useState(false);
  const [loadingHeatmap, setLoadingHeatmap] = useState(false);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [exporting, setExporting] = useState(null); // 'pdf' | 'excel'

  // ── Load filter options ────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAdmin) return;
    api.get('/reports/advanced/filter-options')
      .then(({ data }) => setFilterOptions(data.data))
      .catch(() => {});
  }, [isAdmin]);

  // ── Load employees ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAdmin) return;
    setLoadingEmployees(true);
    api.get('/reports/advanced/employees', { params:{ limit:500 } })
      .then(({ data }) => setEmployees(data.data.employees || []))
      .catch(() => {})
      .finally(() => setLoadingEmployees(false));
  }, [isAdmin]);

  // ── Build API params from filters ─────────────────────────────────────────
  const filterParams = useMemo(() => {
    const p = {};
    Object.entries(filters).forEach(([k,v]) => { if (v) p[k] = v; });
    return p;
  }, [filters]);

  // ── Load stats ─────────────────────────────────────────────────────────────
  const loadStats = useCallback(async () => {
    if (!isAdmin) return;
    setLoadingStats(true);
    try {
      const { data } = await api.get('/reports/advanced/stats', { params: filterParams });
      setStats(data.data);
    } catch { show('Failed to load analytics.', 'error'); }
    setLoadingStats(false);
  }, [filterParams, isAdmin]);

  // ── Load heatmap ───────────────────────────────────────────────────────────
  const loadHeatmap = useCallback(async () => {
    if (!isAdmin) return;
    setLoadingHeatmap(true);
    try {
      const { data } = await api.get('/reports/advanced/heatmap', { params: filterParams });
      setHeatmap(data.data.heatmap || {});
    } catch {}
    setLoadingHeatmap(false);
  }, [filterParams, isAdmin]);

  // ── Load results table ─────────────────────────────────────────────────────
  const loadResults = useCallback(async (page = 1, lim = pagination.limit) => {
    if (!isAdmin) return;
    setLoadingResults(true);
    try {
      const { data } = await api.get('/reports/advanced/results', {
        params: { ...filterParams, page, limit: lim },
      });
      setResults(data.data.results || []);
      setPagination(prev => ({ ...prev, page, limit: lim, ...data.data.pagination }));
    } catch { show('Failed to load data.', 'error'); }
    setLoadingResults(false);
  }, [filterParams, isAdmin, pagination.limit]);

  // ── Re-load when tab changes or filters change ────────────────────────────
  useEffect(() => {
    if (!isAdmin) return;
    if (['overview','workforce','assessments'].includes(tab)) loadStats();
    if (tab === 'competencies') { loadStats(); loadHeatmap(); }
    if (tab === 'data') loadResults(1);
  }, [tab, filters]);

  // ── Export ────────────────────────────────────────────────────────────────
  const doExport = async (format) => {
    setExporting(format);
    try {
      const res = await api.get(`/reports/advanced/export/${format}`, {
        params: filterParams, responseType:'blob',
      });
      const ext = format === 'pdf' ? 'pdf' : 'xlsx';
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hr_report_${new Date().toISOString().split('T')[0]}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
      show(`Exported as ${format.toUpperCase()}.`, 'success');
    } catch (err) {
      show(err.response?.status === 404 ? 'No data for export.' : 'Export failed.', 'error');
    }
    setExporting(null);
  };

  if (!isAdmin) {
    return (
      <div className="p-7">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">My Reports</h1>
        <p className="text-gray-500">Your assessment history and progress.</p>
        {/* minimal employee view */}
        <div className="mt-6 bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center">
          <BookOpen className="w-12 h-12 text-gray-200 mx-auto mb-3"/>
          <p className="text-gray-500">Contact your HR admin to view detailed reports.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Fixed header ── */}
      <div className="flex-shrink-0 px-7 pt-7 pb-0 bg-white shadow-sm z-10">

        {/* Page title */}
        <div className="flex justify-between items-start mb-5 flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Reports & Analytics</h1>
            <p className="text-gray-500 mt-0.5 text-sm">Comprehensive HR competency intelligence — every dimension, every condition.</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={()=>setShowFilters(v=>!v)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border font-semibold text-sm transition-all ${showFilters||activeFilterCount>0?'border-brand-red bg-brand-red/10 text-brand-red':'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
              <SlidersHorizontal className="w-4 h-4"/>
              Filters
              {activeFilterCount>0 && <span className="w-5 h-5 rounded-full bg-brand-red text-white text-xs flex items-center justify-center">{activeFilterCount}</span>}
            </button>
            <button onClick={()=>{ if(tab==='data') loadResults(1); else loadStats(); if(tab==='competencies') loadHeatmap(); }}
              className="p-2.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors">
              <RefreshCw className="w-4 h-4"/>
            </button>
            <button onClick={()=>doExport('excel')} disabled={!!exporting}
              className="flex items-center gap-2 px-3.5 py-2.5 border border-gray-300 rounded-l-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50">
              {exporting==='excel'?<Loader2 className="w-4 h-4 animate-spin"/>:<FileSpreadsheet className="w-4 h-4 text-green-600"/>}Excel
            </button>
            <button onClick={()=>doExport('pdf')} disabled={!!exporting}
              className="flex items-center gap-2 px-3.5 py-2.5 border border-l-0 border-gray-300 rounded-r-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50">
              {exporting==='pdf'?<Loader2 className="w-4 h-4 animate-spin"/>:<FileText className="w-4 h-4 text-red-500"/>}PDF
            </button>
          </div>
        </div>

        {/* Filter panel */}
        {showFilters && (
          <FilterPanel
            filters={filters}
            setFilters={setFilters}
            options={filterOptions}
            onApply={()=>setShowFilters(false)}
            onClear={()=>setFilters({...EMPTY_FILTERS})}
            onClose={()=>setShowFilters(false)}
          />
        )}

        {/* Active filter chips (compact) */}
        {activeFilterCount > 0 && !showFilters && (
          <div className="flex flex-wrap gap-2 mb-3">
            {Object.entries(filters).filter(([k,v])=>v&&!['sortBy','sortDir'].includes(k)).map(([k,v])=>(
              <span key={k} className="inline-flex items-center gap-1 px-2.5 py-1 bg-brand-red/10 text-brand-red text-xs rounded-full font-medium">
                {k.replace(/([A-Z])/g,' $1').replace(/^./,s=>s.toUpperCase())}: {String(v).substring(0,20)}
                <button onClick={()=>setFilters(p=>({...p,[k]:''}))}><X className="w-3 h-3"/></button>
              </span>
            ))}
            <button onClick={()=>setFilters({...EMPTY_FILTERS})} className="text-xs text-gray-500 hover:text-red-500 px-2 font-medium">Clear all</button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 overflow-x-auto">
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${tab===t.id?'bg-white text-brand-red shadow-sm':'text-gray-600 hover:text-gray-900'}`}>
              <t.icon className="w-4 h-4"/>
              {t.label}
            </button>
          ))}
        </div>
        <div className="h-px bg-gray-100 mt-0"/>
      </div>

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-y-auto px-7 py-6 min-h-0">
        {tab === 'overview'     && <OverviewTab     stats={stats}     loading={loadingStats}/>}
        {tab === 'workforce'    && <WorkforceTab    stats={stats}     loading={loadingStats}/>}
        {tab === 'competencies' && <CompetenciesTab stats={stats}     loading={loadingStats||loadingHeatmap} heatmap={heatmap}/>}
        {tab === 'assessments'  && <AssessmentsTab  stats={stats}     loading={loadingStats}/>}
        {tab === 'data'         && (
          <DataTableTab
            filters={filters}
            loading={loadingResults}
            results={results}
            pagination={pagination}
            goToPage={p=>loadResults(p)}
            onPageSizeChange={l=>loadResults(1,l)}
          />
        )}
        {tab === 'deepdive'     && <DeepDiveTab employees={employees} loading={loadingEmployees}/>}
      </div>
    </div>
  );
}
