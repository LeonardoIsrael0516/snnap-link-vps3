# 🧪 Guia de Teste - Melhorias PWA

## 🚀 Como Testar as Novas Funcionalidades

---

## 📋 **PRÉ-REQUISITOS**

### 1. Atualizar Banco de Dados
```bash
cd microservices/link-ai
./update-db.sh
```

### 2. Reiniciar Microserviço
```bash
# Parar o serviço atual (Ctrl+C)
npm run dev
```

### 3. Limpar Cache do Navegador
- Chrome: F12 → Application → Clear Storage → Clear site data
- Ou use modo anônito

---

## 📱 **TESTE 1: Banner de Instalação no Android**

### Objetivo:
Verificar se o banner aparece corretamente

### Passos:

1. **Abrir página PWA no Chrome Android**
   ```
   http://seu-dominio.com/slug-da-pagina
   ```

2. **Aguardar 4 segundos**
   - Banner deve aparecer na parte inferior
   - Deve mostrar ícone do app
   - Deve ter botão "Instalar Agora"

3. **Verificar no Console (DevTools Remoto)**
   ```
   PWA: Dispositivo Android/Chrome detectado
   PWA: Aguardando beforeinstallprompt por até 4s...
   PWA: Mostrando banner (beforeinstallprompt=true/false)
   ```

4. **Clicar "Instalar Agora"**
   - Dialog nativo do Chrome deve aparecer
   - Clicar "Instalar"
   - App deve ser adicionado à tela inicial

### ✅ Resultado Esperado:
- Banner aparece SEMPRE em até 4 segundos
- Instalação funciona corretamente
- Ícone aparece na tela inicial

### 🐛 Se não funcionar:
- Verificar se `pwaEnabled = true` no banco
- Verificar console para erros
- Verificar se manifest.json está carregando: `/slug/manifest.json`
- Verificar se Service Worker registrou: DevTools → Application → Service Workers

---

## 🎨 **TESTE 2: Múltiplos Tamanhos de Ícones**

### Objetivo:
Verificar se ícones estão sendo gerados corretamente

### Passos:

1. **Abrir Manifest no Navegador**
   ```
   http://seu-dominio.com/slug/manifest.json
   ```

2. **Verificar Campo `icons`**
   - Deve ter **9 entradas** (8 tamanhos + 1 maskable)
   - Tamanhos: 72, 96, 128, 144, 152, 192, 384, 512
   - Último deve ter `"purpose": "maskable"`

3. **Testar em Diferentes Resoluções**
   - Android: Verificar ícone na tela inicial (HD, Full HD, 4K)
   - Desktop: Verificar em diferentes zoom levels
   - iOS: Verificar apple-touch-icon

### ✅ Resultado Esperado:
```json
{
  "icons": [
    {"src": "...", "sizes": "72x72", "purpose": "any"},
    {"src": "...", "sizes": "96x96", "purpose": "any"},
    {"src": "...", "sizes": "128x128", "purpose": "any"},
    {"src": "...", "sizes": "144x144", "purpose": "any"},
    {"src": "...", "sizes": "152x152", "purpose": "any"},
    {"src": "...", "sizes": "192x192", "purpose": "any"},
    {"src": "...", "sizes": "384x384", "purpose": "any"},
    {"src": "...", "sizes": "512x512", "purpose": "any"},
    {"src": "...", "sizes": "512x512", "purpose": "maskable"}
  ]
}
```

---

## ⚡ **TESTE 3: Shortcuts (Atalhos)**

### Objetivo:
Verificar atalhos rápidos no ícone

### Passos:

1. **Instalar o App**
   - Seguir TESTE 1

2. **No Android: Pressionar e Segurar Ícone**
   - Deve aparecer menu de contexto
   - Deve mostrar "Abrir Página" como atalho

3. **Clicar no Atalho**
   - Deve abrir diretamente a página

### ✅ Resultado Esperado:
- Menu de contexto com atalho aparece
- Atalho funciona corretamente
- Ícone do atalho igual ao app

### 📝 Nota:
- Shortcuts só aparecem no Android
- Chrome/Edge desktop também suportam (botão direito no ícone)

---

## 🚀 **TESTE 4: Service Worker v2**

### Objetivo:
Verificar estratégias de cache

### Passos:

1. **Abrir DevTools → Application → Service Workers**
   - Verificar que SW está ativo
   - Versão deve ser "v2"

2. **Testar Cache de Imagens**
   - Abrir página com imagens
   - Verificar Network tab: imagens do cache (from ServiceWorker)
   - Desligar internet
   - Recarregar: imagens devem carregar do cache

3. **Testar Cache de HTML**
   - Carregar página
   - Desligar internet
   - Recarregar: página deve carregar (network-first com fallback)

4. **Verificar Caches**
   - DevTools → Application → Cache Storage
   - Deve ter 3 caches:
     - `pwa-static-slug-v2`
     - `pwa-dynamic-slug-v2`
     - `pwa-images-slug-v2`

### ✅ Resultado Esperado:
```
Cache Storage:
├─ pwa-static-slug-v2
│  └─ Tailwind CDN, manifest
├─ pwa-dynamic-slug-v2
│  └─ HTML da página
└─ pwa-images-slug-v2
   └─ Imagens carregadas
```

### 🐛 Debug:
- Console do Service Worker: DevTools → Application → Service Workers → "source"
- Ver logs: `console.log('[SW] ...')`

---

## 🔔 **TESTE 5: Notificação de Atualização**

### Objetivo:
Verificar banner elegante de atualização

### Passos:

1. **Forçar Nova Versão**
   - Editar `pwa.ts` linha do CACHE_VERSION:
     ```typescript
     const CACHE_VERSION = 'v3'; // Era v2
     ```
   - Salvar e reiniciar microserviço

2. **Na Página Instalada**
   - Aguardar até 1 hora (ou force update: DevTools → Application → Service Workers → Update)
   - Banner deve aparecer no **topo** da tela

3. **Verificar Banner**
   - Deve ter gradiente (cores do tema)
   - Deve ter ícone de atualização
   - Botão "Atualizar" e botão "✕"
   - Animação suave de entrada

4. **Clicar "Atualizar"**
   - Animação de saída
   - Página recarrega
   - Nova versão ativa

### ✅ Resultado Esperado:
```
[Topo da Tela]
┌─────────────────────────────────────┐
│ 🔄  Nova versão disponível!         │
│     Clique para atualizar           │
│     [Atualizar]  [✕]                │
└─────────────────────────────────────┘
```

### 🎨 Design:
- Gradiente personalizado
- Animação slideDown (entrada)
- Animação slideOut (saída)
- Auto-dismiss em 10s
- Hover effects

---

## 🎯 **TESTE 6: Lighthouse PWA Score**

### Objetivo:
Verificar score do PWA

### Passos:

1. **Abrir DevTools → Lighthouse**
   - Selecionar "Progressive Web App"
   - Clicar "Generate Report"

2. **Verificar Score**
   - Deve estar entre **95-100**
   - Todos os critérios verdes

3. **Verificar Detalhes**
   - ✅ Installable
   - ✅ PWA Optimized
   - ✅ Works Offline
   - ✅ Fast and Reliable
   - ✅ Multiple Icon Sizes

### ✅ Resultado Esperado:
```
Performance:     95-100 🟢
PWA:            95-100 🟢
Accessibility:   90-100 🟢
Best Practices:  90-100 🟢
SEO:            90-100 🟢
```

---

## 📊 **CHECKLIST COMPLETO**

### Antes de Testar:
- [ ] Banco de dados atualizado (`./update-db.sh`)
- [ ] Microserviço reiniciado
- [ ] Cache do navegador limpo

### Funcionalidades:
- [ ] Banner aparece no Android
- [ ] Banner aparece no iOS (com instruções)
- [ ] Instalação funciona corretamente
- [ ] Múltiplos ícones no manifest
- [ ] Shortcuts aparecem (Android)
- [ ] Service Worker v2 ativo
- [ ] Cache funcionando (offline)
- [ ] Notificação de atualização aparece
- [ ] Lighthouse score > 95

### Performance:
- [ ] Imagens carregam do cache
- [ ] Página funciona offline
- [ ] Atualização suave
- [ ] Sem erros no console

---

## 🐛 **TROUBLESHOOTING**

### Problema: Banner não aparece no Android

**Soluções:**
1. Verificar console:
   ```javascript
   PWA: Dispositivo Android/Chrome detectado
   PWA: Mostrando banner...
   ```
2. Verificar se `pwaEnabled = true`
3. Limpar localStorage: `localStorage.clear()`
4. Recarregar em modo anônito
5. Verificar se não está em standalone mode

### Problema: Ícones não aparecem

**Soluções:**
1. Verificar manifest.json está carregando
2. Verificar URL dos ícones (404?)
3. Se sem ícone: deve gerar SVG automaticamente
4. Verificar console para erros

### Problema: Service Worker não registra

**Soluções:**
1. Verificar HTTPS (ou localhost)
2. Verificar scope correto
3. Unregister old SW: DevTools → Application → Service Workers → Unregister
4. Hard refresh: Ctrl+Shift+R

### Problema: Cache não funciona

**Soluções:**
1. Verificar SW está ativo
2. Verificar Network tab: "from ServiceWorker"
3. Limpar todos os caches
4. Verificar estratégia de cache no código

---

## 📞 **SUPORTE**

Se encontrar problemas:
1. Verificar console do navegador
2. Verificar console do Service Worker
3. Verificar logs do microserviço
4. Consultar documentação: `PWA-IMPROVEMENTS.md`

---

## 🎉 **SUCESSO!**

Se todos os testes passaram, o PWA está funcionando perfeitamente! 🚀📱

**Próximos passos:**
- Testar em dispositivos reais
- Monitorar analytics de instalação
- Coletar feedback dos usuários
- Considerar implementar Push Notifications

**Documentação adicional:**
- `PWA-IMPROVEMENTS.md` - Detalhes técnicos
- Prisma Schema - Campos PWA disponíveis
- Service Worker source - Estratégias de cache
