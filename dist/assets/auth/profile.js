(async function loadProfile() {
    const get = (id) => document.getElementById(id);
    const status = get("profileStatus");
    function bindForm(id, save, success) {
        const form = get(id);
        const button = form.querySelector("button");
        const feedback = form.querySelector('[role="status"]');
        form.onsubmit = async (event) => {
            event.preventDefault();
            button.disabled = true;
            feedback.textContent = "";
            feedback.classList.remove("field-error");
            try {
                await save(form);
                feedback.textContent = success;
            } catch (error) {
                feedback.textContent = error.message;
                feedback.classList.add("field-error");
            } finally {
                button.disabled = false;
            }
        };
    }
    const updateProfile = (fields) => RigAuth.request("/api/auth/profile", {
        method: "PATCH",
        body: JSON.stringify(fields),
    });
    try {
        const user = await RigAuth.me();
        if (!user) {
            status.textContent = "请返回首页登录后查看个人中心。";
            return;
        }
        get("profileName").textContent = user.nickname;
        get("profileAccount").textContent = "账号：" + user.username;
        if (user.avatar) {
            const avatar = get("avatarImage");
            avatar.src = user.avatar;
            avatar.hidden = false;
        } else {
            const avatar = get("avatarInitial");
            avatar.textContent = Array.from(user.nickname)[0] || "我";
            avatar.hidden = false;
        }
        get("profileAdmin").hidden = user.role !== "admin";
        get("nicknameForm").elements.nickname.value = user.nickname;
        get("privacyForm").elements.ai_memory_enabled.checked = user.ai_memory_enabled;
        bindForm("nicknameForm", async (form) => {
            const profile = await updateProfile({ nickname: form.elements.nickname.value });
            get("profileName").textContent = profile.nickname;
            get("avatarInitial").textContent = Array.from(profile.nickname)[0] || "我";
            form.elements.nickname.value = profile.nickname;
        }, "昵称已保存。");
        bindForm("passwordForm", async (form) => {
            const { current_password, new_password, confirm_password } =
                Object.fromEntries(new FormData(form));
            if (new_password !== confirm_password) throw new Error("两次输入的新密码不一致");
            await RigAuth.request("/api/auth/password", {
                method: "PUT",
                body: JSON.stringify({ current_password, new_password }),
            });
            form.reset();
        }, "密码已更新，其他设备需要重新登录。");
        bindForm("privacyForm", async (form) => {
            await updateProfile({ ai_memory_enabled: form.elements.ai_memory_enabled.checked });
        }, "隐私设置已保存。");
        get("profileDetails").hidden = false;
        status.hidden = true;
        const logout = get("logout");
        logout.onclick = async () => {
            logout.disabled = true;
            try {
                await RigAuth.logout();
                location.replace("/");
            } catch (error) {
                status.textContent = error.message;
                status.hidden = false;
                logout.disabled = false;
            }
        };
    } catch (error) {
        status.textContent = error.message;
    }
})();
