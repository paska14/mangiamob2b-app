const PAGE_SIZE = 200;

const COST_PRICE_LIST_ID = 2;

let currentItems = [];    // flat array of items (one per SKU)
let productMap = {};      // { productId: product }
let producerMap = {};     // { producerId: name }
let departmentMap = {};   // { id: name }
let groupMap = {};        // { id: name }
let attributeMap = {};    // { id: { name, values: { valueId: name } } }
let valueAttrMap = {};    // { valueId: { attrName, valueName } }  — reverse lookup
let activeGroupIds = [];  // group IDs con almeno un prezzo non-null negli item caricati

const PRODUCT_FIELDS = ["id", "code", "name", "departments", "producer", "isVisible"];

export function setupProducersView() {
    if (typeof Admin === "undefined") return;

    const select = document.getElementById("producer-select");
    const badge = document.getElementById("producer-count-badge");
    const exportBtn = document.getElementById("export-csv-btn");
    const exportAllBtn = document.getElementById("export-all-btn");
    const tableContainer = document.getElementById("producer-table-container");

    let producersReady = false;
    let deptsReady = false;
    let groupsReady = false;
    let attrsReady = false;

    function onReady() {
        if (!producersReady || !deptsReady || !groupsReady || !attrsReady) return;
        select.disabled = false;
        exportAllBtn.disabled = false;
    }

    Admin.api("commerce.producers.find", { fields: ["id", "name"], order: ["name"] }, function(res) {
        if (res.status !== "ok" || res.producers.length === 0) {
            select.innerHTML = '<option value="">— nessun produttore trovato —</option>';
        } else {
            select.innerHTML = '<option value="">— seleziona un produttore —</option>';
            res.producers.forEach(function(p) {
                producerMap[p.id] = toStr(p.name);
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

    Admin.api("commerce.attributes.find", { fields: ["id", "name"] }, function(res) {
        console.log("[attributes.find] status:", res.status, "| count:", (res.attributes || []).length);
        if (res.status === "ok") {
            (res.attributes || []).forEach(function(attr) {
                attributeMap[attr.id] = { name: toStr(attr.name), values: {} };
            });
        }
        Admin.api("commerce.attribute-values.find", { fields: ["id", "attribute", "name"], limit: 500 }, function(res2) {
            console.log("[attribute-values.find] status:", res2.status, "| count:", (res2.values || []).length);
            if (res2.status === "ok") {
                (res2.values || []).forEach(function(v) {
                    if (attributeMap[v.attribute]) {
                        attributeMap[v.attribute].values[v.id] = toStr(v.name);
                    }
                    valueAttrMap[v.id] = {
                        attrName: attributeMap[v.attribute] ? attributeMap[v.attribute].name : ("Attr " + v.attribute),
                        valueName: toStr(v.name)
                    };
                });
            }
            attrsReady = true;
            onReady();
        });
    });

    select.addEventListener("change", function() {
        const producerId = parseInt(this.value, 10);

        badge.hidden = true;
        exportBtn.hidden = true;
        tableContainer.innerHTML = "";
        currentItems = [];
        productMap = {};
        activeGroupIds = [];

        if (!producerId) return;

        tableContainer.innerHTML = '<p class="table-empty">Caricamento...</p>';

        let products = null;
        let items = null;

        function onBothLoaded() {
            if (products === null || items === null) return;

            console.log("[onBothLoaded] prodotti:", products.length, "| item:", items.length);
            products.forEach(function(p) { productMap[p.id] = p; });
            currentItems = items;
            activeGroupIds = detectActiveGroupIds(items);
            console.log("[onBothLoaded] activeGroupIds:", activeGroupIds);

            badge.textContent = items.length + " varianti";
            badge.hidden = false;
            exportBtn.hidden = items.length === 0;
            renderTable(items, tableContainer);
        }

        fetchProductsPage(producerId, 0, [], function(prods) {
            console.log("[fetchProductsPage] prodotti ricevuti:", prods.length);
            products = prods;
            onBothLoaded();
        });

        fetchItemsPage(producerId, 0, [], function(itms) {
            console.log("[fetchItemsPage] item ricevuti:", itms.length);
            items = itms;
            onBothLoaded();
        });
    });

    exportBtn.addEventListener("click", function() {
        if (currentItems.length === 0) return;
        const producerName = select.options[select.selectedIndex].textContent;
        downloadCSV(currentItems, producerName);
    });

    exportAllBtn.addEventListener("click", function() {
        exportAllBtn.disabled = true;
        exportAllBtn.textContent = "Caricamento...";

        let allProducts = null;
        let allItems = null;

        function onAllLoaded() {
            if (allProducts === null || allItems === null) return;
            console.log("[exportAll] prodotti:", allProducts.length, "| item:", allItems.length);

            const allProductMap = {};
            allProducts.forEach(function(p) { allProductMap[p.id] = p; });

            const allActiveGroupIds = detectActiveGroupIds(allItems);
            downloadAllCSV(allItems, allProductMap, allActiveGroupIds);

            exportAllBtn.disabled = false;
            exportAllBtn.textContent = "Esporta tutto";
        }

        fetchAllProductsPage(0, [], function(prods) {
            console.log("[exportAll] fetchAllProducts:", prods.length);
            allProducts = prods;
            onAllLoaded();
        });

        fetchAllItemsPage(0, [], function(itms) {
            console.log("[exportAll] fetchAllItems:", itms.length);
            allItems = itms;
            onAllLoaded();
        });
    });
}

// Raccoglie i group ID (escluso listino costo) con almeno un prezzo non-null negli item
function detectActiveGroupIds(items) {
    const seen = new Set();
    items.forEach(function(item) {
        if (!item.price) return;
        Object.keys(item.price).forEach(function(lid) {
            if (parseInt(lid) !== COST_PRICE_LIST_ID && groupMap[lid] && item.price[lid] != null) {
                seen.add(lid);
            }
        });
    });
    return Array.from(seen).sort(function(a, b) { return Number(a) - Number(b); });
}

function fetchProductsPage(producerId, offset, accumulated, callback) {
    Admin.api("commerce.products.find", {
        conditions: { producer: producerId },
        fields: PRODUCT_FIELDS,
        order: ["name"],
        limit: PAGE_SIZE,
        first: offset
    }, function(res) {
        if (res.status !== "ok") { callback(accumulated); return; }
        const page = res.products || [];
        const all = accumulated.concat(page);
        if (page.length === PAGE_SIZE) {
            fetchProductsPage(producerId, offset + PAGE_SIZE, all, callback);
        } else {
            callback(all);
        }
    });
}

function fetchItemsPage(producerId, offset, accumulated, callback) {
    Admin.api("commerce.items.find", {
        conditions: { producer: producerId },
        fields: ["sku", "product", "options", "price", "isForSale", "stock"],
        order: ["product", "sku"],
        limit: PAGE_SIZE,
        first: offset
    }, function(res) {
        if (offset === 0) console.log("[items.find] status:", res.status, res.status !== "ok" ? "| error: " + JSON.stringify(res.error) : "| items ricevuti prima pagina: " + (res.items || []).length);
        if (res.status !== "ok") { callback(accumulated); return; }
        const page = res.items || [];
        const all = accumulated.concat(page);
        if (page.length === PAGE_SIZE) {
            fetchItemsPage(producerId, offset + PAGE_SIZE, all, callback);
        } else {
            callback(all);
        }
    });
}

function fetchAllProductsPage(offset, accumulated, callback) {
    Admin.api("commerce.products.find", {
        fields: PRODUCT_FIELDS,
        order: ["name"],
        limit: PAGE_SIZE,
        first: offset
    }, function(res) {
        if (res.status !== "ok") { callback(accumulated); return; }
        const page = res.products || [];
        const all = accumulated.concat(page);
        if (page.length === PAGE_SIZE) {
            fetchAllProductsPage(offset + PAGE_SIZE, all, callback);
        } else {
            callback(all);
        }
    });
}

function fetchAllItemsPage(offset, accumulated, callback) {
    Admin.api("commerce.items.find", {
        fields: ["sku", "product", "options", "price", "isForSale", "stock"],
        order: ["product", "sku"],
        limit: PAGE_SIZE,
        first: offset
    }, function(res) {
        if (offset === 0) console.log("[fetchAllItems] status:", res.status, res.status !== "ok" ? "| error: " + JSON.stringify(res.error) : "| prima pagina: " + (res.items || []).length);
        if (res.status !== "ok") { callback(accumulated); return; }
        const page = res.items || [];
        const all = accumulated.concat(page);
        if (page.length === PAGE_SIZE) {
            fetchAllItemsPage(offset + PAGE_SIZE, all, callback);
        } else {
            callback(all);
        }
    });
}

function downloadAllCSV(items, allProductMap, allActiveGroupIds) {
    const groupNames = allActiveGroupIds.map(getGroupName);
    const priceHeaders = groupNames.map(function(n) { return "Prezzo - " + n; });

    const headers = [
        "Produttore", "Codice prodotto", "Nome prodotto", "SKU", "Reparto",
        "Variante", "Prezzo costo",
    ].concat(priceHeaders).concat(["Vendibile", "Stock"]);

    const rows = items.map(function(item) {
        const product = allProductMap[item.product] || {};
        const producerName = product.producer ? (producerMap[product.producer] || ("ID " + product.producer)) : "—";

        const priceCells = allActiveGroupIds.map(function(gid) {
            return (item.price && item.price[gid] != null) ? Number(item.price[gid]).toFixed(2) : "";
        });

        const costPrice = (item.price && item.price[COST_PRICE_LIST_ID] != null)
            ? Number(item.price[COST_PRICE_LIST_ID]).toFixed(2) : "";

        return [
            producerName,
            toStr(product.code),
            toStr(product.name),
            toStr(item.sku),
            getDeptNames(product.departments),
            getItemOptionsText(item.options),
            costPrice,
        ]
        .concat(priceCells)
        .concat([
            boolCell(item.isForSale),
            item.stock != null ? item.stock : ""
        ])
        .map(csvCell).join(";");
    });

    const csv = "\uFEFF" + "sep=;\n" + headers.join(";") + "\n" + rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "varianti_tutti.csv";
    link.click();
    URL.revokeObjectURL(url);
}

// Risolve item.options (array di value ID) in "Formato: 25cl | Confezione: 12 Pz"
function getItemOptionsText(options) {
    if (!options || options.length === 0) return "—";
    const grouped = {};
    options.forEach(function(vid) {
        const info = valueAttrMap[vid];
        if (!info) return;
        if (!grouped[info.attrName]) grouped[info.attrName] = [];
        grouped[info.attrName].push(info.valueName);
    });
    const parts = Object.keys(grouped).map(function(attrName) {
        return attrName + ": " + grouped[attrName].join(", ");
    });
    return parts.length ? parts.join(" | ") : "—";
}

function getDeptNames(deptIds) {
    if (!deptIds || deptIds.length === 0) return "—";
    return deptIds.map(function(id) {
        return departmentMap[id] || ("ID " + id);
    }).join(", ");
}

function getGroupName(gid) {
    return groupMap[gid] || ("Gr." + gid);
}

function getItemPrice(item, listId) {
    if (!item.price || item.price[listId] == null) return "—";
    return "€ " + Number(item.price[listId]).toFixed(2);
}

// --- Table ---

function renderTable(items, container) {
    if (items.length === 0) {
        container.innerHTML = '<p class="table-empty">Nessun articolo trovato.</p>';
        return;
    }

    const groupHeaders = activeGroupIds.map(function(gid) {
        return "<th>" + escapeHTML(getGroupName(gid)) + "</th>";
    }).join("");

    const rows = items.map(function(item) {
        const product = productMap[item.product] || {};

        const priceCells = activeGroupIds.map(function(gid) {
            return "<td>" + getItemPrice(item, gid) + "</td>";
        }).join("");

        return "<tr>" +
            "<td>" + escapeHTML(toStr(product.code)) + "</td>" +
            "<td>" + escapeHTML(toStr(product.name)) + "</td>" +
            "<td>" + escapeHTML(toStr(item.sku)) + "</td>" +
            "<td>" + escapeHTML(getDeptNames(product.departments)) + "</td>" +
            "<td>" + escapeHTML(getItemOptionsText(item.options)) + "</td>" +
            "<td>" + getItemPrice(item, COST_PRICE_LIST_ID) + "</td>" +
            priceCells +
            "<td>" + (item.isForSale ? "✓" : "—") + "</td>" +
            "</tr>";
    });

    container.innerHTML =
        '<table class="products-table">' +
            "<thead><tr>" +
                "<th>Codice</th><th>Nome</th><th>SKU</th><th>Reparto</th>" +
                "<th>Variante</th>" +
                "<th>Prezzo costo</th>" +
                groupHeaders +
                "<th>Vendibile</th>" +
            "</tr></thead>" +
            "<tbody>" + rows.join("") + "</tbody>" +
        "</table>";
}

// --- CSV ---

function downloadCSV(items, producerName) {
    const groupNames = activeGroupIds.map(getGroupName);
    const priceHeaders = groupNames.map(function(n) { return "Prezzo - " + n; });

    const headers = [
        "Codice prodotto", "Nome prodotto", "SKU", "Reparto",
        "Variante", "Prezzo costo",
    ].concat(priceHeaders).concat(["Vendibile", "Stock"]);

    const rows = items.map(function(item) {
        const product = productMap[item.product] || {};

        const priceCells = activeGroupIds.map(function(gid) {
            return (item.price && item.price[gid] != null) ? Number(item.price[gid]).toFixed(2) : "";
        });

        const costPrice = (item.price && item.price[COST_PRICE_LIST_ID] != null)
            ? Number(item.price[COST_PRICE_LIST_ID]).toFixed(2) : "";

        return [
            toStr(product.code),
            toStr(product.name),
            toStr(item.sku),
            getDeptNames(product.departments),
            getItemOptionsText(item.options),
            costPrice,
        ]
        .concat(priceCells)
        .concat([
            boolCell(item.isForSale),
            item.stock != null ? item.stock : ""
        ])
        .map(csvCell).join(";");
    });

    const csv = "\uFEFF" + "sep=;\n" + headers.join(";") + "\n" + rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "varianti_" + slugify(producerName) + ".csv";
    link.click();
    URL.revokeObjectURL(url);
}

function boolCell(val) {
    if (val == null) return "";
    return val ? "si" : "no";
}

function toStr(val) {
    if (val == null) return "";
    if (typeof val === "object") return val.it || val.en || Object.values(val).find(function(v) { return v; }) || "";
    return String(val);
}

function csvCell(value) {
    const str = String(value);
    if (str.includes(";") || str.includes(",") || str.includes('"') || str.includes("\n")) {
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
