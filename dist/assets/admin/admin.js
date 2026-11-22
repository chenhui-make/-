(async function initializeAdmin() {
    const $ = (s) => document.querySelector(s),
        $$ = (s) => [...document.querySelectorAll(s)],
        S = RigStore;
    const esc = (s) =>
        String(s ?? "").replace(
            /[&<>"']/g,
            (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
        );
    const fmt = (n) => Number(n).toLocaleString("zh-CN");
    const category = (k) => RigCatalog.cats.find((c) => c[0] === k)?.[2] || k;
    const options = () =>
        RigCatalog.cats.map((c) => `<option value="${c[0]}">${c[2]}</option>`).join("");
    let page = "overview",
        period = 7,
        tablePage = 1,
        query = "",
        filter = "",
        stateFilter = "",
        sourceFilter = "all",
        exportRows = [];
    let databaseModels = [];
    async function refreshModels() {
        databaseModels = (await RigAuth.request('/api/admin/parts')).map(p => ({...p, price: Number(p.price)}));
    }
    async function saveDatabaseModel(p) {
        const payload = {...p};
        for (const k of ['socket','ddr','power','watts']) if (!payload[k]) payload[k] = null;
        await RigAuth.request('/api/admin/parts/' + (p.id || 0), {method:'PUT', body:JSON.stringify(payload)});
        await refreshModels();
    }
    const PAGE_SIZE = 8;
    function toast(text) {
        $("#toast").textContent = text;
        $("#toast").classList.add("show");
        clearTimeout(window.toastTimer);
        window.toastTimer = setTimeout(() => $("#toast").classList.remove("show"), 2800);
    }

    // 在等待会话接口时也阻止表单默认提交，避免账号和密码进入网址。
    $("#loginForm").onsubmit = (event) => event.preventDefault();
    let adminUser = null;
    try {
        adminUser = await RigAuth.me();
    } catch (error) {
        $("#loginError").textContent = error.message;
    }
    function authorized() {
        return adminUser?.role === "admin";
    }
    if (adminUser?.role === "admin") await refreshModels();
    function guard() {
        const ok = authorized();
        $("#loginPage").hidden = ok;
        $("#adminApp").hidden = !ok;
        if (!ok) {
            $("#editor").close();
            $("#confirm").close();
        }
        return ok;
    }
    $("#loginForm").onsubmit = async (event) => {
        event.preventDefault();
        const fields = new FormData(event.target);
        const button = event.target.querySelector('[type="submit"]');
        button.disabled = true;
        try {
            const account = await RigAuth.request("/api/auth/staff-login", {
                method: "POST",
                body: JSON.stringify({
                    username: fields.get("account").trim(),
                    password: fields.get("password"),
                }),
            });
            adminUser = account;
            if (!authorized()) {
                $("#loginError").textContent = "该账户没有管理员权限。";
                return;
            }
            event.target.reset();
            guard();
            await refreshModels();
            render();
            toast("管理员登录成功");
        } catch (error) {
            $("#loginError").textContent = error.message;
        } finally {
            button.disabled = false;
        }
    };
    $("#logout").onclick = async () => {
        try {
            await RigAuth.logout();
            adminUser = null;
            guard();
            toast("已退出管理控制台");
        } catch (error) {
            toast(error.message);
        }
    };
    const usersLink = document.createElement("a");
    usersLink.href = "users.html";
    usersLink.textContent = "用户管理 ↗";
    usersLink.style.display = "block";
    usersLink.style.padding = "16px";
    $(".sidebar-bottom").prepend(usersLink);
    const aiSettingsLink = document.createElement("a");
    aiSettingsLink.href = "ai-settings.html";
    aiSettingsLink.textContent = "AI 服务配置 ↗";
    aiSettingsLink.style.display = "block";
    aiSettingsLink.style.padding = "16px";
    $(".sidebar-bottom").prepend(aiSettingsLink);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sample = [];
    for (let d = 0; d < 30; d++) {
        const count = 9 + ((d * 7) % 19);
        for (let i = 0; i < count; i++) {
            const t = new Date(today);
            t.setDate(t.getDate() - d);
            t.setHours(8 + (i % 13), (i * 13) % 60);
            if (t > new Date()) t.setDate(t.getDate() - 1);
            sample.push({
                id: `demo-${d}-${i}`,
                time: t.toISOString(),
                type: "visit",
                visitor: "示例访客-" + String((d * 11 + i) % 97).padStart(3, "0"),
                page: ["#builder", "#community", "#favorites"][i % 3],
                device: i % 4 === 0 ? "移动端" : "桌面端",
                source: i % 3 === 0 ? "搜索引擎" : i % 3 === 1 ? "直接访问" : "社区链接",
                dataSource: "示例数据",
            });
            if (i % 2 === 0)
                sample.push({
                    id: `use-${d}-${i}`,
                    time: t.toISOString(),
                    type: "select",
                    modelId: 1 + ((d * 3 + i * 7) % 31),
                    visitor: "示例访客-" + i,
                    dataSource: "示例数据",
                });
        }
    }
    function events() {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        start.setDate(start.getDate() - period + 1);
        return [...sample, ...S.read("riglab-events", [])]
            .filter(
                (e) =>
                    new Date(e.time) >= start &&
                    new Date(e.time) <= new Date() &&
                    (sourceFilter === "all" || e.dataSource === sourceFilter),
            )
            .sort((a, b) => new Date(b.time) - new Date(a.time));
    }
    function stats() {
        const ev = events(),
            visits = ev.filter((e) => e.type === "visit"),
            uses = ev.filter((e) => e.type === "select"),
            counts = new Map();
        uses.forEach((e) => counts.set(e.modelId, (counts.get(e.modelId) || 0) + 1));
        return { visits, uses, counts, visitors: new Set(visits.map((e) => e.visitor)).size };
    }
    const kpi = (name, value, foot, icon) =>
        `<div class="kpi"><span class="icon">${icon}</span><p>${name}</p><strong>${fmt(value)}</strong><small>${foot}</small></div>`;
    function rank(rows, total, limit = 5) {
        return (
            rows
                .slice(0, limit)
                .map(
                    (p, i) =>
                        `<div class="rank-row"><span class="rank-num">${String(i + 1).padStart(2, "0")}</span><div class="rank-info"><b>${esc(p.name)}</b><p><i style="width:${total ? (p.count / total) * 100 : 0}%"></i></p></div><strong>${p.count}<small>${total ? ((p.count / total) * 100).toFixed(1) : "0.0"}%</small></strong></div>`,
                )
                .join("") || '<div class="empty">暂无选用记录</div>'
        );
    }
    function ranking() {
        const { counts } = stats();
        return databaseModels
            .map((p) => ({ ...p, count: counts.get(p.id) || 0 }))
            .sort((a, b) => b.count - a.count);
    }
    function trend() {
        const { visits } = stats(),
            days = Array.from({ length: period }, (_, i) => {
                let t = new Date(today);
                t.setDate(t.getDate() - period + 1 + i);
                return t;
            }),
            daily = days.map((t) => {
                const next = new Date(t);
                next.setDate(next.getDate() + 1);
                return {
                    sample: visits.filter(
                        (e) =>
                            new Date(e.time) >= t &&
                            new Date(e.time) < next &&
                            e.dataSource === "示例数据",
                    ).length,
                    local: visits.filter(
                        (e) =>
                            new Date(e.time) >= t &&
                            new Date(e.time) < next &&
                            e.dataSource === "本机记录",
                    ).length,
                };
            }),
            max = Math.max(5, ...daily.flatMap((d) => [d.sample, d.local]));
        const points = (key) =>
            daily
                .map((d, i) => `${40 + (i * 560) / (period - 1)},${170 - (d[key] / max) * 140}`)
                .join(" ");
        return `<div class="chart-legend"><span><i class="legend-dot"></i>示例访问</span><span><i class="legend-dot gray"></i>本机访问</span></div><svg class="chart" viewBox="0 0 630 205" role="img" aria-label="最近${period}天访问趋势，示例访问 ${daily.reduce((a, b) => a + b.sample, 0)} 次，本机访问 ${daily.reduce((a, b) => a + b.local, 0)} 次"><defs><linearGradient id="fill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#cde5aa" stop-opacity=".6"/><stop offset="1" stop-color="#cde5aa" stop-opacity="0"/></linearGradient></defs>${[0, 1, 2, 3].map((i) => `<line class="gridline" x1="40" x2="605" y1="${30 + (i * 140) / 3}" y2="${30 + (i * 140) / 3}"/><text x="6" y="${34 + (i * 140) / 3}">${Math.round(max * (1 - i / 3))}</text>`).join("")}<polygon points="40,170 ${points("sample")} 600,170" fill="url(#fill)"/><polyline class="plot" points="${points("sample")}"/><polyline class="local-plot" points="${points("local")}"/>${days.map((d, i) => (i % (period === 7 ? 1 : 5) === 0 ? `<text text-anchor="middle" x="${40 + (i * 560) / (period - 1)}" y="195">${d.getMonth() + 1}/${d.getDate()}</text>` : "")).join("")}</svg>`;
    }
    function overview() {
        const st = stats(),
            models = databaseModels;
        exportRows = st.visits;
        return `<div class="kpis">${kpi("页面访问次数", st.visits.length, "所选时段 · 示例与本机合计", "◷")}${kpi("独立访客标识", st.visitors, "按演示访客标识去重", "◎")}${kpi("配件选用次数", st.uses.length, "每次选入配置计 1 次", "▧")}${kpi("在架配件型号", models.filter((p) => p.status === "active").length, `共 ${models.length} 个型号 · 13 类硬件`, "▦")}</div><div class="two-cols"><section class="panel"><div class="panel-heading"><div><h2>访问趋势</h2><p>最近 ${period} 天 · 页面访问次数 / PV</p></div><span class="badge">VISITOR INSIGHTS</span></div>${trend()}</section><section class="panel"><div class="panel-heading"><div><h2>热门配件 TOP 5</h2><p>占全部配件选用次数的比例</p></div><button class="text-btn" data-go="usage">全部分析 ↗</button></div>${rank(ranking(), st.uses.length)}</section></div><section class="panel"><div class="panel-heading"><div><h2>最近访问动态</h2><p>记录来源已分别标注</p></div><button class="text-btn" data-go="visits">查看全部 ↗</button></div>${visitTable(st.visits.slice(0, 5))}</section>`;
    }
    function pageButtons(count) {
        const max = Math.max(1, Math.ceil(count / PAGE_SIZE));
        tablePage = Math.min(max, tablePage);
        return `<div class="pagination"><span>共 ${count} 条 · 第 ${tablePage} / ${max} 页</span><div><button id="prev" ${tablePage === 1 ? "disabled" : ""}>← 上一页</button><button id="next" ${tablePage === max ? "disabled" : ""}>下一页 →</button></div></div>`;
    }
    function modelsPage() {
        const rows = databaseModels.filter(
            (p) =>
                (!filter || p.category === filter) &&
                (!stateFilter || p.status === stateFilter) &&
                `${p.name} ${p.brand}`.toLowerCase().includes(query.toLowerCase()),
        );
        exportRows = rows;
        const paging = pageButtons(rows.length);
        return `<section class="panel"><div class="panel-heading"><div><h2>硬件型号库 <span class="badge">${rows.length} 个型号</span></h2><p>维护型号、规格与参考价格，管理前台可选配件。</p></div><span class="badge">LOCAL CATALOG</span></div><div class="toolbar"><input id="search" placeholder="搜索型号或品牌…" value="${esc(query)}"><select id="categoryFilter" aria-label="分类筛选"><option value="">全部配件分类</option>${options()}</select><select id="stateFilter" aria-label="状态筛选"><option value="">全部状态</option><option value="active">已上架</option><option value="inactive">已下架</option></select><button id="addModel" class="primary">＋ 添加型号</button></div><div class="table-wrap"><table><thead><tr><th>型号 / 品牌</th><th>配件分类</th><th>参考价格</th><th>规格参数</th><th>状态</th><th>管理操作</th></tr></thead><tbody>${
            rows
                .slice((tablePage - 1) * PAGE_SIZE, tablePage * PAGE_SIZE)
                .map(
                    (p) =>
                        `<tr><td><strong>${esc(p.name)}</strong><small>${esc(p.brand)}</small></td><td>${category(p.category)}</td><td>¥ ${fmt(p.price)}</td><td title="${esc(p.spec)}">${esc(p.spec.slice(0, 35))}</td><td><span class="badge ${p.status === "inactive" ? "off" : ""}">${p.status === "active" ? "已上架" : "已下架"}</span></td><td><button class="table-btn" data-edit="${p.id}">编辑</button><button class="table-btn danger" data-toggle="${p.id}">${p.status === "active" ? "下架" : "上架"}</button></td></tr>`,
                )
                .join("") || '<tr><td colspan="6" class="empty">暂无匹配型号</td></tr>'
        }</tbody></table></div>${paging}</section>`;
    }
    const date = (t) => new Date(t).toLocaleString("zh-CN", { hour12: false });
    const pageName = (p) =>
        ({ "#builder": "自选装机", "#community": "灵感社区", "#favorites": "我的收藏" })[p] || p;
    function visitTable(rows) {
        return `<div class="table-wrap"><table><thead><tr><th>访问时间</th><th>访客标识</th><th>访问页面</th><th>设备</th><th>访问来源</th><th>数据来源</th></tr></thead><tbody>${rows.map((e) => `<tr><td>${date(e.time)}</td><td>${esc(e.visitor)}</td><td>${esc(pageName(e.page))}</td><td>${esc(e.device)}</td><td>${esc(e.source)}</td><td><span class="badge ${e.dataSource === "示例数据" ? "sample" : "local"}">${esc(e.dataSource)}</span></td></tr>`).join("") || '<tr><td colspan="6" class="empty">当前筛选下没有访问记录</td></tr>'}</tbody></table></div>`;
    }
    function sourceOptions() {
        return '<option value="all">全部数据来源</option><option value="示例数据">仅示例数据</option><option value="本机记录">仅本机记录</option>';
    }
    function visitsPage() {
        const rows = stats().visits.filter(
            (e) =>
                (!filter || e.page === filter) &&
                `${e.visitor} ${e.source}`.toLowerCase().includes(query.toLowerCase()),
        );
        exportRows = rows;
        const paging = pageButtons(rows.length);
        return `<section class="panel"><div class="panel-heading"><div><h2>访问记录 <span class="badge">${rows.length} 条记录</span></h2><p>本机记录只涵盖此浏览器中的前台访问，不收集 IP 或跨设备数据。</p></div></div><div class="toolbar"><input id="search" value="${esc(query)}" placeholder="搜索访客标识或来源…"><select id="visitFilter" aria-label="访问页面"><option value="">全部页面</option><option value="#builder">自选装机</option><option value="#community">灵感社区</option><option value="#favorites">我的收藏</option></select><select id="sourceFilter" aria-label="数据来源">${sourceOptions()}</select></div>${visitTable(rows.slice((tablePage - 1) * PAGE_SIZE, tablePage * PAGE_SIZE))}${paging}</section>`;
    }
    function usagePage() {
        const st = stats(),
            rows = ranking().filter(
                (p) =>
                    (!filter || p.category === filter) &&
                    `${p.name} ${p.brand}`.toLowerCase().includes(query.toLowerCase()),
            );
        exportRows = rows.map((p) => ({
            分类: category(p.category),
            型号: p.name,
            选用次数: p.count,
            占全部选用比例: st.uses.length
                ? ((p.count / st.uses.length) * 100).toFixed(1) + "%"
                : "0%",
        }));
        const paging = pageButtons(rows.length);
        const counts = RigCatalog.cats.map((c) => ({
            name: c[2],
            count: ranking()
                .filter((p) => p.category === c[0])
                .reduce((n, p) => n + p.count, 0),
        }));
        const max = Math.max(1, ...counts.map((x) => x.count));
        return `<div class="kpis">${kpi("累计选入配置", st.uses.length, "所选时间范围内的选用事件", "▧")}${kpi("被选用型号", ranking().filter((p) => p.count > 0).length, "至少有 1 次选用的型号", "▦")}${kpi("本机选用次数", st.uses.filter((e) => e.dataSource === "本机记录").length, "来自本浏览器前台交互", "◉")}${kpi("示例选用次数", st.uses.filter((e) => e.dataSource === "示例数据").length, "内置演示数据", "✧")}</div><section class="panel"><div class="panel-heading"><div><h2>分类选用分布</h2><p>所选时间内，各类配件选入配置的次数</p></div><select id="sourceFilter" aria-label="数据来源">${sourceOptions()}</select></div><div class="chart-bars">${counts.map((c) => `<div class="category-bar"><b>${c.count}</b><i style="height:${(c.count / max) * 125}px"></i><span>${c.name}</span></div>`).join("")}</div></section><section class="panel"><div class="panel-heading"><div><h2>型号选用排行</h2><p>选用占比 = 型号被选次数 ÷ 所有类别配件被选总次数</p></div></div><div class="toolbar"><input id="search" value="${esc(query)}" placeholder="搜索型号或品牌…"><select id="categoryFilter" aria-label="分类筛选"><option value="">全部配件分类</option>${options()}</select></div><div class="table-wrap"><table><thead><tr><th>排名</th><th>配件型号</th><th>分类</th><th>选用次数</th><th>占全部选用</th><th>当前状态</th></tr></thead><tbody>${
            rows
                .slice((tablePage - 1) * PAGE_SIZE, tablePage * PAGE_SIZE)
                .map(
                    (p, i) =>
                        `<tr><td>${(tablePage - 1) * PAGE_SIZE + i + 1}</td><td><strong>${esc(p.name)}</strong><small>${esc(p.brand)}</small></td><td>${category(p.category)}</td><td>${p.count}</td><td>${st.uses.length ? ((p.count / st.uses.length) * 100).toFixed(1) : "0.0"}%</td><td><span class="badge ${p.status === "inactive" ? "off" : ""}">${p.status === "active" ? "已上架" : "已下架"}</span></td></tr>`,
                )
                .join("") || '<tr><td colspan="6" class="empty">暂无匹配配件</td></tr>'
        }</tbody></table></div>${paging}<p class="metric-note">选用统计记录的是“加入配置”操作次数；反复移除再选择会重复计数，不代表销量、硬件负载或去重用户数。</p></section>`;
    }
    const pages = {
        overview: ["数据概览", "WORKSPACE OVERVIEW", "你好，管理员。这里是装机研究所的运行概况。"],
        models: ["型号管理", "COMPONENT LIBRARY", "从核心到外设，让每一款硬件井然有序。"],
        visits: ["访问记录", "VISITOR ACTIVITY", "了解每一次到访，找到体验改善的线索。"],
        usage: ["配件选用分析", "COMPONENT INSIGHTS", "看见玩家的选择，发现热门硬件与搭配趋势。"],
    };
    function navigate(p) {
        page = p in pages ? p : "overview";
        query = "";
        filter = "";
        stateFilter = "";
        sourceFilter = "all";
        tablePage = 1;
        location.hash = page;
        render();
    }
    function render() {
        if (!guard()) return;
        const p = pages[page];
        $("#pageTitle").innerHTML = p[0] + " <span>↘</span>";
        $("#breadcrumb").textContent = p[0];
        $("#pageEnglish").textContent = p[1];
        $("#pageSubtitle").textContent = p[2];
        $("#navCount").textContent = databaseModels.length;
        $("#range").disabled = page === "models";
        $$("[data-page]").forEach((b) => b.classList.toggle("active", b.dataset.page === page));
        $("#content").innerHTML = {
            overview,
            models: modelsPage,
            visits: visitsPage,
            usage: usagePage,
        }[page]();
        bind();
    }
    function bind() {
        const setFilter = (id, v, action) => {
            if (!$(id)) return;
            $(id).value = v;
            $(id).onchange = (e) => {
                action(e.target.value);
                tablePage = 1;
                render();
            };
        };
        setFilter("#categoryFilter", filter, (v) => (filter = v));
        setFilter("#visitFilter", filter, (v) => (filter = v));
        setFilter("#stateFilter", stateFilter, (v) => (stateFilter = v));
        setFilter("#sourceFilter", sourceFilter, (v) => (sourceFilter = v));
        if ($("#search"))
            $("#search").oninput = (e) => {
                const pos = e.target.selectionStart;
                query = e.target.value;
                tablePage = 1;
                render();
                $("#search").focus();
                $("#search").setSelectionRange(pos, pos);
            };
        if ($("#prev"))
            $("#prev").onclick = () => {
                tablePage--;
                render();
            };
        if ($("#next"))
            $("#next").onclick = () => {
                tablePage++;
                render();
            };
        if ($("#addModel")) $("#addModel").onclick = () => editModel();
        $$("[data-edit]").forEach((b) => (b.onclick = () => editModel(Number(b.dataset.edit))));
        $$("[data-toggle]").forEach(
            (b) =>
                (b.onclick = async () => {
                    if (!guard()) return;
                    const p = databaseModels.find((p) => p.id === Number(b.dataset.toggle));
                    if (p.status === "active") {
                        $("#confirm").showModal();
                        $("#confirmToggle").onclick = async () => {
                            if (!guard()) return;
                            try {
                                await saveDatabaseModel({ ...p, status: "inactive" });
                                $("#confirm").close();
                                render();
                                toast("型号已下架");
                            } catch {
                                toast("保存失败，请检查浏览器存储");
                            }
                        };
                    } else {
                        try {
                            await saveDatabaseModel({ ...p, status: "active" });
                            render();
                            toast("型号已上架");
                        } catch {
                            toast("保存失败");
                        }
                    }
                }),
        );
        $$("[data-go]").forEach((b) => (b.onclick = () => navigate(b.dataset.go)));
    }
    function conditional() {
        const c = $("#modelForm").elements.category.value;
        $$("[data-field]").forEach((e) => {
            const relevant = {
                socket: ["cpu", "board"],
                ddr: ["ram", "board"],
                power: ["cpu", "gpu"],
                watts: ["psu"],
            }[e.dataset.field].includes(c);
            e.hidden = !relevant;
            const input = e.querySelector("input,select");
            input.disabled = !relevant;
            input.required = relevant;
        });
    }
    function editModel(id) {
        if (!guard()) return;
        const form = $("#modelForm");
        form.reset();
        form.elements.category.innerHTML = options();
        const p = id ? databaseModels.find((p) => p.id === id) : null;
        $("#editorTitle").textContent = p ? "编辑配件型号" : "添加配件型号";
        for (const key of [
            "id",
            "category",
            "name",
            "brand",
            "price",
            "status",
            "spec",
            "purchase_url",
            "purchase_kind",
            "socket",
            "ddr",
            "power",
            "watts",
        ])
            if (form.elements[key])
                form.elements[key].value =
                    p?.[key] ?? ({ category: "cpu", status: "active" }[key] || "");
        $("#formError").textContent = "";
        conditional();
        $("#editor").showModal();
    }
    $("#modelForm").elements.category.onchange = conditional;
    $("#modelForm").onsubmit = async (e) => {
        e.preventDefault();
        if (!guard()) return;
        const f = Object.fromEntries(new FormData(e.target));
        for (const k of ["name", "brand", "spec"]) f[k] = f[k].trim();
        if (!f.name || !f.brand || !f.spec) {
            $("#formError").textContent = "请完整填写型号、品牌与规格。";
            return;
        }
        if (
            databaseModels.some(
                (p) =>
                    p.id !== Number(f.id) &&
                    p.category === f.category &&
                    p.name.toLowerCase() === f.name.toLowerCase() &&
                    p.brand.toLowerCase() === f.brand.toLowerCase(),
            )
        ) {
            $("#formError").textContent = "该分类中已存在同品牌同名型号。";
            return;
        }
        const old = databaseModels.find((p) => p.id === Number(f.id));
        const model = {
            ...old,
            ...f,
            id: f.id ? Number(f.id) : 0,
            price: Number(f.price),
            chip: f.category === "cpu" ? "CPU" : undefined,
        };
        for (const k of ["socket", "ddr", "power", "watts"])
            if (f[k] === undefined) delete model[k];
        for (const k of ["power", "watts"]) if (f[k]) model[k] = Number(f[k]);
        try {
            await saveDatabaseModel(model);
            $("#editor").close();
            render();
            toast("型号已保存，前台刷新后生效");
        } catch (error) {
            $("#formError").textContent = error.message;
        }
    };
    $("#closeEditor").onclick = () => $("#editor").close();
    $("#cancelToggle").onclick = () => $("#confirm").close();
    $$("[data-page]").forEach((b) => (b.onclick = () => navigate(b.dataset.page)));
    $("#range").onchange = (e) => {
        period = Number(e.target.value);
        tablePage = 1;
        render();
    };
    window.addEventListener("hashchange", () => {
        const p = location.hash.slice(1);
        if (p in pages && p !== page) navigate(p);
    });
    window.addEventListener("focus", () => {
        if (guard()) render();
    });
    window.addEventListener("storage", () => {
        if (guard()) render();
    });
    function csv(rows) {
        const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
        const cell = (v) =>
            '"' +
            String(v ?? "")
                .replace(/^[=+@-]/, "'$&")
                .replaceAll('"', '""') +
            '"';
        return (
            "\ufeff" +
            [
                keys.map(cell).join(","),
                ...rows.map((r) => keys.map((k) => cell(r[k])).join(",")),
            ].join("\r\n")
        );
    }
    $("#export").onclick = () => {
        if (!guard()) return;
        if (!exportRows.length) return toast("当前没有可导出的记录");
        const blob = new Blob([csv(exportRows)], { type: "text/csv;charset=utf-8" }),
            url = URL.createObjectURL(blob),
            a = document.createElement("a");
        a.href = url;
        a.download = `RIGLAB-${page}.csv`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast("已导出当前筛选下的全部数据");
    };
    page = location.hash.slice(1) in pages ? location.hash.slice(1) : "overview";
    if (guard()) render();
})().catch((error) => {
    document.querySelector("#loginError").textContent = error.message;
});
