import React from 'react';
import { AppShell } from './components/AppShell';
import { ClinBridgeProvider, useClinBridge } from './context/ClinBridgeContext';
import { DashboardPage } from './pages/DashboardPage';
import { NewReferralPage } from './pages/NewReferralPage';
import { PatientPortalPage } from './pages/PatientPortalPage';
import { ReferralsPage } from './pages/ReferralsPage';
import { SettingsPage } from './pages/SettingsPage';
import { SpecialistDirectoryPage } from './pages/SpecialistDirectoryPage';
import { SpecialistAcceptedPage } from './pages/specialist/SpecialistAcceptedPage';
import { SpecialistAppointmentsPage } from './pages/specialist/SpecialistAppointmentsPage';
import { SpecialistDashboardPage } from './pages/specialist/SpecialistDashboardPage';
import { SpecialistInboxPage } from './pages/specialist/SpecialistInboxPage';
import { SpecialistPatientsPage } from './pages/specialist/SpecialistPatientsPage';
import { SpecialistReviewPage } from './pages/specialist/SpecialistReviewPage';
import { SpecialistSettingsPage } from './pages/specialist/SpecialistSettingsPage';

const ClinBridgeRouter: React.FC = () => {
  const { activeSection } = useClinBridge();

  switch (activeSection) {
    case 'dashboard':
      return <DashboardPage />;
    case 'referrals':
      return <ReferralsPage />;
    case 'new-referral':
      return <NewReferralPage />;
    case 'specialists':
      return <SpecialistDirectoryPage />;
    case 'patient-portal':
      return <PatientPortalPage />;
    case 'settings':
      return <SettingsPage />;
    case 'specialist-dashboard':
      return <SpecialistDashboardPage />;
    case 'specialist-inbox':
      return <SpecialistInboxPage />;
    case 'specialist-review':
      return <SpecialistReviewPage />;
    case 'specialist-accepted':
      return <SpecialistAcceptedPage />;
    case 'specialist-appointments':
      return <SpecialistAppointmentsPage />;
    case 'specialist-patients':
      return <SpecialistPatientsPage />;
    case 'specialist-settings':
      return <SpecialistSettingsPage />;
    default:
      return <DashboardPage />;
  }
};

export default function App() {
  return (
    <ClinBridgeProvider>
      <AppShell>
        <ClinBridgeRouter />
      </AppShell>
    </ClinBridgeProvider>
  );
}
