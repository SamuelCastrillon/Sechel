# 📋 Tablero de Ideas — Sechel

> Un tablero vivo de ideas para Sechel, sin ataduras de versión.
> Cada idea tiene rating y estado. Decidimos **cuándo** implementarla después.
>
> Cómo contribuir: agregá una entrada con el formato de las existentes.
> Estado posible: `💡 idea` · `🔍 investigando` · `📐 diseñando` · `🛠️ en progreso` · `✅ completada` · `❌ descartada`

---

## 🧠 Idea Madre: Grafo de código integrado en la memoria

**Rating: 10/10 · Estado: 💡 idea**

Que Sechel no solo guarde memorias semánticas (decisiones, bugs, patrones), sino que también construya un grafo de dependencias del código a medida que se trabaja con un agente. No es un indexador estilo CodeGraph (parsea TODO upfront), sino incremental: el grafo se construye mientras explorás.

Sechel YA tiene `memory_relations` (source_id, target_id, relation) — es un grafo infrautilizado.

**Fases naturalmente separables:**

| Fase | Qué | Esfuerzo |
|---|---|---|
| F1 | Convención de topic_key para código (cero código nuevo) | Nulo |
| F2 | Tools MCP de navegación de grafo | ~200 líneas |
| F3 | Extracción automática de símbolos durante edición | Alto |

**Origen:** Inspirado en CodeGraph (colbymchenry, 59k⭐)
**Referencia:** `architecture/sechel-codegraph-integration` (Engram)

---

## 🔍 Indexación y Grafos de Código

### 1. Navegación de grafo (mem_get_relations)

**Rating: 10/10 · Estado: 💡 idea**

Tools MCP para navegar el grafo que ya existe en `memory_relations`:

- `mem_get_relations(id, depth)` — BFS sobre memory_relations
- `mem_get_callers(topic_key)` — qué depende de este símbolo
- `mem_get_callees(topic_key)` — de qué depende este símbolo

**Por qué es 10:** Es poquito código sobre infraestructura existente y desbloquea TODO el resto de las ideas de grafo. Sin navegación, `memory_relations` es data muerta.

---

### 2. Iris Gate Ladder (contexto progresivo)

**Rating: 9/10 · Estado: 💡 idea**

Cuatro niveles de contexto progresivo que el agente puede pedir:

| Nivel | Qué ve el agente | Tokens |
|---|---|---|
| 1 — Symbol Card | Firma, resumen, dependencias, métricas | ~100 |
| 2 — Skeleton IR | Signatures + control flow, bodies elididos | ~300 |
| 3 — Hot-Path Excerpt | Líneas específicas + contexto | ~600 |
| 4 — Raw Code Window | Archivo completo (policy-gated) | ~2,000 |

**Por qué es relevante:** El 80% de las consultas se responden en niveles 1-2 sin leer código crudo. Sechel podría implementar esto como formato de salida para `mem_get_observation`.

**Origen:** [SDL-MCP](https://glitterkill-sdl-mcp.mintlify.app/)

---

### 3. Symbol Cards como formato first-class

**Rating: 9/10 · Estado: 💡 idea**

Formato compacto (~100 tokens) para describir un símbolo de código:

```
validateToken(src/auth/tokens.ts:42)
  → Firma: (token: string) → { userId: string, role: Role }
  → Dependencias: jwt.verify(), getUserById()
  → Dependientes: authMiddleware(), loginHandler()
  → Métricas: 15 líneas, 0 branches, 2 tests
```

Si Sechel guarda observaciones de tipo `codegraph-symbol` con este formato, `mem_search` devuelve información útil sin tocar el archivo fuente.

**Origen:** SDL-MCP, CodeGraph

---

### 4. Precomputed Reach Index (blast radius O(1))

**Rating: 8/10 · Estado: 💡 idea**

Indexar depth-3 de reachability en el momento de guardar, no al consultar. Si A llama a B y B llama a C, precomputar que A reach C. "¿Qué se rompe si cambio X?" es instantáneo en vez de BFS cada vez.

**Por qué es relevante:** Sechel podría precomputar reach index sobre `memory_relations`. Consultas de blast radius en O(1).

**Origen:** [Gortex](https://gortex.dev/)

---

### 5. Delta / Blast Radius Analysis

**Rating: 8/10 · Estado: 💡 idea**

Tools para análisis de impacto:

- `mem_impact(symbol, depth)` — "si cambio X, qué más se rompe?"
- `mem_diff(changed_files)` — "estos archivos cambiaron, qué está impactado?"

**Por qué es alto:** Es el killer feature de los grafos de código. Y Sechel tendría una ventaja: el blast radius no es solo estructural, sino también semántico (decisiones, bugs relacionados).

---

### 6. Auto-extraction de símbolos durante edición

**Rating: 7/10 · Estado: 💡 idea**

Cuando el agente lee/edita un archivo, Sechel opcionalmente parsea (regex o tree-sitter mínimo para TS/JS) y crea observaciones tipo `codegraph` con los símbolos detectados. El grafo se construye solo mientras trabajás.

**Riesgo:** Consume tokens de parsing. Debería ser opt-in por proyecto.

**Origen:** CodeGraph

---

### 7. Búsqueda en lenguaje natural sobre el grafo

**Rating: 7/10 · Estado: 💡 idea**

"¿Cómo llega un request a la base de datos?" → Sechel busca en el grafo + observaciones semánticas y devuelve el camino. Ya tiene FTS5 y `memory_relations`, solo falta orquestar la consulta.

**Origen:** CodeGraph NL code search

---

### 8. Cross-language bridging

**Rating: 5/10 · Estado: 💡 idea**

Conexiones entre lenguajes: Swift ↔ ObjC, JS ↔ Native Modules (React Native). Para Sechel, si el proyecto es multi-lenguaje, seguir la cadena de llamadas a través de la frontera.

**Por qué no es prioridad:** Sechel apunta a un público general, no específicamente a RN/iOS.

**Origen:** CodeGraph (colbymchenry)

---

## 🧠 Memorias y Contexto

### 9. Los 4 Pilares del Context Engineering

**Rating: 9/10 · Estado: 📐 diseñando**

Framework conceptual que unifica toda la estrategia de contexto de Sechel:

- **Offload** ✅ — Sechel ya lo hace (guardar memoria afuera del context window)
- **Summarize** ❌ — Que Sechel pueda resumir sesiones largas automáticamente
- **Isolate** ❌ — Tools para que el agente ejecute sub-tareas en contextos limpios
- **Cache** ❌ — KV cache estable para requests repetidos

**Por qué es relevante:** Le da un marco conceptual a las próximas features. No es código, es estrategia.

**Origen:** LangChain, Anthropic, Manus. Convergencia independiente en 2025-2026.

---

### 10. Grafos Temporales (Zep)

**Rating: 7/10 · Estado: 💡 idea**

No solo "qué depende de qué", sino cómo evolucionaron las relaciones en el tiempo:

- "¿Cuándo cambió esta dependencia?"
- "Este módulo se refactorizó 3 veces"
- "Las decisiones de arquitectura de la semana 3"

**Por qué es relevante:** Sechel ya tiene `revision_count` y `last_seen_at` en observations. Está a medio camino de ser temporal. Completarlo sería diferenciador.

**Origen:** [Zep](https://www.getzep.com/) — 18.5% accuracy improvement vs baseline RAG

---

### 11. Compresión de Contexto automática

**Rating: 7/10 · Estado: 💡 idea**

Cuando una sesión de agente se alarga, Sechel podría:

- Resumir automáticamente la sesión al cerrarla
- Generar un "punto de control" comprimido
- El agente siguiente arranca desde el resumen, no desde crudo

**Referencia:** Anthropic compaction API (`compact-2026-01-12`), Factory's anchored iterative summarization

---

### 12. Markdown persistente + versionable

**Rating: 6/10 · Estado: 💡 idea**

Además de SQLite, tener los Symbol Cards como markdown commiteable en el repo. Permite:

- Git diff del conocimiento
- PRs que incluyen actualizaciones de contexto
- Compartir el conocimiento sin acceso a Sechel

**Origen:** Context Vault

---

### 13. Daemon multi-sesión compartido

**Rating: 6/10 · Estado: 💡 idea**

Cuando Sechel corre en modo local (CLI), tener un daemon que compile el grafo una vez y lo comparta entre múltiples sesiones de agente (Claude Code + Cursor + OpenCode simultáneos).

**Origen:** CodeGraph, Gortex

---

## 🖥️ Panel Admin

### 14. Vista de grafo en el panel

**Rating: 8/10 · Estado: 💡 idea**

Visualización interactiva con D3.js/vis-network:

- Nodos: símbolos (funciones/clases) + observaciones semánticas (decisiones/bugs)
- Aristas: calls/imports/relacionado/contradice
- Colores por tipo, búsqueda, filtros
- Click → detalle de la observación

**Por qué es alto:** Es el feature más "vendible" del panel. Una imagen del grafo comunica más que mil palabras.

---

### 15. Timeline de cambios en el grafo

**Rating: 5/10 · Estado: 💡 idea**

Vista temporal: "mostrame cómo evolucionó este módulo en las últimas 2 semanas". Ideal para retrospectivas y onboarding.

---

### 16. Dashboard de métricas del proyecto

**Rating: 6/10 · Estado: 💡 idea**

Panel con estadísticas sobre el grafo de conocimiento:

- Total de observaciones, símbolos, relaciones
- Agentes más activos, proyectos más documentados
- Cobertura de análisis por archivo/módulo
- Actividad semanal: cuántas memorias se guardaron

---

## 🔬 Integración y DevOps

### 17. CI Quality Gates

**Rating: 5/10 · Estado: 💡 idea**

Si el grafo tiene coverage, usarlo en CI:

- "Si este PR cambia X, asegurate de que los tests de Y pasen"
- "Este cambio introduce un ciclo de dependencias"
- "La complejidad ciclomática superó el umbral"

**Origen:** Gortex, ops-codegraph-tool

---

### 18. SCIP como formato de intercambio

**Rating: 4/10 · Estado: 💡 idea**

SCIP (Code Intelligence Protocol) es un formato estándar para intercambiar datos de análisis de código. Usado por Sourcegraph. Podría servir para importar/exportar el grafo.

**Origen:** CodeGraphContext (techsavvyash)

---

## 🗺️ Ideas de la comunidad / Ecosistema

### 19. Engram Sync Bidireccional

**Rating: 6/10 · Estado: 💡 idea**

Sincronización bidireccional entre instancias de Sechel o entre Sechel y Engram local. Permitiría:

- Un developer labura local con Engram y sincroniza a un Sechel compartido
- Pull de memorias del equipo al entorno local
- Resolución de conflictos por `last_seen_at` + `revision_count`

---

### 20. Múltiples Orgs en una sola instancia

**Rating: 4/10 · Estado: ❌ descartada explícitamente en PRD**

Multi-tenant real dentro de una misma base de datos. Descartado en PRD: cada organización corre su propia instancia.

---

## 📊 Resumen

| # | Idea | Rating | Estado |
|---|---|---|---|
| * | Grafo de código en memoria (idea madre) | 10 | 💡 idea |
| 1 | Navegación de grafo: `mem_get_relations` | 10 | 💡 idea |
| 2 | Iris Gate Ladder (contexto progresivo) | 9 | 💡 idea |
| 3 | Symbol Cards como formato first-class | 9 | 💡 idea |
| 9 | 4 Pilares del Context Engineering | 9 | 📐 diseñando |
| 4 | Precomputed Reach Index (blast radius O(1)) | 8 | 💡 idea |
| 5 | Delta / Blast Radius Analysis | 8 | 💡 idea |
| 14 | Vista de grafo en el panel | 8 | 💡 idea |
| 6 | Auto-extraction de símbolos | 7 | 💡 idea |
| 7 | Búsqueda NL sobre el grafo | 7 | 💡 idea |
| 10 | Grafos Temporales | 7 | 💡 idea |
| 11 | Compresión de Contexto automática | 7 | 💡 idea |
| 16 | Dashboard de métricas del proyecto | 6 | 💡 idea |
| 12 | Markdown persistente versionable | 6 | 💡 idea |
| 13 | Daemon multi-sesión compartido | 6 | 💡 idea |
| 19 | Sync bidireccional Engram ↔ Sechel | 6 | 💡 idea |
| 8 | Cross-language bridging | 5 | 💡 idea |
| 15 | Timeline de cambios en el grafo | 5 | 💡 idea |
| 17 | CI Quality Gates | 5 | 💡 idea |
| 18 | SCIP como formato de intercambio | 4 | 💡 idea |
| 20 | Multi-org en una instancia | 4 | ❌ descartada |

---

*Última actualización: 2026-07-14*
*Total: 20 ideas · 1 en diseño · 1 descartada · 18 en backlog*
