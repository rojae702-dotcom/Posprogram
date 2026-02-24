/**
 * local-storage.js — 배포용 localStorage 데이터 레이어 (멀티 부스)
 *
 * 저장 키 구조:
 *   yul_shops                → 부스 목록 (배열)
 *   yul_{shopId}_products    → 부스별 상품
 *   yul_{shopId}_categories  → 부스별 카테고리
 *   yul_{shopId}_sales       → 부스별 매출
 */

// ── 유틸 ──
export function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function load(key) {
    try { return JSON.parse(localStorage.getItem(key)) || []; }
    catch { return []; }
}

function loadStr(key) {
    return localStorage.getItem(key) || '';
}

function save(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
}

// ── URL에서 shopId 추출 ──
export function getShopId() {
    return new URLSearchParams(location.search).get('shopId') || '';
}

// ── 부스 목록 ──
export const shops = {
    list: () => load('yul_shops'),

    add: (name) => {
        const list = load('yul_shops');
        const shop = { id: generateId(), name, createdAt: new Date().toISOString() };
        list.push(shop);
        save('yul_shops', list);
        // 기본 카테고리 생성
        save(`yul_${shop.id}_categories`, [{ id: generateId(), name: '일반' }]);
        return shop;
    },

    remove: (id) => {
        const list = load('yul_shops').filter(s => s.id !== id);
        save('yul_shops', list);
        // 해당 부스 데이터 전체 삭제
        ['products', 'categories', 'sales'].forEach(k => {
            localStorage.removeItem(`yul_${id}_${k}`);
        });
    },

    rename: (id, name) => {
        const list = load('yul_shops');
        const idx = list.findIndex(s => s.id === id);
        if (idx !== -1) { list[idx].name = name; save('yul_shops', list); }
    },

    get: (id) => load('yul_shops').find(s => s.id === id) || null,
};

// ── shopId 기반 키 생성 ──
function keys(shopId) {
    return {
        products:   `yul_${shopId}_products`,
        categories: `yul_${shopId}_categories`,
        sales:      `yul_${shopId}_sales`,
    };
}

// ── 카테고리 ──
export const categories = {
    list: (shopId) => load(keys(shopId).categories),

    add: (shopId, name) => {
        const cats = load(keys(shopId).categories);
        if (cats.find(c => c.name === name)) return null;
        const cat = { id: generateId(), name };
        cats.push(cat);
        save(keys(shopId).categories, cats);
        return cat;
    },

    remove: (shopId, id) => {
        const cats = load(keys(shopId).categories).filter(c => c.id !== id);
        save(keys(shopId).categories, cats);
    },

    init: (shopId) => {
        if (load(keys(shopId).categories).length === 0) {
            save(keys(shopId).categories, [{ id: generateId(), name: '일반' }]);
        }
    },
};

// ── 상품 ──
export const products = {
    list: (shopId) => load(keys(shopId).products),

    get: (shopId, id) => load(keys(shopId).products).find(p => p.id === id) || null,

    add: async (shopId, data, imageFile = null) => {
        const items = load(keys(shopId).products);
        const product = {
            id: generateId(),
            name: data.name,
            category: data.category,
            price: Number(data.price),
            stock: data.stock !== '' && data.stock !== null ? Number(data.stock) : null,
            status: '판매중',
            imageUrl: '',
            createdAt: new Date().toISOString(),
        };
        if (imageFile) product.imageUrl = await fileToBase64(imageFile);
        items.push(product);
        save(keys(shopId).products, items);
        return product;
    },

    update: async (shopId, id, data, imageFile = null) => {
        const items = load(keys(shopId).products);
        const idx = items.findIndex(p => p.id === id);
        if (idx === -1) return null;
        items[idx] = {
            ...items[idx],
            name: data.name,
            category: data.category,
            price: Number(data.price),
            stock: data.stock !== '' && data.stock !== null ? Number(data.stock) : null,
            status: data.status,
        };
        if (imageFile) items[idx].imageUrl = await fileToBase64(imageFile);
        save(keys(shopId).products, items);
        return items[idx];
    },

    remove: (shopId, id) => {
        const items = load(keys(shopId).products).filter(p => p.id !== id);
        save(keys(shopId).products, items);
    },

    updateCategory: (shopId, id, category) => {
        const items = load(keys(shopId).products);
        const idx = items.findIndex(p => p.id === id);
        if (idx !== -1) { items[idx].category = category; save(keys(shopId).products, items); }
    },
};

// ── 매출 ──
export const sales = {
    list: (shopId) => load(keys(shopId).sales),

    addOrder: (shopId, cart, paymentMethod) => {
        const items = load(keys(shopId).sales);
        const orderId = generateId();
        const now = new Date().toISOString();
        const records = cart.map(item => ({
            id: generateId(), orderId,
            productName: item.name,
            price: item.price,
            quantity: item.quantity,
            totalPrice: item.price * item.quantity,
            paymentMethod, createdAt: now,
        }));
        items.push(...records);
        save(keys(shopId).sales, items);
        return orderId;
    },

    filter: (shopId, startDate, endDate) => {
        const items = load(keys(shopId).sales);
        return items.filter(s => {
            const t = new Date(s.createdAt);
            if (startDate && t < new Date(startDate + 'T00:00:00')) return false;
            if (endDate   && t > new Date(endDate   + 'T23:59:59')) return false;
            return true;
        });
    },

    grouped: (shopId, startDate, endDate) => {
        const items = sales.filter(shopId, startDate, endDate);
        const groups = {};
        items.forEach(s => {
            if (!groups[s.orderId]) groups[s.orderId] = { items: [], total: 0, method: s.paymentMethod, time: s.createdAt };
            groups[s.orderId].items.push(s);
            groups[s.orderId].total += s.totalPrice;
        });
        return Object.values(groups);
    },

    exportCSV: (shopId, startDate, endDate, shopNameStr) => {
        const groups = sales.grouped(shopId, startDate, endDate);
        const rows = [['주문시간', '주문ID', '상품명', '수량', '단가', '소계', '결제수단']];
        groups.forEach(order => {
            order.items.forEach(item => {
                rows.push([
                    new Date(item.createdAt).toLocaleString('ko-KR'),
                    item.orderId, item.productName,
                    item.quantity, item.price, item.totalPrice, item.paymentMethod,
                ]);
            });
        });
        const csv = '\uFEFF' + rows.map(r => r.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${shopNameStr}_매출내역_${new Date().toLocaleDateString('ko-KR').replace(/\. /g,'-').replace('.','')}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    },

    // 매출만 초기화
    resetSales: (shopId) => localStorage.removeItem(keys(shopId).sales),
};

// ── 전체 초기화 (해당 부스) ──
export function resetAll(shopId) {
    ['products', 'categories', 'sales'].forEach(k => {
        localStorage.removeItem(`yul_${shopId}_${k}`);
    });
}

// ── 이미지 → Base64 변환 ──
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX = 400;
                let w = img.width, h = img.height;
                if (w > h && w > MAX) { h = (h * MAX) / w; w = MAX; }
                else if (h > MAX)     { w = (w * MAX) / h; h = MAX; }
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', 0.8));
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}
