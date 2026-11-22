(async function initializeApp() {
    const $ = (selector) => document.querySelector(selector);
    const $$ = (selector) => [...document.querySelectorAll(selector)];

    const budgetInput = $("#budget");
    budgetInput.value = read("riglab-budget", 12000);
    budgetInput.oninput = () => {
        try {
            localStorage.setItem("riglab-budget", JSON.stringify(Number(budgetInput.value)));
        } catch {
            // The current budget remains available in the input.
        }
    };
    function adjustBudget(amount) {
        budgetInput.value = Math.max(1, Number(budgetInput.value) + amount);
        budgetInput.dispatchEvent(new Event("input", { bubbles: true }));
    }
    $("#increaseBudget").onclick = () => adjustBudget(500);
    $("#decreaseBudget").onclick = () => adjustBudget(-500);
    budgetInput.onkeydown = (event) => {
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
        event.preventDefault();
        adjustBudget(event.key === "ArrowUp" ? 500 : -500);
    };

    const { cats } = window.RigCatalog;

    const db = Object.fromEntries(cats.map((category) => [category[0], []]));

    async function loadCatalog() {
        const response = await fetch("/api/parts", { cache: "no-store" });
        if (!response.ok) {
            throw new Error("配件加载失败，状态码 " + response.status);
        }
        const parts = await response.json();
        const catalog = Object.fromEntries(cats.map((category) => [category[0], []]));
        for (const part of parts) {
            if (catalog[part.category]) catalog[part.category].push(part);
        }
        Object.assign(db, catalog);
    }

    await loadCatalog();

    function read(k, f) {
        try {
            return JSON.parse(localStorage.getItem(k)) ?? f;
        } catch {
            return f;
        }
    }
    let selected = read("riglab-build", {});
    for (const k in selected) if (!db[k]?.some((x) => x.id === selected[k])) delete selected[k];
    let saved = read("riglab-saved", []);
    if (!Array.isArray(saved)) saved = [];
    let user = await RigAuth.me(),
        cat = "cpu",
        brand = "全部",
        mode = "custom";
    let title = read("riglab-title", "我的梦想主机");
    $("#buildName").value = title;
    const esc = (s) =>
        String(s).replace(
            /[&<>"']/g,
            (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
        );
    const get = (k, s = selected) => db[k]?.find((x) => x.id === s[k]);
    const isBuildComplete = () => cats.every(([key]) => get(key));
    const money = (n) => n.toLocaleString("zh-CN");
    const sum = (s) => Object.keys(s).reduce((t, k) => t + (get(k, s)?.price || 0), 0);
    function persist() {
        try {
            localStorage.setItem("riglab-build", JSON.stringify(selected));
            localStorage.setItem("riglab-saved", JSON.stringify(saved));
            localStorage.setItem("riglab-title", JSON.stringify($("#buildName").value));
            localStorage.setItem("riglab-budget", JSON.stringify(Number($("#budget").value)));
        } catch {
            toast("浏览器存储不可用，本次配置仍可导出。");
        }
    }
    function toast(s) {
        $("#toast").textContent = s;
        $("#toast").classList.add("show");
        clearTimeout(window.tt);
        window.tt = setTimeout(() => $("#toast").classList.remove("show"), 3000);
    }
    function renderCategories() {
        $("#categories").innerHTML = cats
            .map(
                ([k, i, n, e]) =>
                    `<button class="category ${k === cat ? "active" : ""}" data-cat="${k}"><span class="ico">${i}</span>${n}<em class="${get(k) ? "done" : ""}">${get(k) ? "✓" : e === "Motherboard" ? "MB" : e === "Memory" ? "RAM" : e === "Cooling" ? "FAN" : e}</em></button>`,
            )
            .join("");
        $$("[data-cat]").forEach(
            (b) =>
                (b.onclick = () => {
                    cat = b.dataset.cat;
                    brand = "全部";
                    $("#search").value = "";
                    renderCategories();
                    renderCatalog();
                }),
        );
    }
    function renderCatalog() {
        const c = cats.find((c) => c[0] === cat);
        $("#catTitle").textContent = `${c[2]} ${c[3]}`;
        $("#catDesc").textContent = c[4];
        $("#step").textContent = String(cats.indexOf(c) + 1).padStart(2, "0") + " / 13";
        $("#brands").innerHTML = ["全部", ...new Set(db[cat].map((x) => x.brand))]
            .map(
                (b) =>
                    `<button class="${brand === b ? "active" : ""}" data-brand="${esc(b)}">${esc(b)}</button>`,
            )
            .join("");
        $$("[data-brand]").forEach(
            (b) =>
                (b.onclick = () => {
                    brand = b.dataset.brand;
                    renderCatalog();
                }),
        );
        let rows = db[cat].filter(
            (p) =>
                (brand === "全部" || brand === p.brand) &&
                `${esc(p.name)} ${esc(p.brand)} ${esc(p.spec)}`
                    .toLowerCase()
                    .includes($("#search").value.toLowerCase()),
        );
        if ($("#sort").value !== "default")
            rows.sort((a, b) => ($("#sort").value === "asc" ? 1 : -1) * (a.price - b.price));
        $("#products").innerHTML = rows.length
            ? rows
                  .map(
                      (p) =>
                          `<article class="product ${selected[cat] === p.id ? "selected" : ""}"><div class="product-art">${cat === "cpu" ? `<div class="chip ${p.brand === "AMD" ? "amd" : ""}">${esc(p.brand)}<strong>${esc(p.chip)}</strong><small>CORE</small></div>` : `<span class="hardware-icon">${c[1]}</span>`}</div><div class="product-info">${p.tag ? `<span class="tag">${esc(p.tag)}</span>` : ""}<h4>${esc(p.name)}</h4><div class="spec">${esc(p.spec)}${p.socket ? " · " + p.socket : ""}</div><div class="product-bottom"><span class="price"><small>¥</small>${money(p.price)}</span><button class="add" aria-label="${selected[cat] === p.id ? "移除" : "选择"} ${esc(p.name)}" data-add="${p.id}">${selected[cat] === p.id ? "✓" : "+"}</button></div></div></article>`,
                  )
                  .join("")
            : '<div class="empty-selection">没有匹配的配件，试试其他关键词。</div>';
        $$("#products .product").forEach((product, index) => {
            product.style.animationDelay = String(index * 35) + "ms";
        });
        $$("[data-add]").forEach(
            (b) =>
                (b.onclick = () => {
                    const id = Number(b.dataset.add);
                    const wasComplete = isBuildComplete();
                    if (selected[cat] === id) delete selected[cat];
                    else selected[cat] = id;
                    update();
                    renderCatalog();
                    if (!wasComplete && isBuildComplete()) showPurchaseLinks();
                }),
        );
    }
    function update() {
        const n = Object.keys(selected).length,
            total = sum(selected),
            budget = Math.max(1, Number($("#budget").value) || 1);
        $("#count").textContent = saved.length;
        $("#budgetBar").style.width = Math.min((total / budget) * 100, 100) + "%";
        $("#budgetBar").style.background = total > budget ? "#e9a968" : "";
        $("#budgetText").textContent =
            total > budget
                ? `超出预算 ¥${money(total - budget)}`
                : `预算剩余 ¥${money(budget - total)}`;
        $("#selectedCount").textContent = `${n} / 13 已选择`;
        $("#total").textContent = "¥ " + money(total);
        $("#selection").innerHTML = n
            ? cats
                  .filter((c) => get(c[0]))
                  .map(([k, i, label]) => {
                      let p = get(k);
                      return `<div class="selected-row"><span>${i}</span><div><small>${label}</small><p title="${esc(p.name)}">${esc(p.name)}</p><b>¥ ${money(p.price)}</b></div><button data-remove="${k}" aria-label="移除${label}">×</button></div>`;
                  })
                  .join("")
            : '<div class="empty-selection">▧<br>你的装机旅程，从一颗芯片开始<br>选择左侧配件，组建梦想主机</div>';
        $$("[data-remove]").forEach(
            (b) =>
                (b.onclick = () => {
                    delete selected[b.dataset.remove];
                    update();
                    renderCatalog();
                }),
        );
        let issues = [];
        if (get("cpu") && get("board") && get("cpu").socket !== get("board").socket)
            issues.push("CPU 与主板插槽不兼容");
        if (get("ram") && get("board") && get("ram").ddr !== get("board").ddr)
            issues.push("内存代际与主板不兼容");
        const power = (get("cpu")?.power || 0) + (get("gpu")?.power || 0) + 100;
        if (get("psu") && get("psu").watts < power * 1.25)
            issues.push("电源余量不足，建议至少 " + Math.ceil((power * 1.25) / 50) * 50 + "W");
        $("#compat").className = "compat" + (issues.length ? " warn" : "");
        $("#compat").textContent = issues.length
            ? "⚠ " + issues.join("；")
            : n
              ? "✓ 已选配件暂无基础兼容冲突。机箱尺寸、散热扣具及 BIOS 版本请另行核实。"
              : "ⓘ 选配后将自动检查基础兼容性";
        renderCategories();
        persist();
        window.dispatchEvent(new Event("riglab:change"));
    }
    function preset(kind) {
        const plan = {
            cpu: kind === "creator" ? 3 : 2,
            gpu: 5,
            board: kind === "creator" ? 8 : 9,
            ssd: 12,
            ram: 14,
            fan: 17,
            psu: 20,
            case: 22,
        };
        if (Object.keys(plan).some((k) => !db[k].some((p) => p.id === plan[k])))
            return toast("推荐方案包含已下架配件，请自由搭配现有型号");
        selected = plan;
        $("#buildName").value =
            kind === "creator" ? "灵感工作站 · 创作配置" : "帧率自由 · 2K 游戏配置";
        update();
        renderCatalog();
    }
    const community = [
        {
            id: "c1",
            name: "帧率自由 · 2K 高刷游戏主机",
            author: "像素玩家",
            tag: "游戏电竞",
            theme: "",
            selection: { cpu: 2, gpu: 5, board: 9, ssd: 12, ram: 14, fan: 17, psu: 20, case: 22 },
        },
        {
            id: "c2",
            name: "灵感引擎 · 剪辑与创作工作站",
            author: "Studio 七",
            tag: "创意生产力",
            theme: "purple",
            selection: { cpu: 3, gpu: 5, board: 8, ssd: 12, ram: 15, fan: 18, psu: 20, case: 22 },
        },
        {
            id: "c3",
            name: "小而强大 · 高性价比入门搭配",
            author: "硬件观察员",
            tag: "日常全能",
            theme: "dark",
            selection: { cpu: 4, gpu: 7, board: 9, ssd: 13, ram: 14, fan: 17, psu: 19, case: 23 },
        },
    ];
    function card(b, isSaved) {
        const parts = Object.keys(b.selection)
            .map((k) => get(k, b.selection)?.name)
            .filter(Boolean);
        return `<article class="build-card"><div class="build-cover ${b.theme || ""}"><div class="mini-pc"><div class="fan"></div><div class="fan"></div><div class="fan"></div></div></div><div class="build-body"><div class="eyebrow">${esc(b.tag || "MY COLLECTION")}</div><h3 style="margin-top:12px">${esc(b.name)}</h3><p>${esc(parts.slice(0, 3).join(" / "))}</p><div class="build-meta"><span>${esc(b.author || "我")} · ${parts.length} 件配件</span><strong>¥ ${money(sum(b.selection))}</strong></div><div class="card-actions"><button data-detail="${b.id}">查看清单 ↗</button><button data-load="${b.id}">套用配置</button><button data-${isSaved ? "delete" : "favorite"}="${b.id}" aria-label="${isSaved ? "删除收藏" : "收藏配置"}">${isSaved ? "删除" : "♡"}</button></div></div></article>`;
    }
    let view = "builder";
    function showView() {
        view = location.hash.slice(1) || "builder";
        if (view === "profile") {
            location.replace("/profile.html");
            return;
        }
        if (!["builder", "community", "favorites"].includes(view)) view = "builder";
        $$("nav a").forEach((a) => a.classList.toggle("active", a.hash === "#" + view));
        $("#builderView").hidden = view !== "builder";
        $("#cardsView").hidden = view === "builder";
        $(".subtabs").hidden = view !== "builder";
        $("#pageTitle").textContent = {
            builder: "开始你的专属配置 ↘",
            community: "玩家灵感社区 ↗",
            favorites: "我的配置收藏 ♡",
        }[view];
        if (view !== "builder") renderCards();
    }
    function renderCards() {
        const isSaved = view === "favorites",
            rows = isSaved ? saved : community;
        $("#cardsView").innerHTML =
            (!isSaved
                ? '<p style="color:#919986;font-size:12px;margin:0 0 24px">不同需求，同样热爱。发现下一台电脑的灵感。<span style="float:right">示例社区 · 3 套精选配置</span></p>'
                : "") +
            (rows.length
                ? `<div class="cards-grid">${rows.map((x) => card(x, isSaved)).join("")}</div>`
                : '<div class="empty-state"><h3>你的灵感收藏夹，等待第一套配置</h3><p>在装机页保存配置，或收藏社区里的喜欢方案。</p><a href="#builder">开始搭配 ↗</a></div>');
        const find = (id) => rows.find((x) => x.id === id);
        $$("[data-load]").forEach((b) => (b.onclick = () => loadBuild(find(b.dataset.load))));
        $$("[data-detail]").forEach((b) => (b.onclick = () => detail(find(b.dataset.detail))));
        $$("[data-delete]").forEach(
            (b) =>
                (b.onclick = () => {
                    saved = saved.filter((x) => x.id !== b.dataset.delete);
                    update();
                    renderCards();
                    toast("已删除这份收藏");
                }),
        );
        $$("[data-favorite]").forEach(
            (b) => (b.onclick = () => saveBuild(find(b.dataset.favorite))),
        );
    }
    function saveBuild(b) {
        if (!Object.keys(b.selection).length) return toast("先选择一件配件再收藏吧");
        if (
            saved.some(
                (s) =>
                    s.name === b.name &&
                    JSON.stringify(s.selection) === JSON.stringify(b.selection),
            )
        )
            return toast("这套配置已经在收藏夹中");
        saved.unshift({ ...b, id: "s" + Date.now(), selection: { ...b.selection } });
        update();
        toast("已收藏，前往「我的收藏」查看");
    }
    function loadBuild(b) {
        selected = Object.fromEntries(
            Object.entries(b.selection).filter(([k, id]) => db[k]?.some((p) => p.id === id)),
        );
        $("#buildName").value = b.name;
        location.hash = "builder";
        update();
        renderCatalog();
        toast("配置已套用，可以继续调整");
    }
    function openModal(html) {
        $("#modalContent").innerHTML = html;
        $("#modal").showModal();
    }
    function purchaseLink(p) {
        try {
            const url = new URL(p.purchase_url);
            if (url.protocol !== 'https:' || url.username || url.password) return '<small>暂无购买链接</small>';
            return `<a class="purchase-link" href="${esc(url.href)}" target="_blank" rel="noopener noreferrer">${p.purchase_kind === 'product' ? '前往商品页' : '京东搜索同型号'} ↗</a>`;
        } catch { return '<small>暂无购买链接</small>'; }
    }
    function showPurchaseLinks() {
        const rows = cats.filter(c => get(c[0]));
        if (!rows.length) return toast('请先选择配件');
        openModal(`<div class="eyebrow">SHOPPING LIST</div><h2>配件购买链接</h2><p>参考合计 ¥ ${money(sum(selected))}。参考价非实时报价，成交价以商城为准。搜索结果中请核对品牌、型号、容量及店铺。</p>${rows.map(([k,i,n]) => {
            const p = get(k);
            return `<div class="selected-row"><span>${i}</span><div><small>${n}</small><p>${esc(p.brand)} ${esc(p.name)}</p><b>参考 ¥ ${money(p.price)}</b><div>${purchaseLink(p)}</div></div></div>`;
        }).join('')}`);
    }
    $('#purchase').onclick = showPurchaseLinks;
    function detail(b) {
        openModal(
            `<div class="eyebrow">BUILD DETAILS</div><h2>${esc(b.name)}</h2><p>参考总价 ¥ ${money(sum(b.selection))} · 演示价格</p>${cats
                .filter((c) => get(c[0], b.selection))
                .map(
                    ([k, i, n]) =>
                        `<div class="selected-row"><span>${i}</span><div><small>${n}</small><p>${esc(get(k, b.selection).name)}</p></div><b>¥ ${money(get(k, b.selection).price)}</b></div>`,
                )
                .join("")}<button class="primary" id="modalLoad">套用这套配置 ↗</button>`,
        );
        $("#modalLoad").onclick = () => {
            $("#modal").close();
            loadBuild(b);
        };
    }

    let authMode = "login";
    function avatarMarkup(account) {
        return account.avatar
            ? `<img class="user-avatar" src="${esc(account.avatar)}" alt="">`
            : `<span class="user-avatar" aria-hidden="true">${esc(Array.from(account.nickname)[0] || "我")}</span>`;
    }
    function renderAccount() {
        const account = $("#account");
        account.innerHTML = user
            ? `${avatarMarkup(user)}<span class="account-name">${esc(user.nickname)}</span>`
            : "登录 / 注册 ↗";
        account.setAttribute("aria-label", user ? "进入个人中心" : "登录或注册");
    }
    async function encodeAvatar(file) {
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
            throw new Error("请选择 5 MB 以内的 JPG、PNG 或 WebP 图片");
        }
        const image = await createImageBitmap(file).catch(() => {
            throw new Error("无法读取头像图片，请重新选择");
        });
        try {
            const canvas = document.createElement("canvas");
            canvas.width = canvas.height = 256;
            const size = Math.min(image.width, image.height);
            const context = canvas.getContext("2d");
            context.fillStyle = "#fff";
            context.fillRect(0, 0, 256, 256);
            context.drawImage(image, (image.width - size) / 2, (image.height - size) / 2, size, size, 0, 0, 256, 256);
            return canvas.toDataURL("image/jpeg", 0.85);
        } finally {
            image.close();
        }
    }
    function login() {
        const registering = authMode === "register";
        const staff = authMode === "staff";
        openModal(`<h2>${registering ? "手机号注册" : staff ? "工作人员登录后台" : "登录装机研究所"}</h2>
        <form id="authForm">
            ${registering ? `<label>手机号<input name="username" type="tel" required
                inputmode="numeric" pattern="1[3-9][0-9]{9}" autocomplete="tel-national"
                placeholder="请输入 11 位中国大陆手机号" aria-describedby="phoneError">
                <span id="phoneError" class="field-error" aria-live="polite"></span></label>` :
                `<label>${staff ? "账号" : "手机号或账号"}<input name="username" required minlength="3" maxlength="64"
                pattern="[A-Za-z0-9_]+" autocomplete="username"
                placeholder="${staff ? "请输入工作人员账号" : "请输入手机号或原账号"}"></label>`}
            ${registering ? '<label>昵称<input name="nickname" required maxlength="20" autocomplete="nickname"></label>' : ""}
            ${registering ? '<label>自定义头像（可选）<input name="avatar" type="file" accept="image/jpeg,image/png,image/webp"><small>支持 JPG、PNG、WebP，最大 5 MB</small></label>' : ""}
            <label>密码<input name="password" type="password" required minlength="8"
                maxlength="128" autocomplete="${registering ? "new-password" : "current-password"}"></label>
            ${registering ? '<label>确认密码<input name="confirm_password" type="password" required minlength="8" maxlength="128" autocomplete="new-password" placeholder="请再次输入密码"></label>' : ""}
            <p id="authError" role="alert"></p>
            <button class="primary" type="submit">${registering ? "注册并登录" : staff ? "登录并进入后台" : "登录"}</button>
        </form>
        <button id="authSwitch" style="margin-top:16px">
            ${registering || staff ? "返回用户登录" : "手机号注册"}
        </button>
        ${!registering && !staff ? '<button id="staffLogin" style="margin-top:16px">工作人员登录后台 ↗</button>' : ""}`);
        if ($("#staffLogin")) {
            $("#staffLogin").onclick = () => {
                authMode = "staff";
                $("#modal").close();
                login();
            };
        }
        $("#authSwitch").onclick = () => {
            authMode = registering || staff ? "login" : "register";
            $("#modal").close();
            login();
        };
        const form = $("#authForm");
        if (registering) {
            const phone = form.elements.namedItem("username");
            const phoneError = $("#phoneError");
            const showPhoneError = () => {
                const invalid = !phone.validity.valid;
                phone.setAttribute("aria-invalid", String(invalid));
                phoneError.textContent = !invalid ? "" : phone.validity.valueMissing
                    ? "请输入手机号"
                    : "手机号格式不正确，请输入 11 位中国大陆手机号";
            };
            phone.addEventListener("input", showPhoneError);
            phone.addEventListener("invalid", showPhoneError);
        }
        form.onsubmit = async (event) => {
            event.preventDefault();
            const button = event.target.querySelector('[type="submit"]');
            button.disabled = true;
            const fields = Object.fromEntries(new FormData(event.target));
            try {
                if (registering && fields.password !== fields.confirm_password) {
                    throw new Error("两次输入的密码不一致，请重新输入");
                }
                if (registering) {
                    const file = fields.avatar;
                    delete fields.avatar;
                    if (file?.name) fields.avatar = await encodeAvatar(file);
                }
                user = registering
                    ? await RigAuth.request("/api/auth/register", {
                          method: "POST",
                          body: JSON.stringify(fields),
                      })
                    : staff
                      ? await RigAuth.request("/api/auth/staff-login", {
                            method: "POST",
                            body: JSON.stringify(fields),
                        })
                      : await RigAuth.login(fields.username, fields.password);
                event.target.reset();
                renderAccount();
                $("#modal").close();
                if (staff) {
                    location.assign("/admin.html");
                    return;
                }
                toast("欢迎，" + user.nickname);
            } catch (error) {
                $("#authError").textContent = error.message;
            } finally {
                button.disabled = false;
            }
        };
    }
    $("#account").onclick = async () => {
        try {
            user = await RigAuth.me();
            renderAccount();
            if (!user) return login();
            location.assign("/profile.html");
        } catch (error) {
            toast(error.message);
        }
    };

    $("#save").onclick = () =>
        saveBuild({ name: $("#buildName").value.trim() || "未命名配置", selection: selected });
    budgetInput.oninput = update;
    $("#buildName").oninput = persist;
    $("#search").oninput = renderCatalog;
    $("#sort").onchange = renderCatalog;
    $("#reset").onclick = () => {
        openModal(
            '<h2>重新搭配？</h2><p>清空当前选配清单，已经收藏的配置仍可恢复。</p><button class="primary" id="confirmReset">清空当前清单</button>',
        );
        $("#confirmReset").onclick = () => {
            selected = {};
            update();
            renderCatalog();
            $("#modal").close();
        };
    };
    $("#export").onclick = () => {
        if (!Object.keys(selected).length) return toast("请先选择配件");
        const text = [
            $("#buildName").value,
            "RIGLAB 装机清单 · 演示参考价格",
            "",
            ...cats
                .filter((c) => get(c[0]))
                .map(([k, i, n]) => `${n}：${get(k).name}  参考 ¥${get(k).price}\n购买入口（${get(k).purchase_kind === "product" ? "商品页" : "商城搜索"}）：${get(k).purchase_url || "暂无"}`),
            "",
            `合计：¥${sum(selected)}`,
            "请在购买前核对实时价格、BIOS 版本、散热器与机箱尺寸。",
        ].join("\n");
        const url = URL.createObjectURL(
            new Blob(["\ufeff" + text], { type: "text/plain;charset=utf-8" }),
        );
        const a = document.createElement("a");
        a.href = url;
        a.download = "RIGLAB-配置清单.txt";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        toast("配置清单已导出");
    };
    $$("[data-mode]").forEach(
        (b) =>
            (b.onclick = () => {
                mode = b.dataset.mode;
                $$("[data-mode]").forEach((x) => x.classList.toggle("active", x === b));
                if (mode !== "custom") {
                    preset(mode);
                    toast("已载入推荐方案，可继续自由调整");
                }
            }),
    );
    $(".close").onclick = () => $("#modal").close();
    $("#modal").onclick = (e) => {
        if (e.target === $("#modal")) {
            const r = e.target.getBoundingClientRect();
            if (
                e.clientX < r.left ||
                e.clientX > r.right ||
                e.clientY < r.top ||
                e.clientY > r.bottom
            )
                e.target.close();
        }
    };
    window.onhashchange = showView;
    update();
    renderCatalog();
    renderAccount();
    showView();

    window.RigBuilder = {
        snapshot() {
            return {
                selection: { ...selected },
                budget: Number($("#budget").value),
                total: sum(selected),
            };
        },
        async applyPlan(selection, name, budget, checkedParts) {
            await loadCatalog();
            // 使用服务端应用前核价结果，价格明确转为数值。
            const checked = Object.fromEntries(checkedParts.map((part) => [part.category, part]));
            for (const [category, id] of Object.entries(selection)) {
                if (checked[category]?.id !== id || !db[category]?.some((part) => part.id === id)) {
                    throw new Error("推荐配件状态已变化，请重新生成方案");
                }
            }
            for (const [category, part] of Object.entries(checked)) {
                const index = db[category].findIndex((item) => item.id === part.id);
                db[category][index] = { ...db[category][index], ...part, price: Number(part.price) };
            }
            $("#budget").value = budget;
            loadBuild({ name, selection: { ...selection } });
            showView();
            showPurchaseLinks();
        },
    };
    window.dispatchEvent(new Event("riglab:ready"));

    let refreshingCatalog = false;
    window.addEventListener("focus", async () => {
        if (refreshingCatalog) return;
        refreshingCatalog = true;
        try {
            await loadCatalog();
            for (const category of Object.keys(selected)) {
                if (!db[category]?.some((part) => part.id === selected[category])) {
                    delete selected[category];
                }
            }
            update();
            renderCatalog();
            showView();
        } catch (error) {
            toast(error.message);
        } finally {
            refreshingCatalog = false;
        }
    });
})().catch((error) => {
    console.error(error);
    alert("页面初始化失败，请确认 FastAPI 和数据库连接正常。");
});
