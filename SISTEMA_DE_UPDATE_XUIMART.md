# Sistema de Update Xuimart — Documentação Operacional

Como funciona o mecanismo de atualização dos produtos Xuimart, do build à
notificação ao usuário final. Este documento serve de referência para replicar
o mesmo sistema em qualquer novo software.

---

## Visão Geral do Fluxo

```
Developer                   GitHub                      Servidor (Hostinger)         Usuário
   |                          |                              |                         |
   |-- gh release create ---->|                              |                         |
   |   (upload do .exe)       |                              |                         |
   |                          |                              |                         |
   |-- FileZilla -------------|------ version.json --------->|                         |
   |                          |                              |                         |
   |                          |                              |    (abre o programa)    |
   |                          |                              |<--- GET version.json ---|
   |                          |                              |---- responde JSON ----->|
   |                          |                              |                         |
   |                          |                              |    (compara versões)    |
   |                          |                              |                         |
   |                          |                              |    [versão nova!]       |
   |                          |                              |    mostra banner ------>|
   |                          |                              |                         |
   |                          |<---------- download link permanente -------------------|
   |                          |---- entrega .exe (latest) --------------------------->|
```

---

## Componentes do Sistema

### 1. GitHub Releases (hospedagem do binário)

**Repositório:** `https://github.com/xuimart/{nome-do-repo}`
**CLI:** `gh` (GitHub CLI), já autenticado na máquina de desenvolvimento.

O binário é publicado como asset de uma release tagueada. O nome do asset é
**fixo e sem versão**:

```
{Produto}_Setup.exe
```

Isso permite que o link permanente nunca mude:

```
https://github.com/xuimart/{repo}/releases/latest/download/{Produto}_Setup.exe
```

Esse link é o que vai no site, no instalador e no `version.json`. Ele sempre
aponta pra última release publicada, sem precisar atualizar nada quando sai
versão nova.

**Regra crítica:** se o nome do asset tiver versão (ex: `Setup_5.2.13.exe`),
o link permanente quebra a cada release.

### 2. version.json (notificação de atualização)

**Localização:** `https://www.xuimart.com.br/{produto}/version.json`
**Acesso:** via FileZilla (FTP para Hostinger)
**Pasta remota:** `/{produto}/version.json`

Formato:

```json
{
  "version": "X.Y.Z",
  "downloadUrl": "https://github.com/xuimart/{repo}/releases/latest/download/{Produto}_Setup.exe",
  "changelog": "Descrição curta das novidades desta versão"
}
```

**O `downloadUrl` NUNCA muda.** Só `version` e `changelog` são atualizados a cada release.

O programa no cliente lê esse JSON ao abrir e compara `version` com a constante
`{PRODUTO}_VERSION` compilada no código. Se `version > {PRODUTO}_VERSION`, mostra
o banner de atualização.

### 3. Código no cliente (check de atualização)

Ao abrir o programa, faz um GET silencioso ao `version.json`:

```javascript
// Exemplo em JavaScript (CEP/Node)
var https = require('https');
https.get('https://www.xuimart.com.br/{produto}/version.json', function(res) {
    var body = '';
    res.on('data', function(chunk) { body += chunk; });
    res.on('end', function() {
        var data = JSON.parse(body);
        if (compareVersions(data.version, PRODUTO_VERSION) > 0) {
            showUpdateBanner(data);
        }
    });
}).on('error', function() { /* silencioso */ });
```

O banner mostra:
- Versão nova disponível
- Changelog curto
- Botão de download (abre o `downloadUrl` no navegador)

**Princípios:**
- O check é silencioso — nunca bloqueia a abertura
- Se falhar (sem internet, DNS, timeout), ignora silenciosamente
- O banner pode ser fechado e não volta até a próxima abertura
- O botão "Verificar atualização" nas Configurações permite check manual

### 4. Comparação de versões

SemVer: `MAJOR.MINOR.PATCH`. A comparação é numérica por segmento:

```javascript
function compareVersions(a, b) {
    var pa = a.split('.').map(Number);
    var pb = b.split('.').map(Number);
    for (var i = 0; i < 3; i++) {
        if ((pa[i] || 0) > (pb[i] || 0)) return 1;
        if ((pa[i] || 0) < (pb[i] || 0)) return -1;
    }
    return 0;
}
```

---

## Processo de Release (passo a passo)

### Preparação

1. **Bump da versão** em todos os locais:
   - Código do programa (constante `{PRODUTO}_VERSION`)
   - Instalador (AssemblyVersion, título, footer, changelog popup)
   - CHANGELOG.md

2. **Gerar o pacote de instalação:**
   - ZIP com os arquivos do programa (estrutura que o instalador espera)
   - Compilar o instalador com o ZIP embutido como recurso
   - Nome do .exe: `{Produto}_Setup.exe` (sem versão!)

3. **Validar antes de publicar:**
   - Extrair o recurso do .exe e verificar conteúdo
   - Conferir versão dentro dos arquivos empacotados
   - Testar instalação num ambiente limpo se possível

### Publicação

4. **GitHub — criar release:**

```powershell
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" +
            [System.Environment]::GetEnvironmentVariable("Path","User")

gh release create vX.Y.Z "caminho\{Produto}_Setup.exe" `
   --repo xuimart/{repo} `
   --title "{Produto} vX.Y.Z" `
   --notes-file "caminho\notas.md"
```

5. **Verificar após publicar:**

```powershell
# Hash confere
$local = (Get-FileHash "Setup.exe" -Algorithm SHA256).Hash.ToLower()
# Asset subiu
gh release view vX.Y.Z --repo xuimart/{repo} --json assets
# Link permanente funciona
Invoke-WebRequest -Uri "https://github.com/xuimart/{repo}/releases/latest/download/{Produto}_Setup.exe" -Method Head
```

6. **FileZilla — atualizar version.json:**
   - Conectar ao FTP da Hostinger
   - Navegar pra `/{produto}/`
   - Subir o `version.json` atualizado

### Verificação final

7. Abrir o programa numa máquina que tenha a versão antiga e confirmar que o
   banner de atualização aparece com a versão e changelog corretos.

---

## Instalador (padrão WinForms C#)

O instalador é um .exe único que contém o programa inteiro embutido como
recurso. Não depende de internet pra instalar.

### Compilação

Usa o `csc.exe` do .NET Framework (já vem no Windows, sem Visual Studio):

```powershell
$csc = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
$args = "/target:winexe /platform:anycpu /optimize+ " +
    "/win32icon:`"installer_icon.ico`" " +
    "/out:`"{Produto}_Setup.exe`" " +
    "/resource:`"plugin.zip`",{nome_recurso}.zip " +
    "/r:System.dll /r:System.Drawing.dll /r:System.Windows.Forms.dll " +
    "/r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll " +
    "/r:Microsoft.CSharp.dll `"{Produto}Installer.cs`""
```

### Payload embutido

O ZIP é embutido via `/resource:arquivo.zip,nome_do_recurso.zip` e lido em
runtime com:

```csharp
var asm = System.Reflection.Assembly.GetExecutingAssembly();
Stream stream = asm.GetManifestResourceStream("nome_do_recurso.zip");
```

Há fallback: se o recurso não existir, procura o ZIP na pasta do .exe.

### Estrutura do ZIP

O extrator reconhece entradas por **prefixo**. Cada prefixo vai pra um destino
diferente. Entradas fora dos prefixos reconhecidos são **ignoradas em silêncio**.

No DrawlapsePS:
- `cep/...` → pastas CEP do Photoshop
- `generator/...` → pasta Generator do Photoshop

Em outro programa, defina seus próprios prefixos e destinos.

---

## Convenções

### Nomenclatura de tag

```
vMAJOR.MINOR.PATCH
```

Exemplos: `v5.2.13`, `v1.0.0`, `v2.1.0-beta`

### Nomenclatura do asset

```
{Produto}_Setup.exe
```

Sem versão. Sempre o mesmo nome. O link `/latest/download/` resolve pra última.

### Notas da release

Arquivo Markdown (`notas.md`) com:
- O que mudou (seções: Novidades, Correções, Melhorias)
- Instruções de instalação (3 passos)
- Links de apoio (Pix, Ko-fi, suporte)

### CHANGELOG.md

Acumula todas as versões. Formato:

```markdown
## [X.Y.Z] - AAAA-MM-DD

### Novidades
- ...

### Correcoes
- ...
```

---

## Diagrama de Dependências

```
                    ┌─────────────────┐
                    │  version.json   │  ← atualizado manualmente via FTP
                    │  (servidor)     │
                    └────────┬────────┘
                             │
                             │ HTTP GET (ao abrir)
                             ▼
┌──────────────┐    ┌─────────────────┐    ┌───────────────┐
│   GitHub     │    │   Programa no   │    │   Usuário     │
│   Releases   │◄───│   cliente       │───►│   (banner)    │
│              │    │                 │    │               │
│  .exe asset  │    │  compara ver.   │    │  clica update │
└──────┬───────┘    └─────────────────┘    └───────┬───────┘
       │                                           │
       │  /latest/download/{Produto}_Setup.exe     │
       ◄───────────────────────────────────────────┘
```

---

## Pontos de Atenção

**O version.json é manual.** Não existe automação entre publicar no GitHub e
atualizar o JSON no servidor. Se esquecer de subir o JSON, ninguém recebe a
notificação — mas quem visitar o site/GitHub baixa a versão nova normalmente.

**O link permanente depende do nome fixo.** Se publicar uma release com asset
de nome diferente, o link quebra. Confira sempre com `Invoke-WebRequest -Method Head`.

**Deletar e recriar release com mesmo tag funciona.** O GitHub não impede. Útil
pra corrigir um binário logo após publicar (antes de alguém baixar). O link
permanente continua funcionando após a recriação.

**O instalador funciona offline.** Todo o programa está dentro do .exe. A
internet só é necessária pra baixar o instalador — depois disso, instala sem rede.

**Atualizações não são automáticas.** O programa avisa que existe versão nova.
O usuário decide se baixa e instala. Não há auto-update em background.

---

## Checklist para novo produto

- [ ] Criar repositório `xuimart/{repo}` no GitHub (público)
- [ ] Implementar a constante `{PRODUTO}_VERSION` no código
- [ ] Implementar o check de `version.json` ao abrir
- [ ] Implementar banner de atualização com botão de download
- [ ] Implementar botão "Verificar atualização" nas configurações
- [ ] Criar a pasta `/{produto}/` no FTP da Hostinger
- [ ] Subir o primeiro `version.json`
- [ ] Definir os prefixos do ZIP e os destinos de instalação
- [ ] Adaptar o instalador WinForms (paleta, nomes, destinos)
- [ ] Compilar com `csc.exe`
- [ ] Publicar primeira release via `gh release create`
- [ ] Confirmar link permanente com `Invoke-WebRequest -Method Head`
- [ ] Testar o banner de atualização numa instalação existente
