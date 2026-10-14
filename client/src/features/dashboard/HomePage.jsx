import { useAuth } from '../../context/AuthContext.jsx';

import DashboardPage from './DashboardPage.jsx';
import OwnerHomePage from './OwnerHomePage.jsx';

/** P51. The owner's home is today at a glance; every other role keeps its own. */
export default function HomePage() {
  const { user } = useAuth();
  return user?.role === 'OWNER' ? <OwnerHomePage /> : <DashboardPage />;
}
