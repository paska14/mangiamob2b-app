const PAGE_SIZE = 200;

let currentProducts = [];

export function setupProducersView() {
    if (typeof Admin === "undefined") return;

    const select = document.getElementById("producer-select");
    const badge = document.getElementById("producer-count-badge");
    const exportBtn = document.getElementById("export-csv-btn");
    const tableContainer = document.getElementById("producer-table-container");

    // Carica lista produttori
    Admin.api("commerce.producers.find", { fields: ["id", "name"], order: ["name"] }, function(res) {
        if (res.status !== "ok" || res.producers.length === 0) {
            select.innerHTML = '<option value="">— nessun produttore trovato —</option>';
            return;
        }

        select.innerHTML = '<option value="">— seleziona un produttore —</option>';
        res.producers.forEach(function(p) {
            const opt = document.createElement("option");
            opt.value = p.id;
            opt.textContent = p.name;
            select.appendChild(opt);
        });
        select.disabled = false;
    });

    select.addEventListener("change", function() {
        const producerId = parseInt(this.value, 10);

        badge.hidden = true;
        exportBtn.hidden = true;
        tableContainer.innerHTML = "";
        currentProducts = [];

        if (!producerId) return;

        tableContainer.innerHTML = '<p class="table-empty">Caricamento... (id: ' + producerId + ')</p>';

        loadProducts(producerId, function(products) {
            currentProducts = products;
            badge.textContent = products.length + " prodotti";
            badge.hidden = false;
            exportBtn.hidden = false;
            renderTable(products, tableContainer);
        });
    });

    exportBtn.addEventListener("click", function() {
        if (currentProducts.length === 0) return;
        const producerName = select.options[select.selectedIndex].textContent;
        downloadCSV(currentProducts, producerName);
    });
}

function loadProducts(producerId, callback) {
    fetchPage(producerId, 0, [], callback);
}

function fetchPage(producerId, offset, accumulated, callback) {
    var dbg = document.getElementById("producer-table-container");

    // Test senza filtro per confronto
    Admin.api("commerce.products.find", {
        fields: ["id", "producer"],
        limit: 3,
        first: 0
    }, function(noFilterRes) {
        Admin.api("commerce.products.find", {
            conditions: { producer: producerId },
            fields: ["id", "code", "name", "department", "items"],
            order: ["name"],
            limit: PAGE_SIZE,
            first: offset
        }, function(res) {
            dbg.innerHTML = "<pre style='font-size:11px;background:#f5f5f5;padding:10px;overflow:auto;max-height:400px'>"
                + "=== SENZA FILTRO (primi 3 prodotti) ===\n"
                + JSON.stringify(noFilterRes, null, 2)
                + "\n\n=== CON FILTRO producer=" + producerId + " ===\n"
                + JSON.stringify(res, null, 2)
                + "</pre>";

            // Non chiamare callback — mantieni il debug visibile
        });
    });
}

function renderTable(products, container) {
    if (products.length === 0) {
        container.innerHTML = '<p class="table-empty">Nessun prodotto trovato.</p>';
        return;
    }

    const rows = products.map(function(p) {
        const item = (p.items && p.items[0]) || {};
        const dept = (p.department && p.department.name) ? p.department.name : "—";
        const sku = item.sku || "—";
        const price = (item.salePrice && item.salePrice.gross != null)
            ? "€ " + Number(item.salePrice.gross).toFixed(2)
            : "—";
        const stock = (item.stock != null) ? item.stock : "—";

        return "<tr>" +
            "<td>" + escapeHTML(p.code || "") + "</td>" +
            "<td>" + escapeHTML(p.name || "") + "</td>" +
            "<td>" + escapeHTML(dept) + "</td>" +
            "<td>" + escapeHTML(sku) + "</td>" +
            "<td>" + price + "</td>" +
            "<td>" + stock + "</td>" +
            "</tr>";
    });

    container.innerHTML =
        '<table class="products-table">' +
            "<thead><tr>" +
                "<th>Codice</th><th>Nome</th><th>Reparto</th><th>SKU</th><th>Prezzo lordo</th><th>Stock</th>" +
            "</tr></thead>" +
            "<tbody>" + rows.join("") + "</tbody>" +
        "</table>";
}

function downloadCSV(products, producerName) {
    const headers = ["Codice", "Nome", "Reparto", "SKU", "Prezzo lordo", "Stock"];
    const rows = products.map(function(p) {
        const item = (p.items && p.items[0]) || {};
        const dept = (p.department && p.department.name) ? p.department.name : "";
        const price = (item.salePrice && item.salePrice.gross != null)
            ? Number(item.salePrice.gross).toFixed(2)
            : "";
        return [
            p.code || "",
            p.name || "",
            dept,
            item.sku || "",
            price,
            (item.stock != null) ? item.stock : ""
        ].map(csvCell).join(";");
    });

    const csv = "\uFEFF" + headers.join(";") + "\n" + rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "prodotti_" + slugify(producerName) + ".csv";
    link.click();
    URL.revokeObjectURL(url);
}

function csvCell(value) {
    const str = String(value);
    if (str.includes(";") || str.includes('"') || str.includes("\n")) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

function slugify(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function escapeHTML(str) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
