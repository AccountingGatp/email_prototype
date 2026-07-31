"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GoogleLogin } from "@react-oauth/google";
import { Mail } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { getGoogleClientId } from "@/components/google-auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/loader";

export default function LoginPage() {
  const { login, loginWithGoogle, user, loading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [googlePending, setGooglePending] = useState(false);
  const googleClientId = getGoogleClientId();

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [loading, user, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError("");
    try {
      await login(email, password);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setPending(false);
    }
  }

  async function onGoogleSuccess(credential?: string) {
    if (!credential) {
      setError("Google sign-in returned no credential");
      return;
    }
    setGooglePending(true);
    setError("");
    try {
      await loginWithGoogle(credential);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed");
    } finally {
      setGooglePending(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div className="absolute inset-0 bg-[#0f1f24]" />
      <div className="absolute -left-20 top-10 h-72 w-72 rounded-full bg-teal-500/20 blur-3xl" />
      <div className="absolute -right-10 bottom-0 h-80 w-80 rounded-full bg-sky-600/20 blur-3xl" />
      <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-white/95 p-8 shadow-2xl backdrop-blur">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-700 text-white">
            <Mail className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl tracking-tight text-slate-900">InboxLens</h1>
            <p className="text-sm text-slate-500">Sign in with your GATP Google account</p>
          </div>
        </div>

        {googleClientId ? (
          <div className="mb-6 space-y-3">
            <div className="flex min-h-[44px] items-center justify-center">
              {googlePending ? (
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Spinner size="sm" />
                  Signing in with Google…
                </div>
              ) : (
                <GoogleLogin
                  onSuccess={(res) => onGoogleSuccess(res.credential)}
                  onError={() => setError("Google sign-in was cancelled or failed")}
                  useOneTap={false}
                  theme="outline"
                  size="large"
                  text="continue_with"
                  shape="rectangular"
                  width="340"
                />
              )}
            </div>
            <p className="text-center text-xs text-slate-500">
              Only <code className="rounded bg-slate-100 px-1">@gatpsolutions.com</code> emails
              are allowed
            </p>
            <div className="relative my-2">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-slate-400">or email</span>
              </div>
            </div>
          </div>
        ) : (
          <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Set <code>NEXT_PUBLIC_GOOGLE_CLIENT_ID</code> to enable Google sign-in.
          </p>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Work email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@gatpsolutions.com"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <Button type="submit" className="w-full bg-teal-700 hover:bg-teal-800" disabled={pending}>
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>
    </div>
  );
}
