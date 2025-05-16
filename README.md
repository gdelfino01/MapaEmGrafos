
# 🗺️ Visualizador de Grafo de Ruas com GeoJSON

Este projeto é uma aplicação em **JavaScript com HTML5 Canvas** para **visualizar um grafo construído a partir de dados geográficos em formato GeoJSON**, permitindo **calcular o menor caminho entre dois pontos** usando o algoritmo de **Dijkstra**. Ele é especialmente útil para representar **esquinas como nós (vértices)** e **ruas como conexões (arestas)**.

---

## 🚀 Funcionalidades

- Carregamento de arquivo `.geojson` com ruas (vias).
- Construção do grafo com base nas interseções entre ruas.
- Visualização do grafo em um `<canvas>` com suporte a **zoom e pan**.
- Permite selecionar dois pontos clicando no mapa para calcular o **menor caminho**.
- Mostra logs, matriz de adjacência e distância total no caminho encontrado.

---

## 📁 Exemplo de Arquivo GeoJSON

Você pode extrair um `.geojson` usando o site [https://overpass-turbo.eu](https://overpass-turbo.eu) com a seguinte consulta Overpass:

```overpassql
[out:json][timeout:25];
(
  way["highway"](area:3600051475); // Altere o ID da área para sua região desejada
);
(._; >;);
out body;
```

Depois clique em **Export > GeoJSON** e salve o arquivo.

---

## 🖼️ Estrutura da Interface

| Elemento | Descrição |
|---------|-----------|
| `<canvas id="canvas">` | Área de renderização do grafo (usando `CanvasRenderingContext2D`) |
| `<input type="file" id="geojsonInput">` | Input de arquivo para carregar o GeoJSON |
| `<div id="log">` | Área de log textual do algoritmo (execução do Dijkstra) |
| `<div id="matriz">` | Exibe a matriz de adjacência do grafo |
| `<div id="distancia">` | Mostra a distância total do caminho mais curto encontrado |

---

## 🧠 Como o código funciona

### 📍 Classe `Node`

```js
class Node {
  constructor(lat, lon) {
    this.lat = lat;
    this.lon = lon;
    this.edges = [];
  }
}
```

- Representa um **nó do grafo**.
- Cada `Node` armazena sua **latitude**, **longitude** e uma lista de **arestas** conectadas.

---

### ⚙️ Objeto `GrafoApp`

Estrutura central do app. Ele contém métodos e dados para carregar, visualizar e interagir com o grafo.

#### 🔹 `init()`
Inicializa o canvas, configura o `context` e adiciona o listener para carregar arquivos `.geojson`.

#### 🔹 `loadGeoJSON(data)`
Recebe o JSON carregado e:
1. Percorre cada **linha (way)** no GeoJSON.
2. Para cada par de coordenadas, cria ou reutiliza nós (interseções).
3. Conecta nós consecutivos como **arestas bidirecionais**.

#### 🔹 `draw()`
Redesenha o canvas mostrando:
- Nós (esquinas).
- Arestas (ruas).
- Caminho encontrado em destaque (caso tenha sido calculado).

#### 🔹 `findShortestPath()`
Executa o algoritmo de Dijkstra:
- Compara todos os caminhos possíveis a partir do nó de origem.
- Calcula a menor distância até o destino.
- Exibe o caminho e distância total no painel lateral.

#### 🔹 `latLonToCanvas(lat, lon)`
Converte coordenadas geográficas em pixels do canvas, levando em conta zoom e offset.

---

## 📦 Estrutura de Arquivos

```
/
├── index.html         # HTML com canvas, botões e áreas de texto
├── app.js             # Lógica de grafo e visualização
├── style.css          # Estilo da página (opcional)
└── exemplo.geojson    # Exemplo de dados (opcional)
```

---

## 🖱️ Como usar

1. Abra `index.html` em um navegador moderno.
2. Clique em **"Selecionar arquivo"** e carregue seu `.geojson`.
3. O grafo será renderizado automaticamente.
4. Clique em dois pontos diferentes no canvas para calcular e visualizar o **menor caminho** entre eles.

---

## 📌 Requisitos

- Navegador compatível com ES6+ e HTML5 Canvas (ex: Chrome, Firefox).
- Um arquivo `.geojson` com **features do tipo `LineString`** representando vias.

---

## 💡 Exemplo Visual (Ilustração)

```plaintext
Esquina A ---- Rua ---- Esquina B
     |                        |
    Rua                    Rua
     |                        |
Esquina C ---- Rua ---- Esquina D
```

No grafo:
- Esquinas = nós (A, B, C, D)
- Ruas = arestas com peso (distância geográfica)

---

## 🧩 Possíveis Extensões

- Suporte a tipos diferentes de vias.
- Pesos com base em velocidade permitida ou trânsito.
- Exportação do caminho encontrado como novo GeoJSON.
