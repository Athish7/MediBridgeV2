import React, { useMemo, useState } from 'react';
import {
  Activity,
  Bell,
  Building2,
  CalendarCheck,
  Check,
  CheckCircle2,
  ClipboardCheck,
  FilePlus2,
  FolderKanban,
  Inbox,
  LayoutDashboard,
  Menu,
  Search,
  Settings,
  ShieldAlert,
  Stethoscope,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { useClinBridge } from '../context/ClinBridgeContext';
import type { NavSection, Perspective } from '../types/clinbridge';

const PHYSICIAN_AVATAR_URL = '/src/assets/images/physician_avatar_1795145262636.jpg';

interface NavItem {
  id: NavSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

const SECTION_TITLES: Record<NavSection, string> = {
  dashboard: 'Referral Coordination Overview',
  referrals: 'Referral Management',
  'new-referral': 'New Referral Workflow',
  specialists: 'Specialist Directory',
  'patient-portal': 'Patient Portal Preview',
  settings: 'Workspace Settings',
  'specialist-dashboard': 'Specialist Clinic Dashboard',
  'specialist-inbox': 'Incoming Referrals Inbox',
  'specialist-review': 'Detailed Referral Review',
  'specialist-accepted': 'Accepted Referrals',
  'specialist-appointments': 'Appointment Management',
  'specialist-patients': 'Clinic Patient Records',
  'specialist-settings': 'Specialist Clinic Settings',
};

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    referrals,
    specialists,
    perspective,
    switchPerspective,
    activeSection,
    setActiveSection,
    selectedReferralId,
    specialistReviewReferralId,
    openSpecialistReview,
    notifications,
    markNotificationRead,
    dismissNotification,
    markAllNotificationsRead,
    openReferralRecord,
    startNewReferral,
    settings,
    globalSearchQuery,
    setGlobalSearchQuery,
    toastMessage,
  } = useClinBridge();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);

  const visibleNotifications = useMemo(
    () =>
      notifications.filter((n) => {
        if (!n.audience || n.audience === 'all') return true;
        if (perspective === 'specialist') return n.audience === 'specialist';
        if (perspective === 'physician') return n.audience === 'physician';
        if (perspective === 'patient') return n.audience === 'patient';
        return true;
      }),
    [notifications, perspective]
  );

  const unreadCount = visibleNotifications.filter((n) => !n.read).length;

  const physicianUnreadMessagesCount = useMemo(
    () =>
      referrals.reduce(
        (acc, r) =>
          acc + (r.communications ?? []).filter((m) => !m.readByPhysician).length,
        0
      ),
    [referrals]
  );

  const specialistUnreadMessagesCount = useMemo(
    () =>
      referrals.reduce(
        (acc, r) =>
          acc + (r.communications ?? []).filter((m) => !m.readBySpecialist).length,
        0
      ),
    [referrals]
  );

  const incomingReviewCount = useMemo(
    () =>
      referrals.filter(
        (r) =>
          r.status === 'Submitted' ||
          r.status === 'Awaiting Specialist Review' ||
          r.status === 'Anonymous Information Reviewed' ||
          r.status === 'Confidentiality Agreement Accepted' ||
          r.status === 'Full Information Unlocked' ||
          r.status === 'Awaiting Specialist Decision'
      ).length,
    [referrals]
  );

  const physicianNavItems: NavItem[] = useMemo(
    () => [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      {
        id: 'referrals',
        label: 'Referrals',
        icon: FolderKanban,
        badge: physicianUnreadMessagesCount > 0 ? physicianUnreadMessagesCount : undefined,
      },
      { id: 'new-referral', label: 'New Referral', icon: FilePlus2 },
      { id: 'specialists', label: 'Specialist Directory', icon: Users },
      { id: 'patient-portal', label: 'Patient Portal Preview', icon: UserCheck },
      { id: 'settings', label: 'Settings', icon: Settings },
    ],
    [physicianUnreadMessagesCount]
  );

  const specialistNavItems: NavItem[] = useMemo(
    () => [
      { id: 'specialist-dashboard', label: 'Specialist Dashboard', icon: LayoutDashboard },
      {
        id: 'specialist-inbox',
        label: 'Incoming Referrals',
        icon: Inbox,
        badge: incomingReviewCount > 0 ? incomingReviewCount : undefined,
      },
      {
        id: 'specialist-review',
        label: 'Referral Review',
        icon: ClipboardCheck,
        badge: specialistUnreadMessagesCount > 0 ? specialistUnreadMessagesCount : undefined,
      },
      { id: 'specialist-accepted', label: 'Accepted Referrals', icon: CheckCircle2 },
      { id: 'specialist-appointments', label: 'Appointment Management', icon: CalendarCheck },
      { id: 'specialist-patients', label: 'Patient Records', icon: Users },
      { id: 'specialist-settings', label: 'Settings', icon: Settings },
    ],
    [incomingReviewCount, specialistUnreadMessagesCount]
  );

  const activeNavItems =
    perspective === 'specialist' ? specialistNavItems : physicianNavItems;

  const activeSpecialistProfile = useMemo(
    () => specialists.find((s) => s.id === settings.specialistProfileId),
    [specialists, settings.specialistProfileId]
  );

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && globalSearchQuery.trim()) {
      if (perspective === 'specialist') {
        setActiveSection('specialist-inbox');
      } else {
        setActiveSection('referrals');
      }
    }
  };

  const handleReviewNextInQueue = () => {
    const nextPending =
      referrals.find(
        (r) =>
          r.status === 'Submitted' ||
          r.status === 'Awaiting Specialist Review' ||
          r.status === 'Anonymous Information Reviewed' ||
          r.status === 'Awaiting Specialist Decision'
      ) ?? referrals.find((r) => r.status !== 'Draft' && r.status !== 'Awaiting Specialist Selection');
    if (nextPending) {
      openSpecialistReview(nextPending.id);
    } else {
      setActiveSection('specialist-inbox');
    }
  };

  const headerTitle =
    perspective === 'physician' && selectedReferralId
      ? `Shared Referral Record · ${selectedReferralId}`
      : perspective === 'specialist' && activeSection === 'specialist-review' && specialistReviewReferralId
        ? `Specialist Referral Review · ${specialistReviewReferralId}`
        : SECTION_TITLES[activeSection];

  const SidebarContent = (
    <div className="flex flex-col h-full bg-[#0F2942] text-slate-100 select-none">
      {/* Brand mark */}
      <div className="px-5 py-5 border-b border-white/10">
        <button
          type="button"
          onClick={() => {
            setActiveSection(
              perspective === 'specialist' ? 'specialist-dashboard' : 'dashboard'
            );
            setMobileMenuOpen(false);
          }}
          className="flex items-center gap-2.5 text-left w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 rounded-lg"
        >
          <div className="w-8 h-8 rounded-lg bg-teal-500/20 border border-teal-400/30 flex items-center justify-center shrink-0">
            <Activity className="w-4 h-4 text-teal-300" />
          </div>
          <div>
            <div className="font-display text-base font-bold tracking-tight text-white whitespace-nowrap">
              MediBridge
            </div>
            <div className="text-[11px] text-slate-300 leading-tight">
              {perspective === 'specialist'
                ? 'Specialist Intake Portal'
                : perspective === 'patient'
                  ? 'Patient Transparency'
                  : 'Referral Coordination'}
            </div>
          </div>
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Primary Navigation">
        {activeNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (item.id === 'new-referral') {
                  startNewReferral();
                } else {
                  setActiveSection(item.id);
                }
                setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-white/12 text-white'
                  : 'text-slate-300 hover:bg-white/6 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-3 min-w-0">
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-teal-300' : 'text-slate-400'}`} />
                <span className="truncate">{item.label}</span>
              </span>
              {typeof item.badge === 'number' && (
                <span className="font-mono text-[11px] font-semibold px-1.5 py-0.5 rounded bg-teal-500/25 text-teal-200 tabular-nums shrink-0">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Demo notice */}
      <div className="mx-3 mb-3 p-3 rounded-lg bg-white/5 border border-white/10 text-[11px] text-slate-300 leading-relaxed">
        <div className="flex items-center gap-1.5 font-medium text-teal-300 mb-1">
          <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
          <span>Demo Environment</span>
        </div>
        Prototype using fictional patient, clinic, and wait-time data. Not for clinical use.
      </div>

      {/* Active Profile Footer */}
      {perspective === 'specialist' ? (
        <div className="px-4 py-3.5 border-t border-white/10 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-teal-600/30 border border-teal-400/30 text-teal-200 text-xs font-semibold flex items-center justify-center shrink-0">
            {activeSpecialistProfile
              ? activeSpecialistProfile.name
                  .replace('Dr. ', '')
                  .split(' ')
                  .map((p) => p[0])
                  .join('')
              : 'SC'}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-white truncate">
              {activeSpecialistProfile ? activeSpecialistProfile.name : 'Specialist Intake Desk'}
            </div>
            <div className="text-xs text-slate-400 truncate">
              {activeSpecialistProfile
                ? activeSpecialistProfile.clinic
                : 'All Receiving Clinics'}
            </div>
          </div>
        </div>
      ) : (
        <div className="px-4 py-3.5 border-t border-white/10 flex items-center gap-3">
          {!avatarFailed ? (
            <img
              src={PHYSICIAN_AVATAR_URL}
              alt={settings.physicianName}
              referrerPolicy="no-referrer"
              onError={() => setAvatarFailed(true)}
              className="w-9 h-9 rounded-full object-cover border border-white/20 shrink-0"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-teal-600 text-white text-xs font-semibold flex items-center justify-center shrink-0">
              EV
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-white truncate">
              {settings.physicianName}
            </div>
            <div className="text-xs text-slate-400 truncate">{settings.clinicName}</div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen flex bg-[#F8FAFC] text-slate-900">
      {/* Desktop Persistent Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 sticky top-0 h-screen">
        {SidebarContent}
      </aside>

      {/* Mobile Sidebar Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/50"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-64 max-w-[80vw] h-full z-10">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Close menu"
              className="absolute top-3 right-3 p-1.5 text-slate-300 hover:text-white rounded-md"
            >
              <X className="w-5 h-5" />
            </button>
            {SidebarContent}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Clean Top Header */}
        <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <div className="text-sm sm:text-base font-display font-semibold text-slate-900 truncate">
                {headerTitle}
              </div>
              <div className="hidden sm:block text-xs text-slate-500 truncate">
                {perspective === 'specialist'
                  ? 'Receiving specialist intake, triage, and consultation coordination'
                  : 'Connecting care through intelligent referral coordination'}
              </div>
            </div>
          </div>

          {/* Right controls: Search + 3-Way Perspective Switcher + Notifications + Primary CTA */}
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            <div className="hidden 2xl:flex items-center relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
              <input
                type="search"
                value={globalSearchQuery}
                onChange={(e) => setGlobalSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search referrals or patients..."
                aria-label="Search referrals or patients"
                className="pl-9 pr-3 py-1.5 w-52 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-[#0F2942] transition-colors"
              />
            </div>

            {/* 3-Perspective Switcher (Desktop/Tablet) */}
            <div
              className="hidden md:flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200"
              role="group"
              aria-label="Switch perspective"
            >
              {(
                [
                  { id: 'physician', label: 'Physician View', Icon: Stethoscope },
                  { id: 'specialist', label: 'Specialist View', Icon: Building2 },
                  { id: 'patient', label: 'Patient View', Icon: UserCheck },
                ] as const
              ).map(({ id, label, Icon }) => {
                const active = perspective === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => switchPerspective(id)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                      active
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>

            {/* Compact Perspective Dropdown (Mobile) */}
            <select
              value={perspective}
              onChange={(e) => switchPerspective(e.target.value as Perspective)}
              aria-label="Switch perspective"
              className="md:hidden px-2 py-1.5 text-xs font-medium bg-slate-100 border border-slate-200 rounded-lg text-slate-800"
            >
              <option value="physician">Physician View</option>
              <option value="specialist">Specialist View</option>
              <option value="patient">Patient View</option>
            </select>

            {/* Notifications Bell */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen((o) => !o)}
                aria-label="Notifications"
                className="relative p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-[#0F2942] text-white text-[10px] font-mono font-semibold flex items-center justify-center tabular-nums">
                    {unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setNotifOpen(false)}
                  />
                  <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-900">
                        Coordination Notifications ({unreadCount} unread)
                      </span>
                      {unreadCount > 0 && (
                        <button
                          type="button"
                          onClick={markAllNotificationsRead}
                          className="text-xs font-medium text-teal-700 hover:text-teal-800 whitespace-nowrap"
                        >
                          Mark all read
                        </button>
                      )}
                    </div>
                    <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
                      {visibleNotifications.length === 0 ? (
                        <div className="p-6 text-center text-sm text-slate-500">
                          No notifications right now.
                        </div>
                      ) : (
                        visibleNotifications.map((n) => (
                          <div
                            key={n.id}
                            className={`p-3.5 transition-colors ${
                              n.read ? 'bg-white' : 'bg-slate-50/80'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  markNotificationRead(n.id);
                                  if (n.referralId) {
                                    if (perspective === 'specialist') {
                                      openSpecialistReview(n.referralId);
                                    } else {
                                      openReferralRecord(n.referralId);
                                    }
                                    setNotifOpen(false);
                                  }
                                }}
                                className="text-left flex-1 min-w-0"
                              >
                                <div className="text-xs font-semibold text-slate-900 truncate">
                                  {n.title}
                                </div>
                                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                                  {n.message}
                                </p>
                                <div className="text-[11px] text-slate-400 mt-1.5">
                                  {n.timestamp}
                                </div>
                              </button>
                              <div className="flex items-center gap-1 shrink-0">
                                {!n.read && (
                                  <button
                                    type="button"
                                    onClick={() => markNotificationRead(n.id)}
                                    title="Mark as read"
                                    className="p-1 text-slate-400 hover:text-teal-700 rounded"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => dismissNotification(n.id)}
                                  title="Dismiss notification"
                                  className="p-1 text-slate-400 hover:text-rose-600 rounded"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Perspective-aware Primary CTA */}
            {perspective === 'specialist' ? (
              <button
                type="button"
                onClick={handleReviewNextInQueue}
                className="px-3.5 py-2 bg-[#0F2942] hover:bg-[#173A5C] text-white text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5"
              >
                <ClipboardCheck className="w-4 h-4 shrink-0" />
                <span>Review Queue</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => startNewReferral()}
                className="px-3.5 py-2 bg-[#0F2942] hover:bg-[#173A5C] text-white text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5"
              >
                <FilePlus2 className="w-4 h-4 shrink-0" />
                <span>New Referral</span>
              </button>
            )}
          </div>
        </header>

        {/* Page Viewport */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Subtle Toast Feedback */}
      {toastMessage && (
        <div
          role="status"
          className="fixed bottom-5 right-5 z-50 bg-[#0F2942] text-white px-4 py-2.5 rounded-lg shadow-lg border border-white/10 text-sm font-medium flex items-center gap-2"
        >
          <Check className="w-4 h-4 text-teal-300 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};
