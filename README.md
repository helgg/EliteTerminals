# EliteTerminals — app

Servidor local (PC do jogo) + UI web para tablet/2º monitor. Requer **Node 24** (`nvm use 24.22.1`).

```bash
npm install
npm run build      # compila a UI (web/dist)
npm start          # servidor em http://0.0.0.0:8420 — o log mostra os IPs da rede local
npm test           # testes (T1–T7…) com journals reais em server/test/fixtures
npm run check      # type-check servidor + svelte-check
```

Desenvolvimento com hot reload: `npm run dev:server` e, noutro terminal, `npm run dev:web` (Vite em :5173 com proxy p/ :8420).

No tablet: abra `http://<ip-do-pc>:8420` (mesma rede Wi-Fi). Se não abrir, libere a porta 8420 no Firewall do Windows (rede privada).

Variáveis: `PORT` (8420), `HOST` (0.0.0.0), `ED_JOURNAL_DIR` (padrão `%USERPROFILE%\Saved Games\Frontier Developments\Elite Dangerous`).

## Estrutura
| Pasta | Conteúdo |
|---|---|
| `shared/` | Modelo de estado (`EdState`) + protocolo WebSocket |
| `server/src/reducer.ts` | Evento do journal → estado (puro, testável) |
| `server/src/reader.ts` | Segue o journal mais recente e Status/Cargo/NavRoute/Market.json (somente leitura) |
| `server/src/index.ts` | Fastify: `/ws` (estado ao vivo, comandos), `/api/state`, arquivos da UI |
| `web/src/hud.css` | Tokens do design "Elite HUD" |
| `web/src/lib/` | Componentes: Panel, Pips (8 meios-pips), Bar, Toggle |
| `web/src/screens/` | Telas: Flight, Trade (demais em construção) |

