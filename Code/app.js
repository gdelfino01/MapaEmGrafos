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
  distDiv: document.getElementById("distancia"),
  dijkstraIterationsLogElement: null, // For Dijkstra iteration logs
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

  modalElement: null,
  modalTitleElement: null,
  modalBodyElement: null,
  modalConfirmButton: null,
  currentConfirmCallback: null,
  currentCancelCallback: null,
  actionConfirmed: false,

  currentPath: [],
  dijkstraIterationStates: [], // Stores snapshots from Dijkstra's algorithm

  init() {
    if (!this.canvas) {
      return;
    }
    this.ctx = this.canvas.getContext("2d");
    this.dijkstraIterationsLogElement = document.getElementById("dijkstra-iterations-log");

    document.getElementById("geojsonInput").addEventListener("change", event => {
      const file = event.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = e => {
          try {
            const jsonData = JSON.parse(e.target.result);
            this.loadGeoJSON(jsonData);
          } catch (error) {
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
    if (this.dijkstraIterationsLogElement) this.dijkstraIterationsLogElement.textContent = "Aguardando execução do Dijkstra...";
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
    this.dijkstraIterationStates = []; // Clear stored Dijkstra states
    if (this.dijkstraIterationsLogElement) this.dijkstraIterationsLogElement.innerHTML = "Aguardando execução do Dijkstra...";
    this.drawGraph();
    if (this.logDiv) this.logDiv.textContent = "";
    if (this.distDiv) this.distDiv.textContent = "Seleção resetada. Escolha um ponto inicial.";
    const caminhoDiv = document.getElementById("caminho");
    if (caminhoDiv) caminhoDiv.innerHTML = "Caminho:<br>";
  },

  loadGeoJSON(data) {
    // ... (loadGeoJSON function remains largely the same as previous version)
    this.nodes = [];
    this.edges = [];
    this.currentPath = [];
    const nodeMap = new Map();
    let latList = [], lonList = [];

    if (!data || !data.features) {
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

  getNodeId(node) {
    if (!node) return "N/A";
    const index = this.nodes.indexOf(node);
    // Fallback if node not in this.nodes (e.g. if node object is different instance)
    // For robustness, could use lat,lon as a key if index is -1
    return index !== -1 ? `N${index}` : `${node.lat.toFixed(3)},${node.lon.toFixed(3)}`;
  },

  dijkstra(startNode, endNode) {
    this.execCount++;
    const dist = new Map();
    const prev = new Map();
    const cameByRua = new Map();
    const pq = new Set();
    const iterationsLog = [];
    let iterCount = 0;

    this.nodes.forEach(node => {
      dist.set(node, Infinity);
      prev.set(node, null);
      pq.add(node);
    });
    dist.set(startNode, 0);

    iterationsLog.push({
      iter: iterCount++,
      action: "Estado Inicial.",
      details: `Distância de ${this.getNodeId(startNode)} definida para 0. Todas as outras para ∞.`,
      currentNodeId: null,
      distances: new Map(dist), // Store a copy
      pqState: Array.from(pq).map(n => ({ id: this.getNodeId(n), d: dist.get(n) })).sort((a, b) => a.d - b.d)
    });

    while (pq.size > 0) {
      let u = null;
      let minDist = Infinity;
      for (const node of pq) {
        if (dist.get(node) < minDist) {
          minDist = dist.get(node);
          u = node;
        }
      }

      if (u === null) {
        iterationsLog.push({ iter: iterCount, action: "Fila de prioridade vazia ou nós restantes inacessíveis.", details: "Algoritmo encerrado.", currentNodeId: null, distances: new Map(dist), pqState: [] });
        break;
      }

      pq.delete(u);
      const uId = this.getNodeId(u);

      let logEntry = {
        iter: iterCount,
        action: `Nó ${uId} selecionado da fila (dist=${minDist === Infinity ? '∞' : minDist.toFixed(0)}).`,
        details: `Processando vizinhos de ${uId}:`,
        currentNodeId: uId,
        relaxedEdges: [],
      };

      if (u === endNode) {
        logEntry.details += " Nó final alcançado. Encerrando.";
        logEntry.distances = new Map(dist);
        logEntry.predecessors = new Map(prev);
        logEntry.pqState = Array.from(pq).map(n => ({ id: this.getNodeId(n), d: dist.get(n) })).sort((a, b) => a.d - b.d);
        iterationsLog.push(logEntry);
        break;
      }

      let neighborDetails = [];
      u.edges.forEach(({ node: v, dist: weight, rua }) => {
        const vId = this.getNodeId(v);
        const currentDistV = dist.get(v);
        const newDistV = dist.get(u) + weight;
        let detail = `  Aresta ${uId} → ${vId} (peso: ${weight.toFixed(0)}): `;

        if (newDistV < currentDistV) {
          dist.set(v, newDistV);
          prev.set(v, u);
          cameByRua.set(v, rua);
          logEntry.relaxedEdges.push({ from: uId, to: vId, oldDist: currentDistV, newDist: newDistV, street: rua, weight: weight });
          detail += `Dist(${vId}) atualizada de ${currentDistV === Infinity ? '∞' : currentDistV.toFixed(0)} para ${newDistV.toFixed(0)}. Predecessor de ${vId} é ${uId}.`;
        } else {
          detail += `Nenhuma atualização (nova dist ${newDistV.toFixed(0)} >= atual ${currentDistV === Infinity ? '∞' : currentDistV.toFixed(0)}).`;
        }
        neighborDetails.push(detail);
      });
      if (neighborDetails.length > 0) logEntry.details += "\n" + neighborDetails.join("\n");
      else logEntry.details += " Nenhum vizinho a processar.";


      logEntry.distances = new Map(dist);
      logEntry.predecessors = new Map(prev);
      logEntry.pqState = Array.from(pq).map(n => ({ id: this.getNodeId(n), d: dist.get(n) })).sort((a, b) => a.d - b.d);
      iterationsLog.push(logEntry);
      iterCount++;
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

    this.dijkstraIterationStates = iterationsLog;
    return { path, total: dist.get(endNode) === Infinity ? 0 : dist.get(endNode), ruas };
  },

  displayDijkstraIterations() {
    if (!this.dijkstraIterationStates || !this.dijkstraIterationsLogElement) return;
    this.dijkstraIterationsLogElement.innerHTML = "";
    if (this.dijkstraIterationStates.length === 0) {
      this.dijkstraIterationsLogElement.textContent = "Nenhuma iteração para mostrar.";
      return;
    }

    const ul = document.createElement('ul'); ul.className = 'list-unstyled';
    this.dijkstraIterationStates.forEach(state => {
      const li = document.createElement('li');
      li.style.marginBottom = '15px';
      li.style.borderBottom = '1px solid #dee2e6'; // Bootstrap subtle border
      li.style.paddingBottom = '10px';

      let content = `<strong>Iteração ${state.iter}</strong>: ${state.action}<br/>`;
      if (state.details) {
        content += `<span style="white-space: pre-line; display: block; margin-left: 15px;">${state.details}</span>`;
      }

      if (state.relaxedEdges && state.relaxedEdges.length > 0) {
        // Details now cover this, but could be summarized again if needed
      }

      // Distances (show key ones or all non-infinite)
      let distsToLog = "<u>Distâncias Atuais</u> (Nó:Valor): ";
      let relevantDists = new Set();
      if (this.selected[0]) relevantDists.add(this.getNodeId(this.selected[0])); // Start
      if (this.selected[1]) relevantDists.add(this.getNodeId(this.selected[1])); // End
      if (state.currentNodeId) relevantDists.add(state.currentNodeId);
      state.relaxedEdges?.forEach(edge => relevantDists.add(edge.to));

      let distEntries = [];
      relevantDists.forEach(nodeId => {
        // Find the node object to get its distance from the state.distances Map
        const nodeObj = this.nodes.find(n => this.getNodeId(n) === nodeId);
        if (nodeObj && state.distances.has(nodeObj)) {
          const dVal = state.distances.get(nodeObj);
          distEntries.push(`${nodeId}:${dVal === Infinity ? '∞' : dVal.toFixed(0)}`);
        }
      });
      // Add a few other non-Infinity distances if space
      let otherCount = 0;
      state.distances.forEach((d, n_obj) => {
        const n_id = this.getNodeId(n_obj);
        if (d !== Infinity && !relevantDists.has(n_id) && otherCount < 3) {
          distEntries.push(`${n_id}:${d.toFixed(0)}`);
          otherCount++;
        }
      });
      if (distEntries.length === 0) distsToLog += "Nenhuma significativa / Todas ∞";
      else distsToLog += distEntries.join(', ');
      content += `<span style="display: block; margin-left: 15px;">${distsToLog}</span>`;

      // Priority Queue
      content += `<span style="display: block; margin-left: 15px;"><u>Fila de Prioridade</u> (id:dist): ${state.pqState.length > 0 ? state.pqState.slice(0, 8).map(n => `${n.id}:${n.d === Infinity ? '∞' : n.d.toFixed(0)}`).join(', ') + (state.pqState.length > 8 ? '...' : '') : 'vazia'}</span>`;

      // Predecessors (if available in state, mainly for final or key states)
      if (state.predecessors) {
        let predsToLog = `<span style="display: block; margin-left: 15px;"><u>Predecessores</u> (Nó←Pai): `;
        let predEntries = [];
        state.predecessors.forEach((p_obj, c_obj) => {
          if (p_obj && relevantDists.has(this.getNodeId(c_obj))) { // Show for relevant nodes
            predEntries.push(`${this.getNodeId(c_obj)}←${this.getNodeId(p_obj)}`);
          }
        });
        if (predEntries.length === 0 && state.iter > 0) predsToLog += "Nenhum relevante definido.";
        else if (predEntries.length === 0 && state.iter === 0) predsToLog += "Ainda não definidos.";
        else predsToLog += predEntries.join(', ');
        content += `${predsToLog}</span>`;
      }
      li.innerHTML = content;
      ul.appendChild(li);
    });
    this.dijkstraIterationsLogElement.appendChild(ul);
  },

  // ... (handleClick, haversine, project, drawGraph, handleZoom, startPan, doPan, distance remain same as previous version)
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
      if (this.dijkstraIterationsLogElement) this.dijkstraIterationsLogElement.innerHTML = "Aguardando execução do Dijkstra...";
      this.dijkstraIterationStates = [];
      this.drawGraph();
    } else if (this.selected.length === 2) {
      const ruaInicio = getRua(this.selected[0]);
      const ruaFim = getRua(this.selected[1]);

      const modalTitle = "Confirmar Rota";
      const modalBodyText = `Deseja encontrar o menor caminho entre ${ruaInicio || 'Ponto A'} e ${ruaFim || 'Ponto B'}?`;

      const confirmLogic = () => {
        if (this.dijkstraIterationsLogElement) this.dijkstraIterationsLogElement.innerHTML = "Calculando iterações do Dijkstra...";
        this.dijkstraIterationStates = [];

        const result = this.dijkstra(this.selected[0], this.selected[1]);
        this.currentPath = result.path;
        this.drawGraph();
        if (this.logDiv) this.logDiv.textContent = `Dijkstra execuções nesta sessão: ${this.execCount}`;
        if (this.distDiv) this.distDiv.textContent = `Total: ${result.total > 0 || result.path.length > 0 && result.total === 0 ? result.total.toFixed(2) : 'N/A'} m. De ${ruaInicio || 'A'} para ${ruaFim || 'B'}.`;
        const caminhoDiv = document.getElementById("caminho");
        if (caminhoDiv) {
          if (result.path && result.path.length > 0) {
            caminhoDiv.innerHTML = "Caminho:<br>" + result.ruas.map(r => `- ${r || 'Trecho desconhecido'}`).join("<br>");
          } else {
            caminhoDiv.innerHTML = "Caminho:<br>Não foi possível encontrar um caminho.";
            if (this.distDiv) this.distDiv.textContent = `Não foi possível encontrar um caminho entre ${ruaInicio || 'A'} e ${ruaFim || 'B'}.`;
          }
        }
        this.displayDijkstraIterations(); // Display the new iterations
      };

      const cancelLogic = () => {
        this.selected.pop();
        this.currentPath = [];
        if (this.dijkstraIterationsLogElement) this.dijkstraIterationsLogElement.innerHTML = "Aguardando execução do Dijkstra...";
        this.dijkstraIterationStates = [];
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