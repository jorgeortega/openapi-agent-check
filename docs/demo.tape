# The README's GIF. Record it from the repository root with VHS (https://github.com/charmbracelet/vhs):
#
#   brew install vhs
#   vhs docs/demo.tape
#
# It runs the published package with npx, so record after a release.

Output docs/demo.gif

Set Shell "bash"
Set FontSize 16
Set Width 1200
Set Height 720
Set Padding 20
Set TypingSpeed 40ms
Set Theme "GitHub Dark"

# A copy of a fixture in a scratch folder, so --fix writes nothing into the repository.
Hide
Type "export CI= && cd $(mktemp -d) && cp $OLDPWD/test/fixtures/cases/orders-thin/openapi.json . && npx --yes openapi-agent-check --version > /dev/null && clear"
Enter
Sleep 4s
Show

Type "npx openapi-agent-check openapi.json --max 1"
Sleep 500ms
Enter
Sleep 4s

Type "npx openapi-agent-check openapi.json --fix"
Sleep 500ms
Enter
Sleep 2s

Type "npx openapi-agent-check openapi.fixed.json --quiet"
Sleep 500ms
Enter
Sleep 4s
