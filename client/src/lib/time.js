export function toUnixSeconds() {
    return Math.floor(Date.now() / 1000);
}

export function formatDuration(totalSeconds) {
    const seconds = Math.max(0, Number(totalSeconds) || 0);
    const hours = String(Math.floor(seconds / 3600)).padStart(2, "0");
    const minutes = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
    const remaining = String(Math.floor(seconds % 60)).padStart(2, "0");
    return `${hours}:${minutes}:${remaining}`;
}

export function timeAgo(timestamp) {
    if (timestamp == null) {
        return "just now";
    }

    const value = typeof timestamp === "bigint" ? Number(timestamp) : Number(timestamp);
    const ms = value > 1e12 ? value : value * 1000;
    const diff = Math.max(0, Math.floor((Date.now() - ms) / 1000));

    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}
