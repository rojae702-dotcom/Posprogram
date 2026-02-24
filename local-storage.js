/**
 * local-storage.js — 배포용 localStorage 데이터 레이어
 * Appwrite 없이 모든 데이터를 기기 로컬에 저장
 *
 * 저장 키 구조:
 *   yul_products   → 상품 목록 (배열)
 *   yul_categories → 카테고리 목록 (배열)
 *   yul_sales      → 매출 내역 (배열)
 *   yul_shop_name  → 상점 이름 (문자열)
 */

const KEYS = {
    products:   'yul_products',
    categories: 'yul_categories',
    sales:      'yul_sales',
    shopName:   'yul_shop_name',
};

// ── 유틸 ──
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function load(key) {
    try { return JSON.parse(localStorage.getItem(key)) || []; }
    catch { return []; }
}

function save(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
}

// ── 상점 이름 ──
export const shopName = {
    get: () => localStorage.getItem(KEYS.shopName) || '',
    set: (name) => localStorage.setItem(KEYS.shopName, name),
};

// ── 카테고리 ──
export const categories = {
    list: () => load(KEYS.categories),

    add: (name) => {
        const cats = load(KEYS.categories);
        if (cats.find(c => c.name === name)) return null;
        const cat = { id: generateId(), name };
        cats.push(cat);
        save(KEYS.categories, cats);
        return cat;
    },

    remove: (id) => {
        const cats = load(KEYS.categories).filter(c => c.id !== id);
        save(KEYS.categories, cats);
    },

    init: () => {
        // 카테고리 없으면 기본값 생성
        if (load(KEYS.categories).length === 0) {
            save(KEYS.categories, [{ id: generateId(), name: '일반' }]);
        }
    },
};

// ── 상품 ──
export const products = {
    list: () => load(KEYS.products),

    get: (id) => load(KEYS.products).find(p => p.id === id) || null,

    // imageFile: File 객체 → Base64로 변환 후 저장
    add: async (data, imageFile = null) => {
        const items = load(KEYS.products);
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
        if (imageFile) {
            product.imageUrl = await fileToBase64(imageFile);
        }
        items.push(product);
        save(KEYS.products, items);
        return product;
    },

    update: async (id, data, imageFile = null) => {
        const items = load(KEYS.products);
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
        if (imageFile) {
            items[idx].imageUrl = await fileToBase64(imageFile);
        }
        save(KEYS.products, items);
        return items[idx];
    },

    remove: (id) => {
        const items = load(KEYS.products).filter(p => p.id !== id);
        save(KEYS.products, items);
    },

    updateCategory: (id, category) => {
        const items = load(KEYS.products);
        const idx = items.findIndex(p => p.id === id);
        if (idx !== -1) { items[idx].category = category; save(KEYS.products, items); }
    },
};

// ── 매출 ──
export const sales = {
    list: () => load(KEYS.sales),

    // cart: [{ name, price, quantity }]
    addOrder: (cart, paymentMethod) => {
        const items = load(KEYS.sales);
        const orderId = generateId();
        const now = new Date().toISOString();
        const records = cart.map(item => ({
            id: generateId(),
            orderId,
            productName: item.name,
            price: item.price,
            quantity: item.quantity,
            totalPrice: item.price * item.quantity,
            paymentMethod,
            createdAt: now,
        }));
        items.push(...records);
        save(KEYS.sales, items);
        return orderId;
    },

    // 기간 필터링
    filter: (startDate, endDate) => {
        const items = load(KEYS.sales);
        return items.filter(s => {
            const t = new Date(s.createdAt);
            if (startDate && t < new Date(startDate + 'T00:00:00')) return false;
            if (endDate   && t > new Date(endDate   + 'T23:59:59')) return false;
            return true;
        });
    },

    // orderId 기준 그룹화
    grouped: (startDate, endDate) => {
        const items = sales.filter(startDate, endDate);
        const groups = {};
        items.forEach(s => {
            if (!groups[s.orderId]) {
                groups[s.orderId] = { items: [], total: 0, method: s.paymentMethod, time: s.createdAt };
            }
            groups[s.orderId].items.push(s);
            groups[s.orderId].total += s.totalPrice;
        });
        return Object.values(groups);
    },

    // CSV 내보내기
    exportCSV: (startDate, endDate) => {
        const groups = sales.grouped(startDate, endDate);
        const rows = [['주문시간', '주문ID', '상품명', '수량', '단가', '소계', '결제수단']];
        groups.forEach(order => {
            order.items.forEach(item => {
                rows.push([
                    new Date(item.createdAt).toLocaleString('ko-KR'),
                    item.orderId,
                    item.productName,
                    item.quantity,
                    item.price,
                    item.totalPrice,
                    item.paymentMethod,
                ]);
            });
        });
        const csv = '\uFEFF' + rows.map(r => r.join(',')).join('\n'); // BOM for Korean
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `매출내역_${new Date().toLocaleDateString('ko-KR').replace(/\. /g,'-').replace('.','')}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    },
};

// ── 이미지 → Base64 변환 ──
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        // 이미지 리사이즈 (용량 절약: 최대 400px)
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
