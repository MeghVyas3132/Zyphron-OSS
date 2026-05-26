import { useEffect } from "react";

const APP_URL = (import.meta.env.VITE_APP_URL as string) || "https://app.zyphron.space";

export function CallbackPage() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const error = params.get("error");

    if (token) {
      // Pass token cross-domain via URL param; app.zyphron.space stores it
      window.location.replace(`${APP_URL}/?token=${encodeURIComponent(token)}`);
    } else if (error) {
      // Redirect back to login with error
      window.location.replace(`/login?error=${encodeURIComponent(error)}`);
    } else {
      window.location.replace("/login");
    }
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-black">
      <div className="h-8 w-8 rounded-full border border-white/20 border-t-white/60 animate-spin" />
    </div>
  );
}
