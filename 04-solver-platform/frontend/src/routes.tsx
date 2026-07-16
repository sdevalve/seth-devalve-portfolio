import { createBrowserRouter } from 'react-router-dom'
import Layout from './pages/Layout'
import ErrorPage from './pages/ErrorPage'
import HomePage from './pages/HomePage'
import SeasonSettingsPage from './pages/SeasonSettingsPage'
import TeamsPage from './pages/TeamsPage'
import MatchupsPage from './pages/MatchupsPage'
import SlotsNetworksPage from './pages/SlotsNetworksPage'
import WeekmapPage from './pages/WeekmapPage'
import RulesetPage from './pages/RulesetPage'
import RunPage from './pages/RunPage'
import RunDetailPage from './pages/RunDetailPage'
import HistoryPage from './pages/HistoryPage'
import SchedulePage from './pages/SchedulePage'
import MLModelPage from './pages/MLModelPage'
import MLRematchesPage from './pages/MLRematchesPage'
import MLFuturesPage from './pages/MLFuturesPage'
import MLPrimetimePage from './pages/MLPrimetimePage'
import NetworkCategoriesPage from './pages/NetworkCategoriesPage'
import ColorPolicyPage from './pages/ColorPolicyPage'
import SolverConfigPage from './pages/SolverConfigPage'

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    errorElement: <ErrorPage />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'season-settings', element: <SeasonSettingsPage /> },
      { path: 'teams', element: <TeamsPage /> },
      { path: 'matchups', element: <MatchupsPage /> },
      { path: 'slots-networks', element: <SlotsNetworksPage /> },
      { path: 'weekmap', element: <WeekmapPage /> },
      { path: 'ruleset', element: <RulesetPage /> },
      { path: 'run', element: <RunPage /> },
      { path: 'runs/:runId', element: <RunDetailPage /> },
      { path: 'history', element: <HistoryPage /> },
      { path: 'schedule', element: <SchedulePage /> },
      // ── ML Input pages ──
      { path: 'ml-model', element: <MLModelPage /> },
      { path: 'ml-rematches', element: <MLRematchesPage /> },
      { path: 'ml-futures', element: <MLFuturesPage /> },
      { path: 'ml-primetime', element: <MLPrimetimePage /> },
      { path: 'net-cats', element: <NetworkCategoriesPage /> },
      { path: 'color-policy', element: <ColorPolicyPage /> },
      { path: 'solver-config', element: <SolverConfigPage /> },
    ],
  },
])

export default router
