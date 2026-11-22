function initializeAssistant(builder) {
    const launcher = document.createElement("button");
    launcher.type = "button";
    launcher.className = "ai-launcher";
    launcher.setAttribute("aria-label", "AI 装机助手");
    launcher.title = "点击打开 AI 助手，慢拖可定位，快甩可回弹";
    launcher.innerHTML = `
        <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <path d="M16 9V6M14.5 5h3M7 16H5v5h2m18-5h2v5h-2"
                stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
            <rect x="7" y="9" width="18" height="16" rx="6"
                stroke="currentColor" stroke-width="1.7"/>
            <circle cx="12.5" cy="16.5" r="1.4" fill="currentColor"/>
            <circle cx="19.5" cy="16.5" r="1.4" fill="currentColor"/>
            <path d="M14 20c1.1 1 2.9 1 4 0" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            <path d="M26 2v6m-3-3h6" stroke="#e7ff9e" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        <span aria-hidden="true">AI</span>`;
    launcher.setAttribute("aria-controls", "aiChat");
    launcher.setAttribute("aria-expanded", "false");
    const panel = document.createElement("section");
    panel.id = "aiChat";
    panel.hidden = true;
    panel.className = "ai-panel";
    panel.setAttribute("aria-label", "AI 装机助手");
    panel.innerHTML = `
        <div class="ai-heading" title="按住标题可拖动窗口"><div>
            <div class="ai-kicker">YOUR PERSONAL BUILD ADVISOR</div>
            <h2>AI 装机助手</h2>
        </div><a href="/ai-settings.html">服务设置</a>
        <button type="button" class="ai-close" aria-label="关闭 AI 助手">×</button></div>
        <div class="ai-chat-log" role="log" aria-label="装机对话">
            <p class="ai-bubble">你好！告诉我预算、用途和偏好，我会从配件库里挑选一套配置。需要外设时，请在下方勾选。也可以让我点评当前搭配。</p>
            <p class="ai-notice">开启对话记忆时，账号最多保存最近 150 轮问答，相关历史会作为上下文发送给 AI 服务。可在个人中心关闭。</p>
        </div>
        <form id="aiForm" class="ai-form" novalidate>
            <label>你的装机需求
                <textarea id="aiPurpose" minlength="2" maxlength="1000"
                    placeholder="例如：预算 6000 元，主要玩 2K 游戏，希望安静。"></textarea>
            </label>
            <label><input id="aiFollowUp" type="checkbox" checked> 接着上一套推荐调整（在下方修改预算或外设可覆盖上次设置）</label>
            <details><summary>预算与外设</summary>
            <label>总预算（元）<input id="aiBudget" type="number" min="1" max="1000000"
                step="0.01"></label>
            <fieldset><legend>预算需要包含哪些外设？主机八类配件会自动包含。</legend>
                <div class="ai-options">
                    <label><input type="checkbox" value="monitor">显示器</label>
                    <label><input type="checkbox" value="keyboard">键盘</label>
                    <label><input type="checkbox" value="mouse">鼠标</label>
                    <label><input type="checkbox" value="headset">耳机</label>
                    <label><input type="checkbox" value="speaker">音响</label>
                </div>
            </fieldset>
            </details>
        </form>
        <div class="ai-examples">
            <button type="button" data-purpose="主要玩 2K 游戏，兼顾日常使用，希望帧率稳定、噪音低。">2K 游戏</button>
            <button type="button" data-purpose="主要做视频剪辑、图片处理和多任务办公，希望预览流畅、存储充足。">剪辑创作</button>
            <button type="button" data-purpose="主要办公、编程和学习，希望稳定安静，优先考虑性价比。">办公编程</button>
        </div>
        <div class="ai-actions">
            <button class="primary" type="submit" form="aiForm" id="aiRecommend">发送并生成 ↑</button>
            <button type="button" id="aiReview">点评当前配置</button>
        </div>
        <p id="aiMessage" class="ai-message" role="status" aria-live="polite">正在检查 AI 服务…</p>
        `;
    document.body.append(launcher, panel);
    const find = (selector) => panel.querySelector(selector);
    const log = find(".ai-chat-log");
    const purpose = find("#aiPurpose");
    const budget = find("#aiBudget");
    const followUp = find("#aiFollowUp");
    const peripheralOptions = find(".ai-options");
    const status = find("#aiMessage");
    budget.value = builder.snapshot().budget;
    let budgetEdited = false;
    let peripheralsEdited = false;
    budget.addEventListener("input", () => { budgetEdited = true; });
    peripheralOptions.addEventListener("change", () => { peripheralsEdited = true; });
    let busy = false;
    let lastPurpose = "";
    const reviews = [];
    const keepLauncherVisible = makeAssistantDraggable(launcher, launcher, true);
    const keepPanelVisible = makeAssistantDraggable(panel, find(".ai-heading"));
    window.addEventListener("resize", () => {
        keepLauncherVisible();
        keepPanelVisible();
    });
    let panelOpen = false;
    let panelAnimation;
    function toggle(open) {
        if (open === panelOpen) return;
        panelOpen = open;
        launcher.setAttribute("aria-expanded", String(open));
        const wasHidden = panel.hidden;
        const style = getComputedStyle(panel);
        const current = { transform: style.transform, opacity: style.opacity };
        panelAnimation?.cancel();
        panelAnimation = undefined;
        panel.hidden = false;
        panel.inert = !open;
        if (open) {
            keepPanelVisible();
            log.scrollTop = log.scrollHeight;
            purpose.focus({ preventScroll: true });
        } else {
            launcher.focus({ preventScroll: true });
        }

        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !panel.animate) {
            panel.hidden = !open;
            return;
        }
        const button = launcher.getBoundingClientRect();
        const dialog = panel.getBoundingClientRect();
        const x = button.left + button.width / 2 - (dialog.left + dialog.width / 2);
        const y = button.top + button.height / 2 - (dialog.top + dialog.height / 2);
        const collapsed = { transform: `translate(${x}px, ${y}px) scale(0.12)`, opacity: 0 };
        const expanded = { transform: "none", opacity: 1 };
        const animation = panel.animate([wasHidden ? collapsed : current, open ? expanded : collapsed], {
            duration: open ? 320 : 240,
            easing: open ? "cubic-bezier(0.16, 1, 0.3, 1)" : "cubic-bezier(0.4, 0, 0.6, 1)",
            fill: "both",
        });
        panelAnimation = animation;
        animation.onfinish = () => {
            if (panelAnimation !== animation) return;
            panel.hidden = !open;
            animation.cancel();
            panelAnimation = undefined;
        };
    }
    launcher.onclick = () => toggle(!panelOpen);
    find(".ai-close").onclick = () => toggle(false);
    panel.addEventListener("keydown", (event) => {
        if (event.key === "Escape") toggle(false);
    });
    const fingerprint = () =>
        JSON.stringify(builder.snapshot().selection) + "|" + builder.snapshot().total;

    function setBusy(value, message) {
        busy = value;
        panel.setAttribute("aria-busy", String(value));
        panel.querySelectorAll("button:not(.ai-close)").forEach((button) => {
            button.disabled = value;
        });
        for (const input of [budget, followUp, ...peripheralOptions.querySelectorAll("input")]) {
            input.disabled = value;
        }
        find("#aiMessage").textContent = message;
    }
    function inputs() {
        return {
            purpose: purpose.value.trim(),
            budget: Number(budget.value),
            peripherals: [...peripheralOptions.querySelectorAll("input:checked")].map(
                (input) => input.value,
            ),
        };
    }
    function element(tag, content, parent = log) {
        const node = document.createElement(tag);
        node.textContent = content;
        parent.append(node);
        return node;
    }
    function showResult(data, plan, request, snapshotFingerprint) {
        const result = element("article", "");
        result.className = "ai-bubble ai-result";
        const add = (tag, content) => element(tag, content, result);
        add("h3", plan ? data.title : "当前配置 · 性能点评");
        add("p", data.summary);
        if (plan) {
            const peripherals = data.peripherals.map(
                (key) => RigCatalog.cats.find((category) => category[0] === key)?.[2] || key,
            );
            add("p", "本次预算 ¥" + Number(data.budget).toLocaleString("zh-CN") +
                (peripherals.length ? " · 含" + peripherals.join("、") : " · 仅主机"));
        }
        add("strong", "配件库参考总价 ¥" + Number(data.total).toLocaleString("zh-CN"));
        if (plan) {
            const table = add("table", "");
            const head = table.createTHead().insertRow();
            for (const heading of ["分类", "推荐型号", "参考价"]) {
                element("th", heading, head);
            }
            const body = table.createTBody();
            for (const part of data.parts) {
                const row = body.insertRow();
                const category =
                    RigCatalog.cats.find((item) => item[0] === part.category)?.[2] || part.category;
                for (const value of [
                    category,
                    part.name,
                    "¥" + Number(part.price).toLocaleString("zh-CN"),
                ]) {
                    element("td", value, row);
                }
            }
        }
        for (const [key, title] of [
            ["warnings", "配置检查"],
            ["strengths", "适合之处"],
            ["limitations", "需要留意"],
            ["suggestions", "调整与升级建议"],
        ]) {
            if (!data[key]?.length) continue;
            add("h4", title);
            const list = add("ul", "");
            for (const text of data[key]) element("li", text, list);
        }
        if (plan) {
            const apply = add("button", "一键应用这套方案 →");
            apply.type = "button";
            apply.className = "primary";
            apply.onclick = async () => {
                if (busy) return;
                setBusy(true, "正在核对最新价格和配件状态…");
                try {
                    const checked = await RigAuth.request("/api/ai/validate", {
                        method: "POST",
                        body: JSON.stringify({ ...request, selection: data.selection }),
                    });
                    await builder.applyPlan(
                        data.selection,
                        data.title,
                        request.budget,
                        checked.parts,
                    );
                    find("#aiMessage").textContent =
                        "方案已应用。你可以继续选择、移除或更换配件，再点击“点评当前配置”。";
                } catch (error) {
                    find("#aiMessage").textContent = error.message;
                } finally {
                    setBusy(false, status.textContent);
                }
            };
        }
        add("p", data.notice).className = "ai-notice";
        if (!plan) {
            const notice = add("p", "");
            notice.className = "ai-stale";
            reviews.push({ notice, snapshotFingerprint });
            updateReviews();
        }
    }
    function updateReviews() {
        const current = fingerprint();
        for (const { notice, snapshotFingerprint } of reviews) {
            notice.textContent = snapshotFingerprint === current
                ? ""
                : "这份点评对应提交时的配置，可以重新点评当前搭配。";
        }
    }
    async function readAnswer(path, request, preview) {
        const response = await fetch(path, {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
            body: JSON.stringify(request),
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(typeof error.detail === "string" ? error.detail : "AI 请求失败，请检查输入后重试。");
        }
        if (!response.headers.get("content-type")?.includes("application/x-ndjson")) {
            throw new Error("AI 流式接口尚未启动，请重启网站服务后刷新页面。");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let pending = "";
        let content = "";
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) throw new Error("AI 回答在完成前中断，请重试。");
                pending += decoder.decode(value, { stream: true });
                const lines = pending.split("\n");
                pending = lines.pop();
                for (const line of lines) {
                    if (!line.trim()) continue;
                    const event = JSON.parse(line);
                    if (event.type === "result") return event.data;
                    if (event.type === "error") throw new Error(event.data);
                    if (event.type === "reset") {
                        content = "";
                        preview.textContent = "正在重新生成回答…";
                    }
                    if (event.type === "delta") {
                        content += event.data;
                        // Decode only complete characters from the partial JSON summary string.
                        const summary = content.match(/"summary"\s*:\s*"((?:[^"\\\x00-\x1f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*)/);
                        if (summary?.[1]) {
                            preview.textContent = JSON.parse('"' + summary[1] + '"');
                            log.scrollTop = log.scrollHeight;
                        }
                    }
                }
            }
        } finally {
            await reader.cancel().catch(() => {});
            reader.releaseLock();
        }
    }
    async function generate(plan) {
        if (busy) return;
        const message = purpose.value.trim();
        const amount = message.match(/预算\s*(?:是|为|约|[:：])?\s*¥?\s*(-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)\s*(万|千|[kK])?(?![\d.]|,\d)/)
            || message.match(/^\s*(\d+(?:\.\d+)?)\s*(万|千|[kK]|元|块)/);
        if (amount) {
            const unit = { 万: 10000, 千: 1000, k: 1000 };
            budget.value = Number(amount[1].replaceAll(",", "")) * (unit[amount[2]?.toLowerCase()] || 1);
            budgetEdited = true;
        }
        if (!budget.value || !budget.validity.valid) {
            budget.closest("details").open = true;
            status.textContent = "请输入 1 至 100 万元的有效预算，最多保留两位小数。";
            budget.focus();
            return;
        }
        const request = inputs();
        const continuing = plan && followUp.checked;
        const inherit = [];
        if (continuing && !budgetEdited) inherit.push("budget");
        if (continuing && !peripheralsEdited) inherit.push("peripherals");
        if (plan && message.length < 2) {
            status.textContent = "请先输入用途或配置需求。";
            purpose.focus();
            return;
        }
        if (!plan && message.length < 2) {
            request.purpose = lastPurpose || "请点评当前搭配的兼容性、性能和升级空间。";
        }
        const state = builder.snapshot();
        if (!plan && !Object.keys(state.selection).length) {
            find("#aiMessage").textContent = "请先选择配件，或生成一套推荐方案。";
            return;
        }
        const snapshotFingerprint = fingerprint();
        const peripherals = [...peripheralOptions.querySelectorAll("input:checked")]
            .map((input) => input.parentElement.textContent.trim()).join("、");
        element("p", (plan ? message : "点评当前配置" + (message ? " · " + message : "")) +
            (inherit.includes("budget") ? "\n预算沿用上次（若有）" : "\n预算 ¥" + request.budget.toLocaleString("zh-CN")) +
            (inherit.includes("peripherals") ? " · 外设沿用上次（若有）" : peripherals ? " · 含" + peripherals : "")).className = "ai-bubble ai-user";
        log.scrollTop = log.scrollHeight;
        setBusy(true, plan ? "正在按用途和预算挑选配件，请稍候…" : "正在分析当前配置，请稍候…");
        let preview;
        try {
            if (!(await RigAuth.me())) {
                throw new Error("请先点击页面右上角登录，再使用 AI 助手。");
            }
            preview = element("p", "正在等待 AI 回答…");
            preview.className = "ai-bubble ai-result";
            const data = await readAnswer(
                "/api/ai/" + (plan ? "recommend" : "review"),
                plan ? { ...request, follow_up: continuing, inherit } : { ...request, selection: state.selection },
                preview,
            );
            const effective = plan ? { ...request, budget: Number(data.budget), peripherals: data.peripherals } : request;
            showResult(data, plan, effective, snapshotFingerprint);
            if (plan) {
                budget.value = effective.budget;
                for (const input of peripheralOptions.querySelectorAll("input")) {
                    input.checked = effective.peripherals.includes(input.value);
                }
                budgetEdited = false;
                peripheralsEdited = false;
                followUp.checked = true;
            }
            lastPurpose = request.purpose;
            if (purpose.value.trim() === message) purpose.value = "";
            find("#aiMessage").textContent = plan
                ? "方案已生成，核对后可一键应用。"
                : "点评已完成。";
        } catch (error) {
            element("p", error.message).className = "ai-bubble ai-stale";
            status.textContent = "请求未完成，可修改需求后重试。";
        } finally {
            preview?.remove();
            setBusy(false, status.textContent);
            log.scrollTop = log.scrollHeight;
        }
    }
    find("#aiForm").onsubmit = (event) => {
        event.preventDefault();
        generate(true);
    };
    find("#aiReview").onclick = () => generate(false);
    panel.querySelectorAll("[data-purpose]").forEach((button) => {
        button.onclick = () => {
            find("#aiPurpose").value = button.dataset.purpose;
            followUp.checked = false;
        };
    });
    window.addEventListener("riglab:change", updateReviews);
    RigAuth.request("/api/ai/status")
        .then((status) => {
            if (busy) return;
            find("#aiMessage").textContent = status.configured
                ? "AI 服务已就绪，登录后即可生成方案或点评。"
                : "AI 服务尚未启用。请管理员登录后台，在“AI 服务配置”中填写服务信息。";
        })
        .catch((error) => {
            if (!busy) status.textContent = error.message;
        });
}

function makeAssistantDraggable(element, handle, physics = false) {
    let drag;
    let moved = false;
    let positioned = false;
    let frame;

    function bounds() {
        const viewport = document.documentElement;
        return {
            maxX: Math.max(0, viewport.clientWidth - element.offsetWidth),
            maxY: Math.max(0, viewport.clientHeight - element.offsetHeight),
        };
    }
    const clamp = (value, limit) => Math.max(0, Math.min(value, limit));

    function place(x, y, { maxX, maxY } = bounds()) {
        element.style.left = clamp(x, maxX) + "px";
        element.style.top = clamp(y, maxY) + "px";
        element.style.right = "auto";
        element.style.bottom = "auto";
        positioned = true;
    }

    function release(vx, vy) {
        const { left, top } = element.getBoundingClientRect();
        let x = left, y = top;
        let previousTime = performance.now();
        function tick(time) {
            const dt = Math.max(0, Math.min((time - previousTime) / 1000, 0.025));
            previousTime = time;
            const limits = bounds();
            const { maxX, maxY } = limits;
            vx *= Math.exp(-0.9 * dt);
            vy += 1750 * dt;
            x += vx * dt;
            y += vy * dt;

            if (x < 0 || x > maxX) {
                x = clamp(x, maxX);
                vx = maxX === 0 ? 0 : vx * -0.68;
            }
            if (y < 0) {
                y = 0;
                vy = Math.abs(vy) * 0.6;
            }
            if (y >= maxY) {
                y = maxY;
                vy = vy > 105 && maxY > 0 ? vy * -0.53 : 0;
                vx *= Math.exp(-9 * dt);
            }
            place(x, y, limits);
            frame = y === maxY && vy === 0 && Math.abs(vx) < 12
                ? undefined : requestAnimationFrame(tick);
        }
        frame = requestAnimationFrame(tick);
    }

    handle.addEventListener("pointerdown", (event) => {
        if (!event.isPrimary || event.button !== 0 ||
            (handle !== element && event.target.closest("button, a"))) return;
        const { left, top } = element.getBoundingClientRect();
        cancelAnimationFrame(frame);
        frame = undefined;
        moved = false;
        drag = {
            id: event.pointerId, x: event.clientX, y: event.clientY, left, top,
            lastX: event.clientX, lastY: event.clientY, lastTime: event.timeStamp, vx: 0, vy: 0,
        };
        handle.setPointerCapture(drag.id);
    });
    handle.addEventListener("pointermove", (event) => {
        if (event.pointerId !== drag?.id) return;
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;
        if (!moved && Math.hypot(dx, dy) < 6) return;
        moved = true;
        const elapsed = Math.max(8, event.timeStamp - drag.lastTime);
        if (physics) {
            const velocity = (delta) => Math.max(-3600, Math.min(3600, delta * 1000 / elapsed));
            const blend = 1 - Math.exp(-elapsed / 22);
            drag.vx += (velocity(event.clientX - drag.lastX) - drag.vx) * blend;
            drag.vy += (velocity(event.clientY - drag.lastY) - drag.vy) * blend;
            drag.lastX = event.clientX;
            drag.lastY = event.clientY;
            drag.lastTime = event.timeStamp;
        }
        handle.classList.add("ai-dragging");
        place(drag.left + dx, drag.top + dy);
    });
    function finish(event) {
        if (event.pointerId !== drag?.id) return;
        if (physics && moved && event.type === "pointerup" &&
            !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            const pause = Math.max(0, event.timeStamp - drag.lastTime - 16);
            const remaining = Math.max(0, 1 - pause / 100);
            const vx = drag.vx * remaining;
            const vy = drag.vy * remaining;
            if (Math.hypot(vx, vy) >= 360) release(vx, vy);
        }
        drag = undefined;
        handle.classList.remove("ai-dragging");
    }
    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", finish);
    handle.addEventListener("lostpointercapture", finish);
    if (handle === element) {
        handle.addEventListener("click", (event) => {
            if (moved && event.detail > 0) {
                event.stopImmediatePropagation();
                event.preventDefault();
            }
            moved = false;
        }, true);
    }
    return () => {
        if (!positioned || element.hidden) return;
        const { left, top } = element.getBoundingClientRect();
        place(left, top);
    };
}

if (window.RigBuilder) initializeAssistant(window.RigBuilder);
else
    window.addEventListener("riglab:ready", () => initializeAssistant(window.RigBuilder), {
        once: true,
    });
