import React, { useState } from 'react';

type View = 'login' | 'forgot';

interface AuthProps {
  initialMode?: 'login';
  onAuthenticated: () => void;
}

export const Auth: React.FC<AuthProps> = ({ initialMode = 'login', onAuthenticated }) => {
  const [view, setView] = useState<View>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const apiBase =
    import.meta.env.VITE_API_BASE_URL || window.location.origin.replace(/\/$/, '');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    try {
      const res = await fetch(`${apiBase}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          email,
          password,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Kunne ikke logge ind / oprette bruger');
      }

      onAuthenticated();
    } catch (err: any) {
      setError(err.message || 'Der opstod en fejl');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    try {
      const res = await fetch(`${apiBase}/api/auth/reset-password-request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Kunne ikke sende nulstillingslink');
      }

      setMessage('Hvis email findes, har vi sendt et link til nulstilling af kodeord.');
    } catch (err: any) {
      setError(err.message || 'Der opstod en fejl');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-slate-100 p-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">
          {view === 'login' ? 'Log ind på Replypilot' : 'Glemt kodeord?'}
        </h1>
        <p className="text-slate-500 text-sm mb-6">
          {view === 'login'
            ? 'Brug den samme email som du brugte til betalingen.'
            : 'Indtast din email, så sender vi et nulstillingslink.'}
        </p>

        <form onSubmit={view === 'login' ? handleLogin : handleRequestReset} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-11 px-4 rounded-xl bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
              placeholder="dig@firma.dk"
            />
          </div>

          {view === 'login' && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
                Adgangskode
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-11 px-4 rounded-xl bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
                placeholder="Mindst 6 tegn"
              />
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
          {message && <p className="text-sm text-emerald-600">{message}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-11 mt-2 bg-black text-white font-bold rounded-xl hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 disabled:opacity-70"
          >
            {loading ? 'Arbejder...' : view === 'login' ? 'Log ind' : 'Send nulstillingslink'}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-slate-500">
          {view === 'login' ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setMessage(null);
                  setView('forgot');
                }}
                className="text-blue-600 hover:text-blue-700 font-semibold"
              >
                Glemt kodeord?
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setMessage(null);
                  setView('login');
                }}
                className="text-blue-600 hover:text-blue-700 font-semibold"
              >
                Tilbage til login
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

