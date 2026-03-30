const PAGE_SIZE = 200;

let currentProducts = [];
let departmentMap = {};   // { id: name }
let groupMap = {};        // { id: name }
let activeGroupIds = [];  // group IDs con almeno un prezzo non-null nei prodotti caricati

export function setupProducersView() {
    if (typeof Admin === "undefined") return;

    const select = document.getElementById("producer-select");
    const badge = document.getElementById("producer-count-badge");
    const exportBtn = document.getElementById("export-csv-btn");
    const tableContainer = document.getElementById("producer-table-container");

    let producersReady = false;
    let deptsReady = false;
    let groupsReady = false;

    function onReady() {
        if (!producersReady || !deptsReady || !groupsReady) return;
        select.disabled = false;
    }

    Admin.api("commerce.producers.find", { fields: ["id", "name"], order: ["name"] }, function(res) {
        if (res.status !== "ok" || res.producers.length === 0) {
            select.innerHTML = '<option value="">— nessun produttore trovato —</option>';
        } else {
            select.innerHTML = '<option value="">— seleziona un produttore —</option>';
            res.producers.forEach(function(p) {
                const opt = document.createElement("option");
                opt.value = p.id;
                opt.textContent = toStr(p.name);
                select.appendChild(opt);
            });
        }
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

    Admin.api("commerce.customer-groups.find", { fields: ["id", "name"] }, function(res) {
        if (res.status === "ok") {
            res.groups.forEach(function(g) {
                groupMap[g.id] = toStr(g.name);
            });
        }
        groupsReady = true;
        onReady();
    });

    select.addEventListener("change", function() {
        const producerId = parseInt(this.value, 10);

        badge.hidden = true;
        exportBtn.hidden = true;
        tableContainer.innerHTML = "";
        currentProducts = [];
        activeGroupIds = [];

        if (!producerId) return;

        tableContainer.innerHTML = '<p class="table-empty">Caricamento...</p>';

        fetchPage(producerId, 0, [], function(products) {
            currentProducts = products;
            activeGroupIds = detectActiveGroups(products);

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

// Raccoglie tutti i group ID che hanno almeno un prezzo non-null tra i prodotti
function detectActiveGroups(products) {
    const seen = new Set();
    products.forEach(function(p) {
        if (!p.salePrice) return;
        Object.keys(p.salePrice).forEach(function(gid) {
            if (p.salePrice[gid] != null) seen.add(gid);
        });
    });
    return Array.from(seen).sort(function(a, b) { return Number(a) - Number(b); });
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

function getGroupName(gid) {
    return groupMap[gid] || ("Gr." + gid);
}

function getPriceForGroup(salePrice, gid) {
    if (!salePrice || salePrice[gid] == null) return "—";
    return "€ " + Number(salePrice[gid]).toFixed(2);
}

function renderTable(products, container) {
    if (products.length === 0) {
        container.innerHTML = '<p class="table-empty">Nessun prodotto trovato.</p>';
        return;
    }

    const groupHeaders = activeGroupIds.map(function(gid) {
        return "<th>" + escapeHTML(getGroupName(gid)) + "</th>";
    }).join("");

    const rows = products.map(function(p) {
        const priceCells = activeGroupIds.map(function(gid) {
            return "<td>" + getPriceForGroup(p.salePrice, gid) + "</td>";
        }).join("");

        return "<tr>" +
            "<td>" + escapeHTML(toStr(p.code)) + "</td>" +
            "<td>" + escapeHTML(toStr(p.name)) + "</td>" +
            "<td>" + escapeHTML(getDeptName(p.departments)) + "</td>" +
            priceCells +
            "<td>" + (p.isVisible ? "✓" : "—") + "</td>" +
            "</tr>";
    });

    container.innerHTML =
        '<table class="products-table">' +
            "<thead><tr>" +
                "<th>Codice</th><th>Nome</th><th>Reparto</th>" +
                groupHeaders +
                "<th>Visibile</th>" +
            "</tr></thead>" +
            "<tbody>" + rows.join("") + "</tbody>" +
        "</table>";
}

function downloadCSV(products, producerName) {
    const groupHeaders = activeGroupIds.map(getGroupName);
    const headers = ["Codice", "Nome", "Reparto"].concat(groupHeaders).concat(["Visibile"]);

    const rows = products.map(function(p) {
        const priceCells = activeGroupIds.map(function(gid) {
            if (!p.salePrice || p.salePrice[gid] == null) return "";
            return Number(p.salePrice[gid]).toFixed(2);
        });

        return [toStr(p.code), toStr(p.name), getDeptName(p.departments)]
            .concat(priceCells)
            .concat([p.isVisible ? "si" : "no"])
            .map(csvCell).join(";");
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
    return String(val)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
