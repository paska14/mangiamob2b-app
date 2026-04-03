import {
    PAGE_SIZE, COST_PRICE_LIST_ID,
    PRODUCT_FIELDS, groupMap, producerMap, valueAttrMap,
    getItemOptionsText, onSharedMapsReady
} from './producersView.js';

export function setupCatalogView() {
    if (typeof Admin === "undefined") return;

    const listSelect     = document.getElementById("catalog-list-select");
    const producerSelect = document.getElementById("catalog-producer-select");
    const generateBtn    = document.getElementById("catalog-generate-btn");
    const nopriceBtn     = document.getElementById("catalog-noprice-btn");

    onSharedMapsReady(function() {
        // Popola listini (escluso costo)
        listSelect.innerHTML = '<option value="">— seleziona listino —</option>';
        Object.keys(groupMap).sort(function(a, b) { return Number(a) - Number(b); }).forEach(function(gid) {
            if (parseInt(gid) === COST_PRICE_LIST_ID) return;
            const opt = document.createElement("option");
            opt.value = gid;
            opt.textContent = groupMap[gid];
            listSelect.appendChild(opt);
        });

        // Popola produttori
        producerSelect.innerHTML = '<option value="">— tutti i produttori —</option>';
        Object.keys(producerMap).sort(function(a, b) {
            return producerMap[a].localeCompare(producerMap[b]);
        }).forEach(function(pid) {
            const opt = document.createElement("option");
            opt.value = pid;
            opt.textContent = producerMap[pid];
            producerSelect.appendChild(opt);
        });

        listSelect.disabled = false;
        producerSelect.disabled = false;
        generateBtn.disabled = false;
        nopriceBtn.disabled = false;
    });

    generateBtn.addEventListener("click", function() {
        const listId = listSelect.value;
        if (!listId) {
            alert("Seleziona un listino.");
            return;
        }
        const producerId   = producerSelect.value ? parseInt(producerSelect.value, 10) : null;
        const listName     = groupMap[listId] || listId;
        const producerName = producerId ? (producerMap[producerId] || "") : null;

        generateBtn.disabled = true;
        generateBtn.textContent = "Caricamento...";

        let allProducts = null;
        let allItems    = null;

        function onLoaded() {
            if (allProducts === null || allItems === null) return;
            console.log("[catalog] prodotti:", allProducts.length, "| item:", allItems.length);

            const productMapLocal = {};
            allProducts.forEach(function(p) { productMapLocal[p.id] = p; });

            const filtered = allItems.filter(function(item) {
                const product = productMapLocal[item.product];
                return product && product.isVisible && item.isForSale && item.price && item.price[listId] != null;
            });

            console.log("[catalog] item filtrati:", filtered.length);

            const grouped = {};
            const productOrder = [];
            filtered.forEach(function(item) {
                if (!grouped[item.product]) {
                    grouped[item.product] = [];
                    productOrder.push(item.product);
                }
                grouped[item.product].push(item);
            });

            if (productOrder.length === 0) {
                alert("Nessun prodotto con prezzi per questo listino.");
                generateBtn.disabled = false;
                generateBtn.textContent = "Genera PDF";
                return;
            }

            openCatalogWindow(productOrder, grouped, productMapLocal, listId, listName, producerName);

            generateBtn.disabled = false;
            generateBtn.textContent = "Genera PDF";
        }

        fetchCatalogProducts(producerId, 0, [], function(prods) {
            console.log("[catalog] fetchProducts:", prods.length);
            allProducts = prods;
            onLoaded();
        });

        fetchCatalogItems(producerId, 0, [], function(itms) {
            console.log("[catalog] fetchItems:", itms.length);
            allItems = itms;
            onLoaded();
        });
    });

    nopriceBtn.addEventListener("click", function() {
        const producerId   = producerSelect.value ? parseInt(producerSelect.value, 10) : null;
        const producerName = producerId ? (producerMap[producerId] || "") : null;

        nopriceBtn.disabled = true;
        nopriceBtn.textContent = "Caricamento...";

        let allProducts = null;
        let allItems    = null;

        function onLoaded() {
            if (allProducts === null || allItems === null) return;
            console.log("[catalog-np] prodotti:", allProducts.length, "| item:", allItems.length);

            const productMapLocal = {};
            allProducts.forEach(function(p) { productMapLocal[p.id] = p; });

            const filtered = allItems.filter(function(item) {
                const product = productMapLocal[item.product];
                return product && product.isVisible && item.isForSale;
            });

            console.log("[catalog-np] item filtrati:", filtered.length);

            const grouped = {};
            const productOrder = [];
            filtered.forEach(function(item) {
                if (!grouped[item.product]) {
                    grouped[item.product] = [];
                    productOrder.push(item.product);
                }
                grouped[item.product].push(item);
            });

            if (productOrder.length === 0) {
                alert("Nessun prodotto trovato.");
                nopriceBtn.disabled = false;
                nopriceBtn.textContent = "Genera PDF senza prezzi";
                return;
            }

            openNoPriceCatalogWindow(productOrder, grouped, productMapLocal, producerName);

            nopriceBtn.disabled = false;
            nopriceBtn.textContent = "Genera PDF senza prezzi";
        }

        fetchCatalogProductsWithDesc(producerId, 0, [], function(prods) {
            console.log("[catalog-np] fetchProducts:", prods.length);
            allProducts = prods;
            onLoaded();
        });

        fetchCatalogItems(producerId, 0, [], function(itms) {
            console.log("[catalog-np] fetchItems:", itms.length);
            allItems = itms;
            onLoaded();
        });
    });
}

function fetchCatalogProducts(producerId, offset, accumulated, callback) {
    const conditions = producerId ? { producer: producerId } : {};
    Admin.api("commerce.products.find", {
        conditions: conditions,
        fields: PRODUCT_FIELDS,
        order: ["name"],
        limit: PAGE_SIZE,
        first: offset
    }, function(res) {
        if (res.status !== "ok") { callback(accumulated); return; }
        const page = res.products || [];
        const all = accumulated.concat(page);
        if (page.length === PAGE_SIZE) {
            fetchCatalogProducts(producerId, offset + PAGE_SIZE, all, callback);
        } else {
            callback(all);
        }
    });
}

function fetchCatalogProductsWithDesc(producerId, offset, accumulated, callback) {
    const conditions = producerId ? { producer: producerId } : {};
    Admin.api("commerce.products.find", {
        conditions: conditions,
        fields: PRODUCT_FIELDS.concat(["shortDescription"]),
        order: ["name"],
        limit: PAGE_SIZE,
        first: offset
    }, function(res) {
        if (res.status !== "ok") { callback(accumulated); return; }
        const page = res.products || [];
        const all = accumulated.concat(page);
        if (page.length === PAGE_SIZE) {
            fetchCatalogProductsWithDesc(producerId, offset + PAGE_SIZE, all, callback);
        } else {
            callback(all);
        }
    });
}

function fetchCatalogItems(producerId, offset, accumulated, callback) {
    const conditions = producerId ? { producer: producerId } : {};
    Admin.api("commerce.items.find", {
        conditions: conditions,
        fields: ["sku", "product", "options", "price", "isForSale"],
        order: ["product", "sku"],
        limit: PAGE_SIZE,
        first: offset
    }, function(res) {
        if (res.status !== "ok") { callback(accumulated); return; }
        const page = res.items || [];
        const all = accumulated.concat(page);
        if (page.length === PAGE_SIZE) {
            fetchCatalogItems(producerId, offset + PAGE_SIZE, all, callback);
        } else {
            callback(all);
        }
    });
}

const LOGO_URL = "https://cdn.open2b.com/xz8in0enw7/var/site/61/editor/logos/3lRkdH3m2H-400x124.png";

function openCatalogWindow(productOrder, grouped, productMap, listId, listName, producerName) {
    const today = new Date().toLocaleDateString("it-IT");
    const title = producerName
        ? "Catalogo " + producerName + " — " + listName
        : "Catalogo — " + listName;

    const cards = productOrder.map(function(pid) {
        const product = productMap[pid] || {};
        const items   = grouped[pid];
        const imgUrl  = product.mediumImage ? product.mediumImage.url : null;
        const imgTag  = imgUrl
            ? '<img src="' + escapeAttr(imgUrl) + '" alt="" class="prod-img">'
            : '<div class="prod-img-placeholder"></div>';

        const itemRows = items.map(function(item) {
            const price   = "€ " + Number(item.price[listId]).toFixed(2);
            const options = getItemOptionsText(item.options);
            const parts   = [];
            if (options !== "—") parts.push(escapeHTML(options));
            parts.push('<strong>' + escapeHTML(price) + '</strong>');
            return '<div class="item-row">' +
                '<span class="item-sku">SKU: ' + escapeHTML(item.sku) + '</span>' +
                (parts.length ? ' <span class="item-detail">' + parts.join(' &nbsp;|&nbsp; ') + '</span>' : '') +
            '</div>';
        }).join("");

        return '<div class="product-card">' +
            '<div class="prod-img-cell">' + imgTag + '</div>' +
            '<div class="prod-name">' + escapeHTML(toStr(product.name)) + '</div>' +
            '<div class="prod-code">Cod: ' + escapeHTML(toStr(product.code)) + '</div>' +
            '<div class="prod-items">' + itemRows + '</div>' +
        '</div>';
    }).join("");

    const html = '<!DOCTYPE html><html lang="it"><head>' +
        '<meta charset="UTF-8">' +
        '<title>' + escapeHTML(title) + '</title>' +
        '<style>' + catalogCSS() + '</style>' +
        '</head><body>' +
        '<div class="catalog-header no-print">' +
            '<button onclick="window.print()">Stampa / Salva PDF</button>' +
        '</div>' +
        '<div class="catalog-title">' +
            '<img src="' + LOGO_URL + '" alt="Mangiamo Italiano" class="catalog-logo">' +
            '<h2>' + escapeHTML(listName) + (producerName ? ' — ' + escapeHTML(producerName) : '') + '</h2>' +
            '<p class="catalog-date">Data: ' + today + '</p>' +
        '</div>' +
        '<div class="catalog-body">' + cards + '</div>' +
        '</body></html>';

    const win = window.open("", "_blank");
    if (!win) {
        alert("Il browser ha bloccato la finestra popup. Consenti i popup per questa pagina.");
        return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
}

function openNoPriceCatalogWindow(productOrder, grouped, productMap, producerName) {
    const today = new Date().toLocaleDateString("it-IT");
    const title = producerName
        ? "Catalogo " + producerName
        : "Catalogo Prodotti";

    const cards = productOrder.map(function(pid) {
        const product = productMap[pid] || {};
        const items   = grouped[pid];
        const imgUrl  = product.mediumImage ? product.mediumImage.url : null;
        const imgTag  = imgUrl
            ? '<img src="' + escapeAttr(imgUrl) + '" alt="" class="prod-img">'
            : '<div class="prod-img-placeholder"></div>';

        const desc = toStr(product.shortDescription);
        const descTag = desc
            ? '<div class="prod-desc">' + desc + '</div>'
            : '';

        const itemRows = items.map(function(item) {
            const options = getItemOptionsText(item.options);
            return '<div class="item-row">' +
                '<span class="item-sku">SKU: ' + escapeHTML(item.sku) + '</span>' +
                (options !== "—" ? ' <span class="item-detail">' + escapeHTML(options) + '</span>' : '') +
            '</div>';
        }).join("");

        return '<div class="product-card">' +
            '<div class="prod-img-cell">' + imgTag + '</div>' +
            '<div class="prod-name">' + escapeHTML(toStr(product.name)) + '</div>' +
            '<div class="prod-code">Cod: ' + escapeHTML(toStr(product.code)) + '</div>' +
            descTag +
            '<div class="prod-items">' + itemRows + '</div>' +
        '</div>';
    }).join("");

    const html = '<!DOCTYPE html><html lang="it"><head>' +
        '<meta charset="UTF-8">' +
        '<title>' + escapeHTML(title) + '</title>' +
        '<style>' + catalogCSS() + '</style>' +
        '</head><body>' +
        '<div class="catalog-header no-print">' +
            '<button onclick="window.print()">Stampa / Salva PDF</button>' +
        '</div>' +
        '<div class="catalog-title">' +
            '<img src="' + LOGO_URL + '" alt="Mangiamo Italiano" class="catalog-logo">' +
            '<h2>' + (producerName ? escapeHTML(producerName) : 'Tutti i produttori') + '</h2>' +
            '<p class="catalog-date">Data: ' + today + '</p>' +
        '</div>' +
        '<div class="catalog-body">' + cards + '</div>' +
        '</body></html>';

    const win = window.open("", "_blank");
    if (!win) {
        alert("Il browser ha bloccato la finestra popup. Consenti i popup per questa pagina.");
        return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
}

function catalogCSS() {
    return `
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #111; background: #fff; }

        .catalog-header { padding: 12px 20px; background: #f5f5f5; border-bottom: 1px solid #ddd; }
        .catalog-header button {
            padding: 8px 18px; background: #333; color: #fff;
            border: none; border-radius: 4px; cursor: pointer; font-size: 13px;
        }

        .catalog-title { padding: 20px 20px 12px; border-bottom: 2px solid #222; margin-bottom: 16px; }
        .catalog-logo { height: 40px; width: auto; display: block; margin-bottom: 6px; }
        .catalog-title h2 { font-size: 14px; font-weight: normal; margin-top: 4px; color: #444; }
        .catalog-date { font-size: 10px; color: #888; margin-top: 4px; }

        .catalog-body {
            padding: 0 20px 20px;
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 16px;
        }

        .product-card {
            border: 1px solid #ddd;
            border-radius: 4px;
            padding: 10px;
            page-break-inside: avoid;
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        .prod-img-cell { text-align: center; }
        .prod-img { width: 100%; max-height: 120px; object-fit: contain; }
        .prod-img-placeholder { width: 100%; height: 100px; background: #f5f5f5; border: 1px solid #eee; }

        .prod-name { font-weight: bold; font-size: 11px; line-height: 1.3; }
        .prod-code { font-size: 10px; color: #888; }

        .prod-desc { font-size: 10px; color: #555; line-height: 1.4; margin-top: 4px; }
        .prod-desc p { margin: 0; }

        .prod-items { margin-top: 4px; border-top: 1px solid #eee; padding-top: 4px; }
        .item-row { font-size: 10px; color: #444; margin-top: 3px; display: flex; justify-content: space-between; gap: 6px; }
        .item-sku { color: #888; flex-shrink: 0; }
        .item-detail { text-align: right; }
        .item-detail strong { color: #111; }

        @media print {
            @page { size: A4; margin: 12mm 10mm; }
            .no-print { display: none !important; }
            body { font-size: 10px; }
            .catalog-title { padding: 0 0 8px; margin-bottom: 10px; }
            .catalog-body { padding: 0; gap: 10px; }
            .product-card { padding: 6px; gap: 4px; }
            .prod-img { max-height: 90px; }
        }
    `;
}

function toStr(val) {
    if (val == null) return "";
    if (typeof val === "object") return val.it || val.en || Object.values(val).find(function(v) { return v; }) || "";
    return String(val);
}

function escapeHTML(val) {
    return String(val)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function escapeAttr(val) {
    return String(val).replace(/"/g, "&quot;");
}
