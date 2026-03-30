export function setupDashboard() {
    if (typeof Admin === "undefined") {
        document.getElementById("sdk-status").innerHTML =
            '<span class="status status--error">SDK non disponibile</span>';
        return;
    }

    document.getElementById("sdk-status").innerHTML =
        '<span class="status status--ok">Connesso</span>';

    Admin.getInfo(function(info) {
        document.getElementById("api-version").textContent = info.apiVersion || "—";
        document.getElementById("locale").textContent = info.locale || "—";
    });

    Admin.api("commerce.products.count", null, function(res) {
        document.getElementById("products-count").textContent =
            res.status === "ok" ? res.count : "errore";
    });

    Admin.api("commerce.departments.find", { fields: ["id"] }, function(res) {
        document.getElementById("departments-count").textContent =
            res.status === "ok" ? res.departments.length : "errore";
    });

    Admin.api("commerce.producers.find", { fields: ["id"] }, function(res) {
        document.getElementById("producers-count").textContent =
            res.status === "ok" ? res.producers.length : "errore";
    });
}
