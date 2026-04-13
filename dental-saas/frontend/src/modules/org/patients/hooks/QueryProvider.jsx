/**
 * QueryProvider.jsx — React Query Client Provider
 *
 * Wraps the app (or org plane) with a QueryClientProvider.
 * Uses the centralized queryClient from @/lib/query/queryClient.
 *
 * Usage: wrap in App.jsx or OrgShell:
 *   import { QueryProvider } from '@/modules/org/patients/hooks/QueryProvider';
 *   <QueryProvider><App /></QueryProvider>
 */
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/query/queryClient';

export function QueryProvider({ children }) {
    return (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
}

export { queryClient };
