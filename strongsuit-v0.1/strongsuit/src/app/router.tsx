import { createHashRouter } from 'react-router-dom'
import Shell from './Shell'
import DashboardPage from '@/features/dashboard/DashboardPage'
import ClientsPage from '@/features/clients/ClientsPage'
import ClientDetailPage from '@/features/clients/ClientDetailPage'
import SettingsPage from '@/features/settings/SettingsPage'
import { KitchenSink } from '@/features/placeholders'
import BusinessPage from '@/features/business/BusinessPage'
import ReportsPage from '@/features/reports/ReportsPage'
import CalendarPage from '@/features/calendar/CalendarPage'
import LibraryPage from '@/features/library/LibraryPage'
import ProgramsPage from '@/features/programs/ProgramsPage'
import ProgramBuilder from '@/features/programs/builder/ProgramBuilder'
import SessionLoggerPage from '@/features/logging/SessionLoggerPage'
import FilmRoomPage from '@/features/filmroom/FilmRoomPage'
import SyncCenterPage from '@/features/sync/SyncCenterPage'
import PrintSessionSheet from '@/features/print/PrintSessionSheet'
import TeamPage from '@/features/team/TeamPage'
import LeadsPage from '@/features/leads/LeadsPage'
import LeaderboardPage from '@/features/leaderboard/LeaderboardPage'
import TvWorkoutPage from '@/features/tv/TvWorkoutPage'

// Hash router: file-protocol friendly (spec §2.2)
export const router = createHashRouter([
  {
    path: '/',
    element: <Shell />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'clients', element: <ClientsPage /> },
      { path: 'clients/:id', element: <ClientDetailPage /> },
      { path: 'programs', element: <ProgramsPage /> },
      { path: 'programs/:id/edit', element: <ProgramBuilder /> },
      { path: 'log', element: <SessionLoggerPage /> },
      { path: 'exercises', element: <LibraryPage /> },
      { path: 'film-room', element: <FilmRoomPage /> },
      { path: 'calendar', element: <CalendarPage /> },
      { path: 'business', element: <BusinessPage /> },
      { path: 'sync', element: <SyncCenterPage /> },
      { path: 'reports', element: <ReportsPage /> },
      { path: 'team', element: <TeamPage /> },
      { path: 'leads', element: <LeadsPage /> },
      { path: 'leaderboard', element: <LeaderboardPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'kitchen-sink', element: <KitchenSink /> },
    ],
  },
  {
    path: '/print/program/:clientId/:programId',
    element: <PrintSessionSheet />
  },
  {
    path: '/tv/:clientId',
    element: <TvWorkoutPage />
  }
])
