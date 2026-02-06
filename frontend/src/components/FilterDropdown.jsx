import { Filter } from 'lucide-react';

export default function FilterDropdown({ label, value, onChange, options, placeholder = 'All' }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 pl-3 pr-8 rounded-lg border border-gray-300 focus-brand text-sm appearance-none bg-white cursor-pointer min-w-[140px]"
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <Filter className="w-3 h-3 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
    </div>
  );
}
