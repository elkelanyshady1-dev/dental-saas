Invoke-RestMethod https://astral.sh/uv/install.ps1 | Invoke-Expression
$env:Path = "$env:LOCALAPPDATA\bin;$env:Path"
uv version
uv tool install specify-cli --from git+https://github.com/github/spec-kit.git
