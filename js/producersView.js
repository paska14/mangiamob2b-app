const PAGE_SIZE = 200;

const COST_PRICE_LIST_ID = 2;

let currentProducts = [];
let costPriceMap = {};    // { sku: price }
let departmentMap = {};   // { id: name }
let groupMap = {};        // { id: name }
let activeGroupIds = [];  // group IDs con almeno un prezzo non-null nei prodotti caricati

const ALL_PRODUCT_FIELDS = [
    "id", "code", "sku",
    "name", "shortDescription", "longDescription", "moreDescription",
    "departments", "producer",
    "isVisible", "isFeatured", "allowOrders", "allowQuotes", "showPrice", "isNewRelease",
    "minOrder", "maxOrder", "minQuote",
    "listPrice", "salePrice", "hasMorePrices", "promotion",
    "hasVariants", "variants",
    "attributes", "attributesView",
    "rating", "position", "releaseDate", "updateTime", "taxClass",
    "seoTitle", "seoDescription", "canonicalURL",
    "showRequestsFor", "infoForRequests", "showMoreGalleries",
    "thumbnailImage", "smallImage", "mediumImage", "largeImage", "zoomImage"
];

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
        costPriceMap = {};
        activeGroupIds = [];

        if (!producerId) return;

        tableContainer.innerHTML = '<p class="table-empty">Caricamento...</p>';

        fetchPage(producerId, 0, [], function(products) {
            console.log("[producersView] prodotti ricevuti:", products);
            currentProducts = products;
            activeGroupIds = detectActiveGroups(products);

            const skus = products.map(function(p) { return toStr(p.sku); }).filter(Boolean);
            fetchCostPrices(null, {}, function(priceMap) {
                console.log("[producersView] prezzi di costo (listino ID " + COST_PRICE_LIST_ID + "):", priceMap);
                costPriceMap = priceMap;
                badge.textContent = products.length + " prodotti";
                badge.hidden = false;
                exportBtn.hidden = products.length === 0;
                renderTable(products, tableContainer);
            });
        });
    });

    exportBtn.addEventListener("click", function() {
        if (currentProducts.length === 0) return;
        const producerName = select.options[select.selectedIndex].textContent;
        downloadCSV(currentProducts, producerName);
    });
}

// Raccoglie tutti i group ID con almeno un prezzo non-null (listPrice o salePrice)
function detectActiveGroups(products) {
    const seen = new Set();
    products.forEach(function(p) {
        [p.salePrice, p.listPrice].forEach(function(priceMap) {
            if (!priceMap) return;
            Object.keys(priceMap).forEach(function(gid) {
                if (priceMap[gid] != null) seen.add(gid);
            });
        });
    });
    return Array.from(seen).sort(function(a, b) { return Number(a) - Number(b); });
}

function fetchPage(producerId, offset, accumulated, callback) {
    Admin.api("commerce.products.find", {
        conditions: { producer: producerId },
        fields: ALL_PRODUCT_FIELDS,
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

function fetchCostPrices(cursor, accumulated, callback) {
    const conditions = { lists: [COST_PRICE_LIST_ID] };
    if (cursor) {
        conditions.after = cursor;
    }
    Admin.api("commerce.item-prices.find", {
        conditions: conditions,
        limit: PAGE_SIZE
    }, function(res) {
        console.log("[fetchCostPrices] risposta API:", res);
        if (res.status !== "ok") {
            callback(accumulated);
            return;
        }
        const page = res.prices || [];
        page.forEach(function(ip) {
            if (ip.sku && ip.price != null) accumulated[ip.sku] = ip.price;
        });
        if (page.length === PAGE_SIZE) {
            const last = page[page.length - 1];
            fetchCostPrices({ sku: last.sku, list: last.list }, accumulated, callback);
        } else {
            callback(accumulated);
        }
    });
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

function getPriceForGroup(priceMap, gid) {
    if (!priceMap || priceMap[gid] == null) return "—";
    return "€ " + Number(priceMap[gid]).toFixed(2);
}

// --- Table (vista semplificata) ---

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

        const sku = toStr(p.sku);
        const costPrice = costPriceMap[sku] != null ? "€ " + Number(costPriceMap[sku]).toFixed(2) : "—";

        return "<tr>" +
            "<td>" + escapeHTML(toStr(p.code)) + "</td>" +
            "<td>" + escapeHTML(toStr(p.name)) + "</td>" +
            "<td>" + escapeHTML(getDeptNames(p.departments)) + "</td>" +
            "<td>" + costPrice + "</td>" +
            priceCells +
            "<td>" + (p.isVisible ? "✓" : "—") + "</td>" +
            "</tr>";
    });

    container.innerHTML =
        '<table class="products-table">' +
            "<thead><tr>" +
                "<th>Codice</th><th>Nome</th><th>Reparto</th>" +
                "<th>Prezzo costo</th>" +
                groupHeaders +
                "<th>Visibile</th>" +
            "</tr></thead>" +
            "<tbody>" + rows.join("") + "</tbody>" +
        "</table>";
}

// --- CSV (tutti i campi) ---

function downloadCSV(products, producerName) {
    const groupNames = activeGroupIds.map(getGroupName);

    const listPriceHeaders  = groupNames.map(function(n) { return "Prezzo listino - " + n; });
    const salePriceHeaders  = groupNames.map(function(n) { return "Prezzo vendita - " + n; });
    const promotionHeaders  = groupNames.map(function(n) { return "Promozione ID - " + n; });

    const headers = [
        "ID", "Codice", "SKU",
        "Nome", "Descrizione breve", "Descrizione lunga", "Descrizione aggiuntiva",
        "Reparti", "Produttore ID",
        "Visibile", "In evidenza", "Consenti ordini", "Consenti preventivi", "Mostra prezzo", "Novità",
        "Qtà min ordine", "Qtà max ordine", "Qtà min preventivo",
        "Prezzo di costo", "Ha prezzi a scaglioni",
    ]
    .concat(listPriceHeaders)
    .concat(salePriceHeaders)
    .concat(promotionHeaders)
    .concat([
        "Ha varianti", "N. varianti",
        "Attributi", "Attributi (vista)",
        "Rating", "Posizione", "Data uscita", "Ultima modifica", "Classe IVA",
        "SEO Title", "SEO Description", "URL Canonico",
        "Mostra richieste per", "Info per richieste", "Mostra altre gallerie",
        "Immagine thumbnail", "Immagine small", "Immagine medium", "Immagine large", "Immagine zoom"
    ]);

    const rows = products.map(function(p) {
        const listPriceCells = activeGroupIds.map(function(gid) {
            return (p.listPrice && p.listPrice[gid] != null) ? Number(p.listPrice[gid]).toFixed(2) : "";
        });
        const salePriceCells = activeGroupIds.map(function(gid) {
            return (p.salePrice && p.salePrice[gid] != null) ? Number(p.salePrice[gid]).toFixed(2) : "";
        });
        const promotionCells = activeGroupIds.map(function(gid) {
            return (p.promotion && p.promotion[gid] != null) ? p.promotion[gid] : "";
        });

        const deptNames = (p.departments || []).map(function(id) {
            return departmentMap[id] || ("ID " + id);
        }).join(", ");

        // Attributi: serializza come "attrId:valueId, ..."
        const attrsStr = p.attributes
            ? Object.entries(p.attributes).map(function(e) { return e[0] + ":" + e[1]; }).join(", ")
            : "";

        const variantsCount = Array.isArray(p.variants)
            ? p.variants.filter(function(v) { return v != null; }).length
            : "";

        return [
            p.id || "",
            toStr(p.code),
            toStr(p.sku),
            toStr(p.name),
            toStr(p.shortDescription),
            toStr(p.longDescription),
            toStr(p.moreDescription),
            deptNames,
            p.producer || "",
            boolCell(p.isVisible),
            boolCell(p.isFeatured),
            boolCell(p.allowOrders),
            boolCell(p.allowQuotes),
            boolCell(p.showPrice),
            boolCell(p.isNewRelease),
            p.minOrder != null ? p.minOrder : "",
            p.maxOrder != null ? p.maxOrder : "",
            p.minQuote != null ? p.minQuote : "",
            costPriceMap[toStr(p.sku)] != null ? Number(costPriceMap[toStr(p.sku)]).toFixed(2) : "",
            boolCell(p.hasMorePrices),
        ]
        .concat(listPriceCells)
        .concat(salePriceCells)
        .concat(promotionCells)
        .concat([
            boolCell(p.hasVariants),
            variantsCount,
            attrsStr,
            p.attributesView ? JSON.stringify(p.attributesView) : "",
            p.rating != null ? p.rating : "",
            p.position != null ? p.position : "",
            p.releaseDate || "",
            p.updateTime || "",
            p.taxClass != null ? p.taxClass : "",
            toStr(p.seoTitle),
            toStr(p.seoDescription),
            p.canonicalURL || "",
            p.showRequestsFor != null ? p.showRequestsFor : "",
            toStr(p.infoForRequests),
            boolCell(p.showMoreGalleries),
            p.thumbnailImage ? (p.thumbnailImage.url || "") : "",
            p.smallImage ? (p.smallImage.url || "") : "",
            p.mediumImage ? (p.mediumImage.url || "") : "",
            p.largeImage ? (p.largeImage.url || "") : "",
            p.zoomImage ? (p.zoomImage.url || "") : ""
        ])
        .map(csvCell).join(";");
    });

    const csv = "\uFEFF" + "sep=;\n" + headers.join(";") + "\n" + rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "prodotti_" + slugify(producerName) + ".csv";
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
