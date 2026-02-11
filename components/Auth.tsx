import React, { useState } from 'react';

type Mode = 'login' | 'signup';

interface AuthProps {
  initialMode?: Mode;
  onAuthenticated: () => void;
}

export const Auth: React.FC<AuthProps> = ({ initialMode = 'login', onAuthenticated }) => {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const apiBase =
    import.meta.env.VITE_API_BASE_URL || window.location.origin.replace(/\/$/, '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/signup';
      const res = await fetch(`${apiBase}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          email,
          password,
          name: mode === 'signup' ? name : undefined,
          phone: mode === 'signup' ? phone : undefined,
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-slate-100 p-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">
          {mode === 'login' ? 'Log ind på Replypilot' : 'Opret Replypilot-konto'}
        </h1>
        <p className="text-slate-500 text-sm mb-6">
          Brug den samme email som du brugte til betalingen.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
                  Navn
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full h-11 px-4 rounded-xl bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
                  placeholder="Anders Andersen"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
                  Telefon
                </label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full h-11 px-4 rounded-xl bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
                  placeholder="20 30 40 50"
                />
              </div>
            </>
          )}

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

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-11 mt-2 bg-black text-white font-bold rounded-xl hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 disabled:opacity-70"
          >
            {loading ? 'Arbejder...' : mode === 'login' ? 'Log ind' : 'Opret konto'}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-slate-500">
          {mode === 'login' ? (
            <>
              Har du ikke en konto?{' '}
              <button
                type="button"
                onClick={() => setMode('signup')}
                className="text-blue-600 hover:text-blue-700 font-semibold"
              >
                Opret dig
              </button>
            </>
          ) : (
            <>
              Har du allerede en konto?{' '}
              <button
                type="button"
                onClick={() => setMode('login')}
                className="text-blue-600 hover:text-blue-700 font-semibold"
              >
                Log ind
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

