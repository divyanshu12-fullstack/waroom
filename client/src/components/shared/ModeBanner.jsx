export function ModeBanner({ mode }) {
    const demo = mode === "demo";

    return (
        <div className="rounded-xl border px-3 py-2 text-[0.7rem] uppercase tracking-[0.15em]"
            style={{
                borderColor: demo ? "rgba(245, 158, 11, 0.4)" : "rgba(56, 189, 248, 0.4)",
                color: demo ? "#fcd34d" : "#7dd3fc",
                background: demo ? "rgba(120, 53, 15, 0.25)" : "rgba(7, 89, 133, 0.22)",
            }}
        >
            {demo ? "Demo Mode (No Live Bindings)" : "Live SpacetimeDB Mode"}
        </div>
    );
}
