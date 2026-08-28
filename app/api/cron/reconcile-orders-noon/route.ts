import { NextRequest } from "next/server";
import { handleReconcileCron } from "@/lib/cron-reconcile-handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  return handleReconcileCron(request);
}

export async function POST(request: NextRequest) {
  return handleReconcileCron(request);
}
