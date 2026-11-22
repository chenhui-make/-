window.RigAuth = {
    async request(path, options = {}) {
        let response;
        try {
            response = await fetch(path, {
                credentials: "same-origin",
                ...options,
                headers: { "Content-Type": "application/json", ...options.headers },
            });
        } catch {
            throw new Error("无法连接登录服务，请启动 FastAPI 并通过 http://127.0.0.1:8000/ 访问");
        }
        if (!response.headers.get("content-type")?.includes("application/json")) {
            throw new Error("登录接口未正确启动，请重启 FastAPI 后刷新页面");
        }
        const data = await response.json();
        if (!response.ok) {
            const message =
                typeof data.detail === "string"
                    ? data.detail
                    : "请检查账号格式及密码长度（至少 8 位）";
            const error = new Error(message);
            error.status = response.status;
            throw error;
        }
        return data;
    },
    async me() {
        try {
            return await this.request("/api/auth/me");
        } catch (error) {
            if (error.status === 401) return null;
            throw error;
        }
    },
    login(username, password) {
        return this.request("/api/auth/login", {
            method: "POST",
            body: JSON.stringify({ username, password }),
        });
    },
    logout() {
        return this.request("/api/auth/logout", { method: "POST" });
    },
};
