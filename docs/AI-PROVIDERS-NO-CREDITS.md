# Running replypilot when Gemini / OpenAI credits are exhausted

## Current behaviour

- **Only Gemini** is used for AI replies. The `ai_settings.primary_provider` and `secondary_provider` (gemini/openai) are stored and shown in admin but **are not used** in `server/services/aiService.mjs` when generating responses.
- When the Gemini API fails (quota, errors, or circuit breaker), the service returns the **fallback message** (e.g. “Tak for din besked. Jeg viderebringer den til virksomheden…”).
- So today: **no Gemini credits ⇒ only fallback**, and OpenAI is never called for generation.

## Options to keep running without (or with minimal) paid credits

### 1. Use the fallback only (no code change)

- When both Gemini and OpenAI are out of credits, the app already sends the configured fallback message.
- You can improve the text in **Admin → Demo AI** (or per-customer AI settings) so the fallback is more helpful, e.g. direct leads to call or email.
- Pros: no dev work. Cons: no real AI; every reply is the same generic text.

### 2. Wire primary + secondary provider (Gemini ↔ OpenAI)

- In `aiService.mjs`, read `primary_provider` and `secondary_provider` from `ai_settings`.
- Try the primary (Gemini or OpenAI); on failure (e.g. 429, circuit breaker), try the secondary; if both fail, use the fallback message.
- Requires adding the OpenAI SDK and a small OpenAI generation path in `aiService.mjs`.
- Pros: when one provider is out of credits, the other can still serve. Cons: if **both** are out, you still only get fallback.

### 3. Add a provider that doesn’t depend on paid API credits

Then you can run even when Gemini and OpenAI have no credits.

#### A. Groq (free tier)

- [Groq](https://groq.com) offers a free tier (e.g. rate-limited requests).
- Add a “groq” provider in `aiService.mjs`: call their API with the same system prompt + conversation, map their response back to your format.
- In admin, allow `primary_provider` / `secondary_provider` to be `gemini` | `openai` | `groq`, and try in order (primary → secondary → fallback).
- Pros: no per-request cost within free limits; fast. Cons: free tier limits; need to add Groq client and env (e.g. `GROQ_API_KEY`).

#### B. Self-hosted Ollama (no API credits)

- Run [Ollama](https://ollama.com) on your VPS (or another machine). No API key; no per-request cost.
- Add a “local” or “ollama” provider that POSTs to `http://<ollama-host>:11434/api/generate` (or `api/chat`) with your prompt and history.
- Use a small model (e.g. `llama3.2`, `mistral`, `gemma2`) so it runs on CPU or a small GPU.
- In `ai_settings` and admin, add `ollama` as a provider option; chain it as primary/secondary/fallback (e.g. try Gemini → OpenAI → Ollama → fallback).
- Pros: no credits; full control; works offline. Cons: needs a bit of RAM/CPU (or GPU); you maintain the Ollama instance.

### 4. Recommended combination

- **Implement (2)** so Gemini and OpenAI are both used (primary → secondary → fallback).
- **Add (3B) Ollama** as a third provider and put it after the cloud providers (e.g. primary → secondary → ollama → fallback). When both Gemini and OpenAI are out of credits, Ollama can still provide real AI replies.
- Optionally add **(3A) Groq** as another free-tier option in the chain if you want a cloud fallback that doesn’t depend on Gemini/OpenAI credits.

## Summary

| Situation | What you can do |
|----------|------------------|
| No code changes | Use fallback only; improve fallback text in admin. |
| Use both Gemini and OpenAI | Implement provider chain in `aiService.mjs` (primary → secondary → fallback). |
| No credits on either | Add Groq and/or self-hosted Ollama as extra providers so the app can still generate AI replies when Gemini and OpenAI are exhausted. |

If you tell me which you prefer (e.g. “add Ollama only” or “add Groq + wire OpenAI”), I can outline the exact code changes in `aiService.mjs` and env (e.g. `OLLAMA_BASE_URL`, `GROQ_API_KEY`, `OPENAI_API_KEY`).
