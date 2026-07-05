import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * DB-touching health check — the target of the daily keep-alive cron
 * (vercel.json). Its real job is the SELECT 1: free-tier Supabase pauses a
 * project after ~7 idle days, and a paused prod DB means the live app dies
 * silently (the dev project proved it 2026-07-04). One trivial query a day
 * resets the idle clock. Public on purpose — it returns nothing but "ok"
 * and touching it is exactly what we want visitors to do.
 *
 * force-dynamic matters: a GET route handler with no dynamic APIs would be
 * statically optimized and never actually reach the database.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[health] database unreachable:", err);
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
