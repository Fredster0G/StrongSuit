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
      { path: 'reports', element: <ReportsPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'kitchen-sink', element: <KitchenSink /> },
    ],
  },
])
