import { Toaster, toast } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { routers } from "./router";
import { ThemeProvider, useTheme } from "@/context/theme";
import { AuthProvider } from "@/context/auth";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";
import { logClientError } from "@/lib/errorLog";
import { errorMessage } from "@/lib/errorMessage";
import i18n from "@/lib/i18n";

// Built once at module scope: createBrowserRouter() inside the component
// would rebuild the router (and drop its state) on every theme change.
const router = createBrowserRouter(routers);

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (e, query) => {
      logClientError("query", e.message, { key: JSON.stringify(query.queryKey) });
      // One toast per failing query, with a retry; a failed load never looks like an empty list.
      toast.error(i18n.t("common.errors.loadFailed", { reason: errorMessage(e) }), {
        id: `query-${query.queryHash}`,
        action: { label: i18n.t("common.retry"), onClick: () => void query.fetch() },
      });
    },
  }),
  mutationCache: new MutationCache({
    onError: (e, _vars, _ctx, mutation) =>
      logClientError("mutation", e.message, {
        key: JSON.stringify(mutation.options.mutationKey ?? null),
      }),
  }),
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

// Separate component so useTheme is inside ThemeProvider
function AppInner() {
  const { theme } = useTheme();
  return (
    <>
      <Toaster
        theme={theme}
        position="bottom-right"
        toastOptions={{
          classNames: {
            success: "[&_[data-icon]]:text-emerald-500",
            error: "[&_[data-icon]]:text-rose-500",
            warning: "[&_[data-icon]]:text-amber-500",
            info: "[&_[data-icon]]:text-sky-500",
          },
          style:
            theme === "dark"
              ? {
                  background: "hsl(240 5% 8%)",
                  border: "1px solid hsl(240 4% 16%)",
                  color: "hsl(240 5% 96%)",
                }
              : {
                  background: "hsl(0 0% 100%)",
                  border: "1px solid hsl(240 5% 86%)",
                  color: "hsl(240 10% 8%)",
                },
        }}
      />
      <RouterProvider router={router} />
    </>
  );
}

const App = () => (
  <ErrorBoundary>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider>
            <div className="h-full">
              <AppInner />
            </div>
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </ErrorBoundary>
);

export default App;
