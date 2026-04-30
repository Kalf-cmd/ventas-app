const state = {
  products: [],
  customers: [],
  sales: []
};

const formatMoney = (value) => `S/ ${Number(value || 0).toFixed(2)}`;

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
  if (state.products.length === 0) {
    table.innerHTML = rowMessage(4, "Sin productos.");
    return;
  }

  table.innerHTML = state.products.map((product) => `
    <tr>
      <td>${product.name}</td>
      <td>${formatMoney(product.price)}</td>
      <td>${product.stock}</td>
      <td><button class="danger" data-delete-product="${product.id}">Eliminar</button></td>
    </tr>
  `).join("");
}

function renderCustomers() {
  const table = document.querySelector("#customers-table");
  if (state.customers.length === 0) {
    table.innerHTML = rowMessage(4, "Sin clientes.");
    return;
  }

  table.innerHTML = state.customers.map((customer) => `
    <tr>
      <td>${customer.name}</td>
      <td>${customer.document || "-"}</td>
      <td>${customer.email || "-"}</td>
      <td><button class="danger" data-delete-customer="${customer.id}">Eliminar</button></td>
    </tr>
  `).join("");
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
  if (state.sales.length === 0) {
    list.innerHTML = "<p class=\"empty\">Todavia no hay ventas.</p>";
    return;
  }

  list.innerHTML = state.sales.map((sale) => `
    <article class="sale-card">
      <header>
        <strong>Venta #${sale.id}</strong>
        <strong>${formatMoney(sale.total)}</strong>
      </header>
      <p>${sale.customer_name || "Sin cliente"}</p>
      ${sale.items.map((item) => `<p>${item.quantity} x ${item.product_name} - ${formatMoney(item.subtotal)}</p>`).join("")}
    </article>
  `).join("");
}

document.querySelector("#product-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const productForm = event.currentTarget;
  const form = new FormData(productForm);
  try {
    await api("/api/products", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(form))
    });
    productForm.reset();
    toast("Producto guardado.");
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
    await api("/api/customers", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(form))
    });
    customerForm.reset();
    toast("Cliente guardado.");
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
    toast("Venta registrada.");
    await loadAll();
  } catch (error) {
    toast(error.message);
  }
});

document.querySelector("#add-line").addEventListener("click", addSaleLine);

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
    toast("Aplicacion reiniciada desde cero.");
    await loadAll();
  } catch (error) {
    toast(error.message);
  }
});

document.body.addEventListener("click", async (event) => {
  const productId = event.target.dataset.deleteProduct;
  const customerId = event.target.dataset.deleteCustomer;

  if (productId) {
    try {
      await api(`/api/products/${productId}`, { method: "DELETE" });
      toast("Producto eliminado.");
      await loadAll();
    } catch (error) {
      toast(error.message);
    }
  }

  if (customerId) {
    try {
      await api(`/api/customers/${customerId}`, { method: "DELETE" });
      toast("Cliente eliminado.");
      await loadAll();
    } catch (error) {
      toast(error.message);
    }
  }
});

loadAll().catch((error) => toast(error.message));
