#!/bin/bash

# Script de atualização do banco de dados Link-AI
# Adiciona suporte ao campo pwaShortcuts

echo "🔄 Atualizando banco de dados Link-AI..."
echo ""

# Navegar para o diretório do microserviço
cd "$(dirname "$0")"

echo "📦 Gerando Prisma Client..."
npx prisma generate

echo ""
echo "🗄️ Aplicando mudanças no banco de dados..."
npx prisma db push

echo ""
echo "✅ Banco de dados atualizado com sucesso!"
echo ""
echo "📋 Novas features disponíveis:"
echo "   - pwaShortcuts: Campo para shortcuts customizados (JSON)"
echo ""
echo "🚀 Próximos passos:"
echo "   1. Reinicie o microserviço: npm run dev"
echo "   2. Teste o PWA em um dispositivo Android"
echo "   3. Veja o arquivo PWA-IMPROVEMENTS.md para detalhes"
echo ""
