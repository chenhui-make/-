const message = document.querySelector("#message");
async function loadUsers() {
    const users = await RigAuth.request("/api/admin/users");
    document.querySelector("#users").replaceChildren();
    for (const user of users) {
        const row = document.createElement("tr");
        for (const value of [
            user.username,
            user.nickname,
            user.role === "admin" ? "管理员" : "用户",
            user.is_active ? "正常" : "已停用",
        ]) {
            const cell = document.createElement("td");
            cell.textContent = value;
            row.append(cell);
        }
        const action = document.createElement("td");
        if (user.role !== "admin") {
            const button = document.createElement("button");
            button.textContent = user.is_active ? "停用" : "启用";
            button.onclick = async () => {
                button.disabled = true;
                try {
                    await RigAuth.request("/api/admin/users/" + user.id, {
                        method: "PATCH",
                        body: JSON.stringify({ is_active: !user.is_active }),
                    });
                    await loadUsers();
                } catch (error) {
                    message.textContent = error.message;
                    button.disabled = false;
                }
            };
            action.append(button);
        }
        row.append(action);
        document.querySelector("#users").append(row);
    }
    message.textContent = "共 " + users.length + " 个账户";
}
loadUsers().catch((error) => {
    message.textContent = error.message;
});
