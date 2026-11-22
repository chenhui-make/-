(() => {
    let visitor = sessionStorage.getItem("riglab-visitor");
    if (!visitor) {
        visitor = "访客-" + Math.random().toString(36).slice(2, 8);
        sessionStorage.setItem("riglab-visitor", visitor);
    }
    const visit = () =>
        RigStore.event("visit", {
            visitor,
            page: location.hash || "#builder",
            device: innerWidth < 768 ? "移动端" : "桌面端",
            source: document.referrer ? "外部链接" : "直接访问",
            dataSource: "本机记录",
        });
    visit();
    addEventListener("hashchange", visit);
    document.addEventListener("click", (e) => {
        const b = e.target.closest("[data-add]");
        if (!b) return;
        const id = Number(b.dataset.add);
        if (Object.values(RigStore.read("riglab-build", {})).includes(id))
            RigStore.event("select", { modelId: id, visitor, dataSource: "本机记录" });
    });
})();
