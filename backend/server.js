const express = require("express");
const cors = require("cors");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Database = require("better-sqlite3");

const app = express();
const PORT = 3001;
const JWT_SECRET = process.env.JWT_SECRET || "change-this-secret-in-production";

const db = new Database(
  path.join(__dirname, "store.db")
);

app.use(cors());
app.use(express.json());

// Serve frontend
app.use(express.static(path.join(__dirname, "../frontend")));

app.get("/", (req, res) => {
  res.sendFile(
    path.join(__dirname, "../frontend/index.html")
  );
});

/* ================= DATABASE ================= */

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  price REAL NOT NULL,
  image TEXT NOT NULL,
  stock INTEGER NOT NULL DEFAULT 20
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  total REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'Placed',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  price REAL NOT NULL,
  FOREIGN KEY(order_id) REFERENCES orders(id),
  FOREIGN KEY(product_id) REFERENCES products(id)
);
`);

/* ================= SAMPLE PRODUCTS ================= */

const count = db
  .prepare("SELECT COUNT(*) AS count FROM products")
  .get().count;

if (count === 0) {
  const insert = db.prepare(`
    INSERT INTO products
    (name, description, price, image, stock)
    VALUES (?, ?, ?, ?, ?)
  `);

  const products = [
    [
      "Wireless Headphones",
      "Bluetooth headphones with deep bass and 30-hour battery.",
      59.99,
      "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=800&q=80",
      30
    ],
    [
      "Smart Watch",
      "Fitness tracking, notifications and heart-rate monitoring.",
      79.99,
      "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=80",
      25
    ],
    [
      "Mechanical Keyboard",
      "RGB mechanical keyboard with tactile switches.",
      69.99,
      "https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=800&q=80",
      18
    ],
    [
      "Laptop Backpack",
      "Water-resistant backpack with padded laptop compartment.",
      44.99,
      "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=800&q=80",
      40
    ],
    [
      "Running Shoes",
      "Lightweight running shoes with breathable mesh.",
      64.99,
      "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=800&q=80",
      35
    ],
    [
      "Desk Lamp",
      "Minimal LED desk lamp with adjustable brightness.",
      29.99,
      "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=800&q=80",
      50
    ]
  ];

  products.forEach(product => insert.run(...product));
}

/* ================= AUTH ================= */

function authenticate(req, res, next) {
  const token = (req.headers.authorization || "")
    .replace("Bearer ", "");

  if (!token) {
    return res.status(401).json({
      error: "Authentication required"
    });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({
      error: "Invalid or expired token"
    });
  }
}

app.post("/api/auth/register", (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password || password.length < 6) {
    return res.status(400).json({
      error: "Name, email and a 6+ character password are required"
    });
  }

  try {
    const hash = bcrypt.hashSync(password, 10);

    const result = db.prepare(`
      INSERT INTO users(name, email, password)
      VALUES (?, ?, ?)
    `).run(name, email.toLowerCase(), hash);

    const token = jwt.sign(
      {
        id: result.lastInsertRowid,
        name,
        email: email.toLowerCase()
      },
      JWT_SECRET,
      { expiresIn: "2h" }
    );

    res.json({
      token,
      user: {
        id: result.lastInsertRowid,
        name,
        email: email.toLowerCase()
      }
    });
  } catch {
    res.status(409).json({
      error: "Email is already registered"
    });
  }
});

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body;

  const user = db
    .prepare("SELECT * FROM users WHERE email = ?")
    .get((email || "").toLowerCase());

  if (!user || !bcrypt.compareSync(password || "", user.password)) {
    return res.status(401).json({
      error: "Invalid email or password"
    });
  }

  const token = jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email
    },
    JWT_SECRET,
    { expiresIn: "2h" }
  );

  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email
    }
  });
});

/* ================= PRODUCTS ================= */

app.get("/api/products", (req, res) => {
  const products = db
    .prepare("SELECT * FROM products ORDER BY id DESC")
    .all();

  res.json(products);
});

app.get("/api/products/:id", (req, res) => {
  const product = db
    .prepare("SELECT * FROM products WHERE id = ?")
    .get(req.params.id);

  if (!product) {
    return res.status(404).json({
      error: "Product not found"
    });
  }

  res.json(product);
});

/* ================= ORDERS ================= */

app.post("/api/orders", authenticate, (req, res) => {
  const items = Array.isArray(req.body.items)
    ? req.body.items
    : [];

  if (!items.length) {
    return res.status(400).json({
      error: "Cart is empty"
    });
  }

  const getProduct = db.prepare(
    "SELECT * FROM products WHERE id = ?"
  );

  const validItems = [];
  let total = 0;

  for (const item of items) {
    const product = getProduct.get(
      Number(item.productId)
    );

    const quantity = Math.max(
      1,
      Number(item.quantity) || 1
    );

    if (!product) {
      return res.status(400).json({
        error: "Invalid product"
      });
    }

    if (quantity > product.stock) {
      return res.status(400).json({
        error: `Only ${product.stock} ${product.name} available`
      });
    }

    validItems.push({
      product,
      quantity
    });

    total += product.price * quantity;
  }

  const transaction = db.transaction(() => {
    const order = db.prepare(`
      INSERT INTO orders(user_id, total, status)
      VALUES (?, ?, ?)
    `).run(req.user.id, total, "Placed");

    const insertItem = db.prepare(`
      INSERT INTO order_items
      (order_id, product_id, quantity, price)
      VALUES (?, ?, ?, ?)
    `);

    const updateStock = db.prepare(`
      UPDATE products
      SET stock = stock - ?
      WHERE id = ?
    `);

    validItems.forEach(({ product, quantity }) => {
      insertItem.run(
        order.lastInsertRowid,
        product.id,
        quantity,
        product.price
      );

      updateStock.run(
        quantity,
        product.id
      );
    });

    return order.lastInsertRowid;
  });

  const orderId = transaction();

  res.status(201).json({
    orderId,
    total,
    status: "Placed"
  });
});

app.get("/api/orders", authenticate, (req, res) => {
  const orders = db.prepare(`
    SELECT *
    FROM orders
    WHERE user_id = ?
    ORDER BY id DESC
  `).all(req.user.id);

  const getItems = db.prepare(`
    SELECT order_items.*, products.name
    FROM order_items
    JOIN products
      ON products.id = order_items.product_id
    WHERE order_items.order_id = ?
  `);

  orders.forEach(order => {
    order.items = getItems.all(order.id);
  });

  res.json(orders);
});

/* ================= SERVER ================= */
// Root Route
app.get("/", (req, res) => {
    res.send(`
        <h1>🛒 E-Commerce Backend</h1>
        <p>Welcome to the E-Commerce API!</p>
        <p>Server is running successfully 🚀</p>
    `);
});
app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});
