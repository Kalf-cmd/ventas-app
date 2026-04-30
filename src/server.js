require("dotenv").config();

const express = require("express");
const path = require("path");
const { Pool } = require("pg");

const app = express();
const port = process.env.PORT || 3000;
const databaseUrl = process.env.DATABASE_URL;

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

const pool = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
      ssl: databaseUrl.includes("localhost")
        ? false
        : { rejectUnauthorized: false }
    })
  : null;

const memory = {
  products: [],
  customers: [],
  sales: [],
  saleItems: [],
  nextProductId: 1,
  nextCustomerId: 1,
  nextSaleId: 1,
  nextSaleItemId: 1
};

function toMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function positiveNumber(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`${field} debe ser mayor que cero.`);
  }
  return number;
}

function nonNegativeInteger(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`${field} debe ser un entero mayor o igual que cero.`);
  }
  return number;
}

function requiredText(value, field) {
  const text = String(value || "").trim();
  if (!text) {
    throw new Error(`${field} es obligatorio.`);
  }
  return text;
}

async function initDatabase() {
  if (!pool) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
      stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS customers (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      document TEXT,
      email TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sales (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      total NUMERIC(10, 2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sale_items (
      id SERIAL PRIMARY KEY,
      sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      price NUMERIC(10, 2) NOT NULL,
      subtotal NUMERIC(10, 2) NOT NULL
    );
  `);
}

function asyncRoute(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

app.get("/api/summary", asyncRoute(async (req, res) => {
  if (!pool) {
    const revenue = memory.sales.reduce((sum, sale) => sum + Number(sale.total), 0);
    res.json({
      products: memory.products.length,
      customers: memory.customers.length,
      sales: memory.sales.length,
      revenue: toMoney(revenue),
      mode: "memoria"
    });
    return;
  }

  const { rows } = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM products) AS products,
      (SELECT COUNT(*)::int FROM customers) AS customers,
      (SELECT COUNT(*)::int FROM sales) AS sales,
      COALESCE((SELECT SUM(total) FROM sales), 0)::numeric AS revenue
  `);

  res.json({ ...rows[0], revenue: toMoney(rows[0].revenue), mode: "postgres" });
}));

app.get("/api/products", asyncRoute(async (req, res) => {
  if (!pool) {
    res.json(memory.products);
    return;
  }

  const { rows } = await pool.query(
    "SELECT id, name, price::float, stock, created_at FROM products ORDER BY id DESC"
  );
  res.json(rows);
}));

app.post("/api/products", asyncRoute(async (req, res) => {
  const name = requiredText(req.body.name, "Nombre");
  const price = positiveNumber(req.body.price, "Precio");
  const stock = nonNegativeInteger(req.body.stock, "Stock");

  if (!pool) {
    const product = { id: memory.nextProductId++, name, price: toMoney(price), stock };
    memory.products.unshift(product);
    res.status(201).json(product);
    return;
  }

  const { rows } = await pool.query(
    "INSERT INTO products (name, price, stock) VALUES ($1, $2, $3) RETURNING id, name, price::float, stock, created_at",
    [name, price, stock]
  );
  res.status(201).json(rows[0]);
}));

app.put("/api/products/:id", asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  const name = requiredText(req.body.name, "Nombre");
  const price = positiveNumber(req.body.price, "Precio");
  const stock = nonNegativeInteger(req.body.stock, "Stock");

  if (!pool) {
    const product = memory.products.find((item) => item.id === id);
    if (!product) return res.status(404).json({ error: "Producto no encontrado." });
    Object.assign(product, { name, price: toMoney(price), stock });
    res.json(product);
    return;
  }

  const { rows } = await pool.query(
    "UPDATE products SET name = $1, price = $2, stock = $3 WHERE id = $4 RETURNING id, name, price::float, stock, created_at",
    [name, price, stock, id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Producto no encontrado." });
  res.json(rows[0]);
}));

app.delete("/api/products/:id", asyncRoute(async (req, res) => {
  const id = Number(req.params.id);

  if (!pool) {
    memory.products = memory.products.filter((item) => item.id !== id);
    res.status(204).end();
    return;
  }

  await pool.query("DELETE FROM products WHERE id = $1", [id]);
  res.status(204).end();
}));

app.get("/api/customers", asyncRoute(async (req, res) => {
  if (!pool) {
    res.json(memory.customers);
    return;
  }

  const { rows } = await pool.query(
    "SELECT id, name, document, email, created_at FROM customers ORDER BY id DESC"
  );
  res.json(rows);
}));

app.post("/api/customers", asyncRoute(async (req, res) => {
  const name = requiredText(req.body.name, "Nombre");
  const document = String(req.body.document || "").trim();
  const email = String(req.body.email || "").trim();

  if (!pool) {
    const customer = { id: memory.nextCustomerId++, name, document, email };
    memory.customers.unshift(customer);
    res.status(201).json(customer);
    return;
  }

  const { rows } = await pool.query(
    "INSERT INTO customers (name, document, email) VALUES ($1, $2, $3) RETURNING id, name, document, email, created_at",
    [name, document, email]
  );
  res.status(201).json(rows[0]);
}));

app.delete("/api/customers/:id", asyncRoute(async (req, res) => {
  const id = Number(req.params.id);

  if (!pool) {
    memory.customers = memory.customers.filter((item) => item.id !== id);
    res.status(204).end();
    return;
  }

  await pool.query("DELETE FROM customers WHERE id = $1", [id]);
  res.status(204).end();
}));

app.get("/api/sales", asyncRoute(async (req, res) => {
  if (!pool) {
    const sales = memory.sales.map((sale) => ({
      ...sale,
      customer_name: memory.customers.find((customer) => customer.id === sale.customer_id)?.name || "Sin cliente",
      items: memory.saleItems.filter((item) => item.sale_id === sale.id)
    }));
    res.json(sales);
    return;
  }

  const { rows: sales } = await pool.query(`
    SELECT s.id, s.customer_id, COALESCE(c.name, 'Sin cliente') AS customer_name,
           s.total::float, s.created_at
    FROM sales s
    LEFT JOIN customers c ON c.id = s.customer_id
    ORDER BY s.id DESC
    LIMIT 30
  `);

  const ids = sales.map((sale) => sale.id);
  if (ids.length === 0) return res.json([]);

  const { rows: items } = await pool.query(`
    SELECT si.sale_id, si.product_id, COALESCE(p.name, 'Producto eliminado') AS product_name,
           si.quantity, si.price::float, si.subtotal::float
    FROM sale_items si
    LEFT JOIN products p ON p.id = si.product_id
    WHERE si.sale_id = ANY($1::int[])
    ORDER BY si.id ASC
  `, [ids]);

  res.json(sales.map((sale) => ({
    ...sale,
    items: items.filter((item) => item.sale_id === sale.id)
  })));
}));

app.post("/api/sales", asyncRoute(async (req, res) => {
  const customerId = req.body.customer_id ? Number(req.body.customer_id) : null;
  const items = Array.isArray(req.body.items) ? req.body.items : [];

  if (items.length === 0) {
    throw new Error("Agrega al menos un producto a la venta.");
  }

  if (!pool) {
    const saleItems = [];
    let total = 0;

    for (const item of items) {
      const productId = Number(item.product_id);
      const quantity = positiveNumber(item.quantity, "Cantidad");
      const product = memory.products.find((entry) => entry.id === productId);
      if (!product) throw new Error("Producto no encontrado.");
      if (product.stock < quantity) throw new Error(`Stock insuficiente para ${product.name}.`);

      const subtotal = toMoney(product.price * quantity);
      product.stock -= quantity;
      total += subtotal;
      saleItems.push({
        id: memory.nextSaleItemId++,
        product_id: product.id,
        product_name: product.name,
        quantity,
        price: product.price,
        subtotal
      });
    }

    const sale = {
      id: memory.nextSaleId++,
      customer_id: customerId,
      customer_name: memory.customers.find((customer) => customer.id === customerId)?.name || "Sin cliente",
      total: toMoney(total),
      created_at: new Date().toISOString()
    };
    memory.sales.unshift(sale);
    memory.saleItems.push(...saleItems.map((item) => ({ ...item, sale_id: sale.id })));
    res.status(201).json({ ...sale, items: saleItems });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let total = 0;
    const saleItems = [];

    const { rows: saleRows } = await client.query(
      "INSERT INTO sales (customer_id, total) VALUES ($1, 0) RETURNING id, customer_id, total::float, created_at",
      [customerId]
    );
    const sale = saleRows[0];

    for (const item of items) {
      const productId = Number(item.product_id);
      const quantity = positiveNumber(item.quantity, "Cantidad");
      const { rows } = await client.query(
        "SELECT id, name, price::float, stock FROM products WHERE id = $1 FOR UPDATE",
        [productId]
      );
      const product = rows[0];
      if (!product) throw new Error("Producto no encontrado.");
      if (product.stock < quantity) throw new Error(`Stock insuficiente para ${product.name}.`);

      const subtotal = toMoney(product.price * quantity);
      total += subtotal;

      await client.query("UPDATE products SET stock = stock - $1 WHERE id = $2", [quantity, product.id]);
      await client.query(
        "INSERT INTO sale_items (sale_id, product_id, quantity, price, subtotal) VALUES ($1, $2, $3, $4, $5)",
        [sale.id, product.id, quantity, product.price, subtotal]
      );

      saleItems.push({
        product_id: product.id,
        product_name: product.name,
        quantity,
        price: product.price,
        subtotal
      });
    }

    await client.query("UPDATE sales SET total = $1 WHERE id = $2", [toMoney(total), sale.id]);
    await client.query("COMMIT");

    res.status(201).json({ ...sale, total: toMoney(total), items: saleItems });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}));

app.post("/api/reset", asyncRoute(async (req, res) => {
  const confirmation = String(req.body.confirmation || "").trim();
  if (confirmation !== "REINICIAR") {
    return res.status(400).json({ error: "Escribe REINICIAR para confirmar." });
  }

  if (!pool) {
    memory.products = [];
    memory.customers = [];
    memory.sales = [];
    memory.saleItems = [];
    memory.nextProductId = 1;
    memory.nextCustomerId = 1;
    memory.nextSaleId = 1;
    memory.nextSaleItemId = 1;
    res.json({ ok: true });
    return;
  }

  await pool.query("TRUNCATE TABLE sale_items, sales, products, customers RESTART IDENTITY CASCADE");
  res.json({ ok: true });
}));

app.use((error, req, res, next) => {
  console.error(error);
  res.status(400).json({ error: error.message || "No se pudo procesar la solicitud." });
});

initDatabase()
  .then(() => {
    app.listen(port, "0.0.0.0", () => {
      console.log(`Sistema de ventas listo en http://localhost:${port}`);
      console.log(pool ? "Base de datos: PostgreSQL" : "Base de datos: memoria temporal");
    });
  })
  .catch((error) => {
    console.error("No se pudo iniciar la base de datos:", error);
    process.exit(1);
  });
