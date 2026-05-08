const state = {
  products: [],
  customers: [],
  sales: [],
  editingProductId: null,
  editingCustomerId: null,
  filters: {
    products: "",
    customers: "",
    sales: ""
  },
  pagination: {
    products: { page: 1, perPage: 6 },
    customers: { page: 1, perPage: 6 },
    sales: { page: 1, perPage: 5 }
  }
};

const formatMoney = (value) => `S/ ${Number(value || 0).toFixed(2)}`;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  }[character]));
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Ocurrio un error.");
  }

  if (response.status === 204) return null;
  return response.json();
}

function toast(message) {
  const element = document.querySelector("#toast");
  element.textContent = message;
  element.classList.add("show");
  setTimeout(() => element.classList.remove("show"), 2400);
}

function rowMessage(columns, message) {
  return `<tr><td colspan="${columns}" class="empty">${message}</td></tr>`;
}

function getPageItems(items, pagination) {
  const totalPages = Math.max(1, Math.ceil(items.length / pagination.perPage));
  pagination.page = Math.min(Math.max(1, pagination.page), totalPages);
  const start = (pagination.page - 1) * pagination.perPage;
  return {
    items: items.slice(start, start + pagination.perPage),
    totalPages
  };
}

function renderPagination(id, collectionName, totalItems, totalPages) {
  const pagination = state.pagination[collectionName];
  const element = document.querySelector(id);
  if (!element) return;

  if (totalItems <= pagination.perPage) {
    element.innerHTML = "";
    return;
  }

  const start = (pagination.page - 1) * pagination.perPage + 1;
  const end = Math.min(totalItems, pagination.page * pagination.perPage);
  element.innerHTML = `
    <span>Mostrando ${start}-${end} de ${totalItems}</span>
    <div>
      <button type="button" class="secondary" data-page="${collectionName}" data-direction="-1" ${pagination.page === 1 ? "disabled" : ""}>Anterior</button>
      <strong>Pagina ${pagination.page} de ${totalPages}</strong>
      <button type="button" class="secondary" data-page="${collectionName}" data-direction="1" ${pagination.page === totalPages ? "disabled" : ""}>Siguiente</button>
    </div>
  `;
}

async function loadAll() {
  const [summary, products, customers, sales] = await Promise.all([
    api("/api/summary"),
    api("/api/products"),
    api("/api/customers"),
    api("/api/sales")
  ]);

  state.products = products;
  state.customers = customers;
  state.sales = sales;
  renderSummary(summary);
  renderProducts();
  renderCustomers();
  renderSaleForm();
  renderSales();
}

function renderSummary(summary) {
  document.querySelector("#metric-products").textContent = summary.products;
  document.querySelector("#metric-customers").textContent = summary.customers;
  document.querySelector("#metric-sales").textContent = summary.sales;
  document.querySelector("#metric-revenue").textContent = formatMoney(summary.revenue);
  document.querySelector("#mode").textContent =
    summary.mode === "postgres" ? "PostgreSQL en la nube" : "Modo local temporal";
}

function renderProducts() {
  const table = document.querySelector("#products-table");
  const products = filteredProducts();

  if (products.length === 0) {
    table.innerHTML = rowMessage(4, "Sin productos.");
    renderPagination("#products-pagination", "products", 0, 1);
    return;
  }

  const page = getPageItems(products, state.pagination.products);
  table.innerHTML = page.items.map((product) => `
    <tr>
      <td>${escapeHtml(product.name)}</td>
      <td>${formatMoney(product.price)}</td>
      <td>${product.stock}</td>
      <td>
        <div class="row-actions">
          <button class="secondary" data-edit-product="${product.id}">Editar</button>
          <button class="danger" data-delete-product="${product.id}">Eliminar</button>
        </div>
      </td>
    </tr>
  `).join("");
  renderPagination("#products-pagination", "products", products.length, page.totalPages);
}

function renderCustomers() {
  const table = document.querySelector("#customers-table");
  const customers = filteredCustomers();

  if (customers.length === 0) {
    table.innerHTML = rowMessage(4, "Sin clientes.");
    renderPagination("#customers-pagination", "customers", 0, 1);
    return;
  }

  const page = getPageItems(customers, state.pagination.customers);
  table.innerHTML = page.items.map((customer) => `
    <tr>
      <td>${escapeHtml(customer.name)}</td>
      <td>${escapeHtml(customer.document || "-")}</td>
      <td>${escapeHtml(customer.email || "-")}</td>
      <td>
        <div class="row-actions">
          <button class="secondary" data-edit-customer="${customer.id}">Editar</button>
          <button class="danger" data-delete-customer="${customer.id}">Eliminar</button>
        </div>
      </td>
    </tr>
  `).join("");
  renderPagination("#customers-pagination", "customers", customers.length, page.totalPages);
}

function filteredProducts() {
  const query = state.filters.products.toLowerCase();
  if (!query) return state.products;
  return state.products.filter((product) => (
    product.name.toLowerCase().includes(query)
    || String(product.price).includes(query)
    || String(product.stock).includes(query)
  ));
}

function filteredCustomers() {
  const query = state.filters.customers.toLowerCase();
  if (!query) return state.customers;
  return state.customers.filter((customer) => (
    customer.name.toLowerCase().includes(query)
    || String(customer.document || "").toLowerCase().includes(query)
    || String(customer.email || "").toLowerCase().includes(query)
  ));
}

function filteredSales() {
  const query = state.filters.sales.toLowerCase();
  if (!query) return state.sales;
  return state.sales.filter((sale) => {
    const products = sale.items.map((item) => item.product_name).join(" ");
    return [
      `venta ${sale.id}`,
      sale.customer_name || "",
      products,
      String(sale.total)
    ].join(" ").toLowerCase().includes(query);
  });
}

function productOptions() {
  return state.products.filter((product) => product.stock > 0).map((product) => (
    `<option value="${product.id}">${product.name} - ${formatMoney(product.price)} - Stock ${product.stock}</option>`
  )).join("");
}

function customerOptions() {
  return `
    <option value="">Cliente general</option>
    ${state.customers.map((customer) => `<option value="${customer.id}">${customer.name}</option>`).join("")}
  `;
}

function addSaleLine() {
  if (!state.products.some((product) => product.stock > 0)) {
    toast("No hay productos con stock disponible.");
    return;
  }

  const lines = document.querySelector("#sale-lines");
  const line = document.createElement("div");
  line.className = "sale-line";
  line.innerHTML = `
    <select name="product_id" required>${productOptions()}</select>
    <input name="quantity" type="number" min="1" step="1" value="1" required>
    <button type="button" class="danger" title="Quitar">X</button>
  `;
  line.querySelector("button").addEventListener("click", () => {
    line.remove();
    updateSaleTotal();
  });
  line.addEventListener("input", updateSaleTotal);
  line.addEventListener("change", updateSaleTotal);
  lines.appendChild(line);
  syncSaleLineStock(line);
  updateSaleTotal();
}

function renderSaleForm() {
  document.querySelector("#sale-customer").innerHTML = customerOptions();
  const lines = document.querySelector("#sale-lines");
  if (lines.children.length === 0 && state.products.length > 0) addSaleLine();

  for (const select of lines.querySelectorAll("select[name='product_id']")) {
    const value = select.value;
    select.innerHTML = productOptions();
    select.value = value;
    if (!select.value) select.closest(".sale-line").remove();
  }
  updateSaleTotal();
}

function syncSaleLineStock(line) {
  const productId = Number(line.querySelector("[name='product_id']").value);
  const quantityInput = line.querySelector("[name='quantity']");
  const product = state.products.find((item) => item.id === productId);

  if (!product) return;
  quantityInput.max = product.stock;
  if (Number(quantityInput.value) > product.stock) {
    quantityInput.value = product.stock;
  }
}

function updateSaleTotal() {
  let total = 0;
  for (const line of document.querySelectorAll(".sale-line")) {
    syncSaleLineStock(line);
    const productId = Number(line.querySelector("[name='product_id']").value);
    const quantity = Number(line.querySelector("[name='quantity']").value || 0);
    const product = state.products.find((item) => item.id === productId);
    total += product ? Number(product.price) * quantity : 0;
  }
  document.querySelector("#sale-total").textContent = formatMoney(total);
}

function validateSaleItems(items) {
  const quantitiesByProduct = new Map();

  for (const item of items) {
    const productId = Number(item.product_id);
    const quantity = Number(item.quantity);
    if (!productId || !Number.isInteger(quantity) || quantity <= 0) {
      throw new Error("Revisa los productos y cantidades de la venta.");
    }
    quantitiesByProduct.set(productId, (quantitiesByProduct.get(productId) || 0) + quantity);
  }

  for (const [productId, quantity] of quantitiesByProduct) {
    const product = state.products.find((item) => item.id === productId);
    if (!product) throw new Error("Producto no encontrado.");
    if (quantity > product.stock) {
      throw new Error(`Stock insuficiente para ${product.name}. Disponible: ${product.stock}.`);
    }
  }
}

function renderSales() {
  const list = document.querySelector("#sales-list");
  const sales = filteredSales();

  if (sales.length === 0) {
    list.innerHTML = "<p class=\"empty\">Todavia no hay ventas.</p>";
    renderPagination("#sales-pagination", "sales", 0, 1);
    return;
  }

  const page = getPageItems(sales, state.pagination.sales);
  list.innerHTML = page.items.map((sale) => `
    <article class="sale-card">
      <header>
        <strong>Venta #${sale.id}</strong>
        <strong>${formatMoney(sale.total)}</strong>
      </header>
      <p>${escapeHtml(sale.customer_name || "Sin cliente")}</p>
      ${sale.items.map((item) => `<p>${item.quantity} x ${escapeHtml(item.product_name)} - ${formatMoney(item.subtotal)}</p>`).join("")}
    </article>
  `).join("");
  renderPagination("#sales-pagination", "sales", sales.length, page.totalPages);
}

function resetProductForm() {
  state.editingProductId = null;
  document.querySelector("#product-form").reset();
  document.querySelector("#product-submit").textContent = "Guardar";
  document.querySelector("#product-cancel").classList.add("hidden");
}

function resetCustomerForm() {
  state.editingCustomerId = null;
  document.querySelector("#customer-form").reset();
  document.querySelector("#customer-submit").textContent = "Guardar";
  document.querySelector("#customer-cancel").classList.add("hidden");
}

function editProduct(id) {
  const product = state.products.find((item) => item.id === id);
  if (!product) return;
  const form = document.querySelector("#product-form");
  form.elements.name.value = product.name;
  form.elements.price.value = product.price;
  form.elements.stock.value = product.stock;
  state.editingProductId = id;
  document.querySelector("#product-submit").textContent = "Actualizar";
  document.querySelector("#product-cancel").classList.remove("hidden");
  form.scrollIntoView({ behavior: "smooth", block: "center" });
}

function editCustomer(id) {
  const customer = state.customers.find((item) => item.id === id);
  if (!customer) return;
  const form = document.querySelector("#customer-form");
  form.elements.name.value = customer.name;
  form.elements["document"].value = customer.document || "";
  form.elements.email.value = customer.email || "";
  state.editingCustomerId = id;
  document.querySelector("#customer-submit").textContent = "Actualizar";
  document.querySelector("#customer-cancel").classList.remove("hidden");
  form.scrollIntoView({ behavior: "smooth", block: "center" });
}

document.querySelector("#product-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const productForm = event.currentTarget;
  const form = new FormData(productForm);
  try {
    const wasEditing = Boolean(state.editingProductId);
    const path = wasEditing ? `/api/products/${state.editingProductId}` : "/api/products";
    await api(path, {
      method: wasEditing ? "PUT" : "POST",
      body: JSON.stringify(Object.fromEntries(form))
    });
    resetProductForm();
    state.pagination.products.page = 1;
    toast(wasEditing ? "Producto actualizado." : "Producto guardado.");
    await loadAll();
  } catch (error) {
    toast(error.message);
  }
});

document.querySelector("#customer-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const customerForm = event.currentTarget;
  const form = new FormData(customerForm);
  try {
    const wasEditing = Boolean(state.editingCustomerId);
    const path = wasEditing ? `/api/customers/${state.editingCustomerId}` : "/api/customers";
    await api(path, {
      method: wasEditing ? "PUT" : "POST",
      body: JSON.stringify(Object.fromEntries(form))
    });
    resetCustomerForm();
    state.pagination.customers.page = 1;
    toast(wasEditing ? "Cliente actualizado." : "Cliente guardado.");
    await loadAll();
  } catch (error) {
    toast(error.message);
  }
});

document.querySelector("#sale-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const items = [...document.querySelectorAll(".sale-line")].map((line) => ({
    product_id: line.querySelector("[name='product_id']").value,
    quantity: line.querySelector("[name='quantity']").value
  }));

  try {
    validateSaleItems(items);
    await api("/api/sales", {
      method: "POST",
      body: JSON.stringify({
        customer_id: document.querySelector("#sale-customer").value,
        items
      })
    });

    document.querySelector("#sale-lines").innerHTML = "";
    state.pagination.sales.page = 1;
    toast("Venta registrada.");
    await loadAll();
  } catch (error) {
    toast(error.message);
  }
});

document.querySelector("#add-line").addEventListener("click", addSaleLine);

document.querySelector("#product-cancel").addEventListener("click", resetProductForm);
document.querySelector("#customer-cancel").addEventListener("click", resetCustomerForm);

document.querySelector("#products-search").addEventListener("input", (event) => {
  state.filters.products = event.target.value.trim();
  state.pagination.products.page = 1;
  renderProducts();
});

document.querySelector("#customers-search").addEventListener("input", (event) => {
  state.filters.customers = event.target.value.trim();
  state.pagination.customers.page = 1;
  renderCustomers();
});

document.querySelector("#sales-search").addEventListener("input", (event) => {
  state.filters.sales = event.target.value.trim();
  state.pagination.sales.page = 1;
  renderSales();
});

document.querySelector("#logout-app").addEventListener("click", async () => {
  try {
    await api("/api/logout", { method: "POST" });
    window.location.href = "/login.html";
  } catch (error) {
    toast(error.message);
  }
});

document.querySelector("#reset-app").addEventListener("click", async () => {
  const confirmation = window.prompt("Esta accion borrara productos, clientes y ventas. Escribe REINICIAR para confirmar.");
  if (confirmation !== "REINICIAR") {
    toast("Reinicio cancelado.");
    return;
  }

  try {
    await api("/api/reset", {
      method: "POST",
      body: JSON.stringify({ confirmation })
    });
    document.querySelector("#sale-lines").innerHTML = "";
    state.pagination.products.page = 1;
    state.pagination.customers.page = 1;
    state.pagination.sales.page = 1;
    toast("Aplicacion reiniciada desde cero.");
    await loadAll();
  } catch (error) {
    toast(error.message);
  }
});

document.body.addEventListener("click", async (event) => {
  const productId = event.target.dataset.deleteProduct;
  const customerId = event.target.dataset.deleteCustomer;
  const editProductId = event.target.dataset.editProduct;
  const editCustomerId = event.target.dataset.editCustomer;
  const pageTarget = event.target.dataset.page;
  const direction = Number(event.target.dataset.direction || 0);

  if (editProductId) {
    editProduct(Number(editProductId));
    return;
  }

  if (editCustomerId) {
    editCustomer(Number(editCustomerId));
    return;
  }

  if (pageTarget && direction) {
    state.pagination[pageTarget].page += direction;
    if (pageTarget === "products") renderProducts();
    if (pageTarget === "customers") renderCustomers();
    if (pageTarget === "sales") renderSales();
    return;
  }

  if (productId) {
    try {
      await api(`/api/products/${productId}`, { method: "DELETE" });
      state.pagination.products.page = 1;
      toast("Producto eliminado.");
      await loadAll();
    } catch (error) {
      toast(error.message);
    }
  }

  if (customerId) {
    try {
      await api(`/api/customers/${customerId}`, { method: "DELETE" });
      state.pagination.customers.page = 1;
      toast("Cliente eliminado.");
      await loadAll();
    } catch (error) {
      toast(error.message);
    }
  }
});

loadAll().catch((error) => toast(error.message));
