import { ConvexHttpClient } from "convex/browser";

const CONVEX_URL = "https://incredible-husky-286.convex.cloud";
const client = new ConvexHttpClient(CONVEX_URL);

function summarize(result) {
  if (!result) return String(result);
  const { tokens, ...rest } = result;
  return JSON.stringify({
    ...rest,
    tokens: tokens
      ? { hasToken: typeof tokens.token === "string", refreshToken: typeof tokens.refreshToken === "string" }
      : tokens,
  });
}

async function main() {
  // --- Test 1: anonymous (Continue as Guest) ---
  let anonToken = null;
  try {
    const anon = await client.action("auth:signIn", {
      provider: "anonymous",
      params: {},
      verifier: undefined,
    });
    console.log("[anonymous signIn] result:", summarize(anon));
    anonToken = anon?.tokens?.token ?? null;
  } catch (e) {
    console.log("[anonymous signIn] ERROR:", e?.message ?? String(e));
  }

  if (anonToken) {
    try {
      client.setAuth(anonToken, () => {});
      const me = await client.query("users:currentUser");
      console.log("[anonymous currentUser] OK:", JSON.stringify(me));
    } catch (e) {
      console.log("[anonymous currentUser] ERROR:", e?.message ?? String(e));
    }
  }

  // --- Test 2: email-otp step 1 (request code) ---
  try {
    const otp = await client.action("auth:signIn", {
      provider: "email-otp",
      params: { email: "probe.mbc@example.com" },
      verifier: undefined,
    });
    console.log("[email-otp step1] result:", summarize(otp));
  } catch (e) {
    console.log("[email-otp step1] ERROR:", e?.message ?? String(e));
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
