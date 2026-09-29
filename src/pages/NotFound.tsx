import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Home } from "lucide-react";

const NotFound = () => {
  const location = useLocation();
  const { t } = useTranslation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname,
    );
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <p className="text-8xl font-black text-gradient-brand mb-4">404</p>
        <h1 className="text-xl font-semibold text-foreground mb-2">
          {t("errors.notFound.title")}
        </h1>
        <p className="text-sm text-muted-foreground mb-6">
          {t("errors.notFound.message")}
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Home className="w-4 h-4" />
          {t("errors.notFound.back")}
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
