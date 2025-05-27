class Node {
  constructor(lat, lon) {
    this.lat = lat;
    this.lon = lon;
    this.edges = [];
  }
}

const GrafoApp = {
  canvas: document.getElementById("canvas"),
  ctx: null,
  logDiv: document.getElementById("log"),
  matrizDiv: document.getElementById("matriz"),
  distDiv: document.getElementById("distancia"),
  nodes: [],
  edges: [],
  selected: [],
  bounds: null,
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  isDragging: false,
  dragStart: null,
  execCount: 0,

  init() {
    this.ctx = this.canvas.getContext("2d");

    document.getElementById("geojsonInput").addEventListener("change", event => this.handleFileInput(event));
    this.canvas.addEventListener("click", e => this.handleClick(e));
    this.canvas.addEventListener("wheel", e => this.handleZoom(e));
    this.canvas.addEventListener("mousedown", e => this.startPan(e));
    this.canvas.addEventListener("mousemove", e => this.doPan(e));
    this.canvas.addEventListener("mouseup", () => (this.isDragging = false));
  },

  handleFileInput(event) {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = e => {
        try {
          this.loadGeoJSON(JSON.parse(e.target.result));
        } catch (err) {
          alert("Erro ao carregar o arquivo GeoJSON. Verifique o formato.");
        }
      };
      reader.readAsText(file);
    }
  },

  resetSelection() {
    this.selected = [];
    this.execCount = 0;
    this.updateUI();
    this.drawGraph();
  },

  loadGeoJSON(data) {
    this.nodes = [];
    this.edges = [];
    const nodeMap = new Map();
    const latList = [];
    const lonList = [];

    data.features.forEach(f => {
      if (f.geometry.type !== "LineString") return;
      const nomeRua = f.properties?.name || "Rua desconhecida";
      const coords = f.geometry.coordinates.map(([lon, lat]) => [lat, lon]);

      for (let i = 0; i < coords.length - 1; i++) {
        const key1 = coords[i].join(",");
        const key2 = coords[i + 1].join(",");
        if (!nodeMap.has(key1)) nodeMap.set(key1, new Node(...coords[i]));
        if (!nodeMap.has(key2)) nodeMap.set(key2, new Node(...coords[i + 1]));

        const dist = this.haversine(...coords[i], ...coords[i + 1]);
        nodeMap.get(key1).edges.push({ node: nodeMap.get(key2), dist, rua: nomeRua });
        nodeMap.get(key2).edges.push({ node: nodeMap.get(key1), dist, rua: nomeRua });

        latList.push(coords[i][0], coords[i + 1][0]);
        lonList.push(coords[i][1], coords[i + 1][1]);
        this.edges.push([coords[i], coords[i + 1], nomeRua]);
      }
    });

    this.nodes = Array.from(nodeMap.values());
    this.bounds = {
      minLat: Math.min(...latList),
      maxLat: Math.max(...latList),
      minLon: Math.min(...lonList),
      maxLon: Math.max(...lonList)
    };
    this.zoom = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.drawGraph();
  },

  haversine(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = x => (x * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  },

  project(lat, lon) {
    const x = ((lon - this.bounds.minLon) / (this.bounds.maxLon - this.bounds.minLon)) * this.canvas.width * this.zoom + this.offsetX;
    const y = ((1 - (lat - this.bounds.minLat) / (this.bounds.maxLat - this.bounds.minLat)) * this.canvas.height * this.zoom) + this.offsetY;
    return [x, y];
  },

  drawGraph(path = []) {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw edges
    this.edges.forEach(([a, b]) => {
      const [x1, y1] = this.project(...a);
      const [x2, y2] = this.project(...b);
      this.ctx.strokeStyle = "#ccc";
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.moveTo(x1, y1);
      this.ctx.lineTo(x2, y2);
      this.ctx.stroke();
    });

    // Draw nodes
    this.nodes.forEach(n => {
      const [x, y] = this.project(n.lat, n.lon);
      this.ctx.fillStyle = "black";
      this.ctx.beginPath();
      this.ctx.arc(x, y, 2, 0, 2 * Math.PI);
      this.ctx.fill();
    });

    // Highlight path
    path.forEach((n, i) => {
      if (i < path.length - 1) {
        const [x1, y1] = this.project(n.lat, n.lon);
        const [x2, y2] = this.project(path[i + 1].lat, path[i + 1].lon);
        this.ctx.strokeStyle = "red";
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x2, y2);
        this.ctx.stroke();
      }
      const [x, y] = this.project(n.lat, n.lon);
      this.ctx.fillStyle = i === 0 ? "green" : i === path.length - 1 ? "blue" : "orange";
      this.ctx.beginPath();
      this.ctx.arc(x, y, 5, 0, 2 * Math.PI);
      this.ctx.fill();
    });
  },

  handleClick(e) {
    if (!this.bounds) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const clicked = this.nodes.reduce((a, b) => {
      const da = this.distance(this.project(a.lat, a.lon), [x, y]);
      const db = this.distance(this.project(b.lat, b.lon), [x, y]);
      return da < db ? a : b;
    });

    this.selected.push(clicked);
    this.updateUI();

    if (this.selected.length === 2) {
      const result = this.dijkstra(this.selected[0], this.selected[1]);
      this.drawGraph(result.path);
      this.updatePathInfo(result);
    } else {
      this.drawGraph();
    }
  },

  updateUI() {
    if (this.selected.length === 1) {
      this.distDiv.textContent = `Ponto inicial: ${this.getRua(this.selected[0])}`;
    } else if (this.selected.length === 2) {
      const rua1 = this.getRua(this.selected[0]);
      const rua2 = this.getRua(this.selected[1]);
      if (!confirm(`Deseja encontrar o menor caminho entre ${rua1} e ${rua2}?`)) {
        this.resetSelection();
      }
    }
  },

  updatePathInfo(result) {
    const { path, total, ruas } = result;
    this.logDiv.textContent = `Execuções: ${this.execCount}`;
    this.distDiv.textContent = `Distância total: ${total.toFixed(2)} metros`;
    document.getElementById("caminho").innerHTML = "Caminho:<br>" + ruas.map(r => "- " + r).join("<br>");
  },

  dijkstra(start, end) {
    const dist = new Map(this.nodes.map(n => [n, Infinity]));
    const prev = new Map();
    const cameByRua = new Map();
    this.execCount++;
    dist.set(start, 0);
    const queue = [...this.nodes];

    while (queue.length > 0) {
      queue.sort((a, b) => dist.get(a) - dist.get(b));
      const u = queue.shift();
      if (u === end) break;
      u.edges.forEach(({ node: v, dist: w, rua }) => {
        const alt = dist.get(u) + w;
        if (alt < dist.get(v)) {
          dist.set(v, alt);
          prev.set(v, u);
          cameByRua.set(v, rua);
        }
      });
    }

    const path = [];
    const ruas = [];
    let u = end;
    while (prev.has(u)) {
      path.unshift(u);
      ruas.unshift(cameByRua.get(u));
      u = prev.get(u);
    }
    if (path.length > 0) path.unshift(start);
    return { path, total: dist.get(end), ruas };
  },

  handleZoom(e) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    this.zoom *= factor;
    this.drawGraph(this.selected.length === 2 ? this.dijkstra(this.selected[0], this.selected[1]).path : []);
  },

  startPan(e) {
    this.isDragging = true;
    this.dragStart = { x: e.clientX, y: e.clientY };
  },

  doPan(e) {
    if (!this.isDragging) return;
    const dx = e.clientX - this.dragStart.x;
    const dy = e.clientY - this.dragStart.y;
    this.offsetX += dx;
    this.offsetY += dy;
    this.dragStart = { x: e.clientX, y: e.clientY };
    this.drawGraph(this.selected.length === 2 ? this.dijkstra(this.selected[0], this.selected[1]).path : []);
  },

  distance(a, b) {
    return Math.hypot(a[0] - b[0], a[1] - b[1]);
  },

  getRua(n) {
    for (const { rua } of n.edges) {
      if (rua && rua !== "Rua desconhecida") return rua;
    }
    return "Rua desconhecida";
  }
};

window.onload = () => GrafoApp.init();