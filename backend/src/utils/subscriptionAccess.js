export function subscriptionStatus(sub, now = Date.now()) {
  if (sub.revoked_at) return "revoked";
  const start = Date.parse(sub.activated_at);
  const end = sub.expires_at == null ? Infinity : Date.parse(sub.expires_at);
  if (!Number.isFinite(start) || Number.isNaN(end)) return "invalid";
  if (now >= end) return "expired";
  if (now < start) return "pending";
  return "active";
}

export function bestSubscription(rows, now = Date.now()) {
  const active = rows.filter((sub) => subscriptionStatus(sub, now) === "active");
  const candidates = active.length ? active : rows;
  return [...candidates].sort((a, b) => {
    const pa = a.subscription_plans || {}, pb = b.subscription_plans || {};
    if (active.length) {
      const premium = Number(pb.tier === "premium") - Number(pa.tier === "premium");
      if (premium) return premium;
      const unlimited = Number(pb.daily_scan_limit == null) - Number(pa.daily_scan_limit == null);
      if (unlimited) return unlimited;
      const limit = (pb.daily_scan_limit || 0) - (pa.daily_scan_limit || 0);
      if (limit) return limit;
    }
    const ea = a.expires_at == null ? Infinity : Date.parse(a.expires_at);
    const eb = b.expires_at == null ? Infinity : Date.parse(b.expires_at);
    return (ea === eb ? 0 : eb > ea ? 1 : -1) || String(a.id).localeCompare(String(b.id));
  })[0] || null;
}
