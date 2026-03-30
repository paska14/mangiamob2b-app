const PAGE_SIZE = 200;

let currentProducts = [];
let departmentMap = {};   // { id: name }
let firstGroupId = null;  // primo customer group con prezzo

export function setupProducersView() {
    if (typeof Admin === "undefined") return;

    const select = document.getElementById("producer-select");
    const badge = document.getElementById("producer-count-badge");
    const exportBtn = document.getElementById("export-csv-btn");
    const tableContainer = document.getElementById("producer-table-container");

    // Carica produttori e reparti in parallelo
    var producersReady = false;
    var deptsReady = false;

    function onReady() {
        if (!producersReady || !deptsReady) return;
        select.disabled = false;
    }

    Admin.api("commerce.producers.find", { fields: ["id", "name"], order: ["name"] }, function(res) {
        if (res.status !== "ok" || res.producers.length === 0) {
            select.innerHTML = '<option value="">— nessun produttore trovato —</option>';
            producersReady = true;
            onReady();
            return;
        }
        select.innerHTML = '<option value="">— seleziona un produttore —</option>';
        res.producers.forEach(function(p) {
            const opt = document.createElement("option");
            opt.value = p.id;
            opt.textContent = p.name;
            select.appendChild(opt);
        });
        producersReady = true;
        onReady();
    });

    Admin.api("commerce.departments.find", { fields: ["id", "name"] }, function(res) {
        if (res.status === "ok") {
            res.departments.forEach(function(d) {
                departmentMap[d.id] = toStr(d.name);
            });
        }
        deptsReady = true;
        onReady();
    });

    select.addEventListener("change", function() {
        const producerId = parseInt(this.value, 10);

        badge.hidden = true;
        exportBtn.hidden = true;
        tableContainer.innerHTML = "";
        currentProducts = [];
        firstGroupId = null;

        if (!producerId) return;

        tableContainer.innerHTML = '<p class="table-empty">Caricamento...</p>';

        fetchPage(producerId, 0, [], function(products) {
            currentProducts = products;
            badge.textContent = products.length + " prodotti";
            badge.hidden = false;
            exportBtn.hidden = products.length === 0;
            renderTable(products, tableContainer);
        });
    });

    exportBtn.addEventListener("click", function() {
        if (currentProducts.length === 0) return;
        const producerName = select.options[select.selectedIndex].textContent;
        downloadCSV(currentProducts, producerName);
    });
}

function fetchPage(producerId, offset, accumulated, callback) {
    Admin.api("commerce.products.find", {
        conditions: { producer: producerId },
        fields: ["id", "code", "name", "departments", "salePrice", "isVisible"],
        order: ["name"],
        limit: PAGE_SIZE,
        first: offset
    }, function(res) {
        if (res.status !== "ok") {
            callback(accumulated);
            return;
        }

        const page = res.products || [];

        // DEBUG — mostra salePrice del primo prodotto
        if (offset === 0 && page.length > 0) {
            console.log("salePrice primo prodotto:", JSON.stringify(page[0].salePrice));
            document.getElementById("producer-table-container").innerHTML +=
                "<pre style='font-size:11px;background:#fffbe6;padding:8px;margin-bottom:8px'>"
                + "salePrice[0]: " + JSON.stringify(page[0].salePrice) + "</pre>";
        }

        // Rileva il primo gruppo cliente disponibile dai prezzi
        if (firstGroupId === null) {
            page.forEach(function(p) {
                if (firstGroupId === null && p.salePrice) {
                    const keys = Object.keys(p.salePrice);
                    if (keys.length > 0) firstGroupId = keys[0];
                }
            });
        }

        const all = accumulated.concat(page);
        if (page.length === PAGE_SIZE) {
            fetchPage(producerId, offset + PAGE_SIZE, all, callback);
        } else {
            callback(all);
        }
    });
}

function getDeptName(deptIds) {
    if (!deptIds || deptIds.length === 0) return "—";
    return departmentMap[deptIds[0]] || ("ID " + deptIds[0]);
}

function getPrice(salePrice) {
    if (!salePrice) return "—";
    const key = firstGroupId || Object.keys(salePrice)[0];
    if (!key || salePrice[key] == null) return "—";
    return "€ " + Number(salePrice[key]).toFixed(2);
}

function renderTable(products, container) {
    if (products.length === 0) {
        container.innerHTML = '<p class="table-empty">Nessun prodotto trovato.</p>';
        return;
    }

    const priceLabel = firstGroupId ? " (gr." + firstGroupId + ")" : "";

    const rows = products.map(function(p) {
        return "<tr>" +
            "<td>" + escapeHTML(p.code) + "</td>" +
            "<td>" + escapeHTML(p.name) + "</td>" +
            "<td>" + escapeHTML(getDeptName(p.departments)) + "</td>" +
            "<td>" + getPrice(p.salePrice) + "</td>" +
            "<td>" + (p.isVisible ? "✓" : "—") + "</td>" +
            "</tr>";
    });

    container.innerHTML =
        '<table class="products-table">' +
            "<thead><tr>" +
                "<th>Codice</th><th>Nome</th><th>Reparto</th>" +
                "<th>Prezzo lordo" + escapeHTML(priceLabel) + "</th>" +
                "<th>Visibile</th>" +
            "</tr></thead>" +
            "<tbody>" + rows.join("") + "</tbody>" +
        "</table>";
}

function downloadCSV(products, producerName) {
    const priceLabel = firstGroupId ? "Prezzo lordo (gr." + firstGroupId + ")" : "Prezzo lordo";
    const headers = ["Codice", "Nome", "Reparto", priceLabel, "Visibile"];

    const rows = products.map(function(p) {
        const price = (function() {
            if (!p.salePrice) return "";
            const key = firstGroupId || Object.keys(p.salePrice)[0];
            return (key && p.salePrice[key] != null) ? Number(p.salePrice[key]).toFixed(2) : "";
        })();

        return [
            toStr(p.code),
            toStr(p.name),
            getDeptName(p.departments),
            price,
            p.isVisible ? "si" : "no"
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

function toStr(val) {
    if (val == null) return "";
    if (typeof val === "object") return val.it || val.en || Object.values(val).find(function(v) { return v; }) || "";
    return String(val);
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

function escapeHTML(val) {
    return toStr(val)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
