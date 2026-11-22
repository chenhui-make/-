const form = document.querySelector("#settings");
const message = document.querySelector("#message");
const field = (name) => document.querySelector("#" + name);
let pending = false;
function lock(value) {
    pending = value;
    form.querySelectorAll("button").forEach((button) => {
        button.disabled = value;
    });
}
function display(settings) {
    field("enabled").checked = settings.enabled;
    field("baseUrl").value = settings.base_url;
    field("model").value = settings.model;
    field("apiKey").value = "";
    field("keyState").textContent = settings.has_api_key ? "已保存 API 密钥" : "尚未设置 API 密钥";
}
RigAuth.request("/api/admin/ai-settings")
    .then((settings) => {
        display(settings);
        form.hidden = false;
        message.textContent = "填写后保存。测试连接会向服务发送一次简短请求。";
    })
    .catch((error) => {
        message.textContent = error.message + "，请返回后台登录。";
    });
form.onsubmit = async (event) => {
    event.preventDefault();
    if (pending) return;
    lock(true);
    try {
        const settings = await RigAuth.request("/api/admin/ai-settings", {
            method: "PUT",
            body: JSON.stringify({
                enabled: field("enabled").checked,
                base_url: field("baseUrl").value.trim(),
                model: field("model").value.trim(),
                api_key: field("apiKey").value,
            }),
        });
        display(settings);
        message.textContent = "配置已保存，可点击测试连接。";
    } catch (error) {
        message.textContent = error.message;
    } finally {
        lock(false);
    }
};
field("test").onclick = async () => {
    if (pending) return;
    lock(true);
    message.textContent = "正在测试已保存的服务配置…";
    try {
        await RigAuth.request("/api/admin/ai-test", { method: "POST" });
        message.textContent = "连接成功，服务可以返回 JSON 结果。";
    } catch (error) {
        message.textContent = error.message;
    } finally {
        lock(false);
    }
};
