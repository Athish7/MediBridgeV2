import React, { useMemo, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  Clock,
  FilePlus2,
  Info,
  MapPin,
  Phone,
  Search,
  X,
} from 'lucide-react';
import { useClinBridge } from '../context/ClinBridgeContext';
import type { Specialist } from '../types/clinbridge';

export const SpecialistDirectoryPage: React.FC = () => {
  const { specialists, startNewReferral } = useClinBridge();

  const [search, setSearch] = useState('');
  const [specialtyFilter, setSpecialtyFilter] = useState('All');
  const [locationFilter, setLocationFilter] = useState('All');
  const [sortBy, setSortBy] = useState<'wait-asc' | 'name-asc'>('wait-asc');
  const [activeProfile, setActiveProfile] = useState<Specialist | null>(null);

  const specialties = useMemo(
    () => ['All', ...Array.from(new Set(specialists.map((s) => s.specialty))).sort()],
    [specialists]
  );

  const locations = useMemo(
    () => ['All', ...Array.from(new Set(specialists.map((s) => s.location))).sort()],
    [specialists]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = specialists.filter((sp) => {
      const matchSpec = specialtyFilter === 'All' || sp.specialty === specialtyFilter;
      const matchLoc = locationFilter === 'All' || sp.location === locationFilter;
      const matchQuery =
        !q ||
        sp.name.toLowerCase().includes(q) ||
        sp.clinic.toLowerCase().includes(q) ||
        sp.specialty.toLowerCase().includes(q) ||
        sp.subspecialties.some((sub) => sub.toLowerCase().includes(q));
      return matchSpec && matchLoc && matchQuery;
    });

    return [...list].sort((a, b) =>
      sortBy === 'wait-asc'
        ? a.estimatedWaitWeeks - b.estimatedWaitWeeks
        : a.name.localeCompare(b.name)
    );
  }, [specialists, search, specialtyFilter, locationFilter, sortBy]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
          Specialist Directory
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Compare specialist intake requirements, clinic locations, and estimated consultation wait times before initiating a referral.
        </p>
      </div>

      {/* Fictional Directory Disclaimer */}
      <div className="bg-slate-100 border border-slate-200 rounded-xl px-4 py-3 flex items-start gap-2.5 text-xs text-slate-700">
        <Info className="w-4 h-4 text-[#0F2942] shrink-0 mt-0.5" />
        <span>
          <strong className="font-semibold text-slate-900">Demonstration Directory Notice:</strong>{' '}
          All specialists, clinics, addresses, and wait-time estimates below are fictional demonstration data and do not represent real healthcare providers or live scheduling availability.
        </span>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search specialist, clinic, or subspecialty..."
            aria-label="Search specialists"
            className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-[#0F2942]"
          />
        </div>

        <select
          value={specialtyFilter}
          onChange={(e) => setSpecialtyFilter(e.target.value)}
          aria-label="Filter by specialty"
          className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-700"
        >
          {specialties.map((sp) => (
            <option key={sp} value={sp}>
              {sp === 'All' ? 'All Specialties' : sp}
            </option>
          ))}
        </select>

        <select
          value={locationFilter}
          onChange={(e) => setLocationFilter(e.target.value)}
          aria-label="Filter by location"
          className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-700"
        >
          {locations.map((loc) => (
            <option key={loc} value={loc}>
              {loc === 'All' ? 'All Locations' : loc}
            </option>
          ))}
        </select>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'wait-asc' | 'name-asc')}
          aria-label="Sort specialists"
          className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-700"
        >
          <option value="wait-asc">Sort: Shortest Estimated Wait</option>
          <option value="name-asc">Sort: Name (A–Z)</option>
        </select>
      </div>

      {/* Specialist Grid */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
          No specialists match your search criteria.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((sp) => (
            <div
              key={sp.id}
              className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4 hover:border-slate-300 transition-colors"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-medium text-teal-700">
                      {sp.specialty} · {sp.subspecialties.join(', ')}
                    </div>
                    <h2 className="font-display text-lg font-semibold text-slate-900 mt-0.5">
                      {sp.name}, {sp.credentials}
                    </h2>
                    <div className="text-sm text-slate-600 flex items-center gap-1.5 mt-0.5">
                      <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{sp.clinic}</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 pt-2 border-t border-slate-100">
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    {sp.location}
                    {sp.distanceLabel ? ` · ${sp.distanceLabel}` : ''}
                  </span>
                  <span className="inline-flex items-center gap-1 font-mono font-medium text-slate-800">
                    <Clock className="w-3.5 h-3.5 text-teal-700" />
                    {sp.estimatedWait}
                  </span>
                </div>

                <div className="text-xs text-slate-600 space-y-1">
                  <div className="font-semibold text-slate-800">
                    Referral Intake Requirements:
                  </div>
                  <ul className="space-y-0.5 text-slate-600">
                    {sp.intakeRequirements.slice(0, 3).map((req) => (
                      <li key={req} className="flex items-start gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-teal-600 shrink-0 mt-0.5" />
                        <span>{req}</span>
                      </li>
                    ))}
                    {sp.intakeRequirements.length > 3 && (
                      <li className="text-slate-400 pl-5">
                        +{sp.intakeRequirements.length - 3} more requirement
                      </li>
                    )}
                  </ul>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setActiveProfile(sp)}
                  className="text-xs font-medium text-[#0F2942] hover:text-teal-700"
                >
                  View Clinic Profile →
                </button>
                <button
                  type="button"
                  onClick={() => startNewReferral({ specialistId: sp.id })}
                  className="px-3.5 py-1.5 text-xs font-medium text-white bg-[#0F2942] hover:bg-[#173A5C] rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <FilePlus2 className="w-3.5 h-3.5" />
                  <span>Select for Referral</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Specialist Detail Modal */}
      {activeProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40">
          <div className="bg-white border border-slate-200 rounded-xl max-w-xl w-full p-6 shadow-xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <div className="text-xs font-medium text-teal-700">
                  {activeProfile.specialty} · {activeProfile.subspecialties.join(', ')}
                </div>
                <h2 className="font-display text-xl font-bold text-slate-900 mt-0.5">
                  {activeProfile.name}, {activeProfile.credentials}
                </h2>
                <div className="text-sm text-slate-600">{activeProfile.clinic}</div>
              </div>
              <button
                type="button"
                onClick={() => setActiveProfile(null)}
                aria-label="Close specialist profile"
                className="p-1.5 text-slate-400 hover:text-slate-800 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 space-y-1">
                <div className="text-slate-500">Clinic Location & Contact</div>
                <div className="font-medium text-slate-900 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  {activeProfile.address}
                </div>
                <div className="text-slate-600 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  {activeProfile.phone}
                </div>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 space-y-1">
                <div className="text-slate-500">Estimated Wait Time (Demo)</div>
                <div className="font-mono font-semibold text-slate-900 text-sm">
                  {activeProfile.estimatedWait}
                </div>
                <div className="text-slate-500">
                  Fictional estimate for demonstration only.
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-slate-900">
                Required Intake Documentation
              </h3>
              <ul className="space-y-1.5 text-sm text-slate-700">
                {activeProfile.intakeRequirements.map((req) => (
                  <li key={req} className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                    <span>{req}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-slate-900">
                Accepted Referral Information Formats
              </h3>
              <ul className="space-y-1 text-xs text-slate-600 list-disc list-inside">
                {activeProfile.acceptedInformation.map((info) => (
                  <li key={info}>{info}</li>
                ))}
              </ul>
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setActiveProfile(null)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  const id = activeProfile.id;
                  setActiveProfile(null);
                  startNewReferral({ specialistId: id });
                }}
                className="px-4 py-2 text-xs font-medium text-white bg-[#0F2942] hover:bg-[#173A5C] rounded-lg inline-flex items-center gap-1.5"
              >
                <FilePlus2 className="w-4 h-4" />
                <span>Start Referral to {activeProfile.name}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
