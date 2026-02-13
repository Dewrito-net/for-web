import { For, createSignal, Show } from "solid-js";
import { createQuery, createMutation } from "@tanstack/solid-query";
import { useClient } from "@revolt/client";
import { useModals } from "@revolt/modal";

type Report = any;

export default function ModDashboard() {
  const client = useClient();
  const { showError, showSuccess } = useModals();

  // Fetch reports if the backend provides them. If the endpoint is missing
  // we'll catch the error and show an empty state explaining what's missing.
  const reportsQuery = createQuery(["safety_reports"], async () => {
    try {
      const res = await client().api.get("/safety/reports");
      return (res ?? []) as Report[];
    } catch (e) {
      // swallow and return empty to keep UI usable
      return [] as Report[];
    }
  });

  // Try to fetch strikes (may not exist on your backend)
  const strikesQuery = createQuery(["safety_strikes"], async () => {
    try {
      const res = await client().api.get("/safety/strikes");
      return (res ?? []) as any[];
    } catch (_) {
      return [] as any[];
    }
  });

  const strikeMutation = createMutation(async (data: { user_id: string; reason?: string }) => {
    return client().api.post("/safety/strikes", data);
  });

  // Action mutation will call the concrete Stoat endpoints when we can
  // derive the required ids from the report. We only call endpoints that
  // exist in the delta API (channels delete, servers member remove/ban, servers delete).
  const actionMutation = createMutation(async (data: { method: string; path: string; body?: any }) => {
    switch (data.method.toUpperCase()) {
      case "DELETE":
        return client().api.delete(data.path);
      case "PUT":
        return client().api.put(data.path, data.body ?? {});
      case "POST":
        return client().api.post(data.path, data.body ?? {});
      default:
        throw new Error("Unsupported method");
    }
  });

  const [selectedReason, setSelectedReason] = createSignal("");
  const [expanded, setExpanded] = createSignal<string | null>(null);

  async function issueStrikeFor(report: Report) {
    const userId = (report?.content?.User?.id ?? report?.target_id) as string | undefined;
    if (!userId) return showError?.(new Error("No user id found for this report"));
    try {
      await strikeMutation.mutateAsync({ user_id: userId, reason: selectedReason() });
      showSuccess?.("Strike issued");
      reportsQuery.refetch();
      strikesQuery.refetch();
    } catch (e) {
      showError?.(e as Error);
    }
  }

  function formatDate(s?: string) {
    try {
      return s ? new Date(s).toLocaleString() : "";
    } catch (_) {
      return s ?? "";
    }
  }

  // Attempt to derive actionable API calls from the report object.
  function deriveActions(report: Report) {
    const actions: Array<{ label: string; enabled: boolean; method?: string; path?: string } > = [];

    // If we have message info and channel id, we can delete the message
    const msg = report?.content?.Message ?? report?.content?.message;
    const snapshot = report?.snapshots ?? report?.snapshot;

    // Try common places for channel/id: snapshot contents, target_display, etc.
    let channelId: string | undefined;
    let messageId: string | undefined;
    if (msg && typeof msg.id === "string") messageId = msg.id;
    if (snapshot && Array.isArray(snapshot)) {
      for (const s of snapshot) {
        if (s.content?.channel_id) channelId = s.content.channel_id;
        if (s.content?.message_id) messageId = messageId ?? s.content.message_id;
      }
    }
    // target_display sometimes contains helpful text
    if (!channelId && typeof report?.target_display === "string") {
      const m = report.target_display.match(/channel[:\/]?([\w-]+)/i);
      if (m) channelId = m[1];
    }

    if (messageId && channelId) {
      actions.push({ label: "Remove Message", enabled: true, method: "DELETE", path: `/channels/${channelId}/messages/${messageId}` });
    } else {
      actions.push({ label: "Remove Message", enabled: false });
    }

    // If report targets a server, we can delete the server (owner-only on backend)
    const srv = report?.content?.Server ?? report?.content?.server;
    const serverId = srv?.id ?? (report?.target_id && report.type === "server" ? report.target_id : undefined);
    if (serverId) {
      actions.push({ label: "Remove Server", enabled: true, method: "DELETE", path: `/servers/${serverId}` });
    } else {
      actions.push({ label: "Remove Server", enabled: false });
    }

    // If report targets a user AND we know a server context from snapshot, allow kick/ban
    const user = report?.content?.User ?? report?.content?.user;
    const userId = user?.id ?? (report?.type === "user" ? report.target_id : undefined);
    // try to find server id in snapshots
    let ctxServerId: string | undefined;
    if (snapshot && Array.isArray(snapshot)) {
      for (const s of snapshot) if (s.content?.server_id) ctxServerId = s.content.server_id;
    }
    if (userId && ctxServerId) {
      actions.push({ label: "Kick from Server", enabled: true, method: "DELETE", path: `/servers/${ctxServerId}/members/${userId}` });
      actions.push({ label: "Ban from Server", enabled: true, method: "PUT", path: `/servers/${ctxServerId}/bans/${userId}` });
    } else {
      actions.push({ label: "Kick from Server", enabled: false });
      actions.push({ label: "Ban from Server", enabled: false });
    }

    return actions;
  }

  async function runAction(method?: string, path?: string) {
    if (!method || !path) return showError?.(new Error("Action not available"));
    try {
      await actionMutation.mutateAsync({ method, path });
      showSuccess?.("Action completed");
      reportsQuery.refetch();
      strikesQuery.refetch();
    } catch (e) {
      showError?.(e as Error);
    }
  }

  return (
    <div style={{ padding: "16px", "max-width": "1100px" }}>
      <h2 style={{ margin: "0 0 12px 0" }}>Moderator Dashboard</h2>

      <div style={{ display: "flex", gap: "12px", "align-items": "flex-start" }}>
        <div style={{ flex: "1 1 60%" }}>
          <h3 style={{ margin: "6px 0" }}>Reports</h3>

          <Show when={(reportsQuery.data ?? []).length > 0} fallback={<div>No reports available from the API.</div>}>
            <For each={reportsQuery.data ?? []}>{(report) => (
              <div style={{ border: "1px solid #e6e6e6", padding: "12px", margin: "8px 0", "border-radius": "6px", "background": "#fff" }}>
                <div style={{ display: "flex", "justify-content": "space-between", "align-items": "center" }}>
                  <div>
                    <div style={{ "font-weight": "600" }}>{report?.content?.type ?? report?.type ?? "Report"}</div>
                    <div style={{ color: "#666", "font-size": "12px" }}>{report?.target_display ?? report?.target_id}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ color: "#666", "font-size": "12px" }}>{formatDate(report?.created_at)}</div>
                  </div>
                </div>

                <div style={{ margin: "8px 0", color: "#333" }}>{report?.additional_context ?? report?.reason ?? "(no reason)"}</div>

                <div style={{ display: "flex", gap: "8px", "flex-wrap": "wrap" }}>
                  <button onClick={() => issueStrikeFor(report)}>Issue Strike</button>
                  <button onClick={() => setExpanded(expanded() === report.id ? null : report.id)}>{expanded() === report.id ? "Hide JSON" : "View JSON"}</button>
                  {deriveActions(report).map((a) => (
                    <button disabled={!a.enabled} onClick={() => runAction(a.method, a.path)}>{a.label}</button>
                  ))}
                </div>

                <Show when={expanded() === report.id}>
                  <pre style={{ margin: "12px 0", padding: "12px", "background": "#f7f7f7", "border-radius": "6px", overflow: "auto", "max-height": "320px" }}>
                    {JSON.stringify(report, null, 2)}
                  </pre>
                </Show>
              </div>
            )}</For>
          </Show>
        </div>

        <div style={{ width: "320px" }}>
          <h3 style={{ margin: "6px 0" }}>Strikes</h3>
          <Show when={(strikesQuery.data ?? []).length > 0} fallback={<div>No strikes available from API.</div>}>
            <For each={strikesQuery.data ?? []}>{(s) => (
              <div style={{ border: "1px solid #eee", padding: "8px", margin: "6px 0", "border-radius": "6px" }}>
                <div style={{ "font-weight": "600" }}>{s?.user_id ?? s?.target}</div>
                <div style={{ color: "#666", "font-size": "12px" }}>{s?.reason ?? s?.created_at}</div>
              </div>
            )}</For>
          </Show>
        </div>
      </div>
    </div>
  );
}
