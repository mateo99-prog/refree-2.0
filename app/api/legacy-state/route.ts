import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { appState, userStates } from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";

const LEGACY_OWNER_EMAIL = process.env.LEGACY_OWNER_EMAIL?.toLowerCase();

export async function GET(request: Request) {
  try {
    const chatGptUser = await getChatGPTUser();
    if (!chatGptUser) {
      return Response.json({ error: "No hay una sesión anterior que migrar" }, { status: 401 });
    }

    const authorization = request.headers.get("authorization");
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!authorization?.startsWith("Bearer ") || !supabaseUrl || !publishableKey) {
      return Response.json({ error: "No se pudo verificar la nueva cuenta" }, { status: 401 });
    }

    const verification = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        authorization,
        apikey: publishableKey,
      },
    });
    if (!verification.ok) {
      return Response.json({ error: "La sesión de Supabase no es válida" }, { status: 401 });
    }

    const supabaseUser = (await verification.json()) as { email?: string };
    if (!supabaseUser.email || supabaseUser.email.toLowerCase() !== chatGptUser.email.toLowerCase()) {
      return Response.json({ error: "Las cuentas no coinciden" }, { status: 403 });
    }

    const db = await getDb();
    const [saved] = await db.select().from(userStates).where(eq(userStates.userId, chatGptUser.userId)).limit(1);
    if (saved) {
      return Response.json({ state: JSON.parse(saved.payload), migratedFrom: "user_states" });
    }

    if (LEGACY_OWNER_EMAIL && chatGptUser.email.toLowerCase() === LEGACY_OWNER_EMAIL) {
      const [legacy] = await db.select().from(appState).where(eq(appState.id, 1)).limit(1);
      if (legacy) return Response.json({ state: JSON.parse(legacy.payload), migratedFrom: "app_state" });
    }

    return Response.json({ state: null });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "No se pudieron migrar los datos anteriores" },
      { status: 500 },
    );
  }
}
