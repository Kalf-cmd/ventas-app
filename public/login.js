async function login(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "No se pudo iniciar sesion.");
  }

  return response.json();
}

function toast(message) {
  const element = document.querySelector("#toast");
  element.textContent = message;
  element.classList.add("show");
  setTimeout(() => element.classList.remove("show"), 2400);
}

document.querySelector("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);

  try {
    await login("/api/login", Object.fromEntries(form));
    window.location.href = "/";
  } catch (error) {
    toast(error.message);
  }
});
