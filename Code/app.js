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

  modalElement: null,
  modalTitleElement: null,
  modalBodyElement: null,
  modalConfirmButton: null,
  currentConfirmCallback: null,
  currentCancelCallback: null,
  actionConfirmed: false,

  currentPath: [],

  init() {
    if (!this.canvas) {
      console.error("Canvas element not found!");
      return;
    }
    this.ctx = this.canvas.getContext("2d");

    document.getElementById("geojsonInput").addEventListener("change", event => {
      const file = event.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = e => {
          try {
            const jsonData = JSON.parse(e.target.result);
            this.loadGeoJSON(jsonData);
          } catch (error) {
            console.error("Error parsing GeoJSON file:", error);
            if (this.distDiv) this.distDiv.textContent = "Erro ao ler o arquivo GeoJSON.";
          }
        };
        reader.readAsText(file);
      }
    });

    this.canvas.addEventListener("click", e => this.handleClick(e));
    this.canvas.addEventListener("wheel", e => this.handleZoom(e), { passive: false });
    this.canvas.addEventListener("mousedown", e => this.startPan(e));
    this.canvas.addEventListener("mousemove", e => this.doPan(e));
    this.canvas.addEventListener("mouseup", () => this.isDragging = false);
    this.canvas.addEventListener("mouseleave", () => this.isDragging = false);

    this.modalElement = document.getElementById("confirmationModal");
    this.modalTitleElement = document.getElementById("confirmationModalLabel");
    this.modalBodyElement = document.getElementById("confirmationModalBody");
    this.modalConfirmButton = document.getElementById("modalConfirmButton");

    if (this.modalConfirmButton) {
      this.modalConfirmButton.addEventListener('click', () => {
        this.actionConfirmed = true;
        if (this.currentConfirmCallback) this.currentConfirmCallback();
        $(this.modalElement).modal('hide');
      });
    }

    if (this.modalElement) {
      $(this.modalElement).on('hide.bs.modal', () => {
        if (!this.actionConfirmed && this.currentCancelCallback) this.currentCancelCallback();
        this.actionConfirmed = false;
        this.currentConfirmCallback = null;
        this.currentCancelCallback = null;
      });
    }

    if (this.distDiv) this.distDiv.textContent = "Carregue um arquivo GeoJSON.";
    const caminhoDiv = document.getElementById("caminho");
    if (caminhoDiv) caminhoDiv.innerHTML = "Caminho:<br>";
    this.drawGraph();
  },

  showCustomModal(title, body, confirmCallback, cancelCallback) {
    if (!this.modalElement) return;
    this.modalTitleElement.textContent = title;
    this.modalBodyElement.textContent = body;
    this.currentConfirmCallback = confirmCallback;
    this.currentCancelCallback = cancelCallback;
    this.actionConfirmed = false;
    $(this.modalElement).modal('show');
  },

  resetSelection() {
    this.selected = [];
    this.currentPath = [];
    this.drawGraph();
    if (this.distDiv) this.distDiv.textContent = "Seleção resetada. Escolha um ponto inicial.";
    const caminhoDiv = document.getElementById("caminho");
    if (caminhoDiv) caminhoDiv.innerHTML = "Caminho:<br>";
  },

  loadGeoJSON(data) {
    this.nodes = [];
    this.edges = [];
    this.currentPath = [];
    const nodeMap = new Map();
    let latList = [], lonList = [];

    if (!data || !data.features) {
      console.error("GeoJSON data is missing 'features' array or data is null.");
      if (this.distDiv) this.distDiv.textContent = "Formato GeoJSON inválido.";
      this.bounds = null;
      this.drawGraph();
      return;
    }

    data.features.forEach(feature => {
      if (feature.geometry && feature.geometry.type === "LineString") {
        const nomeRua = feature.properties?.name || "Rua desconhecida";
        const coords = feature.geometry.coordinates.map(([lon, lat]) => [lat, lon]);

        for (let i = 0; i < coords.length - 1; i++) {
          const p1 = coords[i], p2 = coords[i + 1];
          const key1 = p1.join(","), key2 = p2.join(",");
          if (!nodeMap.has(key1)) nodeMap.set(key1, new Node(p1[0], p1[1]));
          if (!nodeMap.has(key2)) nodeMap.set(key2, new Node(p2[0], p2[1]));
          const node1 = nodeMap.get(key1), node2 = nodeMap.get(key2);
          const dist = this.haversine(p1[0], p1[1], p2[0], p2[1]);
          node1.edges.push({ node: node2, dist, rua: nomeRua });
          node2.edges.push({ node: node1, dist, rua: nomeRua });
          latList.push(p1[0], p2[0]);
          lonList.push(p1[1], p2[1]);
          this.edges.push([p1, p2, nomeRua]);
        }
      }
    });

    this.nodes = Array.from(nodeMap.values());
    if (latList.length === 0 || lonList.length === 0) {
      this.bounds = null;
      if (this.distDiv) this.distDiv.textContent = this.nodes.length > 0 ? "Mapa carregado, mas sem rotas lineares." : "Nenhuma rota encontrada no arquivo.";
    } else {
      this.bounds = {
        minLat: Math.min(...latList), maxLat: Math.max(...latList),
        minLon: Math.min(...lonList), maxLon: Math.max(...lonList)
      };
      if (this.distDiv) this.distDiv.textContent = "Mapa carregado. Selecione o ponto inicial.";
    }

    this.zoom = 1; this.offsetX = 0; this.offsetY = 0;
    this.resetSelection();
  },

  dijkstra(startNode, endNode) {
    const dist = new Map();
    const prev = new Map();
    const cameByRua = new Map();
    const pq = new Set();

    this.nodes.forEach(node => {
      dist.set(node, Infinity);
      prev.set(node, null);
      pq.add(node);
    });
    dist.set(startNode, 0);

    while (pq.size > 0) {
      let u = null;
      let minDist = Infinity;
      for (const node of pq) {
        if (dist.get(node) < minDist) {
          minDist = dist.get(node);
          u = node;
        }
      }

      if (u === null || u === endNode) { // Optimization: stop if end node is selected or no path
        break;
      }

      pq.delete(u);

      u.edges.forEach(({ node: v, dist: weight, rua }) => {
        const newDistV = dist.get(u) + weight;
        if (newDistV < dist.get(v)) {
          dist.set(v, newDistV);
          prev.set(v, u);
          cameByRua.set(v, rua);
        }
      });
    }

    const path = []; const ruas = []; let curr = endNode;
    if (prev.get(curr) || curr === startNode) {
      while (curr) {
        path.unshift(curr);
        if (prev.get(curr)) ruas.unshift(cameByRua.get(curr) || "Rua desconhecida");
        curr = prev.get(curr);
      }
    }
    if (startNode === endNode && path.length === 0) path.push(startNode);

    return { path, total: dist.get(endNode) === Infinity ? 0 : dist.get(endNode), ruas };
  },

  handleClick(e) {
    if (!this.bounds || this.nodes.length === 0) return;
    const rect = this.canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left, clickY = e.clientY - rect.top;
    let closestNode = null, minDistSq = Infinity;

    this.nodes.forEach(node => {
      const [projX, projY] = this.project(node.lat, node.lon);
      const dx = projX - clickX, dy = projY - clickY;
      const distSq = dx * dx + dy * dy;
      if (distSq < minDistSq) { minDistSq = distSq; closestNode = node; }
    });

    const clickToleranceSq = (15 * this.zoom) ** 2;
    if (!closestNode || minDistSq > clickToleranceSq) return;

    if (this.selected.length === 2) this.resetSelection();

    this.selected.push(closestNode);
    const clickedRua = getRua(closestNode);

    if (this.selected.length === 1) {
      if (this.distDiv) this.distDiv.textContent = `Ponto inicial: ${clickedRua || 'N/A'}. Selecione o ponto final.`;
      this.currentPath = [];
      this.drawGraph();
    } else if (this.selected.length === 2) {
      const ruaInicio = getRua(this.selected[0]);
      const ruaFim = getRua(this.selected[1]);

      const modalTitle = "Confirmar Rota";
      const modalBodyText = `Deseja encontrar o menor caminho entre ${ruaInicio || 'Ponto A'} e ${ruaFim || 'Ponto B'}?`;

      const confirmLogic = () => {
        const result = this.dijkstra(this.selected[0], this.selected[1]);
        this.currentPath = result.path;
        this.drawGraph();
        if (this.distDiv) this.distDiv.textContent = `Total: ${result.total > 0 || (result.path.length > 0 && result.total === 0) ? result.total.toFixed(2) : 'N/A'} m. De ${ruaInicio || 'A'} para ${ruaFim || 'B'}.`;
        const caminhoDiv = document.getElementById("caminho");
        if (caminhoDiv) {
          if (result.path && result.path.length > 0) {
            caminhoDiv.innerHTML = "Caminho:<br>" + result.ruas.map(r => `- ${r || 'Trecho desconhecido'}`).join("<br>");
          } else {
            caminhoDiv.innerHTML = "Caminho:<br>Não foi possível encontrar um caminho.";
            if (this.distDiv) this.distDiv.textContent = `Não foi possível encontrar um caminho entre ${ruaInicio || 'A'} e ${ruaFim || 'B'}.`;
          }
        }
      };

      const cancelLogic = () => {
        this.selected.pop();
        this.currentPath = [];
        const firstPointRua = this.selected[0] ? getRua(this.selected[0]) : 'N/A';
        if (this.distDiv) this.distDiv.textContent = `Ponto inicial: ${firstPointRua}. Selecione o ponto final.`;
        this.drawGraph();
      };

      this.showCustomModal(modalTitle, modalBodyText, confirmLogic, cancelLogic);
    }
  },

  haversine(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = x => x * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    lat1 = toRad(lat1); lat2 = toRad(lat2);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  },

  project(lat, lon) {
    if (!this.bounds || this.bounds.maxLon === this.bounds.minLon || this.bounds.maxLat === this.bounds.minLat) {
      return [this.canvas.width / 2 + this.offsetX, this.canvas.height / 2 + this.offsetY];
    }
    const projectedX = ((lon - this.bounds.minLon) / (this.bounds.maxLon - this.bounds.minLon)) * this.canvas.width;
    const projectedY = (1 - (lat - this.bounds.minLat) / (this.bounds.maxLat - this.bounds.minLat)) * this.canvas.height;
    const x = projectedX * this.zoom + this.offsetX;
    const y = projectedY * this.zoom + this.offsetY;
    return [x, y];
  },

  drawGraph(path = this.currentPath || []) {
    if (!this.ctx) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    if (!this.bounds && this.nodes.length === 0) {
      this.ctx.font = "16px Arial"; this.ctx.fillStyle = "gray";
      this.ctx.textAlign = "center";
      this.ctx.fillText("Carregue um arquivo GeoJSON para visualizar o grafo.", this.canvas.width / 2, this.canvas.height / 2);
      return;
    }

    this.ctx.strokeStyle = "#ced4da"; this.ctx.lineWidth = 1 * this.zoom;
    this.edges.forEach(([coordA, coordB, _]) => {
      const [x1, y1] = this.project(coordA[0], coordA[1]);
      const [x2, y2] = this.project(coordB[0], coordB[1]);
      this.ctx.beginPath(); this.ctx.moveTo(x1, y1); this.ctx.lineTo(x2, y2); this.ctx.stroke();
    });

    this.ctx.fillStyle = "#343a40"; const baseNodeRadius = 2 * this.zoom;
    this.nodes.forEach(node => {
      const isPartOfPath = path.includes(node);
      const isSelectedPoint = this.selected.includes(node);
      if (!isPartOfPath && !isSelectedPoint) {
        const [x, y] = this.project(node.lat, node.lon);
        this.ctx.beginPath(); this.ctx.arc(x, y, baseNodeRadius, 0, 2 * Math.PI); this.ctx.fill();
      }
    });

    if (path && path.length > 0) {
      this.ctx.strokeStyle = "#dc3545"; this.ctx.lineWidth = 3 * this.zoom;
      for (let i = 0; i < path.length - 1; i++) {
        const [x1, y1] = this.project(path[i].lat, path[i].lon);
        const [x2, y2] = this.project(path[i + 1].lat, path[i + 1].lon);
        this.ctx.beginPath(); this.ctx.moveTo(x1, y1); this.ctx.lineTo(x2, y2); this.ctx.stroke();
      }
      path.forEach((node, i) => {
        const [x, y] = this.project(node.lat, node.lon);
        let radius = 5 * this.zoom;
        if (i === 0) this.ctx.fillStyle = "#28a745";
        else if (i === path.length - 1) this.ctx.fillStyle = "#007bff";
        else { this.ctx.fillStyle = "#ffc107"; radius = 4 * this.zoom; }
        this.ctx.beginPath(); this.ctx.arc(x, y, radius, 0, 2 * Math.PI); this.ctx.fill();
      });
    } else {
      const selectedNodeRadius = 6 * this.zoom;
      if (this.selected[0]) {
        const [x, y] = this.project(this.selected[0].lat, this.selected[0].lon);
        this.ctx.fillStyle = "#28a745";
        this.ctx.beginPath(); this.ctx.arc(x, y, selectedNodeRadius, 0, 2 * Math.PI); this.ctx.fill();
      }
      if (this.selected[1]) {
        const [x, y] = this.project(this.selected[1].lat, this.selected[1].lon);
        this.ctx.fillStyle = "#007bff";
        this.ctx.beginPath(); this.ctx.arc(x, y, selectedNodeRadius, 0, 2 * Math.PI); this.ctx.fill();
      }
    }
  },

  handleZoom(e) {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left, mouseY = e.clientY - rect.top;
    const worldXBeforeZoom = (mouseX - this.offsetX) / this.zoom;
    const worldYBeforeZoom = (mouseY - this.offsetY) / this.zoom;
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    this.zoom *= factor;
    this.zoom = Math.max(0.1, Math.min(this.zoom, 20));
    this.offsetX = mouseX - worldXBeforeZoom * this.zoom;
    this.offsetY = mouseY - worldYBeforeZoom * this.zoom;
    this.drawGraph();
  },

  startPan(e) {
    if (e.button !== 0) return;
    this.isDragging = true;
    this.dragStart = { x: e.clientX, y: e.clientY };
  },

  doPan(e) {
    if (!this.isDragging) return;
    const dx = e.clientX - this.dragStart.x, dy = e.clientY - this.dragStart.y;
    this.offsetX += dx; this.offsetY += dy;
    this.dragStart = { x: e.clientX, y: e.clientY };
    this.drawGraph();
  },

  distance(p1, p2) { return Math.hypot(p1[0] - p2[0], p1[1] - p2[1]); }
};

const getRua = (node) => {
  if (node && node.edges && node.edges.length > 0) {
    for (const edge of node.edges) if (edge.rua && edge.rua !== "Rua desconhecida") return edge.rua;
    return node.edges[0].rua || "Rua desconhecida";
  }
  return "Localização desconhecida";
};

GrafoApp.adjustZoom = function (factor) {
  const centerX = this.canvas.width / 2, centerY = this.canvas.height / 2;
  const worldXBeforeZoom = (centerX - this.offsetX) / this.zoom;
  const worldYBeforeZoom = (centerY - this.offsetY) / this.zoom;
  this.zoom *= factor;
  this.zoom = Math.max(0.1, Math.min(this.zoom, 20));
  this.offsetX = centerX - worldXBeforeZoom * this.zoom;
  this.offsetY = centerY - worldYBeforeZoom * this.zoom;
  this.drawGraph();
}

document.addEventListener('DOMContentLoaded', () => { GrafoApp.init(); });