# Sustainability Spec: The Cloud AI Pass Model

## 1. Ethical Foundation
OpenClo remains **100% Free and Open Source**. The code, the math, and the simulation logic will always be public. However, providing a low-latency, high-availability cloud infrastructure (and expensive `.ai` domains) requires a sustainable revenue model.

## 2. The Hybrid AI Strategy
We offer users two paths to use the "Brilliant Copilot":

### Path A: Self-Hosted / BYOK (Bring Your Own Key) — FREE
- **User Action**: The user enters their own API Key (Anthropic, OpenAI, or Google) in the settings.
- **Cost**: $0 to OpenClo. The user pays the provider directly for tokens.
- **Experience**: Full access to all OpenClo features.

### Path B: OpenClo Cloud AI Pass — PAID (~$7 - $9/mo)
- **User Action**: The user subscribes to the "Cloud AI Pass."
- **OpenClo Action**: We provide the infrastructure, the proxy, and the tokens.
- **Value Added**: No configuration needed, faster response times via our dedicated pool, and priority support for new features.
- **Revenue Goal**: Cover the `.ai` domain (68€/yr), Vercel/DigitalOcean hosting, and token costs.

## 3. Infrastructure Architecture
To protect the system, we will implement a **Proxy Server** (Node.js/Supabase):
1. **Request**: Client sends a message.
2. **Auth**: Proxy checks if the user has a valid `CloudPass` or a `LocalKey`.
3. **Execution**: If `CloudPass`, proxy forwards to the LLM using our master key and deducts from the user's monthly budget.
4. **Safety**: No API keys are ever stored in plain text.

## 4. Financial "Break-Even" Analysis
- **Fixed Costs**: ~150€ / year (Domain + Basic Hosting).
- **Variable Costs**: Token usage per active user.
- **Breakeven**: Only **20 active Cloud Pass users** are needed to make the project 100% self-sustaining and profitable for future R&D.

## 5. Next Steps
1. **Landing Page Messaging**: Clearly state "100% Free - Pay only for convenience/cloud."
2. **Stripe Integration**: Set up a simple subscription portal.
3. **Settings UI**: Add the "AI Infrastructure" toggle.
