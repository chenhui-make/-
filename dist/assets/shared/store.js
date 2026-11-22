(() => {
    const read = (key, fallback) => {
        try {
            return JSON.parse(localStorage.getItem(key)) ?? fallback;
        } catch {
            return fallback;
        }
    };
    const write = (key, value) => {
        localStorage.setItem(key, JSON.stringify(value));
    };
    function models() {
        const edits = read("riglab-models", []);
        return Object.entries(RigCatalog.base)
            .flatMap(([category, rows]) => rows.map((p) => ({ ...p, category, status: "active" })))
            .map((p) => ({ ...p, ...edits.find((e) => e.id === p.id) }))
            .concat(
                edits.filter(
                    (p) =>
                        !Object.values(RigCatalog.base)
                            .flat()
                            .some((b) => b.id === p.id),
                ),
            );
    }
    function catalog() {
        const out = Object.fromEntries(RigCatalog.cats.map((c) => [c[0], []]));
        models()
            .filter((p) => p.status === "active")
            .forEach((p) => {
                if (out[p.category]) out[p.category].push({ ...p });
            });
        return out;
    }
    function saveModel(p) {
        const rows = read("riglab-models", []);
        const i = rows.findIndex((x) => x.id === p.id);
        if (i < 0) rows.push(p);
        else rows[i] = p;
        write("riglab-models", rows);
    }
    function event(type, info = {}) {
        try {
            const rows = read("riglab-events", []);
            rows.unshift({
                id: crypto.randomUUID(),
                time: new Date().toISOString(),
                type,
                ...info,
            });
            write("riglab-events", rows.slice(0, 1000));
        } catch {}
    }
    window.RigStore = { read, write, models, catalog, saveModel, event };
})();
