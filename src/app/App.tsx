import { AppErrorBoundary } from "../components/system/AppErrorBoundary";
import { AppProviders } from "./AppProviders";
import { AppRouter } from "./AppRouter";

export function App() {
  return (
    <AppErrorBoundary>
      <AppProviders>
        <AppRouter />
      </AppProviders>
    </AppErrorBoundary>
  );
}
