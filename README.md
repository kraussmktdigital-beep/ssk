# Painel de Análise Jurídica com IA

Aplicação web com autenticação por senha, backend Node.js e integração com a OpenAI Responses API.

## O que faz
- Recebe até 15 arquivos por análise (PDF, DOC/DOCX, TXT/MD, XLS/XLSX).
- Analisa cada documento separadamente.
- Produz quadro probatório, cronologia, convergências, divergências, lacunas, diligências, perguntas para entrevista, linhas argumentativas e minuta-base.
- Permite exportar o resultado em JSON e imprimir/salvar em PDF.
- Mantém a chave da API no servidor, não no navegador.
- Solicita `store: false` e apaga os arquivos enviados à API ao fim do processamento.

## Requisitos
- Node.js 20 ou superior.
- Uma chave da API OpenAI com faturamento/configuração habilitados.
- Hospedagem com HTTPS para uso real.

## Executar localmente
1. Instale Node.js 20+.
2. Copie `.env.example` para `.env`.
3. Preencha `OPENAI_API_KEY`, `ADMIN_PASSWORD` e `SESSION_SECRET`.
4. Instale dependências: `npm install`.
5. Inicie: `npm start`.
6. Acesse `http://localhost:3000`.

Para gerar SESSION_SECRET, use um gerador criptograficamente seguro. Não reutilize a senha do e-mail ou de outros serviços.

## Publicação segura
- Publique o backend em um serviço com HTTPS, variáveis de ambiente secretas e disco persistente para a sessão SQLite.
- Configure `NODE_ENV=production`, `TRUST_PROXY=true` se estiver atrás de proxy HTTPS.
- Não envie `.env`, banco de dados, documentos ou resultados para GitHub.
- Restrinja o acesso por senha forte e, preferencialmente, acrescente MFA/SSO e contas individuais antes de uso por equipe.
- Configure backups criptografados, política de retenção, logs sem conteúdo documental e procedimento de exclusão.
- Avalie contrato, base legal, aviso de privacidade, transferência internacional e obrigações da LGPD antes de inserir dados pessoais ou sensíveis.

## Limitações importantes
- O limite atual é 20 MB por arquivo, 15 arquivos e 50 MB no conjunto.
- Arquivos escaneados podem depender da qualidade do OCR/visão do modelo; confira páginas e trechos nos originais.
- O sistema não persiste o relatório no banco; exporte o JSON/PDF para guardar em repositório seguro do escritório.
- A senha única é uma proteção inicial, não um sistema completo de gestão de usuários. Para produção com vários usuários, implemente contas individuais, MFA, trilha de auditoria e autorização por caso.
- A análise é apoio profissional, não parecer jurídico autônomo. A IA pode omitir, interpretar mal ou errar; confira todos os fatos, páginas, legislação, prazos e jurisprudência.
- `store: false` reduz a retenção de estado de resposta na API, mas não equivale por si só a Zero Data Retention. Consulte a política de dados e as condições da conta/projeto.

## Documentos e privacidade
A aplicação transmite arquivos ao provedor de IA para processamento. O backend solicita a exclusão dos arquivos da API depois da análise, mas não prometa sigilo absoluto nem retenção zero sem verificar a configuração e o contrato aplicáveis. Não use com documentos reais de clientes até concluir a revisão de segurança e LGPD.


## Deploy no Render (Blueprint)
O repositório inclui `render.yaml`. Faça push do projeto para um repositório Git privado e, no Render, use **New > Blueprint** para selecionar esse repositório. O Blueprint cria o Web Service e um Persistent Disk em `/var/data`.

No painel de configuração do serviço, preencha manualmente os segredos:
- `OPENAI_API_KEY`: chave de API do projeto OpenAI.
- `ADMIN_PASSWORD`: senha longa e exclusiva para o acesso inicial.

`SESSION_SECRET` é gerada pelo Render no Blueprint. O banco SQLite de sessões fica no disco persistente `/var/data`. Não coloque documentos de clientes no Git nem no disco persistente; a aplicação não salva os uploads nele.

O plano Starter e o disco persistente podem gerar custos. Confira os valores vigentes no Render antes de confirmar. O domínio `onrender.com` usa HTTPS gerenciado pelo Render.

**Antes de uso real:** revise a retenção e processamento do provedor de IA, habilite MFA/SSO ou camada adicional de acesso se houver equipe, crie política de retenção, e faça teste com documentos fictícios. Não compartilhe o endereço público sem controle de acesso.


Região sugerida no Blueprint: `virginia`, por ser uma opção nas regiões disponíveis e uma escolha inicial de latência para acesso a partir do Brasil; confirme latência real e disponibilidade antes da criação.
