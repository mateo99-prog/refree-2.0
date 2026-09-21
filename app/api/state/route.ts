import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { appState, userStates } from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";

const LEGACY_OWNER_EMAIL = process.env.LEGACY_OWNER_EMAIL?.toLowerCase();

function unauthorized() {
  return Response.json({ error: "Inicia sesión para acceder a tus datos" }, { status: 401 });
}

export async function GET() {
  try {
    const user = await getChatGPTUser();
    if (!user) return unauthorized();
    const db = await getDb();
    const [row] = await db.select().from(userStates).where(eq(userStates.userId, user.userId)).limit(1);
    if (row) return Response.json({ state: JSON.parse(row.payload), user });

    let legacyState = null;
    if (LEGACY_OWNER_EMAIL && user.email.toLowerCase() === LEGACY_OWNER_EMAIL) {
      const [legacy] = await db.select().from(appState).where(eq(appState.id, 1)).limit(1);
      legacyState = legacy ? JSON.parse(legacy.payload) : null;
    }
    return Response.json({ state: legacyState, user });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudieron cargar los datos" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) return unauthorized();
    const state = await request.json();
    const payload = JSON.stringify(state);
    if (payload.length > 1_000_000) return Response.json({ error: "Los datos son demasiado grandes" }, { status: 413 });
    const db = await getDb();
    await db.insert(userStates).values({
      userId: user.userId,
      email: user.email,
      displayName: user.displayName,
      payload,
    }).onConflictDoUpdate({
      target: userStates.userId,
      set: { email: user.email, displayName: user.displayName, payload, updatedAt: new Date().toISOString() },
    });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudieron guardar los datos" }, { status: 500 });
  }
}
