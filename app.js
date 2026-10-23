import { createStore } from "./store.js";

const $ = (id) => document.getElementById(id);

const state = {
  pools: [],
  entries: [],
  currentPoolId: null,
  name: localStorage.getItem("sb-name") || "",
};

let store;

// ---------- Name ----------

function askName() {
  const name = prompt("What's your name? (shown on your submissions)", state.name);
  if (name !== null) {
    state.name = name.trim().slice(0, 30);
    localStorage.setItem("sb-name", state.name);
    renderName();
  }
}

function renderName() {
  $("name-btn").textContent = state.name ? `👤 ${state.name}` : "👤 Set name";
}

// ---------- Routing (hash-based so the back button works) ----------

function route() {
  const id = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
  state.currentPoolId = id || null;
  resetCard();
  render();
}

function openPool(id) {
  location.hash = `#/${encodeURIComponent(id)}`;
}

// ---------- Rendering ----------

const poolEntries = (poolId) => state.entries.filter((e) => e.poolId === poolId);

function render() {
  const pool = state.pools.find((p) => p.id === state.currentPoolId);
  if (state.currentPoolId && !pool && state.pools.length) {
    // Pool was deleted (or bad link) – go home.
    location.hash = "";
    return;
  }

  $("home-view").hidden = !!pool;
  $("pool-view").hidden = !pool;
  $("back").hidden = !pool;
  $("title").textContent = pool ? `${pool.emoji || "✨"} ${pool.name}` : "🦋 Social Butterfly";

  if (pool) renderPool(pool);
  else renderHome();
}

function renderHome() {
  const list = $("pool-list");
  list.replaceChildren(
    ...state.pools.map((pool) => {
      const all = poolEntries(pool.id);
      const left = all.filter((e) => !e.drawn).length;
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.innerHTML = `<span class="emoji"></span><span class="name"></span><span class="count"></span>`;
      btn.querySelector(".emoji").textContent = pool.emoji || "✨";
      btn.querySelector(".name").textContent = pool.name;
      btn.querySelector(".count").textContent = all.length ? `${left}/${all.length}` : "empty";
      btn.onclick = () => openPool(pool.id);
      li.append(btn);
      return li;
    })
  );
}

function renderPool(pool) {
  const all = poolEntries(pool.id);
  const left = all.filter((e) => !e.drawn);

  $("draw-btn").disabled = all.length === 0;
  $("pool-stats").textContent = all.length
    ? `${left.length} of ${all.length} left in the pool`
    : "Nothing here yet — add the first one below!";

  $("entry-list").replaceChildren(
    ...[...all].reverse().map((entry) => {
      const li = document.createElement("li");
      li.className = entry.drawn ? "drawn" : "";
      const text = document.createElement("span");
      text.className = "text";
      text.textContent = entry.text;
      const by = document.createElement("span");
      by.className = "by";
      by.textContent = `${entry.by || "anon"}${entry.drawn ? " · drawn" : ""}`;
      text.append(by);
      const del = document.createElement("button");
      del.textContent = "✕";
      del.ariaLabel = "Delete";
      del.onclick = () => {
        if (confirm(`Delete "${entry.text}"?`)) store.deleteEntry(entry.id);
      };
      li.append(text, del);
      return li;
    })
  );
}

function resetCard() {
  const card = $("card");
  card.className = "card empty";
  $("card-text").textContent = "Tap draw to pull something from the pool.";
  $("card-by").textContent = "";
}

function showCard(entry) {
  const card = $("card");
  card.className = "card";
  void card.offsetWidth; // restart animation
  card.classList.add("pop");
  $("card-text").textContent = entry.text;
  $("card-by").textContent = `— ${entry.by || "anon"}`;
}

// ---------- Actions ----------

async function draw() {
  const pool = state.pools.find((p) => p.id === state.currentPoolId);
  if (!pool) return;
  const all = poolEntries(pool.id);
  if (!all.length) return;

  let left = all.filter((e) => !e.drawn);
  if (!left.length) {
    if (!confirm("Everything has been drawn! Put it all back in the pool?")) return;
    await store.resetPool(pool.id);
    left = all;
  }
  const pick = left[Math.floor(Math.random() * left.length)];
  showCard(pick);
  if (navigator.vibrate) navigator.vibrate(15);
  store.setDrawn(pick.id, true);
}

function bindEvents() {
  $("back").onclick = () => (location.hash = "");
  $("name-btn").onclick = askName;
  $("draw-btn").onclick = draw;

  $("new-pool-form").onsubmit = async (e) => {
    e.preventDefault();
    const name = $("new-pool-name").value.trim();
    if (!name) return;
    await store.addPool(name, $("new-pool-emoji").value.trim() || "✨");
    $("new-pool-name").value = "";
    $("new-pool-emoji").value = "";
  };

  $("entry-form").onsubmit = async (e) => {
    e.preventDefault();
    const text = $("entry-text").value.trim();
    if (!text || !state.currentPoolId) return;
    if (!state.name) askName();
    $("entry-text").value = "";
    await store.addEntry(state.currentPoolId, text, state.name);
  };

  // Submit with Enter, newline with Shift+Enter.
  $("entry-text").onkeydown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      $("entry-form").requestSubmit();
    }
  };

  $("reshuffle-btn").onclick = () => {
    if (confirm("Put every submission back in the pool?")) store.resetPool(state.currentPoolId);
  };

  $("delete-pool-btn").onclick = () => {
    const pool = state.pools.find((p) => p.id === state.currentPoolId);
    if (pool && confirm(`Delete the "${pool.name}" pool and everything in it?`)) {
      store.deletePool(pool.id);
      location.hash = "";
    }
  };

  window.addEventListener("hashchange", route);
}

// ---------- Boot ----------

async function main() {
  renderName();
  bindEvents();

  store = await createStore();
  if (!store.shared) {
    const banner = $("banner");
    banner.hidden = false;
    banner.textContent =
      "Local mode: submissions are only saved on this device. Add a Firebase config to share with friends (see README).";
  }

  store.subscribePools((pools) => {
    state.pools = pools;
    render();
  });
  store.subscribeEntries((entries) => {
    state.entries = entries;
    render();
  });
  route();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch((err) => console.warn("SW registration failed", err));
  }
}

main();
