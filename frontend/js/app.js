/*
const API_URL = "http://localhost:3001/api";

let products = [];
let cart = JSON.parse(localStorage.getItem("novacart-cart") || "[]");
let token = localStorage.getItem("novacart-token");

const $ = selector => document.querySelector(selector);

async function api(endpoint, options = {}) {
  options.headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };

  const response = await fetch(`${API_URL}${endpoint}`, options);
  const data = await response.json();

  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function saveCart() {
  localStorage.setItem("novacart-cart", JSON.stringify(cart));
  renderCart();
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.style.display = "block";
  setTimeout(() => toast.style.display = "none", 2200);
}

async function loadProducts() {
  try {
    products = await api("/products");
    renderProducts();
    renderCart();
  } catch (error) {
    showToast(error.message);
  }
}

function renderProducts() {
  const query = $("#search").value.toLowerCase();

  $("#products").innerHTML = products
    .filter(p => p.name.toLowerCase().includes(query))
    .map(p => `
      <article class="card">
        <img src="${p.image}" alt="${p.name}">
        <div class="card-body">
          <h3>${p.name}</h3>
          <div class="description">${p.description}</div>
          <div class="price">$${p.price.toFixed(2)}</div>
          <div class="actions">
            <button onclick="showProduct(${p.id})">Details</button>
            <button class="add" onclick="addToCart(${p.id})">Add to Cart</button>
          </div>
        </div>
      </article>
    `).join("");
}

function addToCart(productId) {
  const item = cart.find(x => x.productId === productId);

  if (item) item.quantity++;
  else cart.push({ productId, quantity: 1 });

  saveCart();
  showToast("Product added to cart");
}

function renderCart() {
  $("#cartCount").textContent =
    cart.reduce((sum, item) => sum + item.quantity, 0);

  if (!cart.length) {
    $("#cartItems").innerHTML = '<p class="muted">Your cart is empty.</p>';
  } else {
    $("#cartItems").innerHTML = cart.map(item => {
      const p = products.find(x => x.id === item.productId);

      return `
        <div class="cart-row">
          <img src="${p.image}" alt="${p.name}">
          <div class="cart-info">
            <b>${p.name}</b>
            <div>$${(p.price * item.quantity).toFixed(2)}</div>
            <div class="qty">
              <button onclick="changeQuantity(${p.id},-1)">−</button>
              ${item.quantity}
              <button onclick="changeQuantity(${p.id},1)">+</button>
            </div>
          </div>
          <button onclick="removeFromCart(${p.id})">×</button>
        </div>
      `;
    }).join("");
  }

  const total = cart.reduce((sum, item) => {
    const p = products.find(x => x.id === item.productId);
    return sum + p.price * item.quantity;
  }, 0);

  $("#cartTotal").textContent = `$${total.toFixed(2)}`;
}

function changeQuantity(productId, amount) {
  const item = cart.find(x => x.productId === productId);
  if (!item) return;

  item.quantity += amount;

  if (item.quantity < 1) {
    cart = cart.filter(x => x.productId !== productId);
  }

  saveCart();
}

function removeFromCart(productId) {
  cart = cart.filter(x => x.productId !== productId);
  saveCart();
}

function openCart() {
  $("#cartDrawer").classList.add("open");
  $("#overlay").classList.add("show");
}

function closeCart() {
  $("#cartDrawer").classList.remove("open");
  $("#overlay").classList.remove("show");
}

$("#cartBtn").onclick = openCart;

function showProduct(id) {
  const p = products.find(x => x.id === id);

  $("#modalContent").innerHTML = `
    <img src="${p.image}" alt="${p.name}"
         style="width:100%;height:230px;object-fit:cover;border-radius:10px">
    <h2>${p.name}</h2>
    <p>${p.description}</p>
    <h3>$${p.price.toFixed(2)}</h3>
    <button class="btn primary" onclick="addToCart(${p.id});closeModal()">
      Add to Cart
    </button>
  `;

  $("#modal").classList.add("show");
}

function closeModal() {
  $("#modal").classList.remove("show");
}

function showAuth() {
  $("#modalContent").innerHTML = `
    <h2>Login / Register</h2>
    <form id="authForm">
      <input id="name" placeholder="Name (for registration)">
      <input id="email" type="email" placeholder="Email" required>
      <input id="password" type="password"
             placeholder="Password (minimum 6 characters)" required>
      <button class="btn primary" type="submit">Continue</button>
    </form>
    <p class="muted">A new account is created automatically if the email is not registered.</p>
  `;

  $("#modal").classList.add("show");

  $("#authForm").onsubmit = async event => {
    event.preventDefault();

    try {
      let data;

      try {
        data = await api("/auth/login", {
          method: "POST",
          body: JSON.stringify({
            email: $("#email").value,
            password: $("#password").value
          })
        });
      } catch {
        data = await api("/auth/register", {
          method: "POST",
          body: JSON.stringify({
            name: $("#name").value || "Shopper",
            email: $("#email").value,
            password: $("#password").value
          })
        });
      }

      token = data.token;
      localStorage.setItem("novacart-token", token);

      $("#authBtn").textContent = "Logout";
      closeModal();
      showToast("Login successful");
      loadOrders();
    } catch (error) {
      showToast(error.message);
    }
  };
}

$("#authBtn").onclick = () => {
  if (token) {
    localStorage.removeItem("novacart-token");
    token = null;
    location.reload();
  } else {
    showAuth();
  }
};

async function checkout() {
  if (!token) return showAuth();
  if (!cart.length) return showToast("Cart is empty");

  try {
    const order = await api("/orders", {
      method: "POST",
      body: JSON.stringify({ items: cart })
    });

    cart = [];
    saveCart();
    closeCart();

    showToast(`Order #${order.orderId} placed successfully`);
    await loadOrders();
    await loadProducts();
  } catch (error) {
    showToast(error.message);
  }
}

async function loadOrders() {
  if (!token) return;

  $("#orders").classList.remove("hidden");

  try {
    const orders = await api("/orders");

    if (!orders.length) {
      $("#ordersList").innerHTML = "<p>No orders yet.</p>";
      return;
    }

    $("#ordersList").innerHTML = orders.map(order => `
      <div class="order">
        <b>Order #${order.id}</b>
        · ${order.status}
        · $${order.total.toFixed(2)}
        <ul>
          ${order.items.map(item =>
            `<li>${item.name} × ${item.quantity}</li>`
          ).join("")}
        </ul>
        <small>${order.created_at}</small>
      </div>
    `).join("");
  } catch (error) {
    showToast(error.message);
  }
}

$("#search").addEventListener("input", renderProducts);

async function init() {
  $("#authBtn").textContent = token ? "Logout" : "Login";
  await loadProducts();
  await loadOrders();
}

init();
*/


const API_URL = "http://localhost:3001";

async function loadProducts() {
  try {
    const response = await fetch(`${API_URL}/api/products`);

    if (!response.ok) {
      throw new Error("Failed to fetch products");
    }

    const products = await response.json();

    console.log(products);

    displayProducts(products);
  } catch (error) {
    console.error("Error:", error);
  }
}

function displayProducts(products) {
  const container = document.getElementById("products");

  container.innerHTML = products.map(product => `
    <div class="product-card">
      <img src="${product.image}" alt="${product.name}">

      <h2>${product.name}</h2>

      <p>${product.description}</p>

      <h3>$${product.price}</h3>

      <p>Stock: ${product.stock}</p>

      <button>Add to Cart</button>
    </div>
  `).join("");
}

loadProducts();