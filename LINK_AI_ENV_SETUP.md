# 🔧 Configuração do Microserviço Link AI

## ❌ Problema Identificado

O erro **"Foreign key constraint violated: ai_pages_userId_fkey"** ocorre porque:

1. O usuário existe no **backend principal** (banco principal)
2. O usuário **NÃO existe** no **microserviço Link AI** (banco local)
3. O middleware `ensureUserExists` está falhando na sincronização

## ✅ Solução

### **1. Adicione ao arquivo `.env` do microserviço Link AI:**

```bash
# Database local do microserviço
DATABASE_URL="postgresql://username:password@localhost:5432/link_ai_db"

# Database principal (backend)
MAIN_DATABASE_URL="postgresql://username:password@localhost:5432/snnap_db"

# JWT (mesmo do backend principal)
JWT_SECRET="your-jwt-secret-here"

# Backend principal
BACKEND_URL="http://localhost:3001"

# API Key interna
INTERNAL_API_KEY="internal-sync-key"
```

### **2. Verifique se os bancos estão rodando:**

```bash
# Banco principal (backend)
psql -h localhost -p 5432 -U username -d snnap_db

# Banco do microserviço
psql -h localhost -p 5432 -U username -d link_ai_db
```

### **3. Execute as migrações do microserviço:**

```bash
cd link-ai
npx prisma migrate deploy
npx prisma generate
```

### **4. Reinicie o microserviço:**

```bash
cd link-ai
npm run dev
```

## 🎯 **Como funciona a sincronização:**

1. **Usuário faz login** no backend principal
2. **Token JWT** contém `userId` do banco principal
3. **Microserviço recebe** requisição com token
4. **Middleware `ensureUserExists`** verifica se usuário existe localmente
5. **Se não existir**, sincroniza do banco principal automaticamente
6. **Criação da página** prossegue normalmente

## 🔍 **Debug:**

### **Verificar logs do microserviço:**
```bash
cd link-ai
npm run dev
```

### **Logs esperados:**
```
🔄 Middleware ensureUserExists chamado
👤 Verificando usuário: cmgrdppra0006u3jacn1a648b
🔄 Usuário não encontrado no banco local, sincronizando...
🔍 Conectando ao banco principal...
✅ Usuário seckodb@gmail.com sincronizado com sucesso!
```

## 🚀 **Após configurar:**

- ✅ Importação de templates funcionará
- ✅ Importação manual funcionará
- ✅ Usuários serão sincronizados automaticamente
- ✅ Sem mais erro de foreign key



